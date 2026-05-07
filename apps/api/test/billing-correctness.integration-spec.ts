import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { InMemoryRedis } from './support/in-memory-redis';
import { BillingCorrectnessTestModule } from './support/billing-correctness-test.module';

jest.setTimeout(180000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  email: string;
  password: string;
  user_id: string;
  access_token: string;
};

type SubscriptionResponse = {
  id: string;
  tenant_id: string;
  plan_code: string;
  status: string;
  features: string[];
  limits: Record<string, number | string | boolean | null>;
  current_period_start: string;
  current_period_end: string;
};

type StudentResponse = {
  id: string;
  tenant_id: string;
  admission_number: string;
  status: string;
};

type UsageSummaryResponse = {
  subscription_id: string | null;
  period_start: string | null;
  period_end: string | null;
  usage: Array<{
    feature_key: string;
    total_quantity: string;
  }>;
};

type InvoiceResponse = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  status: string;
  currency_code: string;
  description: string;
  total_amount_minor: string;
  amount_paid_minor: string;
  issued_at: string;
  due_at: string;
  metadata: Record<string, unknown>;
};

type DataEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

type CollectionEnvelope<T> = {
  data: T[];
  meta: Record<string, unknown>;
};

const ensureIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? 'integration.test';
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'shule-hub-integration-tests';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'shule-hub-integration-clients';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'integration-access-secret';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';
  process.env.DATABASE_RUNTIME_ROLE =
    process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for billing correctness integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-billing-correctness-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

describe('SaaS billing correctness', () => {
  let app: INestApplication;
  let testingModule: TestingModule;
  let pool: Pool;

  beforeAll(async () => {
    ensureIntegrationEnv();
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [BillingCorrectnessTestModule],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(new InMemoryRedis())
      .compile();

    app = testingModule.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  test('tracks usage for student creation and attendance writes', async () => {
    const tenantUser = await registerTenantUser(app, `billuse-${seedSuffix()}`);
    await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700010001',
    });
    const student = await createStudent(app, tenantUser, {
      admission_number: `ADM-${seedSuffix()}-001`,
      first_name: 'Usage',
      last_name: 'Tracked',
      status: 'active',
    });

    await request(app.getHttpServer())
      .put(`/students/${student.id}/attendance/2026-04-26`)
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        status: 'present',
        notes: 'Tracked attendance',
        last_modified_at: '2026-04-26T08:00:00.000Z',
        metadata: {
          source: 'billing-correctness',
        },
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

  test('generates invoices only for billable subscriptions and preserves totals', async () => {
    const tenantUser = await registerTenantUser(app, `billinv-${seedSuffix()}`);
    const subscription = await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700010002',
    });

    const createResponse = await request(app.getHttpServer())
      .post('/billing/invoices')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        description: 'Starter plan May 2026',
        total_amount_minor: '150000',
        billing_phone_number: '254700010002',
        metadata: {
          scenario: 'invoice-generation',
        },
      })
      .expect(201);
    const invoice = createResponse.body as InvoiceResponse;

    expect(invoice.subscription_id).toBe(subscription.id);
    expect(invoice.status).toBe('open');
    expect(invoice.currency_code).toBe('KES');
    expect(invoice.total_amount_minor).toBe('150000');
    expect(invoice.amount_paid_minor).toBe('0');

    const listResponse = await request(app.getHttpServer())
      .get('/billing/invoices')
      .query({
        status: 'open',
      })
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const invoices = extractCollection<InvoiceResponse>(listResponse.body);

    expect(invoices.some((candidate) => candidate.id === invoice.id)).toBe(true);
  });

  test('blocks feature access when there is no active subscription or the feature is not in the plan', async () => {
    const noSubscriptionUser = await registerTenantUser(app, `billgate-${seedSuffix()}`);

    const noSubscriptionResponse = await request(app.getHttpServer())
      .post('/students')
      .set('host', noSubscriptionUser.host)
      .set('authorization', `Bearer ${noSubscriptionUser.access_token}`)
      .send({
        admission_number: `ADM-${seedSuffix()}-201`,
        first_name: 'No',
        last_name: 'Subscription',
        status: 'active',
      })
      .expect(402);

    expect(noSubscriptionResponse.body.message).toContain(
      'Your subscription is suspended',
    );

    const missingFeatureUser = await registerTenantUser(app, `billfeat-${seedSuffix()}`);
    const subscription = await createSubscription(app, missingFeatureUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700010003',
    });
    await updateSubscriptionAccess(pool, subscription.id, {
      features: ['attendance'],
    });

    const missingFeatureResponse = await request(app.getHttpServer())
      .post('/students')
      .set('host', missingFeatureUser.host)
      .set('authorization', `Bearer ${missingFeatureUser.access_token}`)
      .send({
        admission_number: `ADM-${seedSuffix()}-202`,
        first_name: 'Missing',
        last_name: 'Feature',
        status: 'active',
      })
      .expect(402);

    expect(missingFeatureResponse.body.message).toContain(
      'Current subscription does not include feature "students"',
    );
  });

  test('enters grace period when the billing period lapses without immediate hard lock', async () => {
    const tenantUser = await registerTenantUser(app, `billgrace-${seedSuffix()}`);
    const subscription = await createSubscription(app, tenantUser, {
      plan_code: 'trial',
      status: 'trialing',
      billing_phone_number: '254700010004',
    });
    const renewalBoundary = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await updateSubscriptionAccess(pool, subscription.id, {
      current_period_end: renewalBoundary,
      trial_ends_at: renewalBoundary,
    });

    const lifecycleResponse = await request(app.getHttpServer())
      .get('/billing/subscriptions/current/lifecycle')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const lifecycle = extractData<{
      lifecycle_state: string;
      access_mode: string;
      renewal_required: boolean;
    }>(lifecycleResponse.body);

    expect(lifecycle.lifecycle_state).toBe('GRACE_PERIOD');
    expect(lifecycle.access_mode).toBe('full');
    expect(lifecycle.renewal_required).toBe(true);

    await request(app.getHttpServer())
      .get('/students')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
  });

  test('enters restricted mode without hard-locking billing access', async () => {
    const tenantUser = await registerTenantUser(app, `billrestrict-${seedSuffix()}`);
    const subscription = await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700010006',
    });

    await updateSubscriptionAccess(pool, subscription.id, {
      status: 'restricted',
      current_period_end: '2026-01-01T00:00:00.000Z',
      grace_period_ends_at: '2026-01-08T00:00:00.000Z',
      restricted_at: '2026-01-09T00:00:00.000Z',
      suspended_at: '2026-12-31T00:00:00.000Z',
      suspension_reason: 'renewal_required',
    });

    const lifecycleResponse = await request(app.getHttpServer())
      .get('/billing/subscriptions/current/lifecycle')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
    const lifecycle = extractData<{
      lifecycle_state: string;
      access_mode: string;
    }>(lifecycleResponse.body);

    expect(lifecycle.lifecycle_state).toBe('RESTRICTED');
    expect(lifecycle.access_mode).toBe('read_only');

    await request(app.getHttpServer())
      .post('/students')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        admission_number: `ADM-${seedSuffix()}-401`,
        first_name: 'Restricted',
        last_name: 'Write',
        status: 'active',
      })
      .expect(402);

    const renewalInvoiceResponse = await request(app.getHttpServer())
      .post('/billing/subscriptions/current/renewal-invoice')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({})
      .expect(201);
    const renewalInvoice = renewalInvoiceResponse.body as InvoiceResponse;

    expect(renewalInvoice.metadata.billing_reason).toBe('subscription_renewal');
  });

  test('allows export-safe billing access while suspended and blocks feature access', async () => {
    const tenantUser = await registerTenantUser(app, `billsuspend-${seedSuffix()}`);
    const subscription = await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700010007',
    });

    await updateSubscriptionAccess(pool, subscription.id, {
      status: 'suspended',
      current_period_end: '2026-01-01T00:00:00.000Z',
      grace_period_ends_at: '2026-01-08T00:00:00.000Z',
      restricted_at: '2026-01-09T00:00:00.000Z',
      suspended_at: '2026-01-16T00:00:00.000Z',
      suspension_reason: 'renewal_required',
    });

    await request(app.getHttpServer())
      .get('/students')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(402);

    await request(app.getHttpServer())
      .get('/billing/subscriptions/current/notifications')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .expect(200);
  });

  test('enforces plan limits at the API layer and blocks overuse', async () => {
    const tenantUser = await registerTenantUser(app, `billlimit-${seedSuffix()}`);
    const subscription = await createSubscription(app, tenantUser, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700010005',
    });
    await updateSubscriptionAccess(pool, subscription.id, {
      limits: {
        'students.max_active': 1,
        'usage.events.monthly': 50000,
        'attendance.upserts.monthly': 250000,
      },
    });

    await createStudent(app, tenantUser, {
      admission_number: `ADM-${seedSuffix()}-301`,
      first_name: 'First',
      last_name: 'Allowed',
      status: 'active',
    });

    const secondCreateResponse = await request(app.getHttpServer())
      .post('/students')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        admission_number: `ADM-${seedSuffix()}-302`,
        first_name: 'Second',
        last_name: 'ShouldBlock',
        status: 'active',
      });

    expect(secondCreateResponse.status).toBeGreaterThanOrEqual(400);

    const studentCount = await countStudents(pool, tenantUser.tenant_id);
    expect(studentCount).toBe(1);
  });
});

const registerTenantUser = async (
  app: INestApplication,
  tenantId: string,
): Promise<RegisteredTenantUser> => {
  const email = `owner+${tenantId}@example.test`;
  const password = `SecurePass!${tenantId.slice(-4)}`;
  const host = `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`;

  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .set('host', host)
    .send({
      email,
      password,
      display_name: `Owner ${tenantId}`,
    })
    .expect(201);

  return {
    tenant_id: tenantId,
    host,
    email,
    password,
    user_id: response.body.user.user_id,
    access_token: response.body.tokens.access_token,
  };
};

const createSubscription = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    plan_code: 'trial' | 'starter' | 'growth' | 'enterprise';
    status:
      | 'trialing'
      | 'active'
      | 'past_due'
      | 'restricted'
      | 'suspended'
      | 'canceled'
      | 'expired';
    billing_phone_number: string;
  },
): Promise<SubscriptionResponse> => {
  const response = await request(app.getHttpServer())
    .post('/billing/subscriptions')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      seats_allocated: 5,
      metadata: {
        seeded_by: 'billing-correctness.integration-spec',
      },
    })
    .expect(201);

  return response.body as SubscriptionResponse;
};

const createStudent = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    admission_number: string;
    first_name: string;
    last_name: string;
    status: 'active' | 'inactive' | 'graduated' | 'transferred';
  },
): Promise<StudentResponse> => {
  const response = await request(app.getHttpServer())
    .post('/students')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      primary_guardian_name: 'Guardian',
      primary_guardian_phone: '254700010099',
      metadata: {
        seeded_by: 'billing-correctness.integration-spec',
      },
    })
    .expect(201);

  return response.body as StudentResponse;
};

const updateSubscriptionAccess = async (
  pool: Pool,
  subscriptionId: string,
  changes: {
    features?: string[];
    limits?: Record<string, number | string | boolean | null>;
    status?: string;
    current_period_end?: string;
    grace_period_ends_at?: string | null;
    restricted_at?: string | null;
    suspended_at?: string | null;
    suspension_reason?: string | null;
    trial_ends_at?: string | null;
  },
): Promise<void> => {
  const client = await pool.connect();

  try {
    const assignments: string[] = [];
    const values: unknown[] = [subscriptionId];
    let parameterIndex = 2;

    if (changes.features !== undefined) {
      assignments.push(`features = $${parameterIndex}::jsonb`);
      values.push(JSON.stringify(changes.features));
      parameterIndex += 1;
    }

    if (changes.limits !== undefined) {
      assignments.push(`limits = $${parameterIndex}::jsonb`);
      values.push(JSON.stringify(changes.limits));
      parameterIndex += 1;
    }

    if (changes.current_period_end !== undefined) {
      assignments.push(`current_period_end = $${parameterIndex}::timestamptz`);
      values.push(changes.current_period_end);
      parameterIndex += 1;
    }

    if (changes.status !== undefined) {
      assignments.push(`status = $${parameterIndex}::text`);
      values.push(changes.status);
      parameterIndex += 1;
    }

    if (changes.grace_period_ends_at !== undefined) {
      assignments.push(`grace_period_ends_at = $${parameterIndex}::timestamptz`);
      values.push(changes.grace_period_ends_at);
      parameterIndex += 1;
    }

    if (changes.restricted_at !== undefined) {
      assignments.push(`restricted_at = $${parameterIndex}::timestamptz`);
      values.push(changes.restricted_at);
      parameterIndex += 1;
    }

    if (changes.suspended_at !== undefined) {
      assignments.push(`suspended_at = $${parameterIndex}::timestamptz`);
      values.push(changes.suspended_at);
      parameterIndex += 1;
    }

    if (changes.suspension_reason !== undefined) {
      assignments.push(`suspension_reason = $${parameterIndex}::text`);
      values.push(changes.suspension_reason);
      parameterIndex += 1;
    }

    if (changes.trial_ends_at !== undefined) {
      assignments.push(`trial_ends_at = $${parameterIndex}::timestamptz`);
      values.push(changes.trial_ends_at);
      parameterIndex += 1;
    }

    assignments.push('updated_at = NOW()');

    await client.query(
      `
        UPDATE subscriptions
        SET
          ${assignments.join(',\n          ')}
        WHERE id = $1::uuid
      `,
      values,
    );
  } finally {
    client.release();
  }
};

const countStudents = async (pool: Pool, tenantId: string): Promise<number> => {
  const client = await pool.connect();

  try {
    const result = await client.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM students
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

    return Number(result.rows[0]?.total ?? '0');
  } finally {
    client.release();
  }
};

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
