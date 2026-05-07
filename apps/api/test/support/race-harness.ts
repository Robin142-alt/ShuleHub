import { randomUUID } from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';
import { QueryResultRow } from 'pg';

import { AUTH_ANONYMOUS_USER_ID } from '../../src/auth/auth.constants';
import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { RequestContextState } from '../../src/common/request-context/request-context.types';
import { DatabaseSecurityService } from '../../src/database/database-security.service';
import { DatabaseService } from '../../src/database/database.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { AttendanceService } from '../../src/modules/students/attendance.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { AttendanceRecordsRepository } from '../../src/modules/sync/repositories/attendance-records.repository';
import { SyncOperationLogsRepository } from '../../src/modules/sync/repositories/sync-operation-logs.repository';
import { RaceConditionsTestModule } from './race-conditions-test.module';

export interface FinanceAccountFixture {
  tenant_id: string;
  debit_account_id: string;
  credit_account_id: string;
}

export interface SeededSubscription {
  id: string;
  tenant_id: string;
}

export interface SeededStudent {
  id: string;
  tenant_id: string;
}

export interface SeededAttendanceRecord {
  id: string;
  tenant_id: string;
  student_id: string;
  attendance_date: string;
}

export interface RaceTestHarness {
  testingModule: TestingModule;
  requestContext: RequestContextService;
  databaseService: DatabaseService;
  transactionService: TransactionService;
  billingService: BillingService;
  usageMeterService: UsageMeterService;
  attendanceService: AttendanceService;
  syncService: SyncService;
  subscriptionsRepository: SubscriptionsRepository;
  studentsRepository: StudentsRepository;
  attendanceRecordsRepository: AttendanceRecordsRepository;
  syncOperationLogsRepository: SyncOperationLogsRepository;
}

export const ensureRaceIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.DATABASE_STATEMENT_TIMEOUT_MS =
    process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '20000';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for race-condition integration tests');
  }
};

export const createRaceTestHarness = async (): Promise<RaceTestHarness> => {
  ensureRaceIntegrationEnv();

  const testingModule = await Test.createTestingModule({
    imports: [RaceConditionsTestModule],
  }).compile();

  await initializeIntegrationModule(testingModule);

  return {
    testingModule,
    requestContext: testingModule.get(RequestContextService),
    databaseService: testingModule.get(DatabaseService),
    transactionService: testingModule.get(TransactionService),
    billingService: testingModule.get(BillingService),
    usageMeterService: testingModule.get(UsageMeterService),
    attendanceService: testingModule.get(AttendanceService),
    syncService: testingModule.get(SyncService),
    subscriptionsRepository: testingModule.get(SubscriptionsRepository),
    studentsRepository: testingModule.get(StudentsRepository),
    attendanceRecordsRepository: testingModule.get(AttendanceRecordsRepository),
    syncOperationLogsRepository: testingModule.get(SyncOperationLogsRepository),
  };
};

export const closeRaceTestHarness = async (harness: RaceTestHarness): Promise<void> => {
  await harness.testingModule.close();
};

export const runInTenantContext = async <T>(
  harness: RaceTestHarness,
  tenantId: string,
  callback: () => Promise<T>,
  overrides: Partial<RequestContextState> = {},
): Promise<T> =>
  harness.requestContext.run(
    {
      request_id: overrides.request_id ?? `race:${randomUUID()}`,
      tenant_id: tenantId,
      user_id: overrides.user_id ?? AUTH_ANONYMOUS_USER_ID,
      role: overrides.role ?? 'owner',
      session_id: overrides.session_id ?? null,
      permissions: overrides.permissions ?? ['*:*'],
      is_authenticated: overrides.is_authenticated ?? true,
      client_ip: overrides.client_ip ?? '127.0.0.1',
      user_agent: overrides.user_agent ?? 'race-condition-tests',
      method: overrides.method ?? 'TEST',
      path: overrides.path ?? '/integration/race',
      started_at: overrides.started_at ?? new Date().toISOString(),
      billing: overrides.billing,
      db_client: overrides.db_client,
    },
    callback,
  );

export const registerTenantId = (prefix: string): string =>
  `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

export const ensureFinanceAccounts = async (
  harness: RaceTestHarness,
  tenantId: string,
  debitCode = '1000-CASH',
  creditCode = '4000-REVENUE',
): Promise<FinanceAccountFixture> => {
  const debitAccountId = randomUUID();
  const creditAccountId = randomUUID();

  await runInTenantContext(harness, tenantId, () =>
    harness.databaseService.query(
      `
        INSERT INTO accounts (
          id,
          tenant_id,
          code,
          name,
          category,
          normal_balance,
          currency_code,
          allow_manual_entries,
          is_active,
          metadata
        )
        VALUES
          ($1::uuid, $2, $3, 'Primary cash control', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
          ($4::uuid, $2, $5, 'Primary revenue control', 'revenue', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
        ON CONFLICT (tenant_id, code)
        DO NOTHING
      `,
      [debitAccountId, tenantId, debitCode, creditAccountId, creditCode],
    ),
  );

  return {
    tenant_id: tenantId,
    debit_account_id: debitAccountId,
    credit_account_id: creditAccountId,
  };
};

export const seedActiveSubscription = async (
  harness: RaceTestHarness,
  tenantId: string,
): Promise<SeededSubscription> =>
  runInTenantContext(harness, tenantId, async () => {
    const now = new Date();
    const currentPeriodStart = now.toISOString();
    const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const subscription = await harness.subscriptionsRepository.createSubscription({
      tenant_id: tenantId,
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700000111',
      currency_code: 'KES',
      features: ['students', 'attendance', 'billing.mpesa'],
      limits: {},
      seats_allocated: 10,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      trial_ends_at: null,
      activated_at: currentPeriodStart,
      metadata: {
        seeded_by: 'race-harness',
      },
    });

    return {
      id: subscription.id,
      tenant_id: subscription.tenant_id,
    };
  });

export const seedStudent = async (
  harness: RaceTestHarness,
  tenantId: string,
  suffix: string,
): Promise<SeededStudent> =>
  runInTenantContext(harness, tenantId, async () => {
    const student = await harness.studentsRepository.createStudent({
      tenant_id: tenantId,
      admission_number: `ADM-${suffix.toUpperCase()}`,
      first_name: 'Race',
      last_name: 'Student',
      middle_name: null,
      status: 'active',
      date_of_birth: null,
      gender: null,
      primary_guardian_name: 'Guardian',
      primary_guardian_phone: '254700000112',
      metadata: {
        seeded_by: 'race-harness',
      },
      created_by_user_id: null,
    });

    return {
      id: student.id,
      tenant_id: student.tenant_id,
    };
  });

export const seedAttendanceRecord = async (
  harness: RaceTestHarness,
  tenantId: string,
  studentId: string,
  attendanceDate: string,
  lastModifiedAt: string,
): Promise<SeededAttendanceRecord> =>
  runInTenantContext(harness, tenantId, async () => {
    const recordId = randomUUID();
    const result = await harness.databaseService.query<{
      id: string;
      tenant_id: string;
      student_id: string;
      attendance_date: string;
    }>(
      `
        INSERT INTO attendance_records (
          id,
          tenant_id,
          student_id,
          attendance_date,
          status,
          notes,
          metadata,
          source_device_id,
          last_modified_at,
          last_operation_id,
          sync_version
        )
        VALUES (
          $1::uuid,
          $2,
          $3::uuid,
          $4::date,
          'absent',
          'seeded',
          '{"seeded_by":"race-harness"}'::jsonb,
          'server',
          $5::timestamptz,
          NULL,
          NULL
        )
        RETURNING
          id,
          tenant_id,
          student_id,
          attendance_date::text
      `,
      [recordId, tenantId, studentId, attendanceDate, lastModifiedAt],
    );
    const record = result.rows[0];

    return {
      id: record.id,
      tenant_id: record.tenant_id,
      student_id: record.student_id,
      attendance_date: record.attendance_date,
    };
  });

export const queryRows = async <TRow extends QueryResultRow = QueryResultRow>(
  harness: RaceTestHarness,
  tenantId: string,
  text: string,
  values: unknown[] = [],
): Promise<TRow[]> =>
  runInTenantContext(harness, tenantId, async () => {
    const result = await harness.databaseService.query<TRow>(text, values);
    return result.rows;
  });

export const queryRow = async <TRow extends QueryResultRow = QueryResultRow>(
  harness: RaceTestHarness,
  tenantId: string,
  text: string,
  values: unknown[] = [],
): Promise<TRow> => {
  const rows = await queryRows<TRow>(harness, tenantId, text, values);

  if (!rows[0]) {
    throw new Error('Expected a row but query returned none');
  }

  return rows[0];
};

export const queryScalar = async <TValue>(
  harness: RaceTestHarness,
  tenantId: string,
  text: string,
  values: unknown[] = [],
): Promise<TValue> => {
  const row = await queryRow<{ value: TValue }>(harness, tenantId, text, values);
  return row.value;
};

export const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(SyncSchemaService).onModuleInit();
  await testingModule.get(BillingSchemaService).onModuleInit();
  await testingModule.get(StudentsSchemaService).onModuleInit();
};
