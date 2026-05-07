import { randomUUID } from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';

import { AuthSchemaService } from '../src/auth/auth-schema.service';
import { AUTH_ANONYMOUS_USER_ID } from '../src/auth/auth.constants';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseSecurityService } from '../src/database/database-security.service';
import { DatabaseService } from '../src/database/database.service';
import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { EventsSchemaService } from '../src/modules/events/events-schema.service';
import { FinanceSchemaService } from '../src/modules/finance/finance-schema.service';
import { MpesaService } from '../src/modules/payments/mpesa.service';
import { PaymentsSchemaService } from '../src/modules/payments/payments-schema.service';
import { InMemoryRedis } from './support/in-memory-redis';
import { MpesaMockServer } from './support/mpesa-mock-server';
import { FraudScenariosTestModule } from './support/fraud-scenarios-test.module';

jest.setTimeout(240000);

let poolReference: Pool | null = null;

describe('Fraud scenario detection', () => {
  let testingModule: TestingModule;
  let requestContext: RequestContextService;
  let mpesaService: MpesaService;
  let mockServer: MpesaMockServer;
  let pool: Pool;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    mockServer = new MpesaMockServer('fraud-test-secret');
    await mockServer.start();
    ensureIntegrationEnv(mockServer.baseUrl);

    pool = createDatabasePool();
    poolReference = pool;

    testingModule = await Test.createTestingModule({
      imports: [FraudScenariosTestModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(new InMemoryRedis())
      .compile();

    await initializeIntegrationModule(testingModule);

    requestContext = testingModule.get(RequestContextService);
    mpesaService = testingModule.get(MpesaService);
  });

  afterEach(() => {
    mockServer.reset();
  });

  afterAll(async () => {
    await cleanupTenants(tenantIds);
    await pool?.end();
    poolReference = null;
    await mockServer?.stop();
    await testingModule?.close();
  });

  test('rapid repeated payments trigger velocity alerts while duplicate requests stay idempotent', async () => {
    const tenantId = registerTenantId(tenantIds, 'fraud-velocity');
    const phoneNumber = '254744000101';

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-1', 'checkout-1'));
    const firstResponse = await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'dup-request-key',
      account_reference: 'ACC-VELOCITY-1',
      external_reference: 'EXT-VELOCITY-1',
      amount_minor: '10000',
      phone_number: phoneNumber,
    });
    const duplicateResponse = await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'dup-request-key',
      account_reference: 'ACC-VELOCITY-1',
      external_reference: 'EXT-VELOCITY-1',
      amount_minor: '10000',
      phone_number: phoneNumber,
    });

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-2', 'checkout-2'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'unique-request-key-2',
      account_reference: 'ACC-VELOCITY-1',
      external_reference: 'EXT-VELOCITY-2',
      amount_minor: '12000',
      phone_number: phoneNumber,
    });

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-3', 'checkout-3'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'unique-request-key-3',
      account_reference: 'ACC-VELOCITY-1',
      external_reference: 'EXT-VELOCITY-3',
      amount_minor: '14000',
      phone_number: phoneNumber,
    });

    expect(duplicateResponse.payment_intent_id).toBe(firstResponse.payment_intent_id);
    expect(mockServer.getRecordedStkPushRequests()).toHaveLength(3);
    expect(await countPaymentIntents(tenantId)).toBe(3);
    expect(await countAuditLogsByAction(tenantId, 'fraud.payment.velocity_detected')).toBeGreaterThanOrEqual(1);
  });

  test('same phone number reused across different accounts triggers a cross-account alert', async () => {
    const tenantId = registerTenantId(tenantIds, 'fraud-cross-account');
    const phoneNumber = '254744000202';

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-4', 'checkout-4'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'cross-account-key-1',
      account_reference: 'ACC-CROSS-1',
      external_reference: 'EXT-CROSS-1',
      amount_minor: '15000',
      phone_number: phoneNumber,
    });

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-5', 'checkout-5'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'cross-account-key-2',
      account_reference: 'ACC-CROSS-2',
      external_reference: 'EXT-CROSS-2',
      amount_minor: '17000',
      phone_number: phoneNumber,
    });

    expect(
      await countAuditLogsByAction(tenantId, 'fraud.payment.phone_reused_across_accounts'),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await countAuditLogsByAction(tenantId, 'fraud.payment.suspicious_pattern_detected'),
    ).toBe(0);
  });

  test('suspicious repeated-amount patterns across accounts trigger a high-severity alert', async () => {
    const tenantId = registerTenantId(tenantIds, 'fraud-pattern');
    const phoneNumber = '254744000303';

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-6', 'checkout-6'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'pattern-key-1',
      account_reference: 'ACC-PATTERN-1',
      external_reference: 'EXT-PATTERN-1',
      amount_minor: '25000',
      phone_number: phoneNumber,
    });

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-7', 'checkout-7'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'pattern-key-2',
      account_reference: 'ACC-PATTERN-2',
      external_reference: 'EXT-PATTERN-2',
      amount_minor: '25000',
      phone_number: phoneNumber,
    });

    mockServer.enqueueScenario(acceptedScenario(tenantId, 'merchant-8', 'checkout-8'));
    await createPaymentIntent(requestContext, mpesaService, tenantId, {
      idempotency_key: 'pattern-key-3',
      account_reference: 'ACC-PATTERN-3',
      external_reference: 'EXT-PATTERN-3',
      amount_minor: '25000',
      phone_number: phoneNumber,
    });

    expect(
      await countAuditLogsByAction(tenantId, 'fraud.payment.suspicious_pattern_detected'),
    ).toBeGreaterThanOrEqual(1);
  });
});

const createPaymentIntent = async (
  requestContext: RequestContextService,
  mpesaService: MpesaService,
  tenantId: string,
  input: {
    idempotency_key: string;
    account_reference: string;
    external_reference: string;
    amount_minor: string;
    phone_number: string;
  },
): Promise<{
  payment_intent_id: string;
  checkout_request_id: string | null;
}> =>
  requestContext.run(
    {
      request_id: `fraud:${randomUUID()}`,
      tenant_id: tenantId,
      user_id: AUTH_ANONYMOUS_USER_ID,
      role: 'owner',
      session_id: null,
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'fraud-scenarios-tests',
      method: 'POST',
      path: '/payments/mpesa/payment-intents',
      started_at: new Date().toISOString(),
    },
    async () => {
      const response = await mpesaService.createPaymentIntent({
        idempotency_key: input.idempotency_key,
        amount_minor: input.amount_minor,
        phone_number: input.phone_number,
        account_reference: input.account_reference,
        transaction_desc: 'Fraud scenario test payment',
        external_reference: input.external_reference,
        metadata: {
          source: 'fraud-scenarios.integration-spec',
        },
      });

      return {
        payment_intent_id: response.payment_intent_id,
        checkout_request_id: response.checkout_request_id,
      };
    },
  );

const acceptedScenario = (
  tenantId: string,
  merchantRequestId: string,
  checkoutRequestId: string,
): {
  type: 'accepted';
  tenant_id: string;
  merchant_request_id: string;
  checkout_request_id: string;
  callbacks: [];
} => ({
  type: 'accepted',
  tenant_id: tenantId,
  merchant_request_id: merchantRequestId,
  checkout_request_id: checkoutRequestId,
  callbacks: [],
});

const registerTenantId = (tenantIds: Set<string>, prefix: string): string => {
  const tenantId = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  tenantIds.add(tenantId);
  return tenantId;
};

const ensureIntegrationEnv = (mpesaBaseUrl: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.SECURITY_FRAUD_VELOCITY_WINDOW_SECONDS = '900';
  process.env.SECURITY_FRAUD_VELOCITY_THRESHOLD = '3';
  process.env.SECURITY_FRAUD_CROSS_ACCOUNT_THRESHOLD = '2';
  process.env.SECURITY_FRAUD_REPEATED_AMOUNT_THRESHOLD = '3';
  process.env.MPESA_BASE_URL = mpesaBaseUrl;
  process.env.MPESA_CONSUMER_KEY = 'fraud-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'fraud-consumer-secret';
  process.env.MPESA_SHORT_CODE = '174379';
  process.env.MPESA_PASSKEY = 'fraud-passkey';
  process.env.MPESA_CALLBACK_URL = 'http://127.0.0.1:65535/payments/mpesa/callback';
  process.env.MPESA_CALLBACK_SECRET = 'fraud-test-secret';
  process.env.MPESA_REQUEST_TIMEOUT_MS = '500';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for fraud scenario integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-fraud-scenarios-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(EventsSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
};

const countPaymentIntents = async (tenantId: string): Promise<number> =>
  queryScalar<number>(
    `
      SELECT COUNT(*)::int AS value
      FROM payment_intents
      WHERE tenant_id = $1
    `,
    [tenantId],
  );

const countAuditLogsByAction = async (tenantId: string, action: string): Promise<number> =>
  queryScalar<number>(
    `
      SELECT COUNT(*)::int AS value
      FROM audit_logs
      WHERE tenant_id = $1
        AND action = $2
    `,
    [tenantId, action],
  );

const queryScalar = async <TValue>(
  text: string,
  values: unknown[] = [],
): Promise<TValue> => {
  const result = await globalPool().query<{ value: TValue }>(text, values);
  const row = result.rows[0];

  if (!row) {
    throw new Error('Expected a row but query returned none');
  }

  return row.value;
};

const globalPool = (): Pool => {
  if (!poolReference) {
    throw new Error('Database pool has not been initialized');
  }

  return poolReference;
};

const cleanupTenants = async (tenantIds: Set<string>): Promise<void> => {
  const tenantValues = Array.from(tenantIds);

  if (tenantValues.length === 0) {
    return;
  }

  const client = await globalPool().connect();

  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM mpesa_transactions WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
    await client.query(`DELETE FROM callback_logs WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
    await client.query(`DELETE FROM payment_intents WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
    await client.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
    await client.query(`DELETE FROM idempotency_keys WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
