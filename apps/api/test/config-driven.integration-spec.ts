import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { InMemoryRedis } from './support/in-memory-redis';
import { BillingCorrectnessTestModule } from './support/billing-correctness-test.module';

jest.setTimeout(180000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
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
  trial_ends_at: string | null;
};

type StudentResponse = {
  id: string;
  tenant_id: string;
  admission_number: string;
  status: string;
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
    throw new Error('DATABASE_URL is required for config-driven integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-config-driven-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

describe('Configuration-driven tenant behavior', () => {
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

  test('keeps tenant-specific plan limits isolated', async () => {
    const tenantA = await registerTenantUser(app, `cfg-limits-a-${seedSuffix()}`);
    const tenantB = await registerTenantUser(app, `cfg-limits-b-${seedSuffix()}`);

    const subscriptionA = await createSubscription(app, tenantA, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254711000101',
    });
    const subscriptionB = await createSubscription(app, tenantB, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254711000102',
    });

    await updateSubscriptionAccess(pool, subscriptionA.id, {
      limits: {
        'students.max_active': 1,
        'usage.events.monthly': 10,
        'attendance.upserts.monthly': 10,
      },
    });
    await updateSubscriptionAccess(pool, subscriptionB.id, {
      limits: {
        'students.max_active': 3,
        'usage.events.monthly': 100,
        'attendance.upserts.monthly': 100,
      },
    });

    const tenantACurrent = await getCurrentSubscription(app, tenantA);
    const tenantBCurrent = await getCurrentSubscription(app, tenantB);

    expect(tenantACurrent.limits['students.max_active']).toBe(1);
    expect(tenantBCurrent.limits['students.max_active']).toBe(3);

    await createStudent(app, tenantA, `ADM-${seedSuffix()}-A1`);
    await createStudent(app, tenantB, `ADM-${seedSuffix()}-B1`);
    await createStudent(app, tenantB, `ADM-${seedSuffix()}-B2`);
    await createStudent(app, tenantB, `ADM-${seedSuffix()}-B3`);

    const blockedResponse = await request(app.getHttpServer())
      .post('/students')
      .set('host', tenantA.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .send({
        admission_number: `ADM-${seedSuffix()}-A2`,
        first_name: 'Limit',
        last_name: 'Blocked',
        status: 'active',
      })
      .expect(402);

    expect(blockedResponse.body.message).toContain('students.max_active');
    expect(await countStudents(pool, tenantA.tenant_id)).toBe(1);
    expect(await countStudents(pool, tenantB.tenant_id)).toBe(3);

    const storedConfigs = await loadSubscriptionConfigs(pool, [subscriptionA.id, subscriptionB.id]);
    expect(storedConfigs.get(subscriptionA.id)?.limits['students.max_active']).toBe(1);
    expect(storedConfigs.get(subscriptionB.id)?.limits['students.max_active']).toBe(3);
  });

  test('keeps tenant-specific workflow access windows isolated', async () => {
    const tenantA = await registerTenantUser(app, `cfg-flow-a-${seedSuffix()}`);
    const tenantB = await registerTenantUser(app, `cfg-flow-b-${seedSuffix()}`);

    const subscriptionA = await createSubscription(app, tenantA, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254711000201',
    });
    const subscriptionB = await createSubscription(app, tenantB, {
      plan_code: 'trial',
      status: 'trialing',
      billing_phone_number: '254711000202',
    });

    await updateSubscriptionAccess(pool, subscriptionB.id, {
      current_period_end: '2026-01-01T00:00:00.000Z',
      trial_ends_at: '2026-01-01T00:00:00.000Z',
    });

    const tenantBStudentsResponse = await request(app.getHttpServer())
      .get('/students')
      .set('host', tenantB.host)
      .set('authorization', `Bearer ${tenantB.access_token}`)
      .expect(402);

    expect(tenantBStudentsResponse.body.message).toContain(
      'An active subscription is required to access this feature',
    );

    const tenantAStudentsResponse = await request(app.getHttpServer())
      .get('/students')
      .set('host', tenantA.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .expect(200);

    expect(extractCollection<StudentResponse>(tenantAStudentsResponse.body)).toEqual([]);

    const tenantAUsageResponse = await request(app.getHttpServer())
      .post('/billing/usage')
      .set('host', tenantA.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .send({
        feature_key: 'usage.events',
        quantity: '1',
        idempotency_key: `usage-${seedSuffix()}`,
      })
      .expect(201);

    expect(tenantAUsageResponse.body.tenant_id).toBe(tenantA.tenant_id);

    const tenantBUsageResponse = await request(app.getHttpServer())
      .post('/billing/usage')
      .set('host', tenantB.host)
      .set('authorization', `Bearer ${tenantB.access_token}`)
      .send({
        feature_key: 'usage.events',
        quantity: '1',
        idempotency_key: `usage-${seedSuffix()}`,
      })
      .expect(409);

    expect(tenantBUsageResponse.body.message).toContain(
      'An active subscription is required to meter usage',
    );

    const storedConfigs = await loadSubscriptionConfigs(pool, [subscriptionA.id, subscriptionB.id]);
    expect(storedConfigs.get(subscriptionA.id)?.current_period_end).not.toBe(
      storedConfigs.get(subscriptionB.id)?.current_period_end,
    );
    expect(storedConfigs.get(subscriptionB.id)?.trial_ends_at).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  test('keeps feature toggles isolated across sequential tenant requests', async () => {
    const tenantA = await registerTenantUser(app, `cfg-feature-a-${seedSuffix()}`);
    const tenantB = await registerTenantUser(app, `cfg-feature-b-${seedSuffix()}`);

    const subscriptionA = await createSubscription(app, tenantA, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254711000301',
    });
    const subscriptionB = await createSubscription(app, tenantB, {
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254711000302',
    });

    await updateSubscriptionAccess(pool, subscriptionA.id, {
      features: ['students'],
    });
    await updateSubscriptionAccess(pool, subscriptionB.id, {
      features: ['students', 'attendance'],
    });

    const studentA = await createStudent(app, tenantA, `ADM-${seedSuffix()}-FA`);
    const studentB = await createStudent(app, tenantB, `ADM-${seedSuffix()}-FB`);

    const tenantAAttendanceResponse = await request(app.getHttpServer())
      .put(`/students/${studentA.id}/attendance/2026-04-26`)
      .set('host', tenantA.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .send({
        status: 'present',
        last_modified_at: '2026-04-26T08:00:00.000Z',
      })
      .expect(402);

    expect(tenantAAttendanceResponse.body.message).toContain(
      'Current subscription does not include feature "attendance"',
    );

    const tenantBAttendanceResponse = await request(app.getHttpServer())
      .put(`/students/${studentB.id}/attendance/2026-04-26`)
      .set('host', tenantB.host)
      .set('authorization', `Bearer ${tenantB.access_token}`)
      .send({
        status: 'present',
        last_modified_at: '2026-04-26T08:00:00.000Z',
      })
      .expect(200);

    expect(tenantBAttendanceResponse.body.tenant_id).toBe(tenantB.tenant_id);

    const tenantACurrent = await getCurrentSubscription(app, tenantA);
    const tenantBCurrent = await getCurrentSubscription(app, tenantB);

    expect(tenantACurrent.features).toEqual(['students']);
    expect(tenantBCurrent.features).toEqual(['students', 'attendance']);
  });
});

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
): Promise<SubscriptionResponse> => {
  const response = await request(app.getHttpServer())
    .post('/billing/subscriptions')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      seats_allocated: 5,
      metadata: {
        seeded_by: 'config-driven.integration-spec',
      },
    })
    .expect(201);

  return response.body as SubscriptionResponse;
};

const getCurrentSubscription = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
): Promise<SubscriptionResponse> => {
  const response = await request(app.getHttpServer())
    .get('/billing/subscriptions/current')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .expect(200);

  return extractData<SubscriptionResponse>(response.body);
};

const createStudent = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  admissionNumber: string,
): Promise<StudentResponse> => {
  const response = await request(app.getHttpServer())
    .post('/students')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      admission_number: admissionNumber,
      first_name: 'Config',
      last_name: 'Tenant',
      status: 'active',
      primary_guardian_name: 'Guardian',
      primary_guardian_phone: '254700019999',
      metadata: {
        seeded_by: 'config-driven.integration-spec',
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
    current_period_end?: string;
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

const loadSubscriptionConfigs = async (
  pool: Pool,
  subscriptionIds: string[],
): Promise<
  Map<
    string,
    {
      features: string[];
      limits: Record<string, number | string | boolean | null>;
      current_period_end: string;
      trial_ends_at: string | null;
    }
  >
> => {
  const client = await pool.connect();

  try {
    const result = await client.query<{
      id: string;
      features: string[] | string;
      limits: Record<string, number | string | boolean | null> | null;
      current_period_end: Date;
      trial_ends_at: Date | null;
    }>(
      `
        SELECT
          id,
          features,
          limits,
          current_period_end,
          trial_ends_at
        FROM subscriptions
        WHERE id = ANY($1::uuid[])
      `,
      [subscriptionIds],
    );

    return new Map(
      result.rows.map((row) => [
        row.id,
        {
          features: Array.isArray(row.features)
            ? row.features
            : JSON.parse(row.features) as string[],
          limits: row.limits ?? {},
          current_period_end: row.current_period_end.toISOString(),
          trial_ends_at: row.trial_ends_at?.toISOString() ?? null,
        },
      ]),
    );
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
