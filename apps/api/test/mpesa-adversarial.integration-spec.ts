import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';

import { AUTH_ANONYMOUS_USER_ID } from '../src/auth/auth.constants';
import { AuthSchemaService } from '../src/auth/auth-schema.service';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseSecurityService } from '../src/database/database-security.service';
import { DatabaseService } from '../src/database/database.service';
import { FinanceSchemaService } from '../src/modules/finance/finance-schema.service';
import { MpesaCallbackProcessorService } from '../src/modules/payments/mpesa-callback-processor.service';
import { PaymentsSchemaService } from '../src/modules/payments/payments-schema.service';
import { MpesaService } from '../src/modules/payments/mpesa.service';
import { PaymentIntentEntity } from '../src/modules/payments/entities/payment-intent.entity';
import { ProcessMpesaCallbackJobPayload } from '../src/modules/payments/payments.types';
import { SyncSchemaService } from '../src/modules/sync/sync-schema.service';
import { CapturingQueueService } from './support/capturing-queue.service';
import { FinanceIntegrityTestModule } from './support/finance-integrity-test.module';
import { InMemoryMpesaReplayProtectionService } from './support/in-memory-mpesa-replay-protection.service';
import { MpesaAdversarialTestModule } from './support/mpesa-adversarial-test.module';
import { MpesaMockServer } from './support/mpesa-mock-server';

jest.setTimeout(240000);

describe('MPESA adversarial integration', () => {
  let testingModule: TestingModule;
  let app: INestApplication;
  let requestContext: RequestContextService;
  let databaseService: DatabaseService;
  let mpesaService: MpesaService;
  let mpesaCallbackProcessor: MpesaCallbackProcessorService;
  let queueService: CapturingQueueService;
  let replayProtectionService: InMemoryMpesaReplayProtectionService;
  let mockServer: MpesaMockServer;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    const callbackPort = await reservePort();
    mockServer = new MpesaMockServer('mpesa-test-secret');
    await mockServer.start();
    ensureIntegrationEnv(callbackPort, mockServer.baseUrl);

    const schemaBootstrapModule = await Test.createTestingModule({
      imports: [FinanceIntegrityTestModule],
    }).compile();
    await initializeIntegrationModule(schemaBootstrapModule);
    await schemaBootstrapModule.close();

    testingModule = await Test.createTestingModule({
      imports: [MpesaAdversarialTestModule],
    }).compile();

    app = testingModule.createNestApplication({
      rawBody: true,
    });
    await app.init();
    await app.listen(callbackPort, '127.0.0.1');

    requestContext = testingModule.get(RequestContextService);
    databaseService = testingModule.get(DatabaseService);
    mpesaService = testingModule.get(MpesaService);
    mpesaCallbackProcessor = testingModule.get(MpesaCallbackProcessorService);
    queueService = testingModule.get(CapturingQueueService);
    replayProtectionService = testingModule.get(InMemoryMpesaReplayProtectionService);
  });

  afterEach(async () => {
    await mockServer.waitForCallbacks(undefined, 6000).catch(() => undefined);
    mockServer.reset();
    replayProtectionService.reset();
    queueService.clear();
  });

  afterAll(async () => {
    await cleanupTenants();
    await app?.close();
    await mockServer?.stop();
  });

  test('duplicate callbacks do not create duplicate ledger writes', async () => {
    const tenantId = registerTenantId('dup');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [
        {
          delivery_id: `delivery-${tenantId}-a`,
        },
        {
          delay_ms: 50,
          delivery_id: `delivery-${tenantId}-b`,
        },
      ],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '10000',
      phone_number: '254700000101',
    });

    expect(paymentIntent.status).toBe('stk_requested');
    await mockServer.waitForCallbacks(2, 6000);
    await queueService.waitForJobs(2, 6000);
    const queueErrors = await drainCallbackQueue();

    expect(queueErrors).toHaveLength(0);
    await assertSinglePaymentPosting(tenantId, paymentIntent.id, `checkout-${tenantId}`, 'completed');
  });

  test('delayed callbacks resolve an STK-pushed payment later without double writes', async () => {
    const tenantId = registerTenantId('delay');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [
        {
          delay_ms: 300,
          delivery_id: `delivery-${tenantId}-delay`,
        },
      ],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '12500',
      phone_number: '254700000102',
    });

    expect(paymentIntent.status).toBe('stk_requested');
    expect(await countRows('transactions', tenantId)).toBe(0);

    await sleep(100);
    expect(queueService.getJobs()).toHaveLength(0);
    expect(await getPaymentIntentStatus(tenantId, paymentIntent.id)).toBe('stk_requested');

    await mockServer.waitForCallbacks(1, 6000);
    await queueService.waitForJobs(1, 6000);
    const queueErrors = await drainCallbackQueue();

    expect(queueErrors).toHaveLength(0);
    await assertSinglePaymentPosting(tenantId, paymentIntent.id, `checkout-${tenantId}`, 'completed');
  });

  test('missing callbacks leave the payment unresolved and do not write the ledger', async () => {
    const tenantId = registerTenantId('missing');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '15000',
      phone_number: '254700000103',
    });

    await sleep(400);

    expect(queueService.getJobs()).toHaveLength(0);
    expect(await getPaymentIntentStatus(tenantId, paymentIntent.id)).toBe('stk_requested');
    expect(await countRows('transactions', tenantId)).toBe(0);
    expect(await countRows('mpesa_transactions', tenantId)).toBe(0);
    await assertNoLedgerImbalances(tenantId);
  });

  test('invalid signatures are rejected before queueing and do not mutate payment state', async () => {
    const tenantId = registerTenantId('sig');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [
        {
          delivery_id: `delivery-${tenantId}-invalid`,
          signature_mode: 'invalid',
        },
      ],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '17500',
      phone_number: '254700000104',
    });

    const callbacks = await mockServer.waitForCallbacks(1, 6000);

    expect(callbacks[0].status_code).toBe(401);
    expect(queueService.getJobs()).toHaveLength(0);
    expect(await getPaymentIntentStatus(tenantId, paymentIntent.id)).toBe('stk_requested');
    expect(await countRows('transactions', tenantId)).toBe(0);
    expect(await countRows('mpesa_transactions', tenantId)).toBe(0);
  });

  test('replay attacks are absorbed and only the first callback is processed', async () => {
    const tenantId = registerTenantId('replay');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [
        {
          delivery_id: `delivery-${tenantId}-replay`,
        },
        {
          delay_ms: 50,
          delivery_id: `delivery-${tenantId}-replay`,
        },
      ],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '19000',
      phone_number: '254700000105',
    });

    const callbacks = await mockServer.waitForCallbacks(2, 6000);

    expect(callbacks[0].status_code).toBe(200);
    expect(callbacks[1].status_code).toBe(200);
    expect(callbacks[1].response_body).toContain('"duplicate":true');
    await queueService.waitForJobs(1, 6000);
    const queueErrors = await drainCallbackQueue();

    expect(queueErrors).toHaveLength(0);
    await assertSinglePaymentPosting(tenantId, paymentIntent.id, `checkout-${tenantId}`, 'completed');

    const replayedLogs = await queryScalar<number>(
      `
        SELECT COUNT(*)::int AS value
        FROM callback_logs
        WHERE tenant_id = $1
          AND processing_status = 'replayed'
      `,
      [tenantId],
    );

    expect(replayedLogs).toBe(1);
  });

  test('partial callback data does not create a ledger write and leaves the payment unresolved', async () => {
    const tenantId = registerTenantId('partial');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [
        {
          delivery_id: `delivery-${tenantId}-partial`,
          payload: {
            Body: {
              stkCallback: {
                MerchantRequestID: `merchant-${tenantId}`,
                CheckoutRequestID: `checkout-${tenantId}`,
                ResultCode: 0,
                ResultDesc: 'The service request is processed successfully.',
                CallbackMetadata: {
                  Item: [
                    { Name: 'MpesaReceiptNumber', Value: `REC-${tenantId}` },
                    { Name: 'TransactionDate', Value: 20260426141545 },
                    { Name: 'PhoneNumber', Value: 254700000106 },
                  ],
                },
              },
            },
          },
        },
      ],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '20000',
      phone_number: '254700000106',
    });

    await mockServer.waitForCallbacks(1, 6000);
    await queueService.waitForJobs(1, 6000);
    const queueErrors = await drainCallbackQueue();

    expect(queueErrors).toHaveLength(1);
    expect(queueErrors[0].message).toContain('missing amount metadata');
    expect(await getPaymentIntentStatus(tenantId, paymentIntent.id)).toBe('stk_requested');
    expect(await countRows('transactions', tenantId)).toBe(0);
    expect(await countRows('mpesa_transactions', tenantId)).toBe(0);

    const failedLogs = await queryScalar<number>(
      `
        SELECT COUNT(*)::int AS value
        FROM callback_logs
        WHERE tenant_id = $1
          AND processing_status = 'failed'
      `,
      [tenantId],
    );

    expect(failedLogs).toBe(1);
  });

  test('STK push timeouts do not leave behind pending payment state', async () => {
    const tenantId = registerTenantId('timeout');
    mockServer.enqueueScenario({
      type: 'timeout',
      response_delay_ms: 800,
    });

    await expect(
      createPaymentIntent(tenantId, {
        account_reference: `ACC-${tenantId}`,
        external_reference: `EXT-${tenantId}`,
        amount_minor: '21000',
        phone_number: '254700000107',
      }),
    ).rejects.toThrow();

    expect(await countRows('payment_intents', tenantId)).toBe(0);
    expect(await countRows('idempotency_keys', tenantId)).toBe(0);
    expect(queueService.getJobs()).toHaveLength(0);
  });

  const registerTenantId = (prefix: string): string => {
    const tenantId = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    tenantIds.add(tenantId);
    return tenantId;
  };

  const createPaymentIntent = async (
    tenantId: string,
    overrides: {
      account_reference: string;
      external_reference: string;
      amount_minor: string;
      phone_number: string;
    },
  ): Promise<PaymentIntentEntity> =>
    requestContext.run(
      {
        request_id: `mpesa-create:${randomUUID()}`,
        tenant_id: tenantId,
        user_id: AUTH_ANONYMOUS_USER_ID,
        role: 'owner',
        session_id: null,
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: '127.0.0.1',
        user_agent: 'mpesa-adversarial-tests',
        method: 'POST',
        path: '/payments/mpesa/payment-intents',
        started_at: new Date().toISOString(),
      },
      async () => {
        await ensureMpesaLedgerAccounts(tenantId);

        const response = await mpesaService.createPaymentIntent({
          idempotency_key: `itest:${tenantId}:${randomUUID()}`,
          amount_minor: overrides.amount_minor,
          phone_number: overrides.phone_number,
          account_reference: overrides.account_reference,
          transaction_desc: 'Integration test payment',
          external_reference: overrides.external_reference,
          metadata: {
            source: 'mpesa-adversarial-tests',
          },
        });

        const row = await queryRow<PaymentIntentEntity>(
          `
            SELECT *
            FROM payment_intents
            WHERE tenant_id = $1
              AND id = $2::uuid
            LIMIT 1
          `,
          [tenantId, response.payment_intent_id],
        );

        return row;
      },
    );

  const ensureMpesaLedgerAccounts = async (tenantId: string): Promise<void> => {
    const debitAccountId = randomUUID();
    const creditAccountId = randomUUID();

    await databaseService.query(
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
  };

  const drainCallbackQueue = async (): Promise<Error[]> =>
    queueService.drain<ProcessMpesaCallbackJobPayload>(async (job) => {
      await mpesaCallbackProcessor.process(job.payload);
    });

  const assertSinglePaymentPosting = async (
    tenantId: string,
    paymentIntentId: string,
    checkoutRequestId: string,
    expectedStatus: string,
  ): Promise<void> => {
    const paymentState = await queryRow<{
      status: string;
      ledger_transaction_id: string | null;
    }>(
      `
        SELECT status, ledger_transaction_id
        FROM payment_intents
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, paymentIntentId],
    );
    const transactionCount = await queryScalar<number>(
      `
        SELECT COUNT(*)::int AS value
        FROM transactions
        WHERE tenant_id = $1
          AND reference = $2
      `,
      [tenantId, `MPESA-${checkoutRequestId}`],
    );
    const mpesaTransactionCount = await queryScalar<number>(
      `
        SELECT COUNT(*)::int AS value
        FROM mpesa_transactions
        WHERE tenant_id = $1
          AND checkout_request_id = $2
      `,
      [tenantId, checkoutRequestId],
    );
    const ledgerEntryCount = await queryScalar<number>(
      `
        SELECT COUNT(*)::int AS value
        FROM ledger_entries
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

    expect(paymentState.status).toBe(expectedStatus);
    expect(paymentState.ledger_transaction_id).not.toBeNull();
    expect(transactionCount).toBe(1);
    expect(mpesaTransactionCount).toBe(1);
    expect(ledgerEntryCount).toBe(2);
    await assertNoLedgerImbalances(tenantId);
  };

  const getPaymentIntentStatus = async (tenantId: string, paymentIntentId: string): Promise<string> =>
    queryScalar<string>(
      `
        SELECT status AS value
        FROM payment_intents
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, paymentIntentId],
    );

  const countRows = async (tableName: string, tenantId: string): Promise<number> =>
    queryScalar<number>(
      `
        SELECT COUNT(*)::int AS value
        FROM ${assertAllowedTableName(tableName)}
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

  const assertNoLedgerImbalances = async (tenantId: string): Promise<void> => {
    const violations = await queryRows<{
      transaction_id: string;
    }>(
      `
        SELECT
          t.id AS transaction_id
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

    expect(violations).toHaveLength(0);
  };

  const queryRows = async <TRow = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<TRow[]> => {
    const result = await databaseService.query<TRow & Record<string, unknown>>(text, values);
    return result.rows as TRow[];
  };

  const queryRow = async <TRow = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<TRow> => {
    const rows = await queryRows<TRow>(text, values);

    if (!rows[0]) {
      throw new Error('Expected a row but query returned none');
    }

    return rows[0];
  };

  const queryScalar = async <TValue>(
    text: string,
    values: unknown[] = [],
  ): Promise<TValue> => {
    const row = await queryRow<{ value: TValue }>(text, values);
    return row.value;
  };

  const cleanupTenants = async (): Promise<void> => {
    const values = [...tenantIds];

    if (values.length === 0) {
      return;
    }

    await databaseService.withClient(async (client) => {
      await client.query('BEGIN');

      try {
        await client.query(`DELETE FROM mpesa_transactions WHERE tenant_id = ANY($1::text[])`, [values]);
        await client.query(`DELETE FROM callback_logs WHERE tenant_id = ANY($1::text[])`, [values]);
        await client.query(`DELETE FROM payment_intents WHERE tenant_id = ANY($1::text[])`, [values]);

        const immutableTenantsResult = await client.query<{ tenant_id: string }>(
          `
            SELECT DISTINCT tenant_id
            FROM transactions
            WHERE tenant_id = ANY($1::text[])
          `,
          [values],
        );
        const immutableTenants = new Set(immutableTenantsResult.rows.map((row) => row.tenant_id));
        const mutableOnlyTenants = values.filter((tenantId) => !immutableTenants.has(tenantId));

        if (mutableOnlyTenants.length > 0) {
          await client.query(`DELETE FROM accounts WHERE tenant_id = ANY($1::text[])`, [
            mutableOnlyTenants,
          ]);
          await client.query(`DELETE FROM idempotency_keys WHERE tenant_id = ANY($1::text[])`, [
            mutableOnlyTenants,
          ]);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  };
});

const ensureIntegrationEnv = (callbackPort: number, mpesaBaseUrl: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.MPESA_CALLBACK_SECRET = 'mpesa-test-secret';
  process.env.MPESA_BASE_URL = mpesaBaseUrl;
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORT_CODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_REQUEST_TIMEOUT_MS = '200';
  process.env.MPESA_CALLBACK_URL = `http://127.0.0.1:${callbackPort}/payments/mpesa/callback`;
  process.env.APP_BASE_DOMAIN = 'localhost';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for MPESA adversarial integration tests');
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

const assertAllowedTableName = (tableName: string): string => {
  const allowedTableNames = new Set([
    'transactions',
    'ledger_entries',
    'payment_intents',
    'mpesa_transactions',
    'callback_logs',
    'idempotency_keys',
  ]);

  if (!allowedTableNames.has(tableName)) {
    throw new Error(`Unexpected table name "${tableName}"`);
  }

  return tableName;
};

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
  await testingModule.get(SyncSchemaService).onModuleInit();
};
