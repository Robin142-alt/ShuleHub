import {
  analyzePerformanceTables,
  closePerformanceTestHarness,
  createPerformanceTestHarness,
  explainTenantQuery,
  getBillingAccessCacheMetrics,
  measureOutboxDispatchThroughput,
  PerformanceTestHarness,
  registerTenantId,
  resetPerformanceState,
  runInTenantContext,
  seedOutboxEvents,
  seedPaymentIntentRows,
  seedStudentRows,
  seedSubscription,
} from './support/performance-harness';

jest.setTimeout(180000);

describe('Cost and performance integration', () => {
  let harness: PerformanceTestHarness;

  beforeAll(async () => {
    harness = await createPerformanceTestHarness();
  });

  afterAll(async () => {
    await closePerformanceTestHarness(harness);
  });

  beforeEach(async () => {
    await resetPerformanceState(harness);
  });

  test('billing access cache hits on repeated tenant lookups and invalidates after subscription changes', async () => {
    const tenantId = registerTenantId('cost-cache');
    await seedSubscription(harness, tenantId, 'starter');
    await resetPerformanceState(harness);

    const firstAccess = await runInTenantContext(harness, tenantId, () =>
      harness.billingAccessService.resolveForTenant(tenantId),
    );
    const secondAccess = await runInTenantContext(harness, tenantId, () =>
      harness.billingAccessService.resolveForTenant(tenantId),
    );
    const warmedMetrics = getBillingAccessCacheMetrics(harness);

    expect(firstAccess.plan_code).toBe('starter');
    expect(secondAccess.plan_code).toBe('starter');
    expect(warmedMetrics.enabled).toBe(true);
    expect(warmedMetrics.miss_count).toBe(1);
    expect(warmedMetrics.hit_count).toBe(1);
    expect(warmedMetrics.write_count).toBe(1);
    expect(warmedMetrics.hit_rate).toBe(0.5);

    await runInTenantContext(harness, tenantId, () =>
      harness.billingService.createSubscription({
        plan_code: 'growth',
        billing_phone_number: '254700000211',
        seats_allocated: 25,
        metadata: {
          source: 'cost-performance-test',
        },
      }),
    );

    const refreshedAccess = await runInTenantContext(harness, tenantId, () =>
      harness.billingAccessService.resolveForTenant(tenantId),
    );
    const postMutationMetrics = getBillingAccessCacheMetrics(harness);

    expect(refreshedAccess.plan_code).toBe('growth');
    expect(postMutationMetrics.invalidation_count).toBeGreaterThanOrEqual(1);
    expect(postMutationMetrics.miss_count).toBe(2);
    expect(postMutationMetrics.write_count).toBe(2);
  });

  test('hot tenant queries stay on indexes instead of falling back to sequential scans', async () => {
    const tenantId = registerTenantId('cost-index');
    await seedSubscription(harness, tenantId, 'starter');
    await seedStudentRows(harness, tenantId, 180);
    await seedPaymentIntentRows(harness, tenantId, 120);
    await analyzePerformanceTables(harness);

    const studentsExplain = await explainTenantQuery(
      harness,
      tenantId,
      'students_active_page',
      `
        SELECT id, admission_number, created_at
        FROM students
        WHERE tenant_id = $1
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 25
      `,
      [tenantId],
      ['ix_students_status_created_at'],
    );
    const paymentsExplain = await explainTenantQuery(
      harness,
      tenantId,
      'payments_recent_page',
      `
        SELECT id, checkout_request_id, amount_minor, created_at
        FROM payment_intents
        WHERE tenant_id = $1
          AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 25
      `,
      [tenantId],
      ['ix_payment_intents_status_created_at'],
    );

    expect(studentsExplain.scan_nodes.some((node) => node.index_name)).toBe(true);
    expect(studentsExplain.relation_has_seq_scan).toBe(false);
    expect(paymentsExplain.scan_nodes.some((node) => node.index_name)).toBe(true);
    expect(paymentsExplain.relation_has_seq_scan).toBe(false);
  });

  test('outbox dispatcher bulk-enqueues events without per-event database lookups', async () => {
    const tenantA = registerTenantId('cost-outbox-a');
    const tenantB = registerTenantId('cost-outbox-b');
    const tenantC = registerTenantId('cost-outbox-c');

    await Promise.all([
      seedOutboxEvents(harness, tenantA, 80),
      seedOutboxEvents(harness, tenantB, 70),
      seedOutboxEvents(harness, tenantC, 50),
    ]);
    await analyzePerformanceTables(harness);
    await resetPerformanceState(harness);

    const dispatchResult = await measureOutboxDispatchThroughput(harness, [
      tenantA,
      tenantB,
      tenantC,
    ]);
    const jobs = harness.capturingQueueService.getJobs().filter((job) =>
      [tenantA, tenantB, tenantC].includes(String((job.payload as { tenant_id?: string }).tenant_id)),
    );

    expect(dispatchResult.enqueued_count).toBeGreaterThanOrEqual(200);
    expect(jobs).toHaveLength(200);
    expect(dispatchResult.database_query_count).toBeLessThanOrEqual(3);

    if (dispatchResult.total_enqueued_count === dispatchResult.enqueued_count) {
      expect(dispatchResult.throughput_jobs_per_second).toBeGreaterThan(25);
    } else {
      expect(dispatchResult.throughput_jobs_per_second).toBeGreaterThan(1);
    }
  });
});
