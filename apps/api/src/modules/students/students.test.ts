import assert from 'node:assert/strict';
import test from 'node:test';

import { BillingAccessService } from '../billing/billing-access.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { AttendanceService } from './attendance.service';
import { StudentsService } from './students.service';

test('StudentsService creates a student and publishes student.created', async () => {
  const requestContext = new RequestContextService();
  let publishedPayload: Record<string, unknown> | null = null;

  const service = new StudentsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000101',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-001',
        first_name: 'Amina',
        last_name: 'Otieno',
        middle_name: null,
        status: 'active',
        date_of_birth: '2014-01-10',
        gender: 'female',
        primary_guardian_name: 'Grace Otieno',
        primary_guardian_phone: '254700000001',
        metadata: { stream: 'red' },
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-04-26T08:00:00.000Z'),
        updated_at: new Date('2026-04-26T08:00:00.000Z'),
      }),
      listStudents: async () => [],
      findById: async () => null,
      updateStudent: async () => null,
      countStudentsByStatus: async () => 0,
    } as never,
    new BillingAccessService(
      requestContext,
      {
        findCurrentByTenant: async () => ({
          id: '00000000-0000-0000-0000-000000000201',
          tenant_id: 'tenant-a',
          plan_code: 'starter',
          status: 'active',
          billing_phone_number: null,
          currency_code: 'KES',
          features: ['students', 'attendance'],
          limits: {},
          seats_allocated: 1,
          current_period_start: new Date('2026-04-01T00:00:00.000Z'),
          current_period_end: new Date('2026-05-01T00:00:00.000Z'),
          trial_ends_at: null,
          grace_period_ends_at: null,
          restricted_at: null,
          suspended_at: null,
          suspension_reason: null,
          activated_at: new Date('2026-04-01T00:00:00.000Z'),
          canceled_at: null,
          last_invoice_at: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }),
      } as never,
      {
        ensureCurrentLifecycle: async () => ({
          subscription: null,
          overview: null,
        }),
      } as never,
    ),
    {
      lockCurrentByTenant: async () => ({
        id: '00000000-0000-0000-0000-000000000201',
        tenant_id: 'tenant-a',
        plan_code: 'starter',
        status: 'active',
        billing_phone_number: null,
        currency_code: 'KES',
        features: ['students', 'attendance'],
        limits: {},
        seats_allocated: 1,
        current_period_start: new Date('2026-04-01T00:00:00.000Z'),
        current_period_end: new Date('2026-05-01T00:00:00.000Z'),
        trial_ends_at: null,
        activated_at: new Date('2026-04-01T00:00:00.000Z'),
        canceled_at: null,
        last_invoice_at: null,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      }),
    } as never,
    {
      publishStudentCreated: async (payload: Record<string, unknown>) => {
        publishedPayload = payload;
        return undefined;
      },
    } as never,
    {
      recordUsage: async (): Promise<void> => undefined,
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-student-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/students',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.createStudent({
        admission_number: 'ADM-001',
        first_name: 'Amina',
        last_name: 'Otieno',
        middle_name: undefined,
        date_of_birth: '2014-01-10',
        gender: 'female',
        status: 'active',
        primary_guardian_name: 'Grace Otieno',
        primary_guardian_phone: '254700000001',
        metadata: { stream: 'red' },
      }),
  );

  assert.equal(response.admission_number, 'ADM-001');
  assert.ok(publishedPayload);
  const studentCreatedPayload = publishedPayload as {
    student_id: string;
    tenant_id: string;
  };
  assert.equal(studentCreatedPayload.student_id, '00000000-0000-0000-0000-000000000101');
  assert.equal(studentCreatedPayload.tenant_id, 'tenant-a');
});

test('AttendanceService upserts attendance and records a server sync operation', async () => {
  const requestContext = new RequestContextService();
  let syncPayload: Record<string, unknown> | null = null;

  const service = new AttendanceService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findById: async () => ({
        id: '00000000-0000-0000-0000-000000000301',
      }),
    } as never,
    {
      lockByStudentAndDate: async () => null,
      upsertRecord: async (input: Record<string, unknown>) => ({
        id: input.id,
        tenant_id: input.tenant_id,
        student_id: input.student_id,
        attendance_date: input.attendance_date,
        status: input.status,
        notes: input.notes,
        metadata: input.metadata,
        source_device_id: input.source_device_id,
        last_modified_at: new Date(String(input.last_modified_at)),
        last_operation_id: input.last_operation_id,
        sync_version: input.sync_version,
        created_at: new Date('2026-04-26T09:00:00.000Z'),
        updated_at: new Date('2026-04-26T09:00:00.000Z'),
      }),
      listByStudentAndDateRange: async () => [],
    } as never,
    {
      recordServerOperation: async (
        entity: string,
        payload: Record<string, unknown>,
        _tenantId?: string,
        opId?: string,
      ) => {
        syncPayload = payload;
        return {
          op_id: opId ?? '00000000-0000-0000-0000-000000000401',
          tenant_id: 'tenant-a',
          device_id: 'server',
          entity,
          payload,
          version: '22',
          created_at: new Date('2026-04-26T09:00:00.000Z').toISOString(),
          updated_at: new Date('2026-04-26T09:00:00.000Z').toISOString(),
        };
      },
    } as never,
    {
      recordUsage: async (): Promise<void> => undefined,
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-att-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PUT',
      path: '/students/attendance',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.upsertStudentAttendance(
        '00000000-0000-0000-0000-000000000301',
        '2026-04-26',
        {
          status: 'present',
          notes: 'Checked in on time',
          last_modified_at: '2026-04-26T09:00:00.000Z',
          metadata: { captured_by: 'teacher-1' },
        },
      ),
  );

  assert.equal(response.status, 'present');
  assert.equal(response.sync_version, '22');
  assert.ok(syncPayload);
  const recordedSyncPayload = syncPayload as {
    attendance_date: string;
    source: string;
  };
  assert.equal(recordedSyncPayload.attendance_date, '2026-04-26');
  assert.equal(recordedSyncPayload.source, 'server');
});
