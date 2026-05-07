import format from 'pg-format';
import { Pool } from 'pg';

import {
  createIntegrationPool,
  createMigrationSandbox,
  createSandboxSchemaName,
  dropMigrationSandbox,
  ensureMigrationTestEnv,
  TenantSeedConfig,
} from './migration-harness';

export {
  createIntegrationPool as createDeploymentPool,
  createMigrationSandbox as createDeploymentSandbox,
  createSandboxSchemaName,
  dropMigrationSandbox as dropDeploymentSandbox,
  ensureMigrationTestEnv as ensureDeploymentTestEnv,
};

export { TenantSeedConfig };

export const runAdditiveDeploymentPhase = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);

  await pool.query(
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
      safeSchemaName,
    ),
  );
};

export const runPostDeploymentBackfill = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);

  await pool.query(
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
      safeSchemaName,
    ),
  );
};

export const legacyReleaseCreateStudent = async (
  pool: Pool,
  schemaName: string,
  input: {
    tenant_id: string;
    admission_number: string;
    source: string;
    phone_number?: string;
  },
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const phoneNumber = input.phone_number ?? '254712345678';

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
      safeSchemaName,
    ),
    [
      input.tenant_id,
      input.admission_number,
      `Legacy ${input.admission_number}`,
      phoneNumber,
      JSON.stringify({
        source: input.source,
        release: 'legacy',
      }),
    ],
  );
};

export const currentReleaseCreateStudent = async (
  pool: Pool,
  schemaName: string,
  input: {
    tenant_id: string;
    admission_number: string;
    source: string;
    phone_number?: string;
  },
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const phoneNumber = input.phone_number ?? '254712345678';

  await pool.query(
    format(
      `
        INSERT INTO %I.student_records (
          tenant_id,
          admission_number,
          full_name,
          legacy_guardian_phone,
          normalized_guardian_phone,
          status,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          regexp_replace($4, '[^0-9]', '', 'g'),
          'active',
          $5::jsonb
        )
      `,
      safeSchemaName,
    ),
    [
      input.tenant_id,
      input.admission_number,
      `Current ${input.admission_number}`,
      phoneNumber,
      JSON.stringify({
        source: input.source,
        release: 'current',
      }),
    ],
  );
};

export const currentReleaseReadStudentProjection = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
  admissionPrefix: string,
): Promise<
  Array<{
    admission_number: string;
    projected_phone: string | null;
    release: string | null;
  }>
> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const result = await pool.query<{
    admission_number: string;
    projected_phone: string | null;
    release: string | null;
  }>(
    format(
      `
        SELECT
          admission_number,
          COALESCE(
            normalized_guardian_phone,
            regexp_replace(legacy_guardian_phone, '[^0-9]', '', 'g')
          ) AS projected_phone,
          metadata ->> 'release' AS release
        FROM %I.student_records
        WHERE tenant_id = $1
          AND admission_number LIKE $2
        ORDER BY admission_number ASC
      `,
      safeSchemaName,
    ),
    [tenantId, `${admissionPrefix}%`],
  );

  return result.rows;
};

export const legacyReleaseReadStudentCount = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<number> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const result = await pool.query<{ value: number }>(
    format(
      `
        SELECT COUNT(*)::int AS value
        FROM %I.student_records
        WHERE tenant_id = $1
      `,
      safeSchemaName,
    ),
    [tenantId],
  );

  return result.rows[0]?.value ?? 0;
};

export const legacyReleaseReadPortalFlag = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<boolean> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const result = await pool.query<{ value: boolean }>(
    format(
      `
        SELECT COALESCE((feature_flags ->> 'portal_enabled')::boolean, FALSE) AS value
        FROM %I.tenant_profiles
        WHERE tenant_id = $1
        LIMIT 1
      `,
      safeSchemaName,
    ),
    [tenantId],
  );

  return Boolean(result.rows[0]?.value);
};

export const currentReleaseReadPortalFlag = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<boolean> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const result = await pool.query<{ value: boolean }>(
    format(
      `
        SELECT COALESCE(
          is_portal_enabled,
          COALESCE((feature_flags ->> 'portal_enabled')::boolean, FALSE)
        ) AS value
        FROM %I.tenant_profiles
        WHERE tenant_id = $1
        LIMIT 1
      `,
      safeSchemaName,
    ),
    [tenantId],
  );

  return Boolean(result.rows[0]?.value);
};

export const simulateBrokenCurrentReleaseWrite = async (
  pool: Pool,
  schemaName: string,
  input: {
    tenant_id: string;
    admission_number: string;
    source: string;
    phone_number?: string;
  },
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const client = await pool.connect();
  const phoneNumber = input.phone_number ?? '254712345678';

  try {
    await client.query('BEGIN');
    await client.query(
      format(
        `
          INSERT INTO %I.student_records (
            tenant_id,
            admission_number,
            full_name,
            legacy_guardian_phone,
            normalized_guardian_phone,
            status,
            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            regexp_replace($4, '[^0-9]', '', 'g'),
            'active',
            $5::jsonb
          )
        `,
        safeSchemaName,
      ),
      [
        input.tenant_id,
        input.admission_number,
        `Broken ${input.admission_number}`,
        phoneNumber,
        JSON.stringify({
          source: input.source,
          release: 'broken-current',
        }),
      ],
    );
    await client.query(
      format(
        `
          UPDATE %I.tenant_profiles
          SET imaginary_release_column = 'boom'
          WHERE tenant_id = $1
        `,
        safeSchemaName,
      ),
      [input.tenant_id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const countStudentsByReleaseSource = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
  source: string,
): Promise<number> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const result = await pool.query<{ value: number }>(
    format(
      `
        SELECT COUNT(*)::int AS value
        FROM %I.student_records
        WHERE tenant_id = $1
          AND metadata ->> 'source' = $2
      `,
      safeSchemaName,
    ),
    [tenantId, source],
  );

  return result.rows[0]?.value ?? 0;
};

export const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

function assertIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier "${value}"`);
  }

  return value;
}
