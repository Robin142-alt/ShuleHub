import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Pool } from 'pg';

import {
  buildSerializedBackupArtifact,
  buildTenantConfigs,
  computeRecoveryDigests,
  createRecoveryPool,
  createRecoverySandbox,
  createRecoverySchemaName,
  dropRecoverySandbox,
  ensureDisasterRecoveryEnv,
  exportSchemaBackup,
  extractTenantBackupFromArtifact,
  parseBackupArtifact,
  restoreFullSchemaBackupFromArtifact,
  restoreTenantBackup,
  SerializedSchemaBackupArtifact,
  tenantIds,
} from './support/backup-restore-harness';

jest.setTimeout(300000);

const sandboxSchemas = new Set<string>();
const tempDirectories = new Set<string>();

describe('Backup artifact integrity', () => {
  let pool: Pool;

  beforeAll(() => {
    ensureDisasterRecoveryEnv();
    pool = createRecoveryPool('shule-hub-backup-integrity-tests');
  });

  afterAll(async () => {
    for (const schemaName of sandboxSchemas) {
      await dropRecoverySandbox(pool, schemaName);
    }

    for (const directoryPath of tempDirectories) {
      await rm(directoryPath, { recursive: true, force: true });
    }

    await pool?.end();
  });

  test('serialized backup artifacts restore repeatably into fresh schemas with identical tenant digests', async () => {
    const sourceSchema = registerSandboxSchema('backup_source');
    const restoreSchemaA = registerSandboxSchema('backup_restore_a');
    const restoreSchemaB = registerSandboxSchema('backup_restore_b');
    const tenants = buildTenantConfigs(5);

    await createRecoverySandbox(pool, {
      schema_name: sourceSchema,
      tenants,
      students_per_tenant: 240,
      usage_records_per_tenant: 360,
    });

    const sourceSnapshot = await exportSchemaBackup(pool, sourceSchema);
    const sourceDigests = await computeRecoveryDigests(pool, sourceSchema, tenantIds(tenants));
    const artifactPath = await writeBackupArtifactToDisk(sourceSnapshot);
    const artifact = parseBackupArtifact(await readFile(artifactPath, 'utf8'));

    await restoreFullSchemaBackupFromArtifact(pool, restoreSchemaA, artifact);
    await restoreFullSchemaBackupFromArtifact(pool, restoreSchemaB, artifact);

    const digestsAfterRestoreA = await computeRecoveryDigests(
      pool,
      restoreSchemaA,
      tenantIds(tenants),
    );
    const digestsAfterRestoreB = await computeRecoveryDigests(
      pool,
      restoreSchemaB,
      tenantIds(tenants),
    );

    expect(digestsAfterRestoreA).toEqual(sourceDigests);
    expect(digestsAfterRestoreB).toEqual(sourceDigests);
  });

  test('corrupted backup artifacts fail closed before restore mutates the target schema', async () => {
    const sourceSchema = registerSandboxSchema('backup_corrupt_source');
    const targetSchema = createRecoverySchemaName('backup_corrupt_target');
    const tenants = buildTenantConfigs(3);

    await createRecoverySandbox(pool, {
      schema_name: sourceSchema,
      tenants,
      students_per_tenant: 120,
      usage_records_per_tenant: 180,
    });

    const sourceSnapshot = await exportSchemaBackup(pool, sourceSchema);
    const cleanArtifact = buildSerializedBackupArtifact(sourceSnapshot);
    const corruptedArtifact: SerializedSchemaBackupArtifact = {
      ...cleanArtifact,
      snapshot: {
        ...cleanArtifact.snapshot,
        student_records: cleanArtifact.snapshot.student_records.map((row, index) =>
          index === 0
            ? {
                ...row,
                full_name: `${row.full_name} CORRUPTED`,
              }
            : row,
        ),
      },
    };

    await expect(
      restoreFullSchemaBackupFromArtifact(pool, targetSchema, corruptedArtifact),
    ).rejects.toThrow(/checksum verification failed/i);

    await expect(
      computeRecoveryDigests(pool, targetSchema, tenantIds(tenants)),
    ).rejects.toThrow();
  });

  test('tenant-scoped restores extracted from a full backup artifact preserve isolation', async () => {
    const sourceSchema = registerSandboxSchema('backup_tenant_source');
    const targetSchema = registerSandboxSchema('backup_tenant_target');
    const tenants = buildTenantConfigs(4);
    const restoredTenant = tenants[1];
    const untouchedTenant = tenants[3];

    await createRecoverySandbox(pool, {
      schema_name: sourceSchema,
      tenants,
      students_per_tenant: 160,
      usage_records_per_tenant: 240,
    });
    await createRecoverySandbox(pool, {
      schema_name: targetSchema,
      tenants,
      students_per_tenant: 80,
      usage_records_per_tenant: 120,
    });

    const sourceDigests = await computeRecoveryDigests(pool, sourceSchema, tenantIds(tenants));
    const targetDigestsBefore = await computeRecoveryDigests(
      pool,
      targetSchema,
      tenantIds(tenants),
    );
    const artifact = buildSerializedBackupArtifact(await exportSchemaBackup(pool, sourceSchema));
    const tenantBackup = extractTenantBackupFromArtifact(artifact, restoredTenant.tenant_id);

    await restoreTenantBackup(pool, targetSchema, tenantBackup);

    const targetDigestsAfter = await computeRecoveryDigests(
      pool,
      targetSchema,
      tenantIds(tenants),
    );

    expect(targetDigestsAfter[restoredTenant.tenant_id]).toEqual(
      sourceDigests[restoredTenant.tenant_id],
    );
    expect(targetDigestsAfter[untouchedTenant.tenant_id]).toEqual(
      targetDigestsBefore[untouchedTenant.tenant_id],
    );
  });
});

const writeBackupArtifactToDisk = async (snapshot: Awaited<ReturnType<typeof exportSchemaBackup>>) => {
  const artifact = buildSerializedBackupArtifact(snapshot);
  const tempDirectory = await mkdtemp(join(tmpdir(), 'shule-hub-backup-artifact-'));
  const artifactPath = join(tempDirectory, 'backup-artifact.json');

  tempDirectories.add(tempDirectory);
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  return artifactPath;
};

const registerSandboxSchema = (prefix: string): string => {
  const schemaName = createRecoverySchemaName(prefix);
  sandboxSchemas.add(schemaName);
  return schemaName;
};
