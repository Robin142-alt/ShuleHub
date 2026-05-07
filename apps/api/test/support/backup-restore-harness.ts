import { createHash, randomUUID } from 'node:crypto';

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

export interface TenantProfileBackupRow {
  tenant_id: string;
  timezone: string;
  billing_plan: string;
  feature_flags: Record<string, unknown>;
  config_version: number;
  created_at: string;
  updated_at: string;
}

export interface StudentRecordBackupRow {
  id: string;
  tenant_id: string;
  admission_number: string;
  full_name: string;
  legacy_guardian_phone: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BillingUsageBackupRow {
  id: string;
  tenant_id: string;
  metric_key: string;
  quantity: number;
  recorded_at: string;
  metadata: Record<string, unknown>;
}

export interface SchemaBackupSnapshot {
  taken_at: string;
  tenant_profiles: TenantProfileBackupRow[];
  student_records: StudentRecordBackupRow[];
  billing_usage: BillingUsageBackupRow[];
}

export interface SerializedSchemaBackupArtifact {
  format_version: '1';
  checksum_sha256: string;
  snapshot: SchemaBackupSnapshot;
}

export interface TenantBackupSnapshot {
  taken_at: string;
  tenant_id: string;
  tenant_profiles: TenantProfileBackupRow[];
  student_records: StudentRecordBackupRow[];
  billing_usage: BillingUsageBackupRow[];
}

export interface TenantRecoveryDigest {
  tenant_id: string;
  profile_hash: string;
  student_hash: string;
  usage_hash: string;
  student_count: number;
  usage_count: number;
}

export type RecoveryJournalEntry =
  | {
      kind: 'insert_student';
      occurred_at: string;
      row: StudentRecordBackupRow;
    }
  | {
      kind: 'insert_usage';
      occurred_at: string;
      row: BillingUsageBackupRow;
    }
  | {
      kind: 'update_tenant_profile';
      occurred_at: string;
      tenant_id: string;
      feature_flags: Record<string, unknown>;
      config_version: number;
      updated_at: string;
    };

interface TenantProfileRowDb {
  tenant_id: string;
  timezone: string;
  billing_plan: string;
  feature_flags: Record<string, unknown> | null;
  config_version: number;
  created_at: Date;
  updated_at: Date;
}

interface StudentRecordRowDb {
  id: string;
  tenant_id: string;
  admission_number: string;
  full_name: string;
  legacy_guardian_phone: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

interface BillingUsageRowDb {
  id: string;
  tenant_id: string;
  metric_key: string;
  quantity: number;
  recorded_at: Date;
  metadata: Record<string, unknown> | null;
}

export const ensureDisasterRecoveryEnv = ensureMigrationTestEnv;
export const createRecoveryPool = createIntegrationPool;
export const createRecoverySchemaName = createSandboxSchemaName;
export const createRecoverySandbox = createMigrationSandbox;
export const dropRecoverySandbox = dropMigrationSandbox;

export const exportSchemaBackup = async (
  pool: Pool,
  schemaName: string,
): Promise<SchemaBackupSnapshot> => {
  const safeSchemaName = assertIdentifier(schemaName);

  const [tenantProfiles, studentRecords, billingUsage] = await Promise.all([
    pool.query<TenantProfileRowDb>(
      format(
        `
          SELECT
            tenant_id,
            timezone,
            billing_plan,
            feature_flags,
            config_version,
            created_at,
            updated_at
          FROM %I.tenant_profiles
          ORDER BY tenant_id ASC
        `,
        safeSchemaName,
      ),
    ),
    pool.query<StudentRecordRowDb>(
      format(
        `
          SELECT
            id,
            tenant_id,
            admission_number,
            full_name,
            legacy_guardian_phone,
            status,
            metadata,
            created_at
          FROM %I.student_records
          ORDER BY tenant_id ASC, admission_number ASC
        `,
        safeSchemaName,
      ),
    ),
    pool.query<BillingUsageRowDb>(
      format(
        `
          SELECT
            id,
            tenant_id,
            metric_key,
            quantity,
            recorded_at,
            metadata
          FROM %I.billing_usage
          ORDER BY tenant_id ASC, recorded_at ASC, metric_key ASC, id ASC
        `,
        safeSchemaName,
      ),
    ),
  ]);

  return {
    taken_at: new Date().toISOString(),
    tenant_profiles: tenantProfiles.rows.map((row) => ({
      tenant_id: row.tenant_id,
      timezone: row.timezone,
      billing_plan: row.billing_plan,
      feature_flags: row.feature_flags ?? {},
      config_version: row.config_version,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
    student_records: studentRecords.rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      admission_number: row.admission_number,
      full_name: row.full_name,
      legacy_guardian_phone: row.legacy_guardian_phone,
      status: row.status,
      metadata: row.metadata ?? {},
      created_at: row.created_at.toISOString(),
    })),
    billing_usage: billingUsage.rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      metric_key: row.metric_key,
      quantity: row.quantity,
      recorded_at: row.recorded_at.toISOString(),
      metadata: row.metadata ?? {},
    })),
  };
};

export const exportTenantBackup = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<TenantBackupSnapshot> => {
  const fullSnapshot = await exportSchemaBackup(pool, schemaName);

  return {
    taken_at: fullSnapshot.taken_at,
    tenant_id: tenantId,
    tenant_profiles: fullSnapshot.tenant_profiles.filter((row) => row.tenant_id === tenantId),
    student_records: fullSnapshot.student_records.filter((row) => row.tenant_id === tenantId),
    billing_usage: fullSnapshot.billing_usage.filter((row) => row.tenant_id === tenantId),
  };
};

export const simulateFullSchemaLoss = async (
  pool: Pool,
  schemaName: string,
): Promise<void> => {
  await pool.query(format('DROP SCHEMA IF EXISTS %I CASCADE', assertIdentifier(schemaName)));
};

export const restoreFullSchemaBackup = async (
  pool: Pool,
  schemaName: string,
  snapshot: SchemaBackupSnapshot,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(format('DROP SCHEMA IF EXISTS %I CASCADE', safeSchemaName));
    await createRecoverySchemaStructure(client, safeSchemaName);
    await restoreBackupIntoSchema(client, safeSchemaName, snapshot);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const buildSerializedBackupArtifact = (
  snapshot: SchemaBackupSnapshot,
): SerializedSchemaBackupArtifact => ({
  format_version: '1',
  checksum_sha256: computeBackupChecksum(snapshot),
  snapshot,
});

export const serializeBackupArtifact = (
  artifact: SerializedSchemaBackupArtifact,
): string => JSON.stringify(artifact);

export const parseBackupArtifact = (
  serializedArtifact: string,
): SerializedSchemaBackupArtifact => {
  const parsedArtifact = JSON.parse(serializedArtifact) as SerializedSchemaBackupArtifact;
  assertValidBackupArtifact(parsedArtifact);
  return parsedArtifact;
};

export const restoreFullSchemaBackupFromArtifact = async (
  pool: Pool,
  schemaName: string,
  artifact: SerializedSchemaBackupArtifact,
): Promise<void> => {
  assertValidBackupArtifact(artifact);
  await restoreFullSchemaBackup(pool, schemaName, artifact.snapshot);
};

export const restoreTenantBackup = async (
  pool: Pool,
  schemaName: string,
  snapshot: TenantBackupSnapshot,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      format(`DELETE FROM %I.billing_usage WHERE tenant_id = $1`, safeSchemaName),
      [snapshot.tenant_id],
    );
    await client.query(
      format(`DELETE FROM %I.student_records WHERE tenant_id = $1`, safeSchemaName),
      [snapshot.tenant_id],
    );
    await client.query(
      format(`DELETE FROM %I.tenant_profiles WHERE tenant_id = $1`, safeSchemaName),
      [snapshot.tenant_id],
    );
    await restoreBackupIntoSchema(client, safeSchemaName, snapshot);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const extractTenantBackupFromArtifact = (
  artifact: SerializedSchemaBackupArtifact,
  tenantId: string,
): TenantBackupSnapshot => {
  assertValidBackupArtifact(artifact);

  return {
    taken_at: artifact.snapshot.taken_at,
    tenant_id: tenantId,
    tenant_profiles: artifact.snapshot.tenant_profiles.filter((row) => row.tenant_id === tenantId),
    student_records: artifact.snapshot.student_records.filter((row) => row.tenant_id === tenantId),
    billing_usage: artifact.snapshot.billing_usage.filter((row) => row.tenant_id === tenantId),
  };
};

export const restorePointInTime = async (
  pool: Pool,
  schemaName: string,
  baseSnapshot: SchemaBackupSnapshot,
  journalEntries: RecoveryJournalEntry[],
  restoreToTimestamp: string,
): Promise<void> => {
  await restoreFullSchemaBackup(pool, schemaName, baseSnapshot);

  const safeSchemaName = assertIdentifier(schemaName);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const replayableEntries = [...journalEntries]
      .filter((entry) => new Date(entry.occurred_at).getTime() <= new Date(restoreToTimestamp).getTime())
      .sort(
        (left, right) =>
          new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime(),
      );

    for (const entry of replayableEntries) {
      if (entry.kind === 'insert_student') {
        await client.query(
          format(
            `
              INSERT INTO %I.student_records (
                id,
                tenant_id,
                admission_number,
                full_name,
                legacy_guardian_phone,
                status,
                metadata,
                created_at
              )
              VALUES (
                $1::uuid,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7::jsonb,
                $8::timestamptz
              )
            `,
            safeSchemaName,
          ),
          [
            entry.row.id,
            entry.row.tenant_id,
            entry.row.admission_number,
            entry.row.full_name,
            entry.row.legacy_guardian_phone,
            entry.row.status,
            JSON.stringify(entry.row.metadata),
            entry.row.created_at,
          ],
        );
        continue;
      }

      if (entry.kind === 'insert_usage') {
        await client.query(
          format(
            `
              INSERT INTO %I.billing_usage (
                id,
                tenant_id,
                metric_key,
                quantity,
                recorded_at,
                metadata
              )
              VALUES (
                $1::uuid,
                $2,
                $3,
                $4::integer,
                $5::timestamptz,
                $6::jsonb
              )
            `,
            safeSchemaName,
          ),
          [
            entry.row.id,
            entry.row.tenant_id,
            entry.row.metric_key,
            entry.row.quantity,
            entry.row.recorded_at,
            JSON.stringify(entry.row.metadata),
          ],
        );
        continue;
      }

      await client.query(
        format(
          `
            UPDATE %I.tenant_profiles
            SET
              feature_flags = $2::jsonb,
              config_version = $3::integer,
              updated_at = $4::timestamptz
            WHERE tenant_id = $1
          `,
          safeSchemaName,
        ),
        [
          entry.tenant_id,
          JSON.stringify(entry.feature_flags),
          entry.config_version,
          entry.updated_at,
        ],
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

export const computeRecoveryDigests = async (
  pool: Pool,
  schemaName: string,
  tenantIds: string[],
): Promise<Record<string, TenantRecoveryDigest>> => {
  const result = await pool.query<TenantRecoveryDigest>(
    format(
      `
        WITH profile_digests AS (
          SELECT
            tenant_id,
            md5(
              timezone
              || '|' || billing_plan
              || '|' || feature_flags::text
              || '|' || config_version::text
            ) AS profile_hash
          FROM %1$I.tenant_profiles
          WHERE tenant_id = ANY($1::text[])
        ),
        student_digests AS (
          SELECT
            tenant_id,
            COUNT(*)::int AS student_count,
            COALESCE(
              md5(
                string_agg(
                  id::text
                  || '|' || admission_number
                  || '|' || full_name
                  || '|' || COALESCE(legacy_guardian_phone, '')
                  || '|' || status
                  || '|' || metadata::text
                  || '|' || to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
                  ','
                  ORDER BY admission_number
                )
              ),
              md5('')
            ) AS student_hash
          FROM %1$I.student_records
          WHERE tenant_id = ANY($1::text[])
          GROUP BY tenant_id
        ),
        usage_digests AS (
          SELECT
            tenant_id,
            COUNT(*)::int AS usage_count,
            COALESCE(
              md5(
                string_agg(
                  id::text
                  || '|' || metric_key
                  || '|' || quantity::text
                  || '|' || metadata::text
                  || '|' || to_char(recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
                  ','
                  ORDER BY recorded_at, metric_key, id
                )
              ),
              md5('')
            ) AS usage_hash
          FROM %1$I.billing_usage
          WHERE tenant_id = ANY($1::text[])
          GROUP BY tenant_id
        )
        SELECT
          tenant_profiles.tenant_id,
          profile_digests.profile_hash,
          COALESCE(student_digests.student_hash, md5('')) AS student_hash,
          COALESCE(usage_digests.usage_hash, md5('')) AS usage_hash,
          COALESCE(student_digests.student_count, 0) AS student_count,
          COALESCE(usage_digests.usage_count, 0) AS usage_count
        FROM %1$I.tenant_profiles AS tenant_profiles
        INNER JOIN profile_digests
          ON profile_digests.tenant_id = tenant_profiles.tenant_id
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

export const listTenantIds = async (
  pool: Pool,
  schemaName: string,
): Promise<string[]> => {
  const result = await pool.query<{ tenant_id: string }>(
    format(
      `
        SELECT tenant_id
        FROM %I.tenant_profiles
        ORDER BY tenant_id ASC
      `,
      assertIdentifier(schemaName),
    ),
  );

  return result.rows.map((row) => row.tenant_id);
};

export const corruptTenantData = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<void> => {
  const safeSchemaName = assertIdentifier(schemaName);

  await pool.query(
    format(
      `
        DELETE FROM %1$I.student_records
        WHERE id IN (
          SELECT id
          FROM %1$I.student_records
          WHERE tenant_id = $1
          ORDER BY admission_number ASC
          LIMIT 20
        )
      `,
      safeSchemaName,
    ),
    [tenantId],
  );
  await pool.query(
    format(
      `
        UPDATE %I.student_records
        SET
          full_name = '[CORRUPTED] ' || full_name,
          status = 'inactive',
          metadata = metadata || jsonb_build_object('corrupted', true)
        WHERE tenant_id = $1
          AND metadata ->> 'source' = 'seed'
      `,
      safeSchemaName,
    ),
    [tenantId],
  );
  await pool.query(
    format(
      `
        DELETE FROM %1$I.billing_usage
        WHERE id IN (
          SELECT id
          FROM %1$I.billing_usage
          WHERE tenant_id = $1
          ORDER BY recorded_at ASC
          LIMIT 50
        )
      `,
      safeSchemaName,
    ),
    [tenantId],
  );
  await pool.query(
    format(
      `
        UPDATE %I.tenant_profiles
        SET
          feature_flags = jsonb_build_object('portal_enabled', false, 'corrupted', true),
          config_version = config_version + 99,
          updated_at = NOW()
        WHERE tenant_id = $1
      `,
      safeSchemaName,
    ),
    [tenantId],
  );
};

export const insertStudentWithJournal = async (
  pool: Pool,
  schemaName: string,
  input: {
    tenant_id: string;
    admission_number: string;
    full_name: string;
    legacy_guardian_phone: string | null;
    occurred_at: string;
    source: string;
  },
): Promise<RecoveryJournalEntry> => {
  const row: StudentRecordBackupRow = {
    id: randomUUID(),
    tenant_id: input.tenant_id,
    admission_number: input.admission_number,
    full_name: input.full_name,
    legacy_guardian_phone: input.legacy_guardian_phone,
    status: 'active',
    metadata: {
      source: input.source,
      journaled: true,
    },
    created_at: input.occurred_at,
  };

  await pool.query(
    format(
      `
        INSERT INTO %I.student_records (
          id,
          tenant_id,
          admission_number,
          full_name,
          legacy_guardian_phone,
          status,
          metadata,
          created_at
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::timestamptz
        )
      `,
      assertIdentifier(schemaName),
    ),
    [
      row.id,
      row.tenant_id,
      row.admission_number,
      row.full_name,
      row.legacy_guardian_phone,
      row.status,
      JSON.stringify(row.metadata),
      row.created_at,
    ],
  );

  return {
    kind: 'insert_student',
    occurred_at: input.occurred_at,
    row,
  };
};

export const insertUsageWithJournal = async (
  pool: Pool,
  schemaName: string,
  input: {
    tenant_id: string;
    metric_key: string;
    quantity: number;
    occurred_at: string;
    source: string;
  },
): Promise<RecoveryJournalEntry> => {
  const row: BillingUsageBackupRow = {
    id: randomUUID(),
    tenant_id: input.tenant_id,
    metric_key: input.metric_key,
    quantity: input.quantity,
    recorded_at: input.occurred_at,
    metadata: {
      source: input.source,
      journaled: true,
    },
  };

  await pool.query(
    format(
      `
        INSERT INTO %I.billing_usage (
          id,
          tenant_id,
          metric_key,
          quantity,
          recorded_at,
          metadata
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          $4::integer,
          $5::timestamptz,
          $6::jsonb
        )
      `,
      assertIdentifier(schemaName),
    ),
    [
      row.id,
      row.tenant_id,
      row.metric_key,
      row.quantity,
      row.recorded_at,
      JSON.stringify(row.metadata),
    ],
  );

  return {
    kind: 'insert_usage',
    occurred_at: input.occurred_at,
    row,
  };
};

export const updateTenantFlagsWithJournal = async (
  pool: Pool,
  schemaName: string,
  input: {
    tenant_id: string;
    portal_enabled: boolean;
    recovery_mode?: string;
    occurred_at: string;
  },
): Promise<RecoveryJournalEntry> => {
  const currentProfile = await pool.query<TenantProfileRowDb>(
    format(
      `
        SELECT
          tenant_id,
          timezone,
          billing_plan,
          feature_flags,
          config_version,
          created_at,
          updated_at
        FROM %I.tenant_profiles
        WHERE tenant_id = $1
        LIMIT 1
      `,
      assertIdentifier(schemaName),
    ),
    [input.tenant_id],
  );

  if (!currentProfile.rows[0]) {
    throw new Error(`Expected tenant profile "${input.tenant_id}" to exist`);
  }

  const nextFeatureFlags = {
    ...(currentProfile.rows[0].feature_flags ?? {}),
    portal_enabled: input.portal_enabled,
    recovery_mode: input.recovery_mode ?? 'pitr',
  };
  const nextConfigVersion = currentProfile.rows[0].config_version + 1;

  await pool.query(
    format(
      `
        UPDATE %I.tenant_profiles
        SET
          feature_flags = $2::jsonb,
          config_version = $3::integer,
          updated_at = $4::timestamptz
        WHERE tenant_id = $1
      `,
      assertIdentifier(schemaName),
    ),
    [
      input.tenant_id,
      JSON.stringify(nextFeatureFlags),
      nextConfigVersion,
      input.occurred_at,
    ],
  );

  return {
    kind: 'update_tenant_profile',
    occurred_at: input.occurred_at,
    tenant_id: input.tenant_id,
    feature_flags: nextFeatureFlags,
    config_version: nextConfigVersion,
    updated_at: input.occurred_at,
  };
};

export const buildTenantConfigs = (count: number): TenantSeedConfig[] =>
  Array.from({ length: count }, (_, index) => ({
    tenant_id: `tenant-${String(index + 1).padStart(2, '0')}-${createSandboxSchemaName('dr').slice(-6)}`,
    timezone: index % 2 === 0 ? 'Africa/Nairobi' : 'UTC',
    billing_plan:
      index % 3 === 0 ? 'enterprise' : index % 3 === 1 ? 'growth' : 'starter',
    portal_enabled: index % 2 === 0,
  }));

export const tenantIds = (tenants: TenantSeedConfig[]): string[] =>
  tenants.map((tenant) => tenant.tenant_id);

export const getPortalEnabledState = async (
  pool: Pool,
  schemaName: string,
  tenantId: string,
): Promise<boolean> => {
  const result = await pool.query<{ portal_enabled: boolean }>(
    format(
      `
        SELECT COALESCE((feature_flags ->> 'portal_enabled')::boolean, FALSE) AS portal_enabled
        FROM %I.tenant_profiles
        WHERE tenant_id = $1
        LIMIT 1
      `,
      assertIdentifier(schemaName),
    ),
    [tenantId],
  );

  if (!result.rows[0]) {
    throw new Error(`Expected tenant profile "${tenantId}" to exist`);
  }

  return result.rows[0].portal_enabled;
};

export const studentExists = async (
  pool: Pool,
  schemaName: string,
  admissionNumber: string,
): Promise<boolean> => {
  const result = await pool.query<{ exists: boolean }>(
    format(
      `
        SELECT EXISTS (
          SELECT 1
          FROM %I.student_records
          WHERE admission_number = $1
        ) AS exists
      `,
      assertIdentifier(schemaName),
    ),
    [admissionNumber],
  );

  return Boolean(result.rows[0]?.exists);
};

export const usageExists = async (
  pool: Pool,
  schemaName: string,
  metricKey: string,
  recordedAt: string,
): Promise<boolean> => {
  const result = await pool.query<{ exists: boolean }>(
    format(
      `
        SELECT EXISTS (
          SELECT 1
          FROM %I.billing_usage
          WHERE metric_key = $1
            AND recorded_at = $2::timestamptz
        ) AS exists
      `,
      assertIdentifier(schemaName),
    ),
    [metricKey, recordedAt],
  );

  return Boolean(result.rows[0]?.exists);
};

export const computeBackupChecksum = (
  snapshot: SchemaBackupSnapshot,
): string =>
  createHash('sha256')
    .update(stableSerialize(snapshot))
    .digest('hex');

async function createRecoverySchemaStructure(
  client: Pick<Pool, 'query'>,
  schemaName: string,
): Promise<void> {
  await client.query(format('CREATE SCHEMA IF NOT EXISTS %I', schemaName));
  await client.query(
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
        );

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
        );

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
        );

        CREATE INDEX ix_%1$I_student_records_tenant_created_at
          ON %1$I.student_records (tenant_id, created_at DESC);
        CREATE INDEX ix_%1$I_billing_usage_tenant_recorded_at
          ON %1$I.billing_usage (tenant_id, recorded_at DESC);
      `,
      schemaName,
      schemaName,
      schemaName,
      schemaName,
      schemaName,
    ),
  );
}

async function restoreBackupIntoSchema(
  client: Pick<Pool, 'query'>,
  schemaName: string,
  snapshot: Pick<SchemaBackupSnapshot, 'tenant_profiles' | 'student_records' | 'billing_usage'>,
): Promise<void> {
  if (snapshot.tenant_profiles.length > 0) {
    await client.query(
      format(
        `
          INSERT INTO %I.tenant_profiles (
            tenant_id,
            timezone,
            billing_plan,
            feature_flags,
            config_version,
            created_at,
            updated_at
          )
          SELECT
            tenant_id,
            timezone,
            billing_plan,
            feature_flags,
            config_version,
            created_at,
            updated_at
          FROM jsonb_to_recordset($1::jsonb) AS restored_rows (
            tenant_id text,
            timezone text,
            billing_plan text,
            feature_flags jsonb,
            config_version integer,
            created_at timestamptz,
            updated_at timestamptz
          )
        `,
        schemaName,
      ),
      [JSON.stringify(snapshot.tenant_profiles)],
    );
  }

  if (snapshot.student_records.length > 0) {
    await client.query(
      format(
        `
          INSERT INTO %I.student_records (
            id,
            tenant_id,
            admission_number,
            full_name,
            legacy_guardian_phone,
            status,
            metadata,
            created_at
          )
          SELECT
            id,
            tenant_id,
            admission_number,
            full_name,
            legacy_guardian_phone,
            status,
            metadata,
            created_at
          FROM jsonb_to_recordset($1::jsonb) AS restored_rows (
            id uuid,
            tenant_id text,
            admission_number text,
            full_name text,
            legacy_guardian_phone text,
            status text,
            metadata jsonb,
            created_at timestamptz
          )
        `,
        schemaName,
      ),
      [JSON.stringify(snapshot.student_records)],
    );
  }

  if (snapshot.billing_usage.length > 0) {
    await client.query(
      format(
        `
          INSERT INTO %I.billing_usage (
            id,
            tenant_id,
            metric_key,
            quantity,
            recorded_at,
            metadata
          )
          SELECT
            id,
            tenant_id,
            metric_key,
            quantity,
            recorded_at,
            metadata
          FROM jsonb_to_recordset($1::jsonb) AS restored_rows (
            id uuid,
            tenant_id text,
            metric_key text,
            quantity integer,
            recorded_at timestamptz,
            metadata jsonb
          )
        `,
        schemaName,
      ),
      [JSON.stringify(snapshot.billing_usage)],
    );
  }
}

function assertIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier "${value}"`);
  }

  return value;
}

function assertValidBackupArtifact(
  artifact: SerializedSchemaBackupArtifact,
): void {
  if (!artifact || artifact.format_version !== '1' || !artifact.snapshot) {
    throw new Error('Backup artifact format is invalid');
  }

  if (!Array.isArray(artifact.snapshot.tenant_profiles)) {
    throw new Error('Backup artifact tenant_profiles payload is invalid');
  }

  if (!Array.isArray(artifact.snapshot.student_records)) {
    throw new Error('Backup artifact student_records payload is invalid');
  }

  if (!Array.isArray(artifact.snapshot.billing_usage)) {
    throw new Error('Backup artifact billing_usage payload is invalid');
  }

  const expectedChecksum = computeBackupChecksum(artifact.snapshot);

  if (artifact.checksum_sha256 !== expectedChecksum) {
    throw new Error('Backup artifact checksum verification failed');
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
