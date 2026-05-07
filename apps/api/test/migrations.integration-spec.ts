import { Pool } from 'pg';

import {
  columnExists,
  computeSeedDigests,
  countLegacyQueryMatches,
  countRows,
  countStudentsBySource,
  createIntegrationPool,
  createMigrationSandbox,
  createSandboxSchemaName,
  dropMigrationSandbox,
  ensureMigrationTestEnv,
  getStudentPhoneProjection,
  getTenantPortalState,
  insertLegacyStudentRow,
  runForwardMigration,
  runOnlineForwardMigration,
  runPartialFailingMigration,
  runRollbackMigration,
  sleep,
  TenantSeedConfig,
  updateTenantPortalFlag,
} from './support/migration-harness';

jest.setTimeout(300000);

describe('Multi-tenant migration safety', () => {
  let pool: Pool;
  const sandboxSchemas = new Set<string>();

  beforeAll(() => {
    ensureMigrationTestEnv();
    pool = createIntegrationPool('shule-hub-migration-tests');
  });

  afterAll(async () => {
    for (const schemaName of sandboxSchemas) {
      await dropMigrationSandbox(pool, schemaName);
    }

    await pool?.end();
  });

  test('runs additive migrations on large datasets without losing historical tenant data', async () => {
    const schemaName = registerSandboxSchema('migration_large');
    const tenants = buildTenantConfigs(10);

    await createMigrationSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 900,
      usage_records_per_tenant: 1600,
    });

    const digestsBefore = await computeSeedDigests(pool, schemaName, tenantIds(tenants));
    const studentRowsBefore = await countRows(pool, schemaName, 'student_records');
    const usageRowsBefore = await countRows(pool, schemaName, 'billing_usage');

    await runForwardMigration(pool, schemaName);

    const digestsAfter = await computeSeedDigests(pool, schemaName, tenantIds(tenants));
    const portalState = await getTenantPortalState(pool, schemaName);

    expect(digestsAfter).toEqual(digestsBefore);
    expect(await countRows(pool, schemaName, 'student_records')).toBe(studentRowsBefore);
    expect(await countRows(pool, schemaName, 'billing_usage')).toBe(usageRowsBefore);
    expect(await columnExists(pool, schemaName, 'student_records', 'normalized_guardian_phone')).toBe(true);
    expect(await columnExists(pool, schemaName, 'tenant_profiles', 'is_portal_enabled')).toBe(true);
    expect(await columnExists(pool, schemaName, 'billing_usage', 'usage_dimension')).toBe(true);

    for (const tenant of tenants) {
      expect(portalState[tenant.tenant_id]).toBe(tenant.portal_enabled);
    }
  });

  test('keeps legacy reads and writes working after the migration', async () => {
    const schemaName = registerSandboxSchema('migration_compat');
    const tenants = buildTenantConfigs(3);
    const targetTenant = tenants[0];
    const compatibilityAdmission = `ADM-COMPAT-${schemaName.slice(-6)}`;

    await createMigrationSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 240,
      usage_records_per_tenant: 320,
    });

    const legacyReadCountBefore = await countLegacyQueryMatches(
      pool,
      schemaName,
      targetTenant.tenant_id,
    );

    await runForwardMigration(pool, schemaName);

    const legacyReadCountAfter = await countLegacyQueryMatches(
      pool,
      schemaName,
      targetTenant.tenant_id,
    );

    expect(legacyReadCountAfter).toBe(legacyReadCountBefore);

    await insertLegacyStudentRow(
      pool,
      schemaName,
      targetTenant.tenant_id,
      compatibilityAdmission,
      'compat-write',
    );

    let insertedProjection = await getStudentPhoneProjection(
      pool,
      schemaName,
      compatibilityAdmission,
    );

    expect(insertedProjection.legacy_guardian_phone).toBe('254712345678');
    expect(insertedProjection.normalized_guardian_phone).toBeNull();

    await runForwardMigration(pool, schemaName);

    insertedProjection = await getStudentPhoneProjection(
      pool,
      schemaName,
      compatibilityAdmission,
    );

    expect(insertedProjection.normalized_guardian_phone).toBe('254712345678');
  });

  test('rolls back a partially failed migration without leaking partial schema or data changes', async () => {
    const schemaName = registerSandboxSchema('migration_partial');
    const tenants = buildTenantConfigs(4);

    await createMigrationSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 320,
      usage_records_per_tenant: 480,
    });

    const digestsBefore = await computeSeedDigests(pool, schemaName, tenantIds(tenants));

    await expect(runPartialFailingMigration(pool, schemaName)).rejects.toThrow();

    expect(await columnExists(pool, schemaName, 'student_records', 'normalized_guardian_phone')).toBe(false);
    expect(await columnExists(pool, schemaName, 'tenant_profiles', 'is_portal_enabled')).toBe(false);
    expect(await columnExists(pool, schemaName, 'billing_usage', 'usage_dimension')).toBe(false);
    expect(await computeSeedDigests(pool, schemaName, tenantIds(tenants))).toEqual(digestsBefore);
  });

  test('supports rollback migrations while preserving historical tenant records', async () => {
    const schemaName = registerSandboxSchema('migration_rollback');
    const tenants = buildTenantConfigs(5);

    await createMigrationSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 360,
      usage_records_per_tenant: 540,
    });

    const digestsBefore = await computeSeedDigests(pool, schemaName, tenantIds(tenants));

    await runForwardMigration(pool, schemaName);
    await runRollbackMigration(pool, schemaName);

    expect(await columnExists(pool, schemaName, 'student_records', 'normalized_guardian_phone')).toBe(false);
    expect(await columnExists(pool, schemaName, 'tenant_profiles', 'is_portal_enabled')).toBe(false);
    expect(await columnExists(pool, schemaName, 'billing_usage', 'usage_dimension')).toBe(false);
    expect(await computeSeedDigests(pool, schemaName, tenantIds(tenants))).toEqual(digestsBefore);
  });

  test('applies tenant-specific configuration changes without cross-tenant bleed', async () => {
    const schemaName = registerSandboxSchema('migration_tenant_cfg');
    const tenants = buildTenantConfigs(6);
    const updatedTenant = tenants[1];
    const untouchedTenant = tenants[2];

    await createMigrationSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 180,
      usage_records_per_tenant: 280,
    });

    await runForwardMigration(pool, schemaName);

    const portalStateBefore = await getTenantPortalState(pool, schemaName);
    await updateTenantPortalFlag(pool, schemaName, updatedTenant.tenant_id, !updatedTenant.portal_enabled);
    const portalStateAfter = await getTenantPortalState(pool, schemaName);

    expect(portalStateBefore[updatedTenant.tenant_id]).toBe(updatedTenant.portal_enabled);
    expect(portalStateAfter[updatedTenant.tenant_id]).toBe(!updatedTenant.portal_enabled);
    expect(portalStateAfter[untouchedTenant.tenant_id]).toBe(untouchedTenant.portal_enabled);
  });

  test('keeps tenant reads and writes available during an online backfill migration', async () => {
    const schemaName = registerSandboxSchema('migration_online');
    const tenants = buildTenantConfigs(4);
    const targetTenant = tenants[0];
    const digestsBefore = {};
    let additivePhaseReady = false;

    await createMigrationSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 520,
      usage_records_per_tenant: 780,
    });

    Object.assign(digestsBefore, await computeSeedDigests(pool, schemaName, tenantIds(tenants)));

    const migrationPromise = runOnlineForwardMigration(pool, schemaName, {
      batch_size: 120,
      per_batch_sleep_ms: 5,
      on_additive_phase_ready: async () => {
        additivePhaseReady = true;
      },
    });

    while (!additivePhaseReady) {
      await sleep(10);
    }

    const concurrentOperations = await Promise.allSettled(
      Array.from({ length: 60 }, async (_, index) => {
        if (index % 2 === 0) {
          await insertLegacyStudentRow(
            pool,
            schemaName,
            targetTenant.tenant_id,
            `ADM-LIVE-${index.toString().padStart(4, '0')}-${schemaName.slice(-4)}`,
            'live-write',
          );
          return 'write';
        }

        return countLegacyQueryMatches(pool, schemaName, targetTenant.tenant_id);
      }),
    );

    await migrationPromise;

    const rejectedOperations = concurrentOperations.filter(
      (operation) => operation.status === 'rejected',
    );

    expect(rejectedOperations).toHaveLength(0);
    expect(await computeSeedDigests(pool, schemaName, tenantIds(tenants))).toEqual(digestsBefore);
    expect(await countStudentsBySource(pool, schemaName, targetTenant.tenant_id, 'live-write')).toBe(30);
  });

  function registerSandboxSchema(prefix: string): string {
    const schemaName = createSandboxSchemaName(prefix);
    sandboxSchemas.add(schemaName);
    return schemaName;
  }
});

const buildTenantConfigs = (count: number): TenantSeedConfig[] =>
  Array.from({ length: count }, (_, index) => ({
    tenant_id: `tenant-${String(index + 1).padStart(2, '0')}-${createSandboxSchemaName('t').slice(-6)}`,
    timezone: index % 2 === 0 ? 'Africa/Nairobi' : 'UTC',
    billing_plan: index % 3 === 0 ? 'enterprise' : index % 3 === 1 ? 'growth' : 'starter',
    portal_enabled: index % 2 === 0,
  }));

const tenantIds = (tenants: TenantSeedConfig[]): string[] =>
  tenants.map((tenant) => tenant.tenant_id);
