import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Pool } from 'pg';
import request from 'supertest';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { DatabaseService } from '../src/database/database.service';
import { MpesaCallbackProcessorService } from '../src/modules/payments/mpesa-callback-processor.service';
import { ProcessMpesaCallbackJobPayload } from '../src/modules/payments/payments.types';
import { CapturingQueueService } from './support/capturing-queue.service';
import { InMemoryRedis } from './support/in-memory-redis';
import { MpesaMockServer } from './support/mpesa-mock-server';
import { WorkflowE2ETestModule } from './support/workflow-e2e-test.module';

jest.setTimeout(300000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  access_token: string;
};

type StudentResponse = {
  id: string;
  tenant_id: string;
  admission_number: string;
  status: string;
};

type InvoiceResponse = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  status: string;
  invoice_number: string;
  total_amount_minor: string;
  amount_paid_minor: string;
  payment_intent_id: string | null;
};

type UsageSummaryResponse = {
  subscription_id: string | null;
  usage: Array<{
    feature_key: string;
    total_quantity: string;
  }>;
};

type PaymentIntentRow = {
  id: string;
  tenant_id: string;
  status: string;
  ledger_transaction_id: string | null;
  checkout_request_id: string | null;
  amount_minor: string;
};

type DataEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

type CollectionEnvelope<T> = {
  data: T[];
  meta: Record<string, unknown>;
};

describe('Real user workflows', () => {
  let testingModule: TestingModule;
  let app: INestApplication;
  let pool: Pool;
  let databaseService: DatabaseService;
  let queueService: CapturingQueueService;
  let mpesaCallbackProcessor: MpesaCallbackProcessorService;
  let mockServer: MpesaMockServer;

  beforeAll(async () => {
    const callbackPort = await reservePort();
    mockServer = new MpesaMockServer('workflow-mpesa-secret');
    await mockServer.start();
    ensureIntegrationEnv(callbackPort, mockServer.baseUrl);
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [WorkflowE2ETestModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(new InMemoryRedis())
      .compile();

    app = testingModule.createNestApplication({
      rawBody: true,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    await app.listen(callbackPort, '127.0.0.1');

    databaseService = testingModule.get(DatabaseService);
    queueService = testingModule.get(CapturingQueueService);
    mpesaCallbackProcessor = testingModule.get(MpesaCallbackProcessorService);
  });

  afterEach(async () => {
    await mockServer.waitForCallbacks(undefined, 6000).catch(() => undefined);
    mockServer.reset();
    queueService.clear();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await mockServer?.stop();
  });

  test('student admission to invoice payment completes with ledger updates', async () => {
    const tenantUser = await registerTenantUser(app, `flow-pay-${seedSuffix()}`);
    await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254722000101',
    });
    await ensureMpesaLedgerAccounts(pool, tenantUser.tenant_id);

    const student = await createStudent(app, tenantUser, {
      admission_number: `ADM-${seedSuffix()}-001`,
      first_name: 'Amina',
      last_name: 'Otieno',
    });

    const invoice = await createInvoice(app, tenantUser, {
      description: `Admission fee for ${student.admission_number}`,
      total_amount_minor: '150000',
      billing_phone_number: '254722000101',
    });

    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantUser.tenant_id,
      merchant_request_id: `merchant-${tenantUser.tenant_id}`,
      checkout_request_id: `checkout-${tenantUser.tenant_id}`,
      callbacks: [{ delivery_id: `delivery-${tenantUser.tenant_id}` }],
    });

    const paymentIntentResponse = await request(app.getHttpServer())
      .post(`/billing/invoices/${invoice.id}/mpesa-payment-intents`)
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        idempotency_key: `invoice-pay-${seedSuffix()}`,
        phone_number: '254722000101',
      })
      .expect(201);

    expect(paymentIntentResponse.body.payment_intent_id).toBeTruthy();
    expect(paymentIntentResponse.body.status).toBe('pending_payment');

    await mockServer.waitForCallbacks(1, 6000);
    await queueService.waitForJobs(1, 6000);
    const queueErrors = await drainMpesaQueue(queueService, mpesaCallbackProcessor);

    expect(queueErrors).toHaveLength(0);

    const paidInvoiceResponse = await request(app.getHttpServer())
      .get(`/billing/invoices/${invoice.id}`)
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const paidInvoice = extractData<InvoiceResponse>(paidInvoiceResponse.body);

    expect(paidInvoice.status).toBe('paid');
    expect(paidInvoice.amount_paid_minor).toBe('150000');
    expect(paidInvoice.payment_intent_id).toBeTruthy();

    const paymentIntent = await queryRow<PaymentIntentRow>(
      pool,
      `
        SELECT
          id,
          tenant_id,
          status,
          ledger_transaction_id,
          checkout_request_id,
          amount_minor
        FROM payment_intents
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantUser.tenant_id, paidInvoice.payment_intent_id],
    );

    expect(paymentIntent.status).toBe('completed');
    expect(paymentIntent.ledger_transaction_id).toBeTruthy();
    expect(paymentIntent.checkout_request_id).toBe(`checkout-${tenantUser.tenant_id}`);

    const ledgerSummary = await queryRow<{
      transaction_count: string;
      ledger_entry_count: string;
      debit_total: string;
      credit_total: string;
      audit_log_count: string;
    }>(
      pool,
      `
        SELECT
          COUNT(DISTINCT t.id)::text AS transaction_count,
          COUNT(le.id)::text AS ledger_entry_count,
          COALESCE(SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END), 0)::text AS debit_total,
          COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END), 0)::text AS credit_total,
          (
            SELECT COUNT(*)::text
            FROM audit_logs
            WHERE tenant_id = $1
              AND action = 'finance.transaction.posted'
          ) AS audit_log_count
        FROM transactions t
        JOIN ledger_entries le
          ON le.tenant_id = t.tenant_id
         AND le.transaction_id = t.id
        WHERE t.tenant_id = $1
          AND t.id = $2::uuid
      `,
      [tenantUser.tenant_id, paymentIntent.ledger_transaction_id],
    );

    expect(ledgerSummary.transaction_count).toBe('1');
    expect(ledgerSummary.ledger_entry_count).toBe('2');
    expect(ledgerSummary.debit_total).toBe('150000');
    expect(ledgerSummary.credit_total).toBe('150000');
    expect(Number(ledgerSummary.audit_log_count)).toBeGreaterThanOrEqual(1);
  });

  test('offline attendance sync produces a synced attendance report', async () => {
    const tenantUser = await registerTenantUser(app, `flow-sync-${seedSuffix()}`);
    await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254722000201',
    });
    const student = await createStudent(app, tenantUser, {
      admission_number: `ADM-${seedSuffix()}-101`,
      first_name: 'Brian',
      last_name: 'Kamau',
    });

    await registerDevice(app, tenantUser, 'device-offline-a');

    const pushResponse = await request(app.getHttpServer())
      .post('/sync/push')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        device_id: 'device-offline-a',
        platform: 'android',
        app_version: '1.0.0',
        metadata: {
          mode: 'offline',
        },
        operations: [
          {
            op_id: randomUUID(),
            entity: 'attendance',
            version: 1,
            payload: {
              record_id: randomUUID(),
              student_id: student.id,
              attendance_date: '2026-04-26',
              status: 'present',
              last_modified_at: '2026-04-26T08:00:00.000Z',
              notes: 'Captured offline',
              metadata: {
                source: 'tablet-a',
              },
            },
          },
        ],
      })
      .expect(201);

    expect(pushResponse.body.results[0].status).toBe('applied');
    expect(pushResponse.body.results[0].conflict_policy).toBe('last-write-wins');
    expect(pushResponse.body.cursors.find((cursor: { entity: string }) => cursor.entity === 'attendance')).toBeTruthy();

    await registerDevice(app, tenantUser, 'device-report-b');

    const pullResponse = await request(app.getHttpServer())
      .post('/sync/pull')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        device_id: 'device-report-b',
        platform: 'web',
        app_version: '1.0.0',
        entities: ['attendance'],
        limit: 20,
        cursors: [
          {
            entity: 'attendance',
            last_version: '0',
          },
        ],
      })
      .expect(201);

    expect(pullResponse.body.has_more).toBe(false);
    expect(pullResponse.body.operations).toHaveLength(1);
    expect(pullResponse.body.operations[0].entity).toBe('attendance');
    expect(pullResponse.body.operations[0].payload.status).toBe('present');
    expect(pullResponse.body.cursors[0].last_version).toBe(pullResponse.body.operations[0].version);

    const attendanceReportResponse = await request(app.getHttpServer())
      .get(`/students/${student.id}/attendance`)
      .query({
        from: '2026-04-01',
        to: '2026-04-30',
        limit: 20,
      })
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const attendanceRecords = extractCollection<Array<{
      student_id: string;
      attendance_date: string;
      status: string;
      notes: string | null;
      source_device_id: string | null;
    }> extends never ? never : {
      student_id: string;
      attendance_date: string;
      status: string;
      notes: string | null;
      source_device_id: string | null;
    }>(attendanceReportResponse.body);

    expect(attendanceRecords).toHaveLength(1);
    expect(attendanceRecords[0].student_id).toBe(student.id);
    expect(attendanceRecords[0].attendance_date).toBe('2026-04-26');
    expect(attendanceRecords[0].status).toBe('present');
    expect(attendanceRecords[0].notes).toBe('Captured offline');
    expect(attendanceRecords[0].source_device_id).toBe('device-offline-a');
  });

  test('billing subscription enables feature-gated student workflows without manual repair', async () => {
    const tenantUser = await registerTenantUser(app, `flow-bill-${seedSuffix()}`);

    const blockedBeforeSubscription = await request(app.getHttpServer())
      .post('/students')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        admission_number: `ADM-${seedSuffix()}-201`,
        first_name: 'Before',
        last_name: 'Subscription',
        status: 'active',
      })
      .expect(402);

    expect(blockedBeforeSubscription.body.message).toContain(
      'An active subscription is required to access this feature',
    );

    await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254722000301',
    });

    const currentSubscriptionResponse = await request(app.getHttpServer())
      .get('/billing/subscriptions/current')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const currentSubscription = extractData<{
      status: string;
      features: string[];
    }>(currentSubscriptionResponse.body);

    expect(currentSubscription.status).toBe('active');
    expect(currentSubscription.features).toEqual(
      expect.arrayContaining(['students', 'attendance']),
    );

    const student = await createStudent(app, tenantUser, {
      admission_number: `ADM-${seedSuffix()}-202`,
      first_name: 'After',
      last_name: 'Subscription',
    });

    await request(app.getHttpServer())
      .put(`/students/${student.id}/attendance/2026-04-27`)
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        status: 'late',
        last_modified_at: '2026-04-27T08:05:00.000Z',
        notes: 'Allowed after subscription',
      })
      .expect(200);

    const usageSummaryResponse = await request(app.getHttpServer())
      .get('/billing/usage/summary')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const usageSummary = extractData<UsageSummaryResponse>(usageSummaryResponse.body);
    const usageByFeature = new Map(
      usageSummary.usage.map((item) => [item.feature_key, item.total_quantity]),
    );

    expect(usageSummary.subscription_id).toBeTruthy();
    expect(usageByFeature.get('students.created')).toBe('1');
    expect(usageByFeature.get('attendance.upserts')).toBe('1');
  });
});

const ensureIntegrationEnv = (callbackPort: number, mpesaBaseUrl: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? 'integration.test';
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'shule-hub-workflow-tests';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'shule-hub-workflow-clients';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'workflow-access-secret';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'workflow-refresh-secret';
  process.env.DATABASE_RUNTIME_ROLE =
    process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.MPESA_CALLBACK_SECRET = 'workflow-mpesa-secret';
  process.env.MPESA_BASE_URL = mpesaBaseUrl;
  process.env.MPESA_CONSUMER_KEY = 'workflow-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'workflow-consumer-secret';
  process.env.MPESA_SHORT_CODE = '174379';
  process.env.MPESA_PASSKEY = 'workflow-passkey';
  process.env.MPESA_REQUEST_TIMEOUT_MS = '300';
  process.env.MPESA_CALLBACK_URL = `http://127.0.0.1:${callbackPort}/payments/mpesa/callback`;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for workflow integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-workflow-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

const registerTenantUser = async (
  app: INestApplication,
  tenantId: string,
): Promise<RegisteredTenantUser> => {
  const host = `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`;
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .set('host', host)
    .send({
      email: `owner+${tenantId}@example.test`,
      password: `SecurePass!${tenantId.slice(-4)}`,
      display_name: `Owner ${tenantId}`,
    })
    .expect(201);

  return {
    tenant_id: tenantId,
    host,
    access_token: response.body.tokens.access_token,
  };
};

const createSubscription = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    plan_code: 'trial' | 'starter' | 'growth' | 'enterprise';
    status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
    billing_phone_number: string;
  },
): Promise<void> => {
  await request(app.getHttpServer())
    .post('/billing/subscriptions')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      seats_allocated: 5,
      metadata: {
        seeded_by: 'workflow.integration-spec',
      },
    })
    .expect(201);
};

const createStudent = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    admission_number: string;
    first_name: string;
    last_name: string;
  },
): Promise<StudentResponse> => {
  const response = await request(app.getHttpServer())
    .post('/students')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      status: 'active',
      primary_guardian_name: 'Guardian',
      primary_guardian_phone: '254733000001',
      metadata: {
        seeded_by: 'workflow.integration-spec',
      },
    })
    .expect(201);

  return response.body as StudentResponse;
};

const createInvoice = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    description: string;
    total_amount_minor: string;
    billing_phone_number: string;
  },
): Promise<InvoiceResponse> => {
  const response = await request(app.getHttpServer())
    .post('/billing/invoices')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      metadata: {
        seeded_by: 'workflow.integration-spec',
      },
    })
    .expect(201);

  return response.body as InvoiceResponse;
};

const registerDevice = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  deviceId: string,
): Promise<void> => {
  await request(app.getHttpServer())
    .post('/sync/devices/register')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      device_id: deviceId,
      platform: 'android',
      app_version: '1.0.0',
      metadata: {
        seeded_by: 'workflow.integration-spec',
      },
    })
    .expect(201);
};

const ensureMpesaLedgerAccounts = async (pool: Pool, tenantId: string): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query(
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
          ($1::uuid, $2, '1100-MPESA-CLEARING', 'MPESA Clearing', 'asset', 'debit', 'KES', TRUE, TRUE, '{"seed":"workflow"}'::jsonb),
          ($3::uuid, $2, '2100-CUSTOMER-DEPOSITS', 'Customer Deposits', 'liability', 'credit', 'KES', TRUE, TRUE, '{"seed":"workflow"}'::jsonb)
        ON CONFLICT (tenant_id, code)
        DO NOTHING
      `,
      [randomUUID(), tenantId, randomUUID()],
    );
  } finally {
    client.release();
  }
};

const drainMpesaQueue = async (
  queueService: CapturingQueueService,
  processor: MpesaCallbackProcessorService,
): Promise<Error[]> =>
  queueService.drain<ProcessMpesaCallbackJobPayload>(async (job) => {
    await processor.process(job.payload);
  });

const queryRow = async <TRow>(
  pool: Pool,
  text: string,
  values: unknown[] = [],
): Promise<TRow> => {
  const result = await pool.query<TRow & Record<string, unknown>>(text, values);

  if (!result.rows[0]) {
    throw new Error('Expected a row but query returned none');
  }

  return result.rows[0] as TRow;
};

const reservePort = async (): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a callback port'));
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

const seedSuffix = (): string => randomUUID().replace(/-/g, '').slice(0, 8);

const extractData = <T>(body: unknown): T => {
  if (
    body
    && typeof body === 'object'
    && Object.prototype.hasOwnProperty.call(body, 'data')
  ) {
    return (body as DataEnvelope<T>).data;
  }

  return body as T;
};

const extractCollection = <T>(body: unknown): T[] => {
  if (Array.isArray(body)) {
    return body as T[];
  }

  if (
    body
    && typeof body === 'object'
    && Array.isArray((body as CollectionEnvelope<T>).data)
  ) {
    return (body as CollectionEnvelope<T>).data;
  }

  throw new Error('Expected a collection response body');
};
