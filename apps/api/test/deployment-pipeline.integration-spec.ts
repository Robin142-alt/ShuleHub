import { Pool } from 'pg';

import {
  countStudentsByReleaseSource,
  createDeploymentPool,
  createDeploymentSandbox,
  createSandboxSchemaName,
  currentReleaseCreateStudent,
  currentReleaseReadPortalFlag,
  currentReleaseReadStudentProjection,
  dropDeploymentSandbox,
  ensureDeploymentTestEnv,
  legacyReleaseCreateStudent,
  legacyReleaseReadPortalFlag,
  legacyReleaseReadStudentCount,
  runAdditiveDeploymentPhase,
  runPostDeploymentBackfill,
  simulateBrokenCurrentReleaseWrite,
  sleep,
  TenantSeedConfig,
} from './support/deployment-harness';
import {
  computeSeedDigests,
  runForwardMigration,
  runOnlineForwardMigration,
  SeedDigest,
} from './support/migration-harness';

jest.setTimeout(300000);

describe('Deployment pipeline safety', () => {
  let pool: Pool;
  const sandboxSchemas = new Set<string>();

  beforeAll(() => {
    ensureDeploymentTestEnv();
    pool = createDeploymentPool('shule-hub-deployment-tests');
  });

  afterAll(async () => {
    for (const schemaName of sandboxSchemas) {
      await dropDeploymentSandbox(pool, schemaName);
    }

    await pool?.end();
  });

  test('keeps mixed-version traffic available during a zero-downtime release', async () => {
    const schemaName = registerSandboxSchema('deploy_zero');
    const tenants = buildTenantConfigs(4);
    const targetTenant = tenants[0];
    const digestsBefore = await seedSandbox(schemaName, tenants, 520, 760);
    let additivePhaseReady = false;

    const deploymentPromise = runOnlineForwardMigration(pool, schemaName, {
      batch_size: 100,
      per_batch_sleep_ms: 5,
      on_additive_phase_ready: async () => {
        additivePhaseReady = true;
      },
    });

    while (!additivePhaseReady) {
      await sleep(10);
    }

    const trafficResults = await Promise.allSettled(
      Array.from({ length: 80 }, async (_, index) => {
        const admissionNumber = buildAdmissionNumber(schemaName, 'ZD', index);

        if (index % 4 === 0) {
          await legacyReleaseCreateStudent(pool, schemaName, {
            tenant_id: targetTenant.tenant_id,
            admission_number: `${admissionNumber}-LEG`,
            source: 'zero-downtime-old',
          });
          return 'legacy-write';
        }

        if (index % 4 === 1) {
          await currentReleaseCreateStudent(pool, schemaName, {
            tenant_id: targetTenant.tenant_id,
            admission_number: `${admissionNumber}-CUR`,
            source: 'zero-downtime-new',
          });
          return 'current-write';
        }

        if (index % 4 === 2) {
          return legacyReleaseReadStudentCount(pool, schemaName, targetTenant.tenant_id);
        }

        const projection = await currentReleaseReadStudentProjection(
          pool,
          schemaName,
          targetTenant.tenant_id,
          'ADM-ZD-',
        );
        return projection.length;
      }),
    );

    await deploymentPromise;
    await runForwardMigration(pool, schemaName);

    const rejectedOperations = trafficResults.filter((result) => result.status === 'rejected');
    const digestsAfter = await computeSeedDigests(pool, schemaName, tenantIds(tenants));
    const projection = await currentReleaseReadStudentProjection(
      pool,
      schemaName,
      targetTenant.tenant_id,
      'ADM-ZD-',
    );

    expect(rejectedOperations).toHaveLength(0);
    expect(digestsAfter).toEqual(digestsBefore);
    expect(await countStudentsByReleaseSource(pool, schemaName, targetTenant.tenant_id, 'zero-downtime-old')).toBe(20);
    expect(await countStudentsByReleaseSource(pool, schemaName, targetTenant.tenant_id, 'zero-downtime-new')).toBe(20);
    expect(projection).toHaveLength(40);
    expect(projection.every((row) => row.projected_phone === '254712345678')).toBe(true);
  });

  test('supports rolling updates with staged old-to-new traffic shifts', async () => {
    const schemaName = registerSandboxSchema('deploy_roll');
    const tenants = buildTenantConfigs(3);
    const targetTenant = tenants[1];

    await seedSandbox(schemaName, tenants, 280, 420);
    await runAdditiveDeploymentPhase(pool, schemaName);

    const rolloutRatios = [0, 0.25, 0.5, 0.75, 1];
    const phaseResults = await Promise.allSettled(
      rolloutRatios.map(async (currentTrafficRatio, phaseIndex) => {
        const operations = Array.from({ length: 24 }, async (_, operationIndex) => {
          const useCurrentRelease = operationIndex / 24 < currentTrafficRatio;
          const admissionNumber = buildAdmissionNumber(schemaName, `RU${phaseIndex}`, operationIndex);

          if (useCurrentRelease) {
            await currentReleaseCreateStudent(pool, schemaName, {
              tenant_id: targetTenant.tenant_id,
              admission_number: `${admissionNumber}-CUR`,
              source: 'rolling-new',
            });
          } else {
            await legacyReleaseCreateStudent(pool, schemaName, {
              tenant_id: targetTenant.tenant_id,
              admission_number: `${admissionNumber}-LEG`,
              source: 'rolling-old',
            });
          }

          const [legacyPortalFlag, currentPortalFlag] = await Promise.all([
            legacyReleaseReadPortalFlag(pool, schemaName, targetTenant.tenant_id),
            currentReleaseReadPortalFlag(pool, schemaName, targetTenant.tenant_id),
          ]);

          expect(currentPortalFlag).toBe(legacyPortalFlag);
        });

        await Promise.all(operations);
      }),
    );

    await runPostDeploymentBackfill(pool, schemaName);

    const projection = await currentReleaseReadStudentProjection(
      pool,
      schemaName,
      targetTenant.tenant_id,
      'ADM-RU',
    );
    const rejectedPhases = phaseResults.filter((result) => result.status === 'rejected');

    expect(rejectedPhases).toHaveLength(0);
    expect(await countStudentsByReleaseSource(pool, schemaName, targetTenant.tenant_id, 'rolling-old')).toBe(60);
    expect(await countStudentsByReleaseSource(pool, schemaName, targetTenant.tenant_id, 'rolling-new')).toBe(60);
    expect(projection).toHaveLength(120);
    expect(projection.every((row) => row.projected_phone === '254712345678')).toBe(true);
  });

  test('rolls back a failed candidate deployment without partial writes or downtime', async () => {
    const schemaName = registerSandboxSchema('deploy_rollback');
    const tenants = buildTenantConfigs(3);
    const targetTenant = tenants[2];
    const digestsBefore = await seedSandbox(schemaName, tenants, 320, 480);

    await runAdditiveDeploymentPhase(pool, schemaName);

    const preFailureWrites = await Promise.allSettled(
      Array.from({ length: 12 }, async (_, index) =>
        legacyReleaseCreateStudent(pool, schemaName, {
          tenant_id: targetTenant.tenant_id,
          admission_number: buildAdmissionNumber(schemaName, 'RBPRE', index),
          source: 'rollback-stable',
        }),
      ),
    );
    const failedCandidateWrites = await Promise.allSettled(
      Array.from({ length: 10 }, async (_, index) =>
        simulateBrokenCurrentReleaseWrite(pool, schemaName, {
          tenant_id: targetTenant.tenant_id,
          admission_number: buildAdmissionNumber(schemaName, 'RBFAIL', index),
          source: 'rollback-broken',
        }),
      ),
    );
    const rollbackWrites = await Promise.allSettled(
      Array.from({ length: 12 }, async (_, index) =>
        legacyReleaseCreateStudent(pool, schemaName, {
          tenant_id: targetTenant.tenant_id,
          admission_number: buildAdmissionNumber(schemaName, 'RBPOST', index),
          source: 'rollback-stable',
        }),
      ),
    );

    await runPostDeploymentBackfill(pool, schemaName);

    const successfulStableWrites =
      preFailureWrites.filter((result) => result.status === 'fulfilled').length
      + rollbackWrites.filter((result) => result.status === 'fulfilled').length;
    const failedCandidateCount = failedCandidateWrites.filter(
      (result) => result.status === 'rejected',
    ).length;
    const projection = await currentReleaseReadStudentProjection(
      pool,
      schemaName,
      targetTenant.tenant_id,
      'ADM-RB',
    );
    const digestsAfter = await computeSeedDigests(pool, schemaName, tenantIds(tenants));

    expect(preFailureWrites.filter((result) => result.status === 'rejected')).toHaveLength(0);
    expect(rollbackWrites.filter((result) => result.status === 'rejected')).toHaveLength(0);
    expect(failedCandidateCount).toBe(10);
    expect(digestsAfter).toEqual(digestsBefore);
    expect(await countStudentsByReleaseSource(pool, schemaName, targetTenant.tenant_id, 'rollback-broken')).toBe(0);
    expect(await countStudentsByReleaseSource(pool, schemaName, targetTenant.tenant_id, 'rollback-stable')).toBe(successfulStableWrites);
    expect(projection).toHaveLength(24);
    expect(projection.every((row) => row.projected_phone === '254712345678')).toBe(true);
  });

  function registerSandboxSchema(prefix: string): string {
    const schemaName = createSandboxSchemaName(prefix);
    sandboxSchemas.add(schemaName);
    return schemaName;
  }

  async function seedSandbox(
    schemaName: string,
    tenants: TenantSeedConfig[],
    studentsPerTenant: number,
    usageRecordsPerTenant: number,
  ): Promise<Record<string, SeedDigest>> {
    await createDeploymentSandbox(pool, {
      schema_name: schemaName,
      tenants,
      students_per_tenant: studentsPerTenant,
      usage_records_per_tenant: usageRecordsPerTenant,
    });

    return computeSeedDigests(
      pool,
      schemaName,
      tenantIds(tenants),
    );
  }
});

const buildTenantConfigs = (count: number): TenantSeedConfig[] =>
  Array.from({ length: count }, (_, index) => ({
    tenant_id: `deploy-${String(index + 1).padStart(2, '0')}-${createSandboxSchemaName('t').slice(-6)}`,
    timezone: index % 2 === 0 ? 'Africa/Nairobi' : 'UTC',
    billing_plan: index % 3 === 0 ? 'enterprise' : index % 3 === 1 ? 'growth' : 'starter',
    portal_enabled: index % 2 === 0,
  }));

const tenantIds = (tenants: TenantSeedConfig[]): string[] =>
  tenants.map((tenant) => tenant.tenant_id);

const buildAdmissionNumber = (
  schemaName: string,
  prefix: string,
  index: number,
): string => `ADM-${prefix}-${schemaName.slice(-4)}-${String(index).padStart(4, '0')}`;
