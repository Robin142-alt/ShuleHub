import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { BillingAccessService } from '../billing/billing-access.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { StudentsModule } from './students.module';
import { StudentsSchemaService } from './students-schema.service';
import { StudentsService } from './students.service';

test('StudentsModule does not expose retired attendance controllers or providers', () => {
  const controllers =
    (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StudentsModule) as Array<{ name?: string }> | undefined) ?? [];
  const providers =
    (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StudentsModule) as Array<{ name?: string }> | undefined) ?? [];

  assert.equal(
    controllers.some((controller) => controller?.name === 'AttendanceController'),
    false,
  );
  assert.equal(
    providers.some((provider) => provider?.name === 'AttendanceService'),
    false,
  );
});

test('retired attendance API controller, service, and DTO source files are removed', () => {
  for (const relativePath of [
    'apps/api/src/modules/students/attendance.controller.ts',
    'apps/api/src/modules/students/attendance.service.ts',
    'apps/api/src/modules/students/dto/attendance-record-response.dto.ts',
    'apps/api/src/modules/students/dto/list-attendance-query.dto.ts',
    'apps/api/src/modules/students/dto/upsert-attendance-record.dto.ts',
  ]) {
    assert.equal(existsSync(join(process.cwd(), relativePath)), false, `${relativePath} should be removed`);
  }
});

test('StudentsSchemaService adds a full-text index for active student directory search', async () => {
  let schemaSql = '';
  const service = new StudentsSchemaService(
    {
      runSchemaBootstrap: async (sql: string) => {
        schemaSql += sql;
      },
    } as never,
    {
      onModuleInit: async () => undefined,
    } as never,
  );

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_students_search_vector/);
  assert.match(schemaSql, /ON students\s+USING GIN/);
  assert.match(schemaSql, /to_tsvector\(\s*'simple'/);
  assert.match(schemaSql, /admission_number/);
  assert.match(schemaSql, /primary_guardian_phone/);
  assert.match(schemaSql, /ALTER TABLE student_guardians ADD COLUMN IF NOT EXISTS email text/);
  assert.match(schemaSql, /ALTER TABLE student_guardians ADD COLUMN IF NOT EXISTS invitation_id uuid/);
  assert.doesNotMatch(schemaSql, /attendance/i);
});

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
          features: ['students'],
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
        features: ['students'],
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
