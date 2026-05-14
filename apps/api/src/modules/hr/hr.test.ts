import assert from 'node:assert/strict';
import test from 'node:test';

import { PATH_METADATA } from '@nestjs/common/constants';

import { PERMISSIONS_KEY } from '../../auth/auth.constants';
import { HrController } from './hr.controller';
import { HrSchemaService } from './hr-schema.service';
import { HrService } from './hr.service';

test('HrSchemaService creates staff management tables with forced RLS', async () => {
  let schemaSql = '';
  const service = new HrSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS staff_profiles/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS staff_contracts/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS staff_leave_requests/);
  assert.match(schemaSql, /ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(schemaSql, /payroll/i);
});

test('HrService prevents overlapping active contracts for the same staff member', async () => {
  const service = new HrService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      findOverlappingActiveContract: async () => ({ id: 'contract-existing' }),
      approveContract: async () => {
        throw new Error('overlapping contract must not be approved');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      service.approveContract({
        staff_profile_id: 'staff-1',
        role_title: 'Teacher',
        employment_type: 'full_time',
        workload: '40 lessons',
        starts_on: '2026-05-01',
        approval_state: 'approved',
      }),
    /overlapping active contract/,
  );
});

test('HrService requires override reason when approving leave beyond balance', async () => {
  const service = new HrService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      findLeaveBalance: async () => ({ available_days: 2 }),
      approveLeaveRequest: async () => {
        throw new Error('leave must not be approved without override');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      service.approveLeave({
        staff_profile_id: 'staff-1',
        leave_type: 'annual',
        requested_days: 5,
      }),
    /override reason/,
  );
});

test('HrService records audit logs for staff status changes', async () => {
  const calls: string[] = [];
  const service = new HrService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      changeStaffStatus: async () => {
        calls.push('status');
        return { id: 'staff-1', status: 'suspended' };
      },
      appendAuditLog: async () => {
        calls.push('audit');
      },
    } as never,
  );

  const result = await service.changeStaffStatus({
    staff_profile_id: 'staff-1',
    status: 'suspended',
    reason: 'Safeguarding review',
  });

  assert.equal(result.status, 'suspended');
  assert.deepEqual(calls, ['status', 'audit']);
});

test('HrController exposes staff directory as a read endpoint', () => {
  const handler = HrController.prototype.listStaffDirectory as unknown as Function;

  assert.equal(typeof handler, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'staff');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), ['hr:read']);
});

test('HrService lists staff directory without sensitive identifiers', async () => {
  let capturedInput: Record<string, unknown> | null = null;
  const service = new HrService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      listStaffDirectory: async (input: Record<string, unknown>) => {
        capturedInput = input;
        return [
          {
            id: 'staff-1',
            full_name: 'Mary Wanjiku',
            status: 'active',
            statutory_identifiers: { kra_pin: 'A123' },
            emergency_contact: { phone: '+254700000000' },
          },
        ];
      },
    } as never,
  );

  const rows = await (service as unknown as {
    listStaffDirectory: (query: Record<string, string | undefined>) => Promise<Array<Record<string, unknown>>>;
  }).listStaffDirectory({
    search: ' Mary ',
    status: 'active',
  });

  assert.deepEqual(capturedInput, {
    tenant_id: 'tenant-a',
    search: 'Mary',
    status: 'active',
  });
  assert.equal(rows[0]?.full_name, 'Mary Wanjiku');
  assert.equal('statutory_identifiers' in (rows[0] ?? {}), false);
  assert.equal('emergency_contact' in (rows[0] ?? {}), false);
});
