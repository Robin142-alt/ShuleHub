import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

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
  seedSubscriptionsBulk,
} from './support/performance-harness';

type BenchmarkName = 'students_active_page' | 'payments_recent_page';

interface CostPerformanceConfig {
  tenant_count: number;
  students_per_tenant: number;
  payments_per_tenant: number;
  outbox_events_per_tenant: number;
  sample_tenants: number;
  benchmark_rounds: number;
  cache_read_rounds: number;
  report_path: string | null;
  fail_query_growth_ratio: number;
  fail_query_growth_delta_ms: number;
  fail_cache_hit_rate: number;
  fail_queue_throughput_jobs_per_second: number;
  fail_queue_dispatch_db_queries: number;
}

interface BenchmarkSummary {
  benchmark: BenchmarkName;
  first_bucket_avg_ms: number;
  last_bucket_avg_ms: number;
  growth_ratio: number;
  growth_delta_ms: number;
  tenant_measurements: Array<{
    tenant_id: string;
    avg_latency_ms: number;
  }>;
}

interface ScaleFailure {
  check: string;
  message: string;
  observed: number;
  threshold: number;
}

interface CostPerformanceReport {
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: 'passed' | 'failed';
  config: CostPerformanceConfig;
  seeded: {
    tenant_count: number;
    student_count: number;
    payment_count: number;
    outbox_event_count: number;
  };
  explain_checks: Array<Awaited<ReturnType<typeof explainTenantQuery>>>;
  cache_metrics: ReturnType<typeof getBillingAccessCacheMetrics>;
  queue_dispatch: Awaited<ReturnType<typeof measureOutboxDispatchThroughput>>;
  benchmarks: BenchmarkSummary[];
  failures: ScaleFailure[];
}

const BENCHMARK_SQL: Record<BenchmarkName, string> = {
  students_active_page: `
    SELECT id, admission_number, created_at
    FROM students
    WHERE tenant_id = $1
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 25
  `,
  payments_recent_page: `
    SELECT id, checkout_request_id, amount_minor, created_at
    FROM payment_intents
    WHERE tenant_id = $1
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 25
  `,
};

const main = async (): Promise<void> => {
  const config = parseConfig();
  const startedAt = new Date();
  const harness = await createPerformanceTestHarness();

  try {
    const tenantIds = Array.from({ length: config.tenant_count }, () =>
      registerTenantId('cost-scale'),
    );
    await seedDataset(harness, config, tenantIds);
    await analyzePerformanceTables(harness);

    const sampledTenantIds = pickSampleTenants(tenantIds, config.sample_tenants);
    const explainChecks = await runExplainChecks(harness, sampledTenantIds);
    await resetPerformanceState(harness);
    await warmBillingAccessCache(harness, sampledTenantIds, config.cache_read_rounds);
    const cacheMetrics = getBillingAccessCacheMetrics(harness);
    const benchmarks = await runBenchmarks(
      harness,
      sampledTenantIds,
      config.benchmark_rounds,
    );
    const queueDispatch = await measureOutboxDispatchThroughput(harness, tenantIds);
    const failures = evaluateFailures(
      config,
      explainChecks,
      cacheMetrics,
      queueDispatch,
      benchmarks,
    );
    const endedAt = new Date();
    const report: CostPerformanceReport = {
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: endedAt.getTime() - startedAt.getTime(),
      status: failures.length === 0 ? 'passed' : 'failed',
      config,
      seeded: {
        tenant_count: tenantIds.length,
        student_count: tenantIds.length * config.students_per_tenant,
        payment_count: tenantIds.length * config.payments_per_tenant,
        outbox_event_count: tenantIds.length * config.outbox_events_per_tenant,
      },
      explain_checks: explainChecks,
      cache_metrics: cacheMetrics,
      queue_dispatch: queueDispatch,
      benchmarks,
      failures,
    };

    if (config.report_path) {
      await writeFile(config.report_path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (report.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    await closePerformanceTestHarness(harness);
  }
};

const seedDataset = async (
  harness: PerformanceTestHarness,
  config: CostPerformanceConfig,
  tenantIds: string[],
): Promise<void> => {
  await seedSubscriptionsBulk(harness, tenantIds);

  for (const tenantId of tenantIds) {
    await seedStudentRows(harness, tenantId, config.students_per_tenant);
    await seedPaymentIntentRows(harness, tenantId, config.payments_per_tenant);
    await seedOutboxEvents(harness, tenantId, config.outbox_events_per_tenant);
  }
};

const runExplainChecks = async (
  harness: PerformanceTestHarness,
  tenantIds: string[],
): Promise<Array<Awaited<ReturnType<typeof explainTenantQuery>>>> => {
  const selectedTenantIds = [
    tenantIds[0],
    tenantIds[Math.floor(tenantIds.length / 2)],
    tenantIds[tenantIds.length - 1],
  ].filter((tenantId, index, values) => values.indexOf(tenantId) === index);

  const explainChecks: Array<Awaited<ReturnType<typeof explainTenantQuery>>> = [];

  for (const tenantId of selectedTenantIds) {
    explainChecks.push(
      await explainTenantQuery(
        harness,
        tenantId,
        'students_active_page',
        BENCHMARK_SQL.students_active_page,
        [tenantId],
        ['ix_students_status_created_at'],
      ),
    );
    explainChecks.push(
      await explainTenantQuery(
        harness,
        tenantId,
        'payments_recent_page',
        BENCHMARK_SQL.payments_recent_page,
        [tenantId],
        ['ix_payment_intents_status_created_at'],
      ),
    );
  }

  return explainChecks;
};

const warmBillingAccessCache = async (
  harness: PerformanceTestHarness,
  tenantIds: string[],
  cacheReadRounds: number,
): Promise<void> => {
  for (let round = 0; round < cacheReadRounds; round += 1) {
    for (const tenantId of tenantIds) {
      await runInTenantContext(harness, tenantId, () =>
        harness.billingAccessService.resolveForTenant(tenantId),
      );
    }

    if (round === 0) {
      harness.billingAccessService.resetCacheMetrics();
    }
  }
};

const runBenchmarks = async (
  harness: PerformanceTestHarness,
  tenantIds: string[],
  rounds: number,
): Promise<BenchmarkSummary[]> => {
  const summaries: BenchmarkSummary[] = [];

  for (const benchmark of Object.keys(BENCHMARK_SQL) as BenchmarkName[]) {
    const tenantMeasurements: Array<{ tenant_id: string; avg_latency_ms: number }> = [];

    for (const tenantId of tenantIds) {
      const latencies: number[] = [];

      for (let round = 0; round < rounds; round += 1) {
        const startedAt = performance.now();
        await runInTenantContext(harness, tenantId, async () => {
          await harness.databaseService.query(BENCHMARK_SQL[benchmark], [tenantId]);
        });
        latencies.push(performance.now() - startedAt);
      }

      tenantMeasurements.push({
        tenant_id: tenantId,
        avg_latency_ms: average(latencies),
      });
    }

    const bucketSize = Math.max(1, Math.floor(tenantMeasurements.length / 3));
    const firstBucketAvg = average(
      tenantMeasurements.slice(0, bucketSize).map((item) => item.avg_latency_ms),
    );
    const lastBucketAvg = average(
      tenantMeasurements.slice(-bucketSize).map((item) => item.avg_latency_ms),
    );

    summaries.push({
      benchmark,
      first_bucket_avg_ms: round(firstBucketAvg),
      last_bucket_avg_ms: round(lastBucketAvg),
      growth_ratio: round(firstBucketAvg <= 0 ? 1 : lastBucketAvg / firstBucketAvg),
      growth_delta_ms: round(lastBucketAvg - firstBucketAvg),
      tenant_measurements: tenantMeasurements.map((item) => ({
        tenant_id: item.tenant_id,
        avg_latency_ms: round(item.avg_latency_ms),
      })),
    });
  }

  return summaries;
};

const evaluateFailures = (
  config: CostPerformanceConfig,
  explainChecks: Array<Awaited<ReturnType<typeof explainTenantQuery>>>,
  cacheMetrics: ReturnType<typeof getBillingAccessCacheMetrics>,
  queueDispatch: Awaited<ReturnType<typeof measureOutboxDispatchThroughput>>,
  benchmarks: BenchmarkSummary[],
): ScaleFailure[] => {
  const failures: ScaleFailure[] = [];

  for (const explainCheck of explainChecks) {
    if (!explainCheck.scan_nodes.some((node) => node.index_name)) {
      failures.push({
        check: `index_missing:${explainCheck.benchmark}`,
        message: `Benchmark "${explainCheck.benchmark}" did not use an index-backed plan`,
        observed: 0,
        threshold: 1,
      });
    }

    if (explainCheck.relation_has_seq_scan) {
      failures.push({
        check: `seq_scan:${explainCheck.benchmark}`,
        message: `Benchmark "${explainCheck.benchmark}" fell back to a sequential scan`,
        observed: 1,
        threshold: 0,
      });
    }
  }

  if ((cacheMetrics.hit_rate ?? 0) < config.fail_cache_hit_rate) {
    failures.push({
      check: 'billing_access_cache_hit_rate',
      message: 'Billing access cache hit rate is below the acceptable threshold',
      observed: cacheMetrics.hit_rate ?? 0,
      threshold: config.fail_cache_hit_rate,
    });
  }

  if (
    queueDispatch.total_enqueued_count === queueDispatch.enqueued_count &&
    queueDispatch.throughput_jobs_per_second < config.fail_queue_throughput_jobs_per_second
  ) {
    failures.push({
      check: 'outbox_dispatch_throughput',
      message: 'Outbox dispatch throughput is below the minimum target',
      observed: queueDispatch.throughput_jobs_per_second,
      threshold: config.fail_queue_throughput_jobs_per_second,
    });
  }

  if (queueDispatch.database_query_count > config.fail_queue_dispatch_db_queries) {
    failures.push({
      check: 'outbox_dispatch_query_count',
      message: 'Outbox dispatch performed too many database queries for a bulk enqueue batch',
      observed: queueDispatch.database_query_count,
      threshold: config.fail_queue_dispatch_db_queries,
    });
  }

  for (const benchmark of benchmarks) {
    if (
      benchmark.growth_ratio > config.fail_query_growth_ratio &&
      benchmark.growth_delta_ms > config.fail_query_growth_delta_ms
    ) {
      failures.push({
        check: `tenant_growth:${benchmark.benchmark}`,
        message: `Benchmark "${benchmark.benchmark}" slowed down across tenants faster than expected`,
        observed: benchmark.growth_ratio,
        threshold: config.fail_query_growth_ratio,
      });
    }
  }

  return failures;
};

const pickSampleTenants = (tenantIds: string[], sampleTenants: number): string[] => {
  if (tenantIds.length <= sampleTenants) {
    return tenantIds;
  }

  const interval = Math.max(1, Math.floor(tenantIds.length / sampleTenants));
  const sampled: string[] = [];

  for (let index = 0; index < tenantIds.length && sampled.length < sampleTenants; index += interval) {
    sampled.push(tenantIds[index]);
  }

  if (sampled[sampled.length - 1] !== tenantIds[tenantIds.length - 1]) {
    sampled[sampled.length - 1] = tenantIds[tenantIds.length - 1];
  }

  return sampled;
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number): number => Number(value.toFixed(2));

const parseConfig = (): CostPerformanceConfig => ({
  tenant_count: parseInteger(process.env.COST_TENANTS, 120, 10, 2000),
  students_per_tenant: parseInteger(process.env.COST_STUDENTS_PER_TENANT, 40, 10, 500),
  payments_per_tenant: parseInteger(process.env.COST_PAYMENTS_PER_TENANT, 20, 5, 200),
  outbox_events_per_tenant: parseInteger(
    process.env.COST_OUTBOX_EVENTS_PER_TENANT,
    6,
    1,
    100,
  ),
  sample_tenants: parseInteger(process.env.COST_SAMPLE_TENANTS, 18, 6, 200),
  benchmark_rounds: parseInteger(process.env.COST_BENCHMARK_ROUNDS, 3, 1, 20),
  cache_read_rounds: parseInteger(process.env.COST_CACHE_READ_ROUNDS, 5, 2, 20),
  report_path: process.env.COST_REPORT_PATH?.trim() || null,
  fail_query_growth_ratio: parsePositiveNumber(process.env.COST_FAIL_QUERY_GROWTH_RATIO, 2),
  fail_query_growth_delta_ms: parsePositiveNumber(
    process.env.COST_FAIL_QUERY_GROWTH_DELTA_MS,
    25,
  ),
  fail_cache_hit_rate: parseRatio(process.env.COST_FAIL_CACHE_HIT_RATE, 0.8),
  fail_queue_throughput_jobs_per_second: parsePositiveNumber(
    process.env.COST_FAIL_QUEUE_THROUGHPUT_JOBS_PER_SECOND,
    150,
  ),
  fail_queue_dispatch_db_queries: parseInteger(
    process.env.COST_FAIL_QUEUE_DISPATCH_DB_QUERIES,
    5,
    1,
    100,
  ),
});

const parseInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received "${value}"`);
  }

  return parsed;
};

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received "${value}"`);
  }

  return parsed;
};

const parseRatio = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`Expected a ratio between 0 and 1, received "${value}"`);
  }

  return parsed;
};

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
