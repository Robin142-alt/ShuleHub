import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { InMemoryRedis } from './support/in-memory-redis';
import { ComplianceTestModule } from './support/compliance-test.module';

jest.setTimeout(180000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  email: string;
  password: string;
  user_id: string;
  access_token: string;
};

type ConsentRecord = {
  id: string;
  tenant_id: string;
  consent_type: string;
  status: 'granted' | 'revoked' | 'withdrawn';
  policy_version: string;
  metadata: Record<string, unknown>;
  captured_at: string;
  created_at: string;
  updated_at: string;
};

type DataEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

describe('Data compliance workflows', () => {
  let app: INestApplication;
  let testingModule: TestingModule;
  let pool: Pool;
  let tenantAUser: RegisteredTenantUser;
  let tenantBUser: RegisteredTenantUser;
  let seededStudentId: string;

  const tenantIds = new Set<string>();

  beforeAll(async () => {
    ensureIntegrationEnv();
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [ComplianceTestModule],
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

    const sharedEmail = `privacy+${seedSuffix()}@example.test`;
    const sharedPassword = `SecurePass!${seedSuffix().slice(-4)}`;

    tenantAUser = await registerTenantUser(app, `privacy-a-${seedSuffix()}`, sharedEmail, sharedPassword);
    tenantBUser = await registerTenantUser(app, `privacy-b-${seedSuffix()}`, sharedEmail, sharedPassword);

    tenantIds.add(tenantAUser.tenant_id);
    tenantIds.add(tenantBUser.tenant_id);
  });

  afterAll(async () => {
    await cleanupSeedData(pool, tenantIds, [tenantAUser?.email, tenantBUser?.email].filter(Boolean));
    await app?.close();
    await pool?.end();
  });

  test('exports current-tenant user data and keeps consent records tenant-scoped', async () => {
    await recordConsent(app, tenantAUser, {
      consent_type: 'marketing_email',
      status: 'granted',
      policy_version: '2026-04',
      metadata: {
        source: 'web-settings',
      },
    });
    await recordConsent(app, tenantBUser, {
      consent_type: 'sms_notifications',
      status: 'granted',
      policy_version: '2026-05',
      metadata: {
        source: 'mobile-app',
      },
    });

    const consentsResponse = await request(app.getHttpServer())
      .get('/compliance/me/consents')
      .set('host', tenantAUser.host)
      .set('authorization', `Bearer ${tenantAUser.access_token}`)
      .expect(200);
    const tenantAConsents = extractData<ConsentRecord[]>(consentsResponse.body);

    expect(tenantAConsents).toHaveLength(1);
    expect(tenantAConsents[0].tenant_id).toBe(tenantAUser.tenant_id);
    expect(tenantAConsents[0].consent_type).toBe('marketing_email');

    const exportResponse = await request(app.getHttpServer())
      .get('/compliance/me/export')
      .set('host', tenantAUser.host)
      .set('authorization', `Bearer ${tenantAUser.access_token}`)
      .expect(200);
    const exportBody = extractData<{
      generated_at: string;
      user: {
        user_id: string;
        email: string;
        display_name: string;
        status: string;
      };
      membership: {
        tenant_id: string;
        role_code: string;
        role_name: string;
        status: string;
      };
      consents: ConsentRecord[];
    }>(exportResponse.body);

    expect(exportBody.generated_at).toBeTruthy();
    expect(exportBody.user.user_id).toBe(tenantAUser.user_id);
    expect(exportBody.user.email).toBe(tenantAUser.email);
    expect(exportBody.user.display_name).toContain('User');
    expect(exportBody.user.status).toBe('active');
    expect(exportBody.membership.tenant_id).toBe(tenantAUser.tenant_id);
    expect(exportBody.membership.role_code).toBeTruthy();
    expect(exportBody.consents).toHaveLength(1);
    expect(exportBody.consents[0].tenant_id).toBe(tenantAUser.tenant_id);
    expect(exportBody.consents[0].consent_type).toBe('marketing_email');
    expect(JSON.stringify(exportBody)).not.toContain('password_hash');
  });

  test('deletes the account, invalidates sessions, and clears recoverable links', async () => {
    seededStudentId = randomUUID();
    await pool.query(
      `
        INSERT INTO students (
          id,
          tenant_id,
          admission_number,
          first_name,
          last_name,
          status,
          metadata,
          created_by_user_id
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          'Privacy',
          'Subject',
          'active',
          '{"seeded_by":"compliance.integration-spec"}'::jsonb,
          $4::uuid
        )
      `,
      [seededStudentId, tenantAUser.tenant_id, `ADM-${seedSuffix()}`, tenantAUser.user_id],
    );

    const deleteResponse = await request(app.getHttpServer())
      .delete('/compliance/me')
      .set('host', tenantAUser.host)
      .set('authorization', `Bearer ${tenantAUser.access_token}`)
      .expect(200);

    expect(deleteResponse.body.success).toBe(true);
    expect(deleteResponse.body.deleted_user_id).toBe(tenantAUser.user_id);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('host', tenantAUser.host)
      .set('authorization', `Bearer ${tenantAUser.access_token}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('host', tenantBUser.host)
      .set('authorization', `Bearer ${tenantBUser.access_token}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('host', tenantAUser.host)
      .send({
        email: tenantAUser.email,
        password: tenantAUser.password,
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('host', tenantBUser.host)
      .send({
        email: tenantBUser.email,
        password: tenantBUser.password,
      })
      .expect(401);

    const userCount = await queryScalar<number>(
      pool,
      `
        SELECT COUNT(*)::int AS value
        FROM users
        WHERE id = $1::uuid
      `,
      [tenantAUser.user_id],
    );
    const membershipCount = await queryScalar<number>(
      pool,
      `
        SELECT COUNT(*)::int AS value
        FROM tenant_memberships
        WHERE user_id = $1::uuid
      `,
      [tenantAUser.user_id],
    );
    const anonymizedConsentCount = await queryScalar<number>(
      pool,
      `
        SELECT COUNT(*)::int AS value
        FROM consent_records
        WHERE tenant_id = ANY($1::text[])
          AND user_id IS NULL
      `,
      [[tenantAUser.tenant_id, tenantBUser.tenant_id]],
    );
    const studentCreator = await queryScalar<string | null>(
      pool,
      `
        SELECT created_by_user_id::text AS value
        FROM students
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [seededStudentId],
    );

    expect(userCount).toBe(0);
    expect(membershipCount).toBe(0);
    expect(anonymizedConsentCount).toBeGreaterThanOrEqual(2);
    expect(studentCreator).toBeNull();
  });
});

const ensureIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? 'integration.test';
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'shule-hub-compliance-tests';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'shule-hub-compliance-clients';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'compliance-access-secret';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'compliance-refresh-secret';
  process.env.DATABASE_RUNTIME_ROLE =
    process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for compliance integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-compliance-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

const registerTenantUser = async (
  app: INestApplication,
  tenantId: string,
  email: string,
  password: string,
): Promise<RegisteredTenantUser> => {
  const host = `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`;
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .set('host', host)
    .send({
      email,
      password,
      display_name: `User ${tenantId}`,
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

const recordConsent = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    consent_type: string;
    status: 'granted' | 'revoked' | 'withdrawn';
    policy_version: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> => {
  await request(app.getHttpServer())
    .post('/compliance/me/consents')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send(payload)
    .expect(201);
};

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

const queryScalar = async <TValue>(
  pool: Pool,
  text: string,
  values: unknown[] = [],
): Promise<TValue> => {
  const result = await pool.query<{ value: TValue }>(text, values);

  if (!result.rows[0]) {
    throw new Error('Expected a row but query returned none');
  }

  return result.rows[0].value;
};

const cleanupSeedData = async (
  pool: Pool | undefined,
  tenantIds: Set<string>,
  emails: string[],
): Promise<void> => {
  if (!pool) {
    return;
  }

  const client = await pool.connect();
  const tenantValues = [...tenantIds];

  try {
    await client.query('BEGIN');

    if (tenantValues.length > 0) {
      await client.query(`DELETE FROM consent_records WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
      await client.query(`DELETE FROM students WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
      await client.query(`DELETE FROM role_permissions WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
      await client.query(`DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
      await client.query(`DELETE FROM permissions WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
      await client.query(`DELETE FROM roles WHERE tenant_id = ANY($1::text[])`, [tenantValues]);
    }

    if (emails.length > 0) {
      await client.query(`DELETE FROM users WHERE lower(email) = ANY($1::text[])`, [
        emails.map((email) => email.toLowerCase()),
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const seedSuffix = (): string => randomUUID().replace(/-/g, '').slice(0, 8);
