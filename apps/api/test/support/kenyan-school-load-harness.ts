import { randomUUID } from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';

import { AUTH_ANONYMOUS_USER_ID } from '../../src/auth/auth.constants';
import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { RequestContextState } from '../../src/common/request-context/request-context.types';
import { DatabaseSecurityService } from '../../src/database/database-security.service';
import { DatabaseService } from '../../src/database/database.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingMpesaService } from '../../src/modules/billing/billing-mpesa.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { AccountsRepository } from '../../src/modules/finance/repositories/accounts.repository';
import { MpesaCallbackProcessorService } from '../../src/modules/payments/mpesa-callback-processor.service';
import { MpesaService } from '../../src/modules/payments/mpesa.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { CallbackLogsRepository } from '../../src/modules/payments/repositories/callback-logs.repository';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { AttendanceService } from '../../src/modules/students/attendance.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { KenyanSchoolLoadTestModule } from './kenyan-school-load-test.module';

export interface KenyanSchoolLoadHarness {
  testingModule: TestingModule;
  requestContext: RequestContextService;
  databaseService: DatabaseService;
  studentsService: StudentsService;
  studentsRepository: StudentsRepository;
  attendanceService: AttendanceService;
  billingService: BillingService;
  billingMpesaService: BillingMpesaService;
  invoicesRepository: InvoicesRepository;
  subscriptionsRepository: SubscriptionsRepository;
  usageMeterService: UsageMeterService;
  transactionService: TransactionService;
  accountsRepository: AccountsRepository;
  paymentIntentsRepository: PaymentIntentsRepository;
  callbackLogsRepository: CallbackLogsRepository;
  mpesaService: MpesaService;
  mpesaCallbackProcessorService: MpesaCallbackProcessorService;
  syncService: SyncService;
  eventPublisherService: EventPublisherService;
}

export const ensureKenyanSchoolLoadEnv = (mpesaBaseUrl?: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.DATABASE_STATEMENT_TIMEOUT_MS =
    process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '30000';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.MPESA_BASE_URL = mpesaBaseUrl ?? process.env.MPESA_BASE_URL ?? 'http://127.0.0.1:65535';
  process.env.MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY ?? 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET =
    process.env.MPESA_CONSUMER_SECRET ?? 'test-consumer-secret';
  process.env.MPESA_SHORT_CODE = process.env.MPESA_SHORT_CODE ?? '174379';
  process.env.MPESA_PASSKEY = process.env.MPESA_PASSKEY ?? 'test-passkey';
  process.env.MPESA_CALLBACK_URL =
    process.env.MPESA_CALLBACK_URL ?? 'http://127.0.0.1:3000/payments/mpesa/callback';
  process.env.MPESA_CALLBACK_SECRET =
    process.env.MPESA_CALLBACK_SECRET ?? 'kenyan-school-load-secret';
  process.env.MPESA_LEDGER_DEBIT_ACCOUNT_CODE =
    process.env.MPESA_LEDGER_DEBIT_ACCOUNT_CODE ?? '1100-MPESA-CLEARING';
  process.env.MPESA_LEDGER_CREDIT_ACCOUNT_CODE =
    process.env.MPESA_LEDGER_CREDIT_ACCOUNT_CODE ?? '2100-CUSTOMER-DEPOSITS';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for Kenyan school load scripts');
  }
};

export const createKenyanSchoolLoadHarness = async (
  options: { mpesaBaseUrl?: string } = {},
): Promise<KenyanSchoolLoadHarness> => {
  ensureKenyanSchoolLoadEnv(options.mpesaBaseUrl);

  const testingModule = await Test.createTestingModule({
    imports: [KenyanSchoolLoadTestModule],
  }).compile();

  await initializeIntegrationModule(testingModule);

  return {
    testingModule,
    requestContext: testingModule.get(RequestContextService),
    databaseService: testingModule.get(DatabaseService),
    studentsService: testingModule.get(StudentsService),
    studentsRepository: testingModule.get(StudentsRepository),
    attendanceService: testingModule.get(AttendanceService),
    billingService: testingModule.get(BillingService),
    billingMpesaService: testingModule.get(BillingMpesaService),
    invoicesRepository: testingModule.get(InvoicesRepository),
    subscriptionsRepository: testingModule.get(SubscriptionsRepository),
    usageMeterService: testingModule.get(UsageMeterService),
    transactionService: testingModule.get(TransactionService),
    accountsRepository: testingModule.get(AccountsRepository),
    paymentIntentsRepository: testingModule.get(PaymentIntentsRepository),
    callbackLogsRepository: testingModule.get(CallbackLogsRepository),
    mpesaService: testingModule.get(MpesaService),
    mpesaCallbackProcessorService: testingModule.get(MpesaCallbackProcessorService),
    syncService: testingModule.get(SyncService),
    eventPublisherService: testingModule.get(EventPublisherService),
  };
};

export const closeKenyanSchoolLoadHarness = async (
  harness: KenyanSchoolLoadHarness,
): Promise<void> => {
  await harness.testingModule.close();
};

export const runInKenyanTenantContext = async <T>(
  harness: KenyanSchoolLoadHarness,
  tenantId: string,
  callback: () => Promise<T>,
  overrides: Partial<RequestContextState> = {},
): Promise<T> =>
  harness.requestContext.run(
    {
      request_id: overrides.request_id ?? `kenya-load:${randomUUID()}`,
      tenant_id: tenantId,
      user_id: overrides.user_id ?? AUTH_ANONYMOUS_USER_ID,
      role: overrides.role ?? 'owner',
      session_id: overrides.session_id ?? null,
      permissions: overrides.permissions ?? ['*:*'],
      is_authenticated: overrides.is_authenticated ?? true,
      client_ip: overrides.client_ip ?? '127.0.0.1',
      user_agent: overrides.user_agent ?? 'kenyan-school-load',
      method: overrides.method ?? 'TEST',
      path: overrides.path ?? '/integration/kenyan-school-load',
      started_at: overrides.started_at ?? new Date().toISOString(),
      billing: overrides.billing,
      db_client: overrides.db_client,
    },
    callback,
  );

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(StudentsSchemaService).onModuleInit();
  await testingModule.get(BillingSchemaService).onModuleInit();
  await testingModule.get(EventsSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
  await testingModule.get(SyncSchemaService).onModuleInit();
};

