import { randomUUID } from 'node:crypto';

import format from 'pg-format';
import { Pool } from 'pg';

export interface TenantSeedConfig {
  tenant_id: string;
  timezone: string;
  billing_plan: string;
  portal_enabled: boolean;
}

export interface SeedDigest {
  tenant_id: string;
  student_count: number;
  usage_count: number;
  student_hash: string;
  usage_hash: string;
}

export interface MigrationSandboxSeedOptions {
  schema_name: string;
  tenants: TenantSeedConfig[];
  students_per_tenant: number;
  usage_records_per_tenant: number;
}

export interface OnlineMigrationOptions {
  batch_size?: number;
  per_batch_sleep_ms?: number;
  on_additive_phase_ready?: () => void | Promise<void>;
}

export const ensureMigrationTestEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for migration integration tests');
  }
};

export const createIntegrationPool = (applicationName: string): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: applicationName,
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

export const createSandboxSchemaName = (prefix: string): string =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

export const createMigrationSandbox = async (
  pool: Pool,
  options: MigrationSandboxSeedOptions,
): Promise<void> => {
  const schemaName = assertIdentifier(options.schema_name);

  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(format('CREATE SCHEMA IF NOT EXISTS %I', schemaName));
  await pool.query(
    format(
      `
        CREATE TABLE %I.tenant_profiles (
          tenant_id text PRIMARY KEY,
          timezone text NOT NULL,
          billing_plan text NOT NULL,
          feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
          config_version integer NOT NULL DEFAULT 1,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )
      `,
      schemaName,
    ),
  );
  await pool.query(
    format(
      `
        CREATE TABLE %I.student_records (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id text NOT NULL,
          admission_number text NOT NULL,
          full_name text NOT NULL,
          legacy_guardian_phone text,
          status text NOT NULL DEFAULT 'active',
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_student_records_tenant_admission UNIQUE (tenant_id, admission_number),
          CONSTRAINT fk_student_records_tenant
            FOREIGN KEY (tenant_id)
            REFERENCES %I.tenant_profiles (tenant_id)
            ON DELETE CASCADE
        )
      `,
      schemaName,
      schemaName,
    ),
  );
  await pool.query(
    format(
      `
        CREATE TABLE %I.billing_usage (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id text NOT NULL,
          metric_key text NOT NULL,
          quantity integer NOT NULL,
          recorded_at timestamptz NOT NULL DEFAULT NOW(),
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          CONSTRAINT fk_billing_usage_tenant
            FOREIGN KEY (tenant_id)
            REFERENCES %I.tenant_profiles (tenant_id)
            ON DELETE CASCADE
        )
      `,
      schemaName,
      schemaName,
    ),
  );
  await pool.query(
    format(
      `
        CREATE INDEX ix_%1$I_student_records_tenant_created_at
          ON %1$I.student_records (tenant_id, created_at DESC);
        CREATE INDEX ix_%1$I_billing_usage_tenant_recorded_at
          ON %1$I.billing_usage (tenant_id, recorded_at DESC);
      `,
      schemaName,
    ),
  );

  for (const tenant of options.tenants) {
    await pool.query(
      format(
        `
          INSERT INTO %I.tenant_profiles (
            tenant_id,
            timezone,
            billing_plan,
            feature_flags,
            config_version
          )
          VALUES ($1, $2, $3, $4::jsonb, 1)
        `,
        schemaName,
      ),
      [
        tenant.tenant_id,
        tenant.timezone,
        tenant.billing_plan,
        JSON.stringify({
          portal_enabled: tenant.portal_enabled,
          seeded: true,
          migration_test: true,
        }),
      ],
    );

    await pool.query(
      format(
        `
          INSERT INTO %I.student_records (
            tenant_id,
            admission_number,
            full_name,
            legacy_guardian_phone,
            status,
            metadata,
            created_at
          )
          SELECT
            $1::text,
            'ADM-' || $2::text || '-' || LPAD(series_number::text, 5, '0'),
            'Student ' || $2::text || ' #' || series_number::text,
            '2547' || LPAD(((series_number + $3::integer) %% 100000000)::text, 8, '0'),
            CASE WHEN series_number %% 9 = 0 THEN 'inactive' ELSE 'active' END,
            jsonb_build_object(
              'source',
              'seed',
              'series_number',
              series_number,
              'tenant_id',
              $1::text
            ),
            NOW() - make_interval(mins => series_number)
          FROM generate_series(1, $4::integer) AS seeded(series_number)
        `,
        schemaName,
      ),
      [
        tenant.tenant_id,
        tenant.tenant_id.slice(-4),
        options.students_per_tenant,
        options.students_per_tenant,
      ],
    );

    await pool.query(
      format(
        `
          INSERT INTO %I.billing_usage (
            tenant_id,
            metric_key,
            quantity,
            recorded_at,
            metadata
          )
          SELECT
            $1::text,
            CASE
              WHEN series_number %% 3 = 0 THEN 'attendance.sync'
              WHEN series_number %% 3 = 1 THEN 'finance.posted'
              ELSE 'billing.invoice.generated'
            END,
            (series_number %% 5) + 1,
            NOW() - make_interval(secs => series_number),
            jsonb_build_object(
              'source',
              CASE
                WHEN series_number %% 2 = 0 THEN 'mobile'
                ELSE 'web'
              END,
              'seeded',
              true,
              'series_number',
              series_number
            )
          FROM generate_series(1, $2::integer) AS seeded(series_number)
        `,
        schemaName,
      ),
      [tenant.tenant_id, options.usage_records_per_tenant],
    );
  }
};

export const dropMigrationSandbox = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  await pool.query(format('DROP SCHEMA IF EXISTS %I CASCADE', assertIdentifier(schemaName)));
};

export const computeSeedDigests = async (
  pool: Pool,
  schemaName: string,
  tenantIds: string[],
): Promise<Record<string, SeedDigest>> => {
  const result = await pool.query<SeedDigest>(
    format(
      `
        WITH student_digests AS (
          SELECT
            tenant_id,
            COUNT(*)::int AS student_count,
            COALESCE(
              md5(
                string_agg(
                  admission_number
                  || '|' || full_name
                  || '|' || COALESCE(legacy_guardian_phone, '')
                  || '|' || status,
                  ','
                  ORDER BY admission_number
                )
              ),
              md5('')
            ) AS student_hash
          FROM %1$I.student_records
          WHERE tenant_id = ANY($1::text[])
            AND metadata ->> 'source' = 'seed'
          GROUP BY tenant_id
        ),
        usage_digests AS (
          SELECT
            tenant_id,
            COUNT(*)::int AS usage_count,
            COALESCE(
              md5(
                string_agg(
                  metric_key
                  || '|' || quantity::text
                  || '|' || (metadata ->> 'source')
                  || '|' || to_char(recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
                  ','
                  ORDER BY recorded_at, metric_key
                )
              ),
              md5('')
            ) AS usage_hash
          FROM %1$I.billing_usage
          WHERE tenant_id = ANY($1::text[])
            AND metadata ->> 'seeded' = 'true'
          GROUP BY tenant_id
        )
        SELECT
          tenant_profiles.tenant_id,
          COALESCE(student_digests.student_count, 0) AS student_count,
          COALESCE(usage_digests.usage_count, 0) AS usage_count,
          COALESCE(student_digests.student_hash, md5('')) AS student_hash,
          COALESCE(usage_digests.usage_hash, md5('')) AS usage_hash
        FROM %1$I.tenant_profiles AS tenant_profiles
        LEFT JOIN student_digests
          ON student_digests.tenant_id = tenant_profiles.tenant_id
        LEFT JOIN usage_digests
          ON usage_digests.tenant_id = tenant_profiles.tenant_id
        WHERE tenant_profiles.tenant_id = ANY($1::text[])
        ORDER BY tenant_profiles.tenant_id ASC
      `,
      assertIdentifier(schemaName),
    ),
    [tenantIds],
  );

  return Object.fromEntries(result.rows.map((row) => [row.tenant_id, row]));
};

export const runForwardMigration = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);

  await runAdditiveMigrationPhase(pool, safeSchemaName);
  await runBackfillPhase(pool, safeSchemaName);
  await pool.query(
    format(
      `
        ALTER TABLE %1$I.tenant_profiles
          ALTER COLUMN is_portal_enabled SET DEFAULT FALSE;
        ALTER TABLE %1$I.tenant_profiles
          ALTER COLUMN is_portal_enabled SET NOT NULL;
      `,
      safeSchemaName,
    ),
  );
};

export const runPartialFailingMigration = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await runAdditiveMigrationPhaseOnClient(client, safeSchemaName);
    await runBackfillPhaseOnClient(client, safeSchemaName);
    await client.query(`SELECT 1 / 0`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const runRollbackMigration = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);

  await pool.query(
    format(
      `
        DROP INDEX IF EXISTS %1$I.ix_student_records_tenant_normalized_guardian_phone;
        DROP INDEX IF EXISTS %1$I.ix_billing_usage_tenant_usage_dimension_recorded_at;
        ALTER TABLE %1$I.tenant_profiles
          ALTER COLUMN is_portal_enabled DROP DEFAULT;
        ALTER TABLE %1$I.tenant_profiles
          DROP COLUMN IF EXISTS is_portal_enabled;
        ALTER TABLE %1$I.student_records
          DROP CONSTRAINT IF EXISTS ck_student_records_normalized_guardian_phone_digits;
        ALTER TABLE %1$I.student_records
          DROP COLUMN IF EXISTS normalized_guardian_phone;
        ALTER TABLE %1$I.billing_usage
          DROP COLUMN IF EXISTS usage_dimension;
      `,
      safeSchemaName,
    ),
  );
};

export const runOnlineForwardMigration = async (
  pool: Pool,
  schemaName: string,
  options: OnlineMigrationOptions = {},
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const client = await pool.connect();
  const batchSize = options.batch_size ?? 250;
  const perBatchSleepMs = options.per_batch_sleep_ms ?? 10;

  try {
    await runAdditiveMigrationPhaseOnClient(client, safeSchemaName);

    if (options.on_additive_phase_ready) {
      await options.on_additive_phase_ready();
    }

    await runChunkedBackfill(
      client,
      safeSchemaName,
      batchSize,
      perBatchSleepMs,
    );
    await client.query(
      format(
        `
          UPDATE %1$I.tenant_profiles
          SET
            is_portal_enabled = COALESCE((feature_flags ->> 'portal_enabled')::boolean, FALSE),
            updated_at = NOW()
          WHERE is_portal_enabled IS NULL;

          UPDATE %1$I.billing_usage
          SET usage_dimension = COALESCE(NULLIF(metadata ->> 'source', ''), 'general')
          WHERE usage_dimension IS NULL;
        `,
        safeSchemaName,
      ),
    );
  } finally {
    client.release();
  }
};

export const columnExists = async (
  pool: Pool,
  schemaName: string,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS exists
    `,
    [schemaName, tableName, columnName],
  );

  return Boolean(result.rows[0]?.exists);
};

export const getTenantPortalState = async (
  pool: Pool,
  schemaName: string,
): Promise<Record<string, boolean>> => {
  const result = await pool.query<{ tenant_id: string; is_portal_enabled: boolean }>(
    format(
      `
        SELECT tenant_id, is_portal_enabled
        FROM %I.tenant_profiles
        ORDER BY tenant_id ASC
      `,
      assertIdentifier(schemaName),
    ),
  );

  return Object.fromEntries(
    result.rows.map((row) => [row.tenant_id, row.is_portal_enabled]),
  );
};

export const countLegacyQueryMatches = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    format(
      `
        SELECT COUNT(*)::int AS value
        FROM %I.student_records
        WHERE tenant_id = $1
          AND legacy_guardian_phone LIKE '2547%%'
      `,
      assertIdentifier(schemaName),
    ),
    [tenantId],
  );

  return result.rows[0]?.value ?? 0;
};

export const insertLegacyStudentRow = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
  admissionNumber: string,
  source: string,
): Promise<void> => {
  await pool.query(
    format(
      `
        INSERT INTO %I.student_records (
          tenant_id,
          admission_number,
          full_name,
          legacy_guardian_phone,
          status,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'active',
          $5::jsonb
        )
      `,
      assertIdentifier(schemaName),
    ),
    [
      tenantId,
      admissionNumber,
      `Legacy ${admissionNumber}`,
      '254712345678',
      JSON.stringify({
        source,
      }),
    ],
  );
};

export const getStudentPhoneProjection = async (
  pool: Pool,
  schemaName: string,
  admissionNumber: string,
): Promise<{ legacy_guardian_phone: string | null; normalized_guardian_phone: string | null }> => {
  const result = await pool.query<{
    legacy_guardian_phone: string | null;
    normalized_guardian_phone: string | null;
  }>(
    format(
      `
        SELECT legacy_guardian_phone, normalized_guardian_phone
        FROM %I.student_records
        WHERE admission_number = $1
        LIMIT 1
      `,
      assertIdentifier(schemaName),
    ),
    [admissionNumber],
  );

  if (!result.rows[0]) {
    throw new Error(`Expected student record "${admissionNumber}" to exist`);
  }

  return result.rows[0];
};

export const updateTenantPortalFlag = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
  isPortalEnabled: boolean,
): Promise<void> => {
  await pool.query(
    format(
      `
        UPDATE %I.tenant_profiles
        SET
          is_portal_enabled = $2,
          updated_at = NOW()
        WHERE tenant_id = $1
      `,
      assertIdentifier(schemaName),
    ),
    [tenantId, isPortalEnabled],
  );
};

export const countStudentsBySource = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
  source: string,
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    format(
      `
        SELECT COUNT(*)::int AS value
        FROM %I.student_records
        WHERE tenant_id = $1
          AND metadata ->> 'source' = $2
      `,
      assertIdentifier(schemaName),
    ),
    [tenantId, source],
  );

  return result.rows[0]?.value ?? 0;
};

export const countRows = async (
  pool: Pool,
  schemaName: string,
  tableName: 'student_records' | 'billing_usage' | 'tenant_profiles',
): Promise<number> => {
  const result = await pool.query<{ value: number }>(
    format(
      `
        SELECT COUNT(*)::int AS value
        FROM %I.%I
      `,
      assertIdentifier(schemaName),
      tableName,
    ),
  );

  return result.rows[0]?.value ?? 0;
};

export const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

async function runAdditiveMigrationPhase(pool: Pool, schemaName: string): Promise<void> {
  const client = await pool.connect();

  try {
    await runAdditiveMigrationPhaseOnClient(client, schemaName);
  } finally {
    client.release();
  }
}

async function runBackfillPhase(pool: Pool, schemaName: string): Promise<void> {
  const client = await pool.connect();

  try {
    await runBackfillPhaseOnClient(client, schemaName);
  } finally {
    client.release();
  }
}

async function runAdditiveMigrationPhaseOnClient(
  client: Pick<Pool, 'query'>,
  schemaName: string,
): Promise<void> {
  await client.query(
    format(
      `
        ALTER TABLE %1$I.student_records
          ADD COLUMN IF NOT EXISTS normalized_guardian_phone text;
        ALTER TABLE %1$I.tenant_profiles
          ADD COLUMN IF NOT EXISTS is_portal_enabled boolean;
        ALTER TABLE %1$I.billing_usage
          ADD COLUMN IF NOT EXISTS usage_dimension text;
        CREATE INDEX IF NOT EXISTS ix_student_records_tenant_normalized_guardian_phone
          ON %1$I.student_records (tenant_id, normalized_guardian_phone);
        CREATE INDEX IF NOT EXISTS ix_billing_usage_tenant_usage_dimension_recorded_at
          ON %1$I.billing_usage (tenant_id, usage_dimension, recorded_at DESC);
        ALTER TABLE %1$I.student_records
          DROP CONSTRAINT IF EXISTS ck_student_records_normalized_guardian_phone_digits;
        ALTER TABLE %1$I.student_records
          ADD CONSTRAINT ck_student_records_normalized_guardian_phone_digits
          CHECK (
            normalized_guardian_phone IS NULL
            OR normalized_guardian_phone ~ '^[0-9]+$'
          ) NOT VALID;
      `,
      schemaName,
    ),
  );
}

async function runBackfillPhaseOnClient(
  client: Pick<Pool, 'query'>,
  schemaName: string,
): Promise<void> {
  await client.query(
    format(
      `
        UPDATE %1$I.student_records
        SET normalized_guardian_phone = regexp_replace(legacy_guardian_phone, '[^0-9]', '', 'g')
        WHERE normalized_guardian_phone IS NULL
          AND legacy_guardian_phone IS NOT NULL;

        UPDATE %1$I.tenant_profiles
        SET
          is_portal_enabled = COALESCE((feature_flags ->> 'portal_enabled')::boolean, FALSE),
          updated_at = NOW()
        WHERE is_portal_enabled IS NULL;

        UPDATE %1$I.billing_usage
        SET usage_dimension = COALESCE(NULLIF(metadata ->> 'source', ''), 'general')
        WHERE usage_dimension IS NULL;

        ALTER TABLE %1$I.student_records
          VALIDATE CONSTRAINT ck_student_records_normalized_guardian_phone_digits;
      `,
      schemaName,
    ),
  );
}

async function runChunkedBackfill(
  client: Pick<Pool, 'query'>,
  schemaName: string,
  batchSize: number,
  perBatchSleepMs: number,
): Promise<void> {
  for (;;) {
    const batchResult = await client.query<{ id: string }>(
      format(
        `
          WITH next_batch AS (
            SELECT id
            FROM %1$I.student_records
            WHERE normalized_guardian_phone IS NULL
              AND legacy_guardian_phone IS NOT NULL
            ORDER BY tenant_id ASC, admission_number ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE %1$I.student_records AS student_records
          SET normalized_guardian_phone = regexp_replace(student_records.legacy_guardian_phone, '[^0-9]', '', 'g')
          FROM next_batch
          WHERE student_records.id = next_batch.id
          RETURNING student_records.id
        `,
        schemaName,
      ),
      [batchSize],
    );

    if ((batchResult.rowCount ?? 0) === 0) {
      break;
    }

    if (perBatchSleepMs > 0) {
      await client.query('SELECT pg_sleep($1)', [perBatchSleepMs / 1000]);
    }
  }

  await client.query(
    format(
      `
        ALTER TABLE %1$I.student_records
          VALIDATE CONSTRAINT ck_student_records_normalized_guardian_phone_digits;
      `,
      schemaName,
    ),
  );
}

function assertIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier "${value}"`);
  }

  return value;
}
