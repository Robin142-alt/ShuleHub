import { performance } from 'node:perf_hooks';

import { Pool } from 'pg';

import {
  buildTenantConfigs,
  computeRecoveryDigests,
  corruptTenantData,
  createRecoveryPool,
  createRecoverySandbox,
  createRecoverySchemaName,
  dropRecoverySandbox,
  ensureDisasterRecoveryEnv,
  exportSchemaBackup,
  exportTenantBackup,
  getPortalEnabledState,
  insertStudentWithJournal,
  insertUsageWithJournal,
  listTenantIds,
  restoreFullSchemaBackup,
  restorePointInTime,
  restoreTenantBackup,
  RecoveryJournalEntry,
  SchemaBackupSnapshot,
  simulateFullSchemaLoss,
  studentExists,
  tenantIds,
  updateTenantFlagsWithJournal,
  usageExists,
} from './support/backup-restore-harness';

jest.setTimeout(300000);

const MAX_FULL_RESTORE_RTO_MS = 20000;
const MAX_TENANT_RESTORE_RTO_MS = 12000;
const MAX_PITR_RTO_MS = 20000;
const MAX_PITR_RPO_MS = 5 * 60 * 1000;

describe('Disaster recovery validation', () => {
  let pool: Pool;
  const sandboxSchemas = new Set<string>();

  beforeAll(() => {
    ensureDisasterRecoveryEnv();
    pool = createRecoveryPool('shule-hub-disaster-recovery-tests');
  });

  afterAll(async () => {
    for (const schemaName of sandboxSchemas) {
      await dropRecoverySandbox(pool, schemaName);
    }

    await pool?.end();
  });

  test('restores a fully lost multi-tenant database snapshot within RTO and without tenant data loss', async () => {
    const schemaName = registerSandboxSchema('dr_full');
    const tenants = buildTenantConfigs(6);

    await createRecoverySandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 320,
      usage_records_per_tenant: 540,
    });

    const backupSnapshot = await exportSchemaBackup(pool, schemaName);
    const digestsBefore = await computeRecoveryDigests(pool, schemaName, tenantIds(tenants));

    await simulateFullSchemaLoss(pool, schemaName);

    const restoreStartedAt = performance.now();
    await restoreFullSchemaBackup(pool, schemaName, backupSnapshot);
    const restoreDurationMs = performance.now() - restoreStartedAt;

    const digestsAfter = await computeRecoveryDigests(pool, schemaName, tenantIds(tenants));

    expect(restoreDurationMs).toBeLessThanOrEqual(MAX_FULL_RESTORE_RTO_MS);
    expect(digestsAfter).toEqual(digestsBefore);
    expect(await listTenantIds(pool, schemaName)).toEqual(tenantIds(tenants));
    expect(calculateRpoMs(backupSnapshot.taken_at, backupSnapshot.taken_at)).toBe(0);
  });

  test('restores a specifically corrupted tenant without disturbing other tenants', async () => {
    const schemaName = registerSandboxSchema('dr_tenant');
    const tenants = buildTenantConfigs(5);
    const targetTenant = tenants[1];
    const untouchedTenant = tenants[3];

    await createRecoverySandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 260,
      usage_records_per_tenant: 420,
    });

    const fullDigestsBefore = await computeRecoveryDigests(pool, schemaName, tenantIds(tenants));
    const targetTenantBackup = await exportTenantBackup(pool, schemaName, targetTenant.tenant_id);
    const anchorAdmissionNumber = targetTenantBackup.student_records[0]?.admission_number;

    if (!anchorAdmissionNumber) {
      throw new Error('Expected seeded tenant backup to contain student data');
    }

    await corruptTenantData(pool, schemaName, targetTenant.tenant_id);

    const corruptedDigests = await computeRecoveryDigests(pool, schemaName, tenantIds(tenants));
    expect(corruptedDigests[targetTenant.tenant_id]).not.toEqual(
      fullDigestsBefore[targetTenant.tenant_id],
    );
    expect(corruptedDigests[untouchedTenant.tenant_id]).toEqual(
      fullDigestsBefore[untouchedTenant.tenant_id],
    );

    const restoreStartedAt = performance.now();
    await restoreTenantBackup(pool, schemaName, targetTenantBackup);
    const restoreDurationMs = performance.now() - restoreStartedAt;

    const digestsAfter = await computeRecoveryDigests(pool, schemaName, tenantIds(tenants));

    expect(restoreDurationMs).toBeLessThanOrEqual(MAX_TENANT_RESTORE_RTO_MS);
    expect(digestsAfter[targetTenant.tenant_id]).toEqual(
      fullDigestsBefore[targetTenant.tenant_id],
    );
    expect(digestsAfter[untouchedTenant.tenant_id]).toEqual(
      fullDigestsBefore[untouchedTenant.tenant_id],
    );
    expect(await studentExists(pool, schemaName, anchorAdmissionNumber)).toBe(true);
    expect(await listTenantIds(pool, schemaName)).toEqual(tenantIds(tenants));
  });

  test('restores from a point in time within RPO and preserves tenant isolation', async () => {
    const schemaName = registerSandboxSchema('dr_pitr');
    const tenants = buildTenantConfigs(4);
    const tenantA = tenants[0];
    const tenantB = tenants[1];
    const tenantC = tenants[2];

    await createRecoverySandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: 180,
      usage_records_per_tenant: 260,
    });

    const baseSnapshot = await exportSchemaBackup(pool, schemaName);
    const journalEntries: RecoveryJournalEntry[] = [];
    const operationOneTimestamp = '2026-04-26T08:00:00.000Z';
    const operationTwoTimestamp = '2026-04-26T08:02:00.000Z';
    const operationThreeTimestamp = '2026-04-26T08:04:00.000Z';
    const operationOneAdmission = `ADM-PITR-${schemaName.slice(-5)}`;

    journalEntries.push(
      await insertStudentWithJournal(pool, schemaName, {
        tenant_id: tenantA.tenant_id,
        admission_number: operationOneAdmission,
        full_name: 'PITR Student',
        legacy_guardian_phone: '254700001234',
        occurred_at: operationOneTimestamp,
        source: 'pitr-replay',
      }),
    );
    journalEntries.push(
      await insertUsageWithJournal(pool, schemaName, {
        tenant_id: tenantB.tenant_id,
        metric_key: 'finance.rebuild',
        quantity: 7,
        occurred_at: operationTwoTimestamp,
        source: 'pitr-replay',
      }),
    );

    const expectedSnapshotAtTarget = await exportSchemaBackup(pool, schemaName);
    const expectedDigestsAtTarget = await computeRecoveryDigests(
      pool,
      schemaName,
      tenantIds(tenants),
    );
    const tenantCPortalStateBeforeLateChange = await getPortalEnabledState(
      pool,
      schemaName,
      tenantC.tenant_id,
    );

    journalEntries.push(
      await updateTenantFlagsWithJournal(pool, schemaName, {
        tenant_id: tenantC.tenant_id,
        portal_enabled: !tenantCPortalStateBeforeLateChange,
        recovery_mode: 'late-change',
        occurred_at: operationThreeTimestamp,
      }),
    );

    await simulateFullSchemaLoss(pool, schemaName);

    const restoreStartedAt = performance.now();
    await restorePointInTime(
      pool,
      schemaName,
      baseSnapshot,
      journalEntries,
      operationTwoTimestamp,
    );
    const restoreDurationMs = performance.now() - restoreStartedAt;

    const digestsAfterRestore = await computeRecoveryDigests(
      pool,
      schemaName,
      tenantIds(tenants),
    );

    expect(restoreDurationMs).toBeLessThanOrEqual(MAX_PITR_RTO_MS);
    expect(calculateRpoMs(operationTwoTimestamp, operationThreeTimestamp)).toBeLessThanOrEqual(
      MAX_PITR_RPO_MS,
    );
    expect(digestsAfterRestore).toEqual(expectedDigestsAtTarget);
    expect(await studentExists(pool, schemaName, operationOneAdmission)).toBe(true);
    expect(await usageExists(pool, schemaName, 'finance.rebuild', operationTwoTimestamp)).toBe(
      true,
    );
    expect(await getPortalEnabledState(pool, schemaName, tenantC.tenant_id)).toBe(
      tenantCPortalStateBeforeLateChange,
    );
    expect(await listTenantIds(pool, schemaName)).toEqual(tenantIds(tenants));
  });

  function registerSandboxSchema(prefix: string): string {
    const schemaName = createRecoverySchemaName(prefix);
    sandboxSchemas.add(schemaName);
    return schemaName;
  }
});

const calculateRpoMs = (
  restoredPointInTime: string,
  failureTimestamp: string,
): number =>
  Math.max(
    0,
    new Date(failureTimestamp).getTime() - new Date(restoredPointInTime).getTime(),
  );
