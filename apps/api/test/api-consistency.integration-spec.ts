import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { InMemoryRedis } from './support/in-memory-redis';
import { ApiConsistencyTestModule } from './support/api-consistency-test.module';

jest.setTimeout(180000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  email: string;
  password: string;
  user_id: string;
  access_token: string;
};

type StudentResponse = {
  id: string;
  tenant_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
};

type InvoiceResponse = {
  id: string;
  tenant_id: string;
  status: string;
  description: string;
  issued_at: string;
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
    throw new Error('DATABASE_URL is required for API consistency integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-api-consistency-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

describe('API consistency checks', () => {
  let app: INestApplication;
  let testingModule: TestingModule;
  let pool: Pool;
  let tenantOwner: RegisteredTenantUser;
  let createdStudents: StudentResponse[];
  let createdInvoices: InvoiceResponse[];

  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

  beforeAll(async () => {
    ensureIntegrationEnv();
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [ApiConsistencyTestModule],
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

    tenantOwner = await registerTenantUser(
      app,
      `apic-${suffix}`,
      `owner+api-${suffix}@example.test`,
    );

    await createSubscription(app, tenantOwner);

    createdStudents = await seedStudents(app, tenantOwner, suffix);
    await setStudentCreatedAtOrder(pool, createdStudents, [
      '2026-04-26T10:00:00.000Z',
      '2026-04-26T10:01:00.000Z',
      '2026-04-26T10:02:00.000Z',
      '2026-04-26T10:03:00.000Z',
    ]);

    createdInvoices = await seedInvoices(app, tenantOwner, suffix);
    await setInvoiceState(pool, createdInvoices[0].id, {
      status: 'paid',
      issued_at: '2026-04-26T08:00:00.000Z',
    });
    await setInvoiceState(pool, createdInvoices[1].id, {
      status: 'open',
      issued_at: '2026-04-26T09:00:00.000Z',
    });
    await setInvoiceState(pool, createdInvoices[2].id, {
      status: 'open',
      issued_at: '2026-04-26T10:00:00.000Z',
    });
  });

  afterAll(async () => {
    await cleanupSeedData(pool, tenantOwner ? [tenantOwner] : []);
    await app?.close();
    await pool?.end();
  });

  test('students list applies pagination, filtering, and deterministic default sorting', async () => {
    const response = await request(app.getHttpServer())
      .get('/students')
      .query({
        limit: 2,
      })
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(200);

    const students = extractCollection<StudentResponse>(response.body);

    expect(students).toHaveLength(2);
    expect(students.map((student) => student.admission_number)).toEqual([
      `ADM-${suffix}-004`,
      `ADM-${suffix}-003`,
    ]);

    const filteredResponse = await request(app.getHttpServer())
      .get('/students')
      .query({
        status: 'inactive',
        search: 'searchable',
      })
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(200);

    const filteredStudents = extractCollection<StudentResponse>(filteredResponse.body);

    expect(filteredStudents).toHaveLength(1);
    expect(filteredStudents[0].admission_number).toBe(`ADM-${suffix}-002`);
    expect(filteredStudents[0].status).toBe('inactive');
  });

  test('billing invoices list applies filtering and newest-first sorting', async () => {
    const response = await request(app.getHttpServer())
      .get('/billing/invoices')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(200);

    const invoices = extractCollection<InvoiceResponse>(response.body);

    expect(invoices.map((invoice) => invoice.description)).toEqual([
      `Invoice ${suffix} C`,
      `Invoice ${suffix} B`,
      `Invoice ${suffix} A`,
    ]);

    const filteredResponse = await request(app.getHttpServer())
      .get('/billing/invoices')
      .query({
        status: 'paid',
      })
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(200);

    const filteredInvoices = extractCollection<InvoiceResponse>(filteredResponse.body);

    expect(filteredInvoices).toHaveLength(1);
    expect(filteredInvoices[0].status).toBe('paid');
    expect(filteredInvoices[0].description).toBe(`Invoice ${suffix} A`);
  });

  test('invalid list query parameters return validation errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/students')
      .query({
        limit: 0,
        status: 'bogus',
      })
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(400);

    expect(Array.isArray(response.body.message)).toBe(true);
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('limit must not be less than 1'),
        expect.stringContaining('status must be one of the following values'),
      ]),
    );
  });

  test('missing required fields return validation errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/students')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .send({
        last_name: 'OnlyLastName',
      })
      .expect(400);

    expect(Array.isArray(response.body.message)).toBe(true);
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('admission_number must be shorter than or equal to 32 characters'),
        expect.stringContaining('admission_number must be longer than or equal to 1 characters'),
        expect.stringContaining('admission_number must be a string'),
        expect.stringContaining('first_name must be shorter than or equal to 80 characters'),
        expect.stringContaining('first_name must be longer than or equal to 1 characters'),
        expect.stringContaining('first_name must be a string'),
      ]),
    );
  });

  test('collection responses use the { data, meta } envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/students')
      .query({
        limit: 2,
      })
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.any(Array),
        meta: expect.any(Object),
      }),
    );
  });

  test('resource responses use the { data, meta } envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('host', tenantOwner.host)
      .set('authorization', `Bearer ${tenantOwner.access_token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.any(Object),
        meta: expect.any(Object),
      }),
    );
  });
});

const registerTenantUser = async (
  app: INestApplication,
  tenantId: string,
  email: string,
): Promise<RegisteredTenantUser> => {
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
): Promise<void> => {
  await request(app.getHttpServer())
    .post('/billing/subscriptions')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      plan_code: 'starter',
      status: 'active',
      billing_phone_number: '254700000701',
      seats_allocated: 5,
      metadata: {
        seeded_by: 'api-consistency.integration-spec',
      },
    })
    .expect(201);
};

const seedStudents = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  seedSuffix: string,
): Promise<StudentResponse[]> => {
  const payloads = [
    {
      admission_number: `ADM-${seedSuffix}-001`,
      first_name: 'Alpha',
      last_name: 'Sorting',
      status: 'active',
    },
    {
      admission_number: `ADM-${seedSuffix}-002`,
      first_name: 'Searchable',
      last_name: 'Inactive',
      status: 'inactive',
    },
    {
      admission_number: `ADM-${seedSuffix}-003`,
      first_name: 'Bravo',
      last_name: 'Sorting',
      status: 'active',
    },
    {
      admission_number: `ADM-${seedSuffix}-004`,
      first_name: 'Charlie',
      last_name: 'Sorting',
      status: 'active',
    },
  ];

  const students: StudentResponse[] = [];

  for (const payload of payloads) {
    const response = await request(app.getHttpServer())
      .post('/students')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        ...payload,
        primary_guardian_name: 'Guardian',
        primary_guardian_phone: '254700000702',
        metadata: {
          seeded_by: 'api-consistency.integration-spec',
        },
      })
      .expect(201);

    students.push(response.body as StudentResponse);
  }

  return students;
};

const seedInvoices = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  seedSuffix: string,
): Promise<InvoiceResponse[]> => {
  const payloads = [
    {
      description: `Invoice ${seedSuffix} A`,
      total_amount_minor: '1000',
    },
    {
      description: `Invoice ${seedSuffix} B`,
      total_amount_minor: '2000',
    },
    {
      description: `Invoice ${seedSuffix} C`,
      total_amount_minor: '3000',
    },
  ];

  const invoices: InvoiceResponse[] = [];

  for (const payload of payloads) {
    const response = await request(app.getHttpServer())
      .post('/billing/invoices')
      .set('host', tenantUser.host)
      .set('authorization', `Bearer ${tenantUser.access_token}`)
      .send({
        ...payload,
        billing_phone_number: '254700000703',
        metadata: {
          seeded_by: 'api-consistency.integration-spec',
        },
      })
      .expect(201);

    invoices.push(response.body as InvoiceResponse);
  }

  return invoices;
};

const setStudentCreatedAtOrder = async (
  pool: Pool,
  students: StudentResponse[],
  timestamps: string[],
): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let index = 0; index < students.length; index += 1) {
      await client.query(
        `
          UPDATE students
          SET
            created_at = $2::timestamptz,
            updated_at = $2::timestamptz
          WHERE id = $1::uuid
        `,
        [students[index].id, timestamps[index]],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const setInvoiceState = async (
  pool: Pool,
  invoiceId: string,
  input: {
    status: string;
    issued_at: string;
  },
): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query(
      `
        UPDATE invoices
        SET
          status = $2,
          issued_at = $3::timestamptz,
          updated_at = $3::timestamptz
        WHERE id = $1::uuid
      `,
      [invoiceId, input.status, input.issued_at],
    );
  } finally {
    client.release();
  }
};

const extractCollection = <T>(body: unknown): T[] => {
  if (Array.isArray(body)) {
    return body as T[];
  }

  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown[] }).data)) {
    return (body as { data: T[] }).data;
  }

  throw new Error('Expected an array response or a { data } envelope');
};

const cleanupSeedData = async (
  pool: Pool,
  tenantUsers: RegisteredTenantUser[],
): Promise<void> => {
  if (tenantUsers.length === 0) {
    return;
  }

  const tenantIds = [...new Set(tenantUsers.map((tenantUser) => tenantUser.tenant_id))];
  const emails = tenantUsers.map((tenantUser) => tenantUser.email.toLowerCase());
  const ownerClient = await pool.connect();

  try {
    await ownerClient.query('BEGIN');
    await ownerClient.query('ALTER TABLE usage_records DISABLE TRIGGER USER');
    await ownerClient.query(`DELETE FROM usage_records WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM invoices WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM subscriptions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM students WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM role_permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM roles WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM users WHERE lower(email) = ANY($1::text[])`, [emails]);
    await ownerClient.query('ALTER TABLE usage_records ENABLE TRIGGER USER');
    await ownerClient.query('COMMIT');
  } catch (error) {
    await ownerClient.query('ROLLBACK');
    throw error;
  } finally {
    ownerClient.release();
  }
};
