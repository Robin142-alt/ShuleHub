import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool, QueryResultRow } from 'pg';
import request from 'supertest';

import { AUTH_ANONYMOUS_USER_ID, AUTH_SESSION_PREFIX } from '../src/auth/auth.constants';
import { AuthSchemaService } from '../src/auth/auth-schema.service';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseSecurityService } from '../src/database/database-security.service';
import { DatabaseService } from '../src/database/database.service';
import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { EventConsumerService } from '../src/modules/events/event-consumer.service';
import { EventPublisherService } from '../src/modules/events/event-publisher.service';
import { EventsSchemaService } from '../src/modules/events/events-schema.service';
import { DispatchOutboxEventJobPayload } from '../src/modules/events/events.types';
import { OutboxEventsRepository } from '../src/modules/events/repositories/outbox-events.repository';
import { FinanceSchemaService } from '../src/modules/finance/finance-schema.service';
import { PostedFinancialTransaction } from '../src/modules/finance/finance.types';
import { TransactionService } from '../src/modules/finance/transaction.service';
import { MpesaCallbackProcessorService } from '../src/modules/payments/mpesa-callback-processor.service';
import { PaymentsSchemaService } from '../src/modules/payments/payments-schema.service';
import { MpesaService } from '../src/modules/payments/mpesa.service';
import { PaymentIntentEntity } from '../src/modules/payments/entities/payment-intent.entity';
import { ProcessMpesaCallbackJobPayload } from '../src/modules/payments/payments.types';
import { SyncSchemaService } from '../src/modules/sync/sync-schema.service';
import { CapturingQueueService } from './support/capturing-queue.service';
import { ChaosAuthTestModule } from './support/chaos-auth-test.module';
import { ChaosEventsTestModule } from './support/chaos-events-test.module';
import { ChaosFinanceTestModule } from './support/chaos-finance-test.module';
import { CrashOnceStudentCreatedConsumer } from './support/crash-once-student-created.consumer';
import { FinanceIntegrityTestModule } from './support/finance-integrity-test.module';
import { FlakyLedgerEntriesRepository } from './support/flaky-ledger-entries.repository';
import { MpesaAdversarialTestModule } from './support/mpesa-adversarial-test.module';
import { MpesaMockServer } from './support/mpesa-mock-server';
import { ToggleableInMemoryRedis } from './support/toggleable-in-memory-redis';

jest.setTimeout(300000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  email: string;
  password: string;
  user_id: string;
  session_id: string;
  access_token: string;
};

type LedgerFixture = {
  tenant_id: string;
  debit_account_id: string;
  credit_account_id: string;
};

describe('Chaos recovery integration', () => {
  let pool: Pool;

  let authTestingModule: TestingModule;
  let authApp: INestApplication;
  let authRedis: ToggleableInMemoryRedis;

  let financeTestingModule: TestingModule;
  let financeRequestContext: RequestContextService;
  let financeDatabaseService: DatabaseService;
  let transactionService: TransactionService;
  let flakyLedgerEntriesRepository: FlakyLedgerEntriesRepository;

  let eventsTestingModule: TestingModule;
  let eventsRequestContext: RequestContextService;
  let eventsDatabaseService: DatabaseService;
  let eventPublisherService: EventPublisherService;
  let eventConsumerService: EventConsumerService;
  let outboxEventsRepository: OutboxEventsRepository;
  let crashOnceStudentCreatedConsumer: CrashOnceStudentCreatedConsumer;

  let mpesaTestingModule: TestingModule;
  let mpesaApp: INestApplication;
  let mpesaRequestContext: RequestContextService;
  let mpesaDatabaseService: DatabaseService;
  let mpesaService: MpesaService;
  let mpesaCallbackProcessor: MpesaCallbackProcessorService;
  let mpesaQueueService: CapturingQueueService;
  let mpesaMockServer: MpesaMockServer;

  const tenantIds = new Set<string>();
  const userEmails = new Set<string>();
  const authSuffix = randomUUID().replace(/-/g, '').slice(0, 8);

  beforeAll(async () => {
    ensureBaseIntegrationEnv();
    pool = createDatabasePool();

    authRedis = new ToggleableInMemoryRedis();

    authTestingModule = await Test.createTestingModule({
      imports: [ChaosAuthTestModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(authRedis)
      .compile();

    authApp = authTestingModule.createNestApplication();
    authApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await authApp.init();

    financeTestingModule = await Test.createTestingModule({
      imports: [ChaosFinanceTestModule],
    }).compile();
    await initializeFinanceIntegrationModule(financeTestingModule);
    financeRequestContext = financeTestingModule.get(RequestContextService);
    financeDatabaseService = financeTestingModule.get(DatabaseService);
    transactionService = financeTestingModule.get(TransactionService);
    flakyLedgerEntriesRepository = financeTestingModule.get(FlakyLedgerEntriesRepository);

    eventsTestingModule = await Test.createTestingModule({
      imports: [ChaosEventsTestModule],
    }).compile();
    await initializeEventsIntegrationModule(eventsTestingModule);
    eventsRequestContext = eventsTestingModule.get(RequestContextService);
    eventsDatabaseService = eventsTestingModule.get(DatabaseService);
    eventPublisherService = eventsTestingModule.get(EventPublisherService);
    eventConsumerService = eventsTestingModule.get(EventConsumerService);
    outboxEventsRepository = eventsTestingModule.get(OutboxEventsRepository);
    crashOnceStudentCreatedConsumer = eventsTestingModule.get(CrashOnceStudentCreatedConsumer);

    const callbackPort = await reservePort();
    mpesaMockServer = new MpesaMockServer('mpesa-test-secret');
    await mpesaMockServer.start();
    ensureMpesaIntegrationEnv(callbackPort, mpesaMockServer.baseUrl);

    const schemaBootstrapModule = await Test.createTestingModule({
      imports: [FinanceIntegrityTestModule],
    }).compile();
    await initializePaymentsIntegrationModule(schemaBootstrapModule);
    await schemaBootstrapModule.close();

    mpesaTestingModule = await Test.createTestingModule({
      imports: [MpesaAdversarialTestModule],
    }).compile();

    mpesaApp = mpesaTestingModule.createNestApplication({
      rawBody: true,
    });
    await mpesaApp.init();
    await mpesaApp.listen(callbackPort, '127.0.0.1');

    mpesaRequestContext = mpesaTestingModule.get(RequestContextService);
    mpesaDatabaseService = mpesaTestingModule.get(DatabaseService);
    mpesaService = mpesaTestingModule.get(MpesaService);
    mpesaCallbackProcessor = mpesaTestingModule.get(MpesaCallbackProcessorService);
    mpesaQueueService = mpesaTestingModule.get(CapturingQueueService);
  });

  afterEach(async () => {
    mpesaMockServer?.reset();
    mpesaQueueService?.clear();
    crashOnceStudentCreatedConsumer?.crashNext(0);
  });

  afterAll(async () => {
    await cleanupSeedData(pool, [...tenantIds], [...userEmails]);
    await mpesaApp?.close();
    await mpesaMockServer?.stop();
    await eventsTestingModule?.close();
    await financeTestingModule?.close();
    await authApp?.close();
    await pool?.end();
  });

  test('recovers cleanly from Redis session persistence failure without committing partial tenant registration state', async () => {
    const tenantId = registerTenantId('chaos-auth');
    const host = `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`;
    const email = `chaos-auth-${authSuffix}-${randomUUID().slice(0, 8)}@example.test`;
    userEmails.add(email.toLowerCase());

    authRedis.failNext('set');

    await request(authApp.getHttpServer())
      .post('/auth/register')
      .set('host', host)
      .send({
        email,
        password: 'SecurePass!123',
        display_name: 'Chaos Auth User',
      })
      .expect(500);

    expect(await countUsersByEmail(pool, email)).toBe(0);
    expect(await countTenantMemberships(pool, tenantId)).toBe(0);
    expect(await countTenantRoles(pool, tenantId)).toBe(0);

    const response = await request(authApp.getHttpServer())
      .post('/auth/register')
      .set('host', host)
      .send({
        email,
        password: 'SecurePass!123',
        display_name: 'Chaos Auth User',
      })
      .expect(201);

    expect(await countUsersByEmail(pool, email)).toBe(1);
    expect(await countTenantMemberships(pool, tenantId)).toBe(1);
    expect(await countTenantRoles(pool, tenantId)).toBeGreaterThan(0);

    const sessionId = response.body.user.session_id as string;
    const storedSession = await authRedis.get(`${AUTH_SESSION_PREFIX}:${sessionId}`);

    expect(storedSession).not.toBeNull();
  });

  test('rolls back a ledger post on simulated database connection drop and succeeds on retry without duplicate state', async () => {
    const fixture = await createLedgerFixture('chaos-finance');
    const idempotencyKey = `chaos-finance:${fixture.tenant_id}`;

    flakyLedgerEntriesRepository.failNextInsert();

    await expect(
      runInFinanceTenantContext(fixture.tenant_id, () =>
        transactionService.postTransaction({
          idempotency_key: idempotencyKey,
          reference: `CHAOS-FIN-${fixture.tenant_id}`,
          description: 'Chaos DB drop simulation',
          entries: [
            {
              account_id: fixture.debit_account_id,
              direction: 'debit',
              amount_minor: '25000',
            },
            {
              account_id: fixture.credit_account_id,
              direction: 'credit',
              amount_minor: '25000',
            },
          ],
        }),
      ),
    ).rejects.toThrow(/connection terminated unexpectedly/i);

    expect(await countRowsByTenant(pool, 'transactions', fixture.tenant_id)).toBe(0);
    expect(await countRowsByTenant(pool, 'ledger_entries', fixture.tenant_id)).toBe(0);
    expect(await countRowsByTenant(pool, 'idempotency_keys', fixture.tenant_id)).toBe(0);

    const posted = await runInFinanceTenantContext(fixture.tenant_id, () =>
      transactionService.postTransaction({
        idempotency_key: idempotencyKey,
        reference: `CHAOS-FIN-${fixture.tenant_id}`,
        description: 'Chaos DB drop simulation',
        entries: [
          {
            account_id: fixture.debit_account_id,
            direction: 'debit',
            amount_minor: '25000',
          },
          {
            account_id: fixture.credit_account_id,
            direction: 'credit',
            amount_minor: '25000',
          },
        ],
      }),
    );

    expect(posted.entries).toHaveLength(2);
    expect(await countRowsByTenant(pool, 'transactions', fixture.tenant_id)).toBe(1);
    expect(await countRowsByTenant(pool, 'ledger_entries', fixture.tenant_id)).toBe(2);
    expect(await countCompletedIdempotencyKeys(pool, fixture.tenant_id, idempotencyKey)).toBe(1);
    await assertNoLedgerImbalances(pool, fixture.tenant_id);
  });

  test('retries a crashed event worker without duplicate side effects or lost outbox events', async () => {
    const tenantId = registerTenantId('chaos-events');
    const studentId = randomUUID();

    await runInEventsTenantContext(tenantId, async () => {
      await eventsDatabaseService.withRequestTransaction(async () => {
        await eventPublisherService.publishStudentCreated({
          tenant_id: tenantId,
          student_id: studentId,
          created_at: new Date().toISOString(),
          created_by_user_id: null,
          admission_number: `CHAOS-${studentId.slice(0, 8)}`,
          first_name: 'Chaos',
          last_name: 'Student',
          metadata: {
            source: 'chaos.integration-spec',
          },
        });
      });
    });

    crashOnceStudentCreatedConsumer.crashNext(1);

    const firstClaim = await claimOutboxEvent(tenantId);
    await expect(eventConsumerService.consume(firstClaim)).rejects.toThrow(
      /simulated queue worker crash/i,
    );

    const failedEventState = await getOutboxEventState(pool, tenantId);
    expect(failedEventState.status).toBe('failed');
    expect(failedEventState.attempt_count).toBe(1);
    expect(await countAuditLogsByAction(pool, tenantId, 'chaos.student.created.processed')).toBe(0);

    await sleep(40);

    const secondClaim = await claimOutboxEvent(tenantId);
    await expect(eventConsumerService.consume(secondClaim)).resolves.toBeUndefined();

    const publishedEventState = await getOutboxEventState(pool, tenantId);
    expect(publishedEventState.status).toBe('published');
    expect(publishedEventState.attempt_count).toBe(2);
    expect(await countAuditLogsByAction(pool, tenantId, 'chaos.student.created.processed')).toBe(1);
    expect(await countCompletedConsumerRuns(pool, tenantId, 'chaos.student-created')).toBe(1);
  });

  test('recovers from MPESA downtime without persisting inconsistent payment state and posts once after retry', async () => {
    const tenantId = registerTenantId('chaos-mpesa');
    const idempotencyKey = `chaos-mpesa:${tenantId}`;

    await ensureMpesaLedgerAccounts(tenantId);

    mpesaMockServer.enqueueScenario({
      type: 'timeout',
      response_delay_ms: 600,
    });

    await expect(
      runInMpesaTenantContext(tenantId, () =>
        mpesaService.createPaymentIntent({
          idempotency_key: idempotencyKey,
          amount_minor: '10000',
          phone_number: '254700000301',
          account_reference: `ACC-${tenantId}`,
          transaction_desc: 'Chaos timeout payment',
          external_reference: `EXT-${tenantId}`,
          metadata: {
            source: 'chaos.integration-spec',
          },
        }),
      ),
    ).rejects.toThrow(/timeout|abort/i);

    expect(await countRowsByTenant(pool, 'payment_intents', tenantId)).toBe(0);
    expect(await countRowsByTenant(pool, 'mpesa_transactions', tenantId)).toBe(0);
    expect(await countRowsByTenant(pool, 'callback_logs', tenantId)).toBe(0);
    expect(await countCompletedIdempotencyKeys(pool, tenantId, idempotencyKey)).toBe(0);

    mpesaMockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [
        {
          delivery_id: `delivery-${tenantId}`,
        },
      ],
    });

    const response = await runInMpesaTenantContext(tenantId, () =>
      mpesaService.createPaymentIntent({
        idempotency_key: idempotencyKey,
        amount_minor: '10000',
        phone_number: '254700000301',
        account_reference: `ACC-${tenantId}`,
        transaction_desc: 'Chaos timeout payment',
        external_reference: `EXT-${tenantId}`,
        metadata: {
          source: 'chaos.integration-spec',
        },
      }),
    );

    await mpesaMockServer.waitForCallbacks(1, 6000);
    await mpesaQueueService.waitForJobs(1, 6000);
    const queueErrors = await mpesaQueueService.drain<ProcessMpesaCallbackJobPayload>(
      async (job) => {
        await mpesaCallbackProcessor.process(job.payload);
      },
    );

    expect(queueErrors).toHaveLength(0);
    expect(await getPaymentIntentStatus(pool, tenantId, response.payment_intent_id)).toBe('completed');
    expect(await countRowsByTenant(pool, 'payment_intents', tenantId)).toBe(1);
    expect(await countRowsByTenant(pool, 'mpesa_transactions', tenantId)).toBe(1);
    expect(await countRowsByTenant(pool, 'transactions', tenantId)).toBe(1);
    expect(await countRowsByTenant(pool, 'ledger_entries', tenantId)).toBe(2);
    expect(await countCompletedIdempotencyKeys(pool, tenantId, idempotencyKey)).toBe(1);
    await assertNoLedgerImbalances(pool, tenantId);
  });

  const runInFinanceTenantContext = async <T>(
    tenantId: string,
    callback: () => Promise<T>,
    requestId = `chaos-finance:${randomUUID()}`,
  ): Promise<T> =>
    financeRequestContext.run(
      buildRequestContext(tenantId, requestId, '/integration/chaos/finance', 'TEST'),
      callback,
    );

  const runInEventsTenantContext = async <T>(
    tenantId: string,
    callback: () => Promise<T>,
    requestId = `chaos-events:${randomUUID()}`,
  ): Promise<T> =>
    eventsRequestContext.run(
      buildRequestContext(tenantId, requestId, '/integration/chaos/events', 'TEST'),
      callback,
    );

  const runInMpesaTenantContext = async <T>(
    tenantId: string,
    callback: () => Promise<T>,
    requestId = `chaos-mpesa:${randomUUID()}`,
  ): Promise<T> =>
    mpesaRequestContext.run(
      buildRequestContext(tenantId, requestId, '/integration/chaos/mpesa', 'POST'),
      callback,
    );

  const createLedgerFixture = async (prefix: string): Promise<LedgerFixture> => {
    const tenantId = registerTenantId(prefix);
    const debitAccountId = randomUUID();
    const creditAccountId = randomUUID();

    await runInFinanceTenantContext(tenantId, async () => {
      await financeDatabaseService.withRequestTransaction(async () => {
        await financeDatabaseService.query(
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
              ($1::uuid, $2, $3, 'Chaos Cash', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
              ($4::uuid, $2, $5, 'Chaos Revenue', 'revenue', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
          `,
          [debitAccountId, tenantId, `1000-${tenantId}`, creditAccountId, `4000-${tenantId}`],
        );
      });
    });

    return {
      tenant_id: tenantId,
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId,
    };
  };

  const claimOutboxEvent = async (tenantId: string): Promise<DispatchOutboxEventJobPayload> =>
    eventsRequestContext.run(
      {
        ...buildRequestContext(tenantId, `outbox-claim:${randomUUID()}`, '/internal/events/claim', 'WORKER'),
        role: 'system',
      },
      async () =>
        eventsDatabaseService.withRequestTransaction(async () => {
          const claimedEvents = await outboxEventsRepository.lockPendingBatch(1, 100);

          if (!claimedEvents[0]) {
            throw new Error(`Expected a queued outbox event for tenant "${tenantId}"`);
          }

          return {
            outbox_event_id: claimedEvents[0].id,
            tenant_id: claimedEvents[0].tenant_id,
            request_id: claimedEvents[0].request_id,
          };
        }),
    );

  const ensureMpesaLedgerAccounts = async (tenantId: string): Promise<void> => {
    const debitAccountId = randomUUID();
    const creditAccountId = randomUUID();

    await runInMpesaTenantContext(tenantId, async () => {
      await mpesaDatabaseService.query(
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
            ($1::uuid, $2, '1100-MPESA-CLEARING', 'MPESA Clearing', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
            ($3::uuid, $2, '2100-CUSTOMER-DEPOSITS', 'Customer Deposits', 'liability', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
          ON CONFLICT (tenant_id, code)
          DO NOTHING
        `,
        [debitAccountId, tenantId, creditAccountId],
      );
    });
  };
});

const ensureBaseIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? 'integration.test';
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'shule-hub-chaos-tests';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'shule-hub-chaos-clients';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'chaos-access-secret';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'chaos-refresh-secret';
  process.env.DATABASE_RUNTIME_ROLE =
    process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.DATABASE_STATEMENT_TIMEOUT_MS =
    process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '20000';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.EVENTS_RETRY_DELAY_MS = process.env.EVENTS_RETRY_DELAY_MS ?? '20';
  process.env.EVENTS_MAX_ATTEMPTS = process.env.EVENTS_MAX_ATTEMPTS ?? '5';
  process.env.MPESA_LEDGER_DEBIT_ACCOUNT_CODE =
    process.env.MPESA_LEDGER_DEBIT_ACCOUNT_CODE ?? '1100-MPESA-CLEARING';
  process.env.MPESA_LEDGER_CREDIT_ACCOUNT_CODE =
    process.env.MPESA_LEDGER_CREDIT_ACCOUNT_CODE ?? '2100-CUSTOMER-DEPOSITS';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for chaos integration tests');
  }
};

const ensureMpesaIntegrationEnv = (callbackPort: number, mpesaBaseUrl: string): void => {
  process.env.APP_BASE_DOMAIN = 'localhost';
  process.env.MPESA_CALLBACK_SECRET = 'mpesa-test-secret';
  process.env.MPESA_BASE_URL = mpesaBaseUrl;
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORT_CODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_REQUEST_TIMEOUT_MS = '200';
  process.env.MPESA_CALLBACK_URL = `http://127.0.0.1:${callbackPort}/payments/mpesa/callback`;
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-chaos-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

const initializeFinanceIntegrationModule = async (
  testingModule: TestingModule,
): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
};

const initializeEventsIntegrationModule = async (
  testingModule: TestingModule,
): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(EventsSchemaService).onModuleInit();
};

const initializePaymentsIntegrationModule = async (
  testingModule: TestingModule,
): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
  await testingModule.get(SyncSchemaService).onModuleInit();
};

const buildRequestContext = (
  tenantId: string,
  requestId: string,
  path: string,
  method: string,
) => ({
  request_id: requestId,
  tenant_id: tenantId,
  user_id: AUTH_ANONYMOUS_USER_ID,
  role: 'owner',
  session_id: null,
  permissions: ['*:*'],
  is_authenticated: true,
  client_ip: '127.0.0.1',
  user_agent: 'chaos-integration-tests',
  method,
  path,
  started_at: new Date().toISOString(),
});

const registerTenantId = (prefix: string): string =>
  `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const countUsersByEmail = async (pool: Pool, email: string): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM users
      WHERE lower(email) = $1
    `,
    [email.toLowerCase()],
  );

  return result.rows[0]?.value ?? 0;
};

const countTenantMemberships = async (pool: Pool, tenantId: string): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM tenant_memberships
      WHERE tenant_id = $1
    `,
    [tenantId],
  );

  return result.rows[0]?.value ?? 0;
};

const countTenantRoles = async (pool: Pool, tenantId: string): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM roles
      WHERE tenant_id = $1
    `,
    [tenantId],
  );

  return result.rows[0]?.value ?? 0;
};

const countRowsByTenant = async (
  pool: Pool,
  tableName: 'transactions' | 'ledger_entries' | 'idempotency_keys' | 'payment_intents' | 'mpesa_transactions' | 'callback_logs',
  tenantId: string,
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM ${tableName}
      WHERE tenant_id = $1
    `,
    [tenantId],
  );

  return result.rows[0]?.value ?? 0;
};

const countCompletedIdempotencyKeys = async (
  pool: Pool,
  tenantId: string,
  idempotencyKey: string,
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM idempotency_keys
      WHERE tenant_id = $1
        AND idempotency_key = $2
        AND status = 'completed'
    `,
    [tenantId, idempotencyKey],
  );

  return result.rows[0]?.value ?? 0;
};

const getOutboxEventState = async (
  pool: Pool,
  tenantId: string,
): Promise<{
  status: string;
  attempt_count: number;
} > => {
  const result = await pool.query<{
    status: string;
    attempt_count: number;
  }>(
    `
      SELECT status, attempt_count
      FROM outbox_events
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [tenantId],
  );

  if (!result.rows[0]) {
    throw new Error(`Expected an outbox event for tenant "${tenantId}"`);
  }

  return result.rows[0];
};

const countAuditLogsByAction = async (
  pool: Pool,
  tenantId: string,
  action: string,
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM audit_logs
      WHERE tenant_id = $1
        AND action = $2
    `,
    [tenantId, action],
  );

  return result.rows[0]?.value ?? 0;
};

const countCompletedConsumerRuns = async (
  pool: Pool,
  tenantId: string,
  consumerName: string,
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    `
      SELECT COUNT(*)::int AS value
      FROM event_consumer_runs
      WHERE tenant_id = $1
        AND consumer_name = $2
        AND status = 'completed'
    `,
    [tenantId, consumerName],
  );

  return result.rows[0]?.value ?? 0;
};

const getPaymentIntentStatus = async (
  pool: Pool,
  tenantId: string,
  paymentIntentId: string,
): Promise<string> => {
  const result = await pool.query<{ status: string }>(
    `
      SELECT status
      FROM payment_intents
      WHERE tenant_id = $1
        AND id = $2::uuid
      LIMIT 1
    `,
    [tenantId, paymentIntentId],
  );

  if (!result.rows[0]) {
    throw new Error(`Expected payment intent "${paymentIntentId}" in tenant "${tenantId}"`);
  }

  return result.rows[0].status;
};

const assertNoLedgerImbalances = async (pool: Pool, tenantId: string): Promise<void> => {
  const result = await pool.query<QueryResultRow>(
    `
      SELECT t.id
      FROM transactions t
      LEFT JOIN ledger_entries le
        ON le.tenant_id = t.tenant_id
       AND le.transaction_id = t.id
      WHERE t.tenant_id = $1
      GROUP BY t.id, t.entry_count
      HAVING COUNT(le.id) <> t.entry_count
         OR COALESCE(
              SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END),
              0
            ) <> COALESCE(
              SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END),
              0
            )
         OR COUNT(DISTINCT le.currency_code) <> 1
    `,
    [tenantId],
  );

  expect(result.rows).toHaveLength(0);
};

const cleanupSeedData = async (
  pool: Pool,
  tenantIds: string[],
  emails: string[],
): Promise<void> => {
  if (tenantIds.length === 0 && emails.length === 0) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER USER');
    await client.query('ALTER TABLE transactions DISABLE TRIGGER USER');
    await client.query(`DELETE FROM event_consumer_runs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM outbox_events WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM callback_logs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM mpesa_transactions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM payment_intents WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM ledger_entries WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM transactions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM accounts WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM idempotency_keys WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM role_permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM roles WHERE tenant_id = ANY($1::text[])`, [tenantIds]);

    if (emails.length > 0) {
      await client.query(`DELETE FROM users WHERE lower(email) = ANY($1::text[])`, [emails]);
    }

    await client.query('ALTER TABLE transactions ENABLE TRIGGER USER');
    await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER USER');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const reservePort = async (): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve callback port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));
