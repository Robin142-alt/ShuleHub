import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { randomUUID } from 'node:crypto';

import { REDIS_CLIENT } from '../src/infrastructure/redis/redis.constants';
import { InMemoryRedis } from './support/in-memory-redis';
import { TenantIsolationTestModule } from './support/tenant-isolation-test.module';

jest.setTimeout(120000);

type RegisteredTenantUser = {
  tenant_id: string;
  host: string;
  email: string;
  password: string;
  user_id: string;
  access_token: string;
};

type CreatedStudent = {
  id: string;
  tenant_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
};

type TenantCoverageFixture = {
  outbox_event_id: string;
  shared_device_id: string;
  shared_checkout_request_id: string;
};

type CollectionEnvelope<T> = {
  data: T[];
  meta: Record<string, unknown>;
};

const TENANT_SCOPED_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
  'tenant_memberships',
  'consent_records',
  'audit_logs',
  'outbox_events',
  'event_consumer_runs',
  'idempotency_keys',
  'accounts',
  'transactions',
  'ledger_entries',
  'payment_intents',
  'callback_logs',
  'mpesa_transactions',
  'students',
  'subscriptions',
  'invoices',
  'usage_records',
  'sync_devices',
  'sync_cursors',
  'sync_operation_logs',
  'attendance_records',
] as const;

type TenantScopedTableName = (typeof TENANT_SCOPED_TABLES)[number];

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
    throw new Error('DATABASE_URL is required for tenant isolation integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-tenant-isolation-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

describe('Multi-tenant isolation hardening', () => {
  let app: INestApplication;
  let testingModule: TestingModule;
  let pool: Pool;
  let tenantA: RegisteredTenantUser;
  let tenantB: RegisteredTenantUser;
  let tenantAStudent: CreatedStudent;
  let tenantBStudent: CreatedStudent;
  let tenantACoverageFixture: TenantCoverageFixture;
  let tenantBCoverageFixture: TenantCoverageFixture;

  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

  beforeAll(async () => {
    ensureIntegrationEnv();
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [TenantIsolationTestModule],
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

    tenantA = await registerTenantUser(app, `tenanta-${suffix}`, `owner+a-${suffix}@example.test`);
    tenantB = await registerTenantUser(app, `tenantb-${suffix}`, `owner+b-${suffix}@example.test`);

    tenantAStudent = await createStudent(app, tenantA, {
      admission_number: `ADM-A-${suffix}`,
      first_name: 'Alice',
      last_name: 'TenantA',
      primary_guardian_name: 'Guardian A',
      primary_guardian_phone: '254700000001',
    });
    tenantBStudent = await createStudent(app, tenantB, {
      admission_number: `ADM-B-${suffix}`,
      first_name: 'Bob',
      last_name: 'TenantB',
      primary_guardian_name: 'Guardian B',
      primary_guardian_phone: '254700000002',
    });

    tenantACoverageFixture = await seedTenantCoverageFixtures(
      pool,
      tenantA,
      tenantAStudent,
      suffix,
    );
    tenantBCoverageFixture = await seedTenantCoverageFixtures(
      pool,
      tenantB,
      tenantBStudent,
      suffix,
    );
  });

  afterAll(async () => {
    await cleanupSeedData(pool, [tenantA, tenantB].filter(Boolean));
    await app?.close();
    await pool?.end();
  });

  test('tenant A cannot read tenant B student over the API even with a valid tenant A token', async () => {
    const response = await request(app.getHttpServer())
      .get(`/students/${tenantBStudent.id}`)
      .set('host', tenantA.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .expect(404);

    expect(response.body.message).toContain('was not found');
  });

  test('tenant A token cannot be replayed against tenant B host context', async () => {
    const response = await request(app.getHttpServer())
      .get(`/students/${tenantBStudent.id}`)
      .set('host', tenantB.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .expect(401);

    expect(response.body.message).toContain('does not belong to this tenant');
  });

  test('tenant A cannot read tenant B global user row directly from the users table', async () => {
    const rows = await withRlsSession(
      pool,
      {
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.user_id,
        role: 'owner',
      },
      async (client) => {
        const result = await client.query<{
          id: string;
          email: string;
          tenant_id: string;
        }>(
          `
            SELECT id, email, tenant_id
            FROM users
            WHERE id = $1::uuid OR id = $2::uuid
            ORDER BY email ASC
          `,
          [tenantA.user_id, tenantB.user_id],
        );

        return result.rows;
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(tenantA.user_id);
    expect(rows[0].email).toBe(tenantA.email.toLowerCase());
    expect(rows[0].tenant_id).toBe('global');
  });

  test('unfiltered reads across all tenant-scoped tables only return tenant A rows', async () => {
    const tableFootprints = await withRlsSession(
      pool,
      {
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.user_id,
        role: 'owner',
      },
      async (client) => {
        const footprints: Array<{
          table_name: TenantScopedTableName;
          rows: Array<{ tenant_id: string; row_count: number }>;
        }> = [];

        for (const tableName of TENANT_SCOPED_TABLES) {
          const result = await client.query<{ tenant_id: string; row_count: number }>(
            `
              SELECT tenant_id, COUNT(*)::int AS row_count
              FROM ${quoteIdentifier(tableName)}
              GROUP BY tenant_id
              ORDER BY tenant_id ASC
            `,
          );

          footprints.push({
            table_name: tableName,
            rows: result.rows,
          });
        }

        return footprints;
      },
    );

    for (const footprint of tableFootprints) {
      expect(footprint.rows.length).toBeGreaterThan(0);
      expect(footprint.rows.every((row) => row.tenant_id === tenantA.tenant_id)).toBe(true);
      expect(footprint.rows.some((row) => row.row_count > 0)).toBe(true);
    }
  });

  test('cross-tenant joins without tenant predicates still cannot bridge tenant A to tenant B rows', async () => {
    const joinResults = await withRlsSession(
      pool,
      {
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.user_id,
        role: 'owner',
      },
      async (client) => {
        const syncJoin = await client.query<{
          left_tenant: string;
          right_tenant: string;
        }>(
          `
            SELECT DISTINCT
              sd.tenant_id AS left_tenant,
              sol.tenant_id AS right_tenant
            FROM sync_devices sd
            INNER JOIN sync_operation_logs sol
              ON sol.device_id = sd.device_id
            WHERE sd.device_id = $1
          `,
          [tenantACoverageFixture.shared_device_id],
        );
        const callbackJoin = await client.query<{
          left_tenant: string;
          right_tenant: string;
        }>(
          `
            SELECT DISTINCT
              pi.tenant_id AS left_tenant,
              cl.tenant_id AS right_tenant
            FROM payment_intents pi
            INNER JOIN callback_logs cl
              ON cl.checkout_request_id = pi.checkout_request_id
            WHERE pi.checkout_request_id = $1
          `,
          [tenantACoverageFixture.shared_checkout_request_id],
        );
        const mpesaJoin = await client.query<{
          left_tenant: string;
          right_tenant: string;
        }>(
          `
            SELECT DISTINCT
              pi.tenant_id AS left_tenant,
              mt.tenant_id AS right_tenant
            FROM payment_intents pi
            INNER JOIN mpesa_transactions mt
              ON mt.checkout_request_id = pi.checkout_request_id
            WHERE pi.checkout_request_id = $1
          `,
          [tenantACoverageFixture.shared_checkout_request_id],
        );

        return {
          syncJoin: syncJoin.rows,
          callbackJoin: callbackJoin.rows,
          mpesaJoin: mpesaJoin.rows,
        };
      },
    );

    expect(joinResults.syncJoin).toEqual([
      { left_tenant: tenantA.tenant_id, right_tenant: tenantA.tenant_id },
    ]);
    expect(joinResults.callbackJoin).toEqual([
      { left_tenant: tenantA.tenant_id, right_tenant: tenantA.tenant_id },
    ]);
    expect(joinResults.mpesaJoin).toEqual([
      { left_tenant: tenantA.tenant_id, right_tenant: tenantA.tenant_id },
    ]);
  });

  test('runtime database role used for request sessions does not bypass RLS', async () => {
    const roleState = await withRlsSession(
      pool,
      {
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.user_id,
        role: 'owner',
      },
      async (client) => {
        const result = await client.query<{
          current_user: string;
          rolbypassrls: boolean;
        }>(`
          SELECT current_user, r.rolbypassrls
          FROM pg_roles r
          WHERE r.rolname = current_user
          LIMIT 1
        `);

        return result.rows[0];
      },
    );

    expect(roleState.current_user).toBe(process.env.DATABASE_RUNTIME_ROLE);
    expect(roleState.rolbypassrls).toBe(false);
  });

  test('manual SQL injection through the student search API does not leak tenant B rows', async () => {
    const response = await request(app.getHttpServer())
      .get('/students')
      .query({
        search: `' OR tenant_id = '${tenantB.tenant_id}' --`,
      })
      .set('host', tenantA.host)
      .set('authorization', `Bearer ${tenantA.access_token}`)
      .expect(200);

    const students = extractCollection<{ id: string }>(response.body);

    expect(students.some((student) => student.id === tenantBStudent.id)).toBe(false);
  });

  test('RLS blocks tenant A from reading tenant B rows at the database layer even with injected OR clauses', async () => {
    const rows = await withRlsSession(
      pool,
      {
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.user_id,
        role: 'owner',
      },
      async (client) => {
        const result = await client.query<{
          id: string;
          tenant_id: string;
          admission_number: string;
        }>(`
          SELECT id, tenant_id, admission_number
          FROM students
          WHERE admission_number = '${tenantAStudent.admission_number}'
             OR tenant_id = '${tenantB.tenant_id}'
          ORDER BY admission_number ASC
        `);

        return result.rows;
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(tenantAStudent.id);
    expect(rows[0].tenant_id).toBe(tenantA.tenant_id);
  });

  test('queries without tenant context fail closed across all tenant-scoped tables', async () => {
    const tableFootprints = await withRlsSession(
      pool,
      {
        tenant_id: null,
        user_id: null,
        role: null,
      },
      async (client) => {
        const footprints: Array<{
          table_name: TenantScopedTableName;
          row_count: number;
        }> = [];

        for (const tableName of TENANT_SCOPED_TABLES) {
          const result = await client.query<{ value: number }>(
            `
              SELECT COUNT(*)::int AS value
              FROM ${quoteIdentifier(tableName)}
            `,
          );

          footprints.push({
            table_name: tableName,
            row_count: result.rows[0]?.value ?? 0,
          });
        }

        return footprints;
      },
    );

    for (const footprint of tableFootprints) {
      expect(footprint.row_count).toBe(0);
    }
  });

  test('tenant A cannot update tenant B rows through direct SQL even when the target UUID is known', async () => {
    const updatedRowCount = await withRlsSession(
      pool,
      {
        tenant_id: tenantA.tenant_id,
        user_id: tenantA.user_id,
        role: 'owner',
      },
      async (client) => {
        const result = await client.query(
          `
            UPDATE students
            SET last_name = 'Compromised'
            WHERE id = $1::uuid
          `,
          [tenantBStudent.id],
        );

        return result.rowCount ?? 0;
      },
    );

    expect(updatedRowCount).toBe(0);

    const studentBState = await withRlsSession(
      pool,
      {
        tenant_id: tenantB.tenant_id,
        user_id: tenantB.user_id,
        role: 'owner',
      },
      async (client) => {
        const result = await client.query<{ last_name: string }>(
          `
            SELECT last_name
            FROM students
            WHERE id = $1::uuid
          `,
          [tenantBStudent.id],
        );

        return result.rows[0]?.last_name ?? null;
      },
    );

    expect(studentBState).toBe('TenantB');
  });

  test('RLS WITH CHECK rejects inserts that try to smuggle tenant B data from a tenant A session', async () => {
    await expect(
      withRlsSession(
        pool,
        {
          tenant_id: tenantA.tenant_id,
          user_id: tenantA.user_id,
          role: 'owner',
        },
        async (client) => {
          await client.query(
            `
              INSERT INTO students (
                tenant_id,
                admission_number,
                first_name,
                last_name
              )
              VALUES ($1, $2, $3, $4)
            `,
            [tenantB.tenant_id, `ATTACK-${suffix}`, 'Mallory', 'Escape'],
          );
        },
      ),
    ).rejects.toThrow(/row-level security|violates row-level security/i);
  });

  test('background job contexts with no tenant_id cannot read tenant rows even when marked as system', async () => {
    const rows = await withRlsSession(
      pool,
      {
        tenant_id: null,
        user_id: null,
        role: 'system',
      },
      async (client) => {
        const result = await client.query<{ id: string; tenant_id: string }>(
          `
            SELECT id, tenant_id
            FROM students
            ORDER BY admission_number ASC
          `,
        );

        return result.rows;
      },
    );

    expect(rows).toHaveLength(0);
  });

  test('system worker contexts with no tenant_id cannot read outbox rows directly', async () => {
    const rows = await withRlsSession(
      pool,
      {
        tenant_id: null,
        user_id: null,
        role: 'system',
      },
      async (client) => {
        const result = await client.query<{ id: string; tenant_id: string }>(
          `
            SELECT id, tenant_id
            FROM outbox_events
            WHERE id = $1::uuid
          `,
          [tenantACoverageFixture.outbox_event_id],
        );

        return result.rows;
      },
    );

    expect(rows).toHaveLength(0);
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

const createStudent = async (
  app: INestApplication,
  tenantUser: RegisteredTenantUser,
  payload: {
    admission_number: string;
    first_name: string;
    last_name: string;
    primary_guardian_name: string;
    primary_guardian_phone: string;
  },
): Promise<CreatedStudent> => {
  const response = await request(app.getHttpServer())
    .post('/students')
    .set('host', tenantUser.host)
    .set('authorization', `Bearer ${tenantUser.access_token}`)
    .send({
      ...payload,
      status: 'active',
      metadata: {
        seeded_by: 'tenant-isolation.integration-spec',
      },
    })
    .expect(201);

  return response.body as CreatedStudent;
};

const seedTenantCoverageFixtures = async (
  pool: Pool,
  tenantUser: RegisteredTenantUser,
  student: CreatedStudent,
  seedSuffix: string,
): Promise<TenantCoverageFixture> => {
  const sharedDeviceId = `shared-device-${seedSuffix}`;
  const sharedCheckoutRequestId = `shared-checkout-${seedSuffix}`;
  const sharedMerchantRequestId = `shared-merchant-${seedSuffix}`;

  return withRlsSession(
    pool,
    {
      tenant_id: tenantUser.tenant_id,
      user_id: tenantUser.user_id,
      role: 'owner',
    },
    async (client) => {
      const consentId = randomUUID();
      const financeIdempotencyKeyId = randomUUID();
      const paymentIdempotencyKeyId = randomUUID();
      const debitAccountId = randomUUID();
      const creditAccountId = randomUUID();
      const transactionId = randomUUID();
      const paymentIntentId = randomUUID();
      const callbackLogId = randomUUID();
      const mpesaTransactionId = randomUUID();
      const subscriptionId = randomUUID();
      const invoiceId = randomUUID();
      const usageRecordId = randomUUID();
      const syncDeviceId = randomUUID();
      const syncCursorId = randomUUID();
      const syncOperationId = randomUUID();
      const attendanceRecordId = randomUUID();

      await client.query(
        `
          INSERT INTO consent_records (
            id,
            tenant_id,
            user_id,
            consent_type,
            status,
            policy_version,
            metadata
          )
          VALUES ($1::uuid, $2, $3::uuid, 'privacy', 'granted', '2026-04', '{}'::jsonb)
        `,
        [consentId, tenantUser.tenant_id, tenantUser.user_id],
      );

      await client.query(
        `
          INSERT INTO idempotency_keys (
            id,
            tenant_id,
            user_id,
            scope,
            idempotency_key,
            request_method,
            request_path,
            request_hash,
            status,
            completed_at,
            expires_at,
            response_status_code,
            response_body
          )
          VALUES
            (
              $1::uuid,
              $3,
              $4::uuid,
              'finance:ledger:post',
              $2,
              'POST',
              '/finance/transactions',
              $5,
              'completed',
              NOW(),
              NOW() + INTERVAL '1 day',
              201,
              '{}'::jsonb
            ),
            (
              $6::uuid,
              $7,
              $8::uuid,
              'payments:mpesa:payment-intents:create',
              $9,
              'POST',
              '/payments/mpesa/payment-intents',
              $10,
              'completed',
              NOW(),
              NOW() + INTERVAL '1 day',
              201,
              '{}'::jsonb
            )
        `,
        [
          financeIdempotencyKeyId,
          `tenant-isolation:finance:${seedSuffix}:${tenantUser.tenant_id}`,
          tenantUser.tenant_id,
          tenantUser.user_id,
          `hash-finance-${seedSuffix}-${tenantUser.tenant_id}`,
          paymentIdempotencyKeyId,
          tenantUser.tenant_id,
          tenantUser.user_id,
          `tenant-isolation:payment:${seedSuffix}:${tenantUser.tenant_id}`,
          `hash-payment-${seedSuffix}-${tenantUser.tenant_id}`,
        ],
      );

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
            ($1::uuid, $3, '1100-TEST-CASH', 'Isolation Cash', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
            ($2::uuid, $3, '4100-TEST-REV', 'Isolation Revenue', 'revenue', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
        `,
        [debitAccountId, creditAccountId, tenantUser.tenant_id],
      );

      await client.query(
        `
          INSERT INTO transactions (
            id,
            tenant_id,
            idempotency_key_id,
            reference,
            description,
            currency_code,
            total_amount_minor,
            entry_count,
            effective_at,
            posted_at,
            created_by_user_id,
            request_id,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            $3::uuid,
            $4,
            'Tenant isolation financial seed',
            'KES',
            10000,
            2,
            NOW(),
            NOW(),
            $5::uuid,
            $6,
            '{}'::jsonb
          )
        `,
        [
          transactionId,
          tenantUser.tenant_id,
          financeIdempotencyKeyId,
          `TXN-${seedSuffix}-${tenantUser.tenant_id}`,
          tenantUser.user_id,
          `itest:txn:${seedSuffix}:${tenantUser.tenant_id}`,
        ],
      );

      await client.query(
        `
          INSERT INTO ledger_entries (
            tenant_id,
            transaction_id,
            account_id,
            line_number,
            direction,
            amount_minor,
            currency_code,
            description,
            metadata
          )
          VALUES
            ($1, $2::uuid, $3::uuid, 1, 'debit', 10000, 'KES', 'Isolation debit', '{}'::jsonb),
            ($1, $2::uuid, $4::uuid, 2, 'credit', 10000, 'KES', 'Isolation credit', '{}'::jsonb)
        `,
        [tenantUser.tenant_id, transactionId, debitAccountId, creditAccountId],
      );

      await client.query(
        `
          INSERT INTO payment_intents (
            id,
            tenant_id,
            idempotency_key_id,
            user_id,
            request_id,
            external_reference,
            account_reference,
            transaction_desc,
            phone_number,
            amount_minor,
            currency_code,
            status,
            merchant_request_id,
            checkout_request_id,
            response_code,
            response_description,
            customer_message,
            ledger_transaction_id,
            completed_at,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            $3::uuid,
            $4::uuid,
            $5,
            $6,
            $7,
            'Tenant isolation MPESA seed',
            $8,
            10000,
            'KES',
            'completed',
            $9,
            $10,
            '0',
            'Seeded',
            'Seeded',
            $11::uuid,
            NOW(),
            '{}'::jsonb
          )
        `,
        [
          paymentIntentId,
          tenantUser.tenant_id,
          paymentIdempotencyKeyId,
          tenantUser.user_id,
          `itest:payment-intent:${seedSuffix}:${tenantUser.tenant_id}`,
          `EXT-${seedSuffix}-${tenantUser.tenant_id}`,
          `ACC-${seedSuffix}-${tenantUser.tenant_id}`,
          `254700${tenantUser.tenant_id.endsWith('a') ? '000011' : '000022'}`,
          sharedMerchantRequestId,
          sharedCheckoutRequestId,
          transactionId,
        ],
      );

      await client.query(
        `
          INSERT INTO callback_logs (
            id,
            tenant_id,
            merchant_request_id,
            checkout_request_id,
            delivery_id,
            request_fingerprint,
            event_timestamp,
            signature,
            signature_verified,
            headers,
            raw_body,
            raw_payload,
            source_ip,
            processing_status
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            NOW(),
            'seed-signature',
            TRUE,
            '{}'::jsonb,
            '{}',
            NULL,
            '127.0.0.1',
            'processed'
          )
        `,
        [
          callbackLogId,
          tenantUser.tenant_id,
          sharedMerchantRequestId,
          sharedCheckoutRequestId,
          `delivery-${seedSuffix}-${tenantUser.tenant_id}`,
          `fingerprint-${seedSuffix}-${tenantUser.tenant_id}`,
        ],
      );

      await client.query(
        `
          INSERT INTO mpesa_transactions (
            id,
            tenant_id,
            payment_intent_id,
            callback_log_id,
            checkout_request_id,
            merchant_request_id,
            result_code,
            result_desc,
            status,
            mpesa_receipt_number,
            amount_minor,
            phone_number,
            transaction_occurred_at,
            ledger_transaction_id,
            processed_at,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            $3::uuid,
            $4::uuid,
            $5,
            $6,
            0,
            'Processed',
            'succeeded',
            $7,
            10000,
            $8,
            NOW(),
            $9::uuid,
            NOW(),
            '{}'::jsonb
          )
        `,
        [
          mpesaTransactionId,
          tenantUser.tenant_id,
          paymentIntentId,
          callbackLogId,
          sharedCheckoutRequestId,
          sharedMerchantRequestId,
          `REC-${seedSuffix}-${tenantUser.tenant_id}`,
          `254711${tenantUser.tenant_id.endsWith('a') ? '000011' : '000022'}`,
          transactionId,
        ],
      );

      await client.query(
        `
          INSERT INTO subscriptions (
            id,
            tenant_id,
            plan_code,
            status,
            billing_phone_number,
            currency_code,
            features,
            limits,
            seats_allocated,
            current_period_start,
            current_period_end,
            activated_at,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            'integration',
            'active',
            $3,
            'KES',
            '["students","attendance"]'::jsonb,
            '{"students.max_active": 100}'::jsonb,
            10,
            NOW() - INTERVAL '1 day',
            NOW() + INTERVAL '29 days',
            NOW() - INTERVAL '1 day',
            '{}'::jsonb
          )
        `,
        [
          subscriptionId,
          tenantUser.tenant_id,
          `254722${tenantUser.tenant_id.endsWith('a') ? '000011' : '000022'}`,
        ],
      );

      await client.query(
        `
          INSERT INTO invoices (
            id,
            tenant_id,
            subscription_id,
            invoice_number,
            status,
            currency_code,
            description,
            subtotal_amount_minor,
            tax_amount_minor,
            total_amount_minor,
            amount_paid_minor,
            billing_phone_number,
            issued_at,
            due_at,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            $3::uuid,
            $4,
            'open',
            'KES',
            'Tenant isolation invoice',
            10000,
            0,
            10000,
            0,
            $5,
            NOW(),
            NOW() + INTERVAL '7 days',
            '{}'::jsonb
          )
        `,
        [
          invoiceId,
          tenantUser.tenant_id,
          subscriptionId,
          `INV-${seedSuffix}-${tenantUser.tenant_id}`,
          `254733${tenantUser.tenant_id.endsWith('a') ? '000011' : '000022'}`,
        ],
      );

      await client.query(
        `
          INSERT INTO usage_records (
            id,
            tenant_id,
            subscription_id,
            feature_key,
            quantity,
            unit,
            idempotency_key,
            recorded_at,
            period_start,
            period_end,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            $3::uuid,
            'students.active',
            1,
            'count',
            $4,
            NOW(),
            NOW() - INTERVAL '1 day',
            NOW() + INTERVAL '29 days',
            '{}'::jsonb
          )
        `,
        [
          usageRecordId,
          tenantUser.tenant_id,
          subscriptionId,
          `usage-${seedSuffix}-${tenantUser.tenant_id}`,
        ],
      );

      await client.query(
        `
          INSERT INTO sync_devices (
            id,
            tenant_id,
            device_id,
            platform,
            app_version,
            metadata,
            last_seen_at,
            last_push_at,
            last_pull_at
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            'android',
            '1.0.0',
            '{}'::jsonb,
            NOW(),
            NOW(),
            NOW()
          )
        `,
        [syncDeviceId, tenantUser.tenant_id, sharedDeviceId],
      );

      await client.query(
        `
          INSERT INTO sync_cursors (
            id,
            tenant_id,
            device_id,
            entity,
            last_version
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            'attendance',
            1
          )
        `,
        [syncCursorId, tenantUser.tenant_id, sharedDeviceId],
      );

      await client.query(
        `
          INSERT INTO sync_operation_logs (
            op_id,
            tenant_id,
            device_id,
            entity,
            payload
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            'attendance',
            $4::jsonb
          )
        `,
        [
          syncOperationId,
          tenantUser.tenant_id,
          sharedDeviceId,
          JSON.stringify({
            action: 'upsert',
            student_id: student.id,
            attendance_date: new Date().toISOString().slice(0, 10),
            status: 'present',
          }),
        ],
      );

      await client.query(
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
            CURRENT_DATE,
            'present',
            'Tenant isolation attendance seed',
            '{}'::jsonb,
            $4,
            NOW(),
            $5::uuid,
            1
          )
        `,
        [attendanceRecordId, tenantUser.tenant_id, student.id, sharedDeviceId, syncOperationId],
      );

      await client.query(
        `
          INSERT INTO audit_logs (
            tenant_id,
            actor_user_id,
            request_id,
            action,
            resource_type,
            resource_id,
            metadata
          )
          VALUES (
            $1,
            $2::uuid,
            $3,
            'tenant.isolation.seeded',
            'student',
            $4::uuid,
            '{}'::jsonb
          )
        `,
        [
          tenantUser.tenant_id,
          tenantUser.user_id,
          `itest:audit:${seedSuffix}:${tenantUser.tenant_id}`,
          student.id,
        ],
      );

      const outboxEventId = await createFutureOutboxEvent(
        pool,
        tenantUser,
        student.id,
        `${seedSuffix}-${tenantUser.tenant_id}`,
      );

      await client.query(
        `
          INSERT INTO event_consumer_runs (
            tenant_id,
            outbox_event_id,
            event_key,
            consumer_name,
            status,
            attempt_count,
            processed_at
          )
          VALUES (
            $1,
            $2::uuid,
            $3,
            'tenant-isolation.consumer',
            'completed',
            1,
            NOW()
          )
        `,
        [
          tenantUser.tenant_id,
          outboxEventId,
          `tenant-isolation:hidden-outbox:${seedSuffix}-${tenantUser.tenant_id}`,
        ],
      );

      return {
        outbox_event_id: outboxEventId,
        shared_device_id: sharedDeviceId,
        shared_checkout_request_id: sharedCheckoutRequestId,
      };
    },
  );
};

const createFutureOutboxEvent = async (
  pool: Pool,
  tenantUser: RegisteredTenantUser,
  aggregateId: string,
  seedSuffix: string,
): Promise<string> =>
  withRlsSession(
    pool,
    {
      tenant_id: tenantUser.tenant_id,
      user_id: tenantUser.user_id,
      role: 'owner',
    },
    async (client) => {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO outbox_events (
            tenant_id,
            event_key,
            event_name,
            aggregate_type,
            aggregate_id,
            payload,
            headers,
            status,
            available_at
          )
          VALUES (
            $1,
            $2,
            'student.created',
            'student',
            $3::uuid,
            $4::jsonb,
            $5::jsonb,
            'pending',
            NOW() + INTERVAL '1 day'
          )
          RETURNING id
        `,
        [
          tenantUser.tenant_id,
          `tenant-isolation:hidden-outbox:${seedSuffix}`,
          aggregateId,
          JSON.stringify({
            tenant_id: tenantUser.tenant_id,
            student_id: aggregateId,
            created_at: new Date().toISOString(),
            created_by_user_id: tenantUser.user_id,
          }),
          JSON.stringify({
            request_id: `itest:hidden-outbox:${seedSuffix}`,
          }),
        ],
      );

      return result.rows[0].id;
    },
  );

const withRlsSession = async <T>(
  pool: Pool,
  context: {
    tenant_id: string | null;
    user_id: string | null;
    role: string | null;
  },
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setSessionContext(client, context);
    const result = await callback(client);
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const setSessionContext = async (
  client: PoolClient,
  context: {
    tenant_id: string | null;
    user_id: string | null;
    role: string | null;
  },
): Promise<void> => {
  const runtimeRole = process.env.DATABASE_RUNTIME_ROLE?.trim();

  if (runtimeRole) {
    await client.query(`SET LOCAL ROLE ${quoteIdentifier(runtimeRole)}`);
  }

  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenant_id ?? '']);
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [context.user_id ?? 'anonymous']);
  await client.query(`SELECT set_config('app.role', $1, true)`, [context.role ?? '']);
  await client.query(`SELECT set_config('app.request_id', $1, true)`, [`itest:${randomUUID()}`]);
};

const cleanupSeedData = async (
  pool: Pool,
  tenantUsers: RegisteredTenantUser[],
): Promise<void> => {
  if (tenantUsers.length === 0) {
    return;
  }

  const tenantIds = tenantUsers.map((tenantUser) => tenantUser.tenant_id);
  const emails = tenantUsers.map((tenantUser) => tenantUser.email.toLowerCase());
  const ownerClient = await pool.connect();

  try {
    await ownerClient.query('BEGIN');
    await ownerClient.query('ALTER TABLE ledger_entries DISABLE TRIGGER USER');
    await ownerClient.query('ALTER TABLE transactions DISABLE TRIGGER USER');
    await ownerClient.query('ALTER TABLE sync_operation_logs DISABLE TRIGGER USER');
    await ownerClient.query('ALTER TABLE usage_records DISABLE TRIGGER USER');
    await ownerClient.query(`DELETE FROM event_consumer_runs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM outbox_events WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM mpesa_transactions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM callback_logs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM payment_intents WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM invoices WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM usage_records WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM subscriptions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM attendance_records WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM sync_cursors WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM sync_devices WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM sync_operation_logs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM consent_records WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM ledger_entries WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM transactions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM accounts WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM idempotency_keys WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM students WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM role_permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM permissions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM roles WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await ownerClient.query(`DELETE FROM users WHERE lower(email) = ANY($1::text[])`, [emails]);
    await ownerClient.query('ALTER TABLE usage_records ENABLE TRIGGER USER');
    await ownerClient.query('ALTER TABLE sync_operation_logs ENABLE TRIGGER USER');
    await ownerClient.query('ALTER TABLE transactions ENABLE TRIGGER USER');
    await ownerClient.query('ALTER TABLE ledger_entries ENABLE TRIGGER USER');
    await ownerClient.query('COMMIT');
  } catch (error) {
    await ownerClient.query('ROLLBACK');
    throw error;
  } finally {
    ownerClient.release();
  }
};

const quoteIdentifier = (identifier: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL role identifier "${identifier}"`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
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
