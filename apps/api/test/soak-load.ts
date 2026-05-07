import { randomInt, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import { DatabaseService } from '../src/database/database.service';
import {
  closeRaceTestHarness,
  createRaceTestHarness,
  ensureFinanceAccounts,
  RaceTestHarness,
  registerTenantId,
  runInTenantContext,
  seedStudent,
  sleep,
} from './support/race-harness';
import { SyncPushOperationDto } from '../src/modules/sync/dto/sync-push-operation.dto';
import { SyncSimulatorDevice } from './support/sync-simulator';
import { createSoakQueueProbe, QueueProbeSnapshot } from './support/soak-queue-probe';

type WorkloadName =
  | 'finance_post'
  | 'finance_balance'
  | 'attendance_upsert'
  | 'attendance_list'
  | 'sync_push'
  | 'sync_pull'
  | 'billing_invoice'
  | 'billing_read';

interface SoakConfig {
  duration_ms: number;
  concurrency: number;
  tenant_count: number;
  students_per_tenant: number;
  devices_per_tenant: number;
  sample_interval_ms: number;
  warmup_ms: number;
  think_time_min_ms: number;
  think_time_max_ms: number;
  report_path: string | null;
  queue_mode: 'auto' | 'bullmq' | 'simulated';
  fail_memory_slope_mb_per_hour: number;
  fail_rss_slope_mb_per_hour: number;
  fail_latency_growth_ratio: number;
  fail_latency_p95_increase_ms: number;
  fail_queue_backlog: number;
  fail_db_waiting_requests: number;
  fail_db_total_connections: number;
  fail_error_rate: number;
  min_analysis_hours_for_slope_checks: number;
}

interface SoakTenantFixture {
  tenant_id: string;
  debit_account_id: string;
  credit_account_id: string;
  student_ids: string[];
  devices: SoakDevice[];
  invoice_counter: number;
  finance_counter: number;
}

interface SoakDevice {
  simulator: SyncSimulatorDevice;
  next_version: number;
}

interface WindowAccumulator {
  operation_count: number;
  success_count: number;
  error_count: number;
  latencies_ms: number[];
  per_operation: Record<WorkloadName, { count: number; errors: number }>;
}

interface WindowSummary {
  operation_count: number;
  success_count: number;
  error_count: number;
  error_rate: number;
  throughput_ops_per_minute: number;
  latency_ms: {
    min: number;
    avg: number;
    p50: number;
    p95: number;
    max: number;
  };
  per_operation: Record<WorkloadName, { count: number; errors: number }>;
}

interface SoakSample {
  captured_at: string;
  elapsed_ms: number;
  memory_mb: {
    rss: number;
    heap_used: number;
    heap_total: number;
    external: number;
    array_buffers: number;
  };
  event_loop_ms: {
    mean: number;
    max: number;
    p95: number;
  };
  database_connections: ReturnType<DatabaseService['getPoolMetrics']>;
  queue: QueueProbeSnapshot;
  workload: WindowSummary;
}

interface SoakFailure {
  check: string;
  message: string;
  observed: number;
  threshold: number;
}

interface SoakReport {
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: 'passed' | 'failed';
  config: SoakConfig;
  queue_mode: QueueProbeSnapshot['mode'];
  tenant_ids: string[];
  summary: {
    total_operations: number;
    successful_operations: number;
    failed_operations: number;
    error_rate: number;
    peak_heap_used_mb: number;
    peak_rss_mb: number;
    peak_queue_backlog: number;
    peak_db_total_connections: number;
    peak_db_waiting_requests: number;
    first_quartile_p95_ms: number;
    last_quartile_p95_ms: number;
    latency_growth_ratio: number;
    latency_p95_increase_ms: number;
    heap_slope_mb_per_hour: number;
    rss_slope_mb_per_hour: number;
  };
  failures: SoakFailure[];
  samples: SoakSample[];
}

const main = async (): Promise<void> => {
  const config = parseConfig();
  const startedAt = new Date();
  const harness = await createRaceTestHarness();
  const queueProbe = await createSoakQueueProbe({
    queueName: 'soak-heartbeat',
    prefix: 'shule-hub-soak',
    workerConcurrency: Math.max(2, Math.ceil(config.concurrency / 8)),
    producerIntervalMs: 200,
    mode: config.queue_mode,
  });
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  const accumulator = createWindowAccumulator();
  const samples: SoakSample[] = [];
  let stopRequested = false;

  try {
    eventLoopDelay.enable();
    const fixtures = await seedFixtures(harness, config);
    const deadline = Date.now() + config.duration_ms;
    const sampler = startSampler(
      harness,
      queueProbe,
      accumulator,
      eventLoopDelay,
      samples,
      startedAt.getTime(),
      config,
    );

    const workers = Array.from({ length: config.concurrency }, (_, index) =>
      runWorkerLoop(harness, fixtures, accumulator, deadline, config, index),
    );

    await Promise.all(workers);
    stopRequested = true;
    clearInterval(sampler);

    const finalSample = await captureSample(
      harness,
      queueProbe,
      accumulator,
      eventLoopDelay,
      startedAt.getTime(),
      config.sample_interval_ms,
    );

    if (finalSample.workload.operation_count > 0) {
      samples.push(finalSample);
    }

    const report = analyzeRun(config, fixtures, samples, startedAt, new Date(), queueProbe.mode);

    if (config.report_path) {
      await writeFile(config.report_path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (report.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    eventLoopDelay.disable();
    if (!stopRequested) {
      stopRequested = true;
    }
    await queueProbe.stop();
    await closeRaceTestHarness(harness);
  }
};

const parseConfig = (): SoakConfig => {
  const durationMinutes = parsePositiveNumber(process.env.SOAK_DURATION_MINUTES, 24 * 60);
  const thinkTimeMinMs = parsePositiveNumber(process.env.SOAK_THINK_TIME_MIN_MS, 10);
  const thinkTimeMaxMs = parsePositiveNumber(process.env.SOAK_THINK_TIME_MAX_MS, 50);

  if (thinkTimeMaxMs < thinkTimeMinMs) {
    throw new Error('SOAK_THINK_TIME_MAX_MS must be greater than or equal to SOAK_THINK_TIME_MIN_MS');
  }

  return {
    duration_ms: Math.round(durationMinutes * 60_000),
    concurrency: parseInteger(process.env.SOAK_CONCURRENCY, 24, 1, 1000),
    tenant_count: parseInteger(process.env.SOAK_TENANTS, 6, 1, 100),
    students_per_tenant: parseInteger(process.env.SOAK_STUDENTS_PER_TENANT, 20, 1, 1000),
    devices_per_tenant: parseInteger(process.env.SOAK_DEVICES_PER_TENANT, 3, 1, 100),
    sample_interval_ms: parseInteger(process.env.SOAK_SAMPLE_INTERVAL_MS, 30_000, 1_000, 300_000),
    warmup_ms: Math.round(parsePositiveNumber(process.env.SOAK_WARMUP_MINUTES, 5) * 60_000),
    think_time_min_ms: thinkTimeMinMs,
    think_time_max_ms: thinkTimeMaxMs,
    report_path: process.env.SOAK_REPORT_PATH?.trim() || null,
    queue_mode: parseQueueMode(process.env.SOAK_QUEUE_MODE),
    fail_memory_slope_mb_per_hour: parsePositiveNumber(
      process.env.SOAK_FAIL_MEMORY_SLOPE_MB_PER_HOUR,
      64,
    ),
    fail_rss_slope_mb_per_hour: parsePositiveNumber(
      process.env.SOAK_FAIL_RSS_SLOPE_MB_PER_HOUR,
      96,
    ),
    fail_latency_growth_ratio: parsePositiveNumber(
      process.env.SOAK_FAIL_LATENCY_GROWTH_RATIO,
      2,
    ),
    fail_latency_p95_increase_ms: parsePositiveNumber(
      process.env.SOAK_FAIL_LATENCY_P95_INCREASE_MS,
      75,
    ),
    fail_queue_backlog: parsePositiveNumber(process.env.SOAK_FAIL_QUEUE_BACKLOG, 250),
    fail_db_waiting_requests: parsePositiveNumber(
      process.env.SOAK_FAIL_DB_WAITING_REQUESTS,
      10,
    ),
    fail_db_total_connections: parsePositiveNumber(
      process.env.SOAK_FAIL_DB_TOTAL_CONNECTIONS,
      25,
    ),
    fail_error_rate: parsePositiveNumber(process.env.SOAK_FAIL_ERROR_RATE, 0.02),
    min_analysis_hours_for_slope_checks: parsePositiveNumber(
      process.env.SOAK_MIN_ANALYSIS_HOURS_FOR_SLOPE_CHECKS,
      1,
    ),
  };
};

const seedFixtures = async (
  harness: RaceTestHarness,
  config: SoakConfig,
): Promise<SoakTenantFixture[]> => {
  const fixtures: SoakTenantFixture[] = [];

  for (let tenantIndex = 0; tenantIndex < config.tenant_count; tenantIndex += 1) {
    const tenantId = registerTenantId(`soak-${tenantIndex + 1}`);
    await runInTenantContext(
      harness,
      tenantId,
      () =>
        harness.billingService.createSubscription({
          plan_code: 'enterprise',
          status: 'active',
          billing_phone_number: `2547001${tenantIndex.toString().padStart(5, '0')}`,
          seats_allocated: 250,
          metadata: {
            seeded_by: 'soak-load',
          },
        }),
      {
        method: 'POST',
        path: '/billing/subscriptions',
      },
    );

    const accounts = await ensureFinanceAccounts(
      harness,
      tenantId,
      '1100-CASH',
      '4100-TUITION',
    );
    const studentIds: string[] = [];

    for (let studentIndex = 0; studentIndex < config.students_per_tenant; studentIndex += 1) {
      const student = await seedStudent(
        harness,
        tenantId,
        `${tenantIndex + 1}-${studentIndex + 1}-${randomUUID().slice(0, 4)}`,
      );
      studentIds.push(student.id);
    }

    const devices = Array.from({ length: config.devices_per_tenant }, (_, deviceIndex) => ({
      simulator: new SyncSimulatorDevice(
        harness,
        tenantId,
        `soak-device-${tenantIndex + 1}-${deviceIndex + 1}`,
      ),
      next_version: 1,
    }));

    fixtures.push({
      tenant_id: tenantId,
      debit_account_id: accounts.debit_account_id,
      credit_account_id: accounts.credit_account_id,
      student_ids: studentIds,
      devices,
      invoice_counter: 0,
      finance_counter: 0,
    });
  }

  return fixtures;
};

const runWorkerLoop = async (
  harness: RaceTestHarness,
  fixtures: SoakTenantFixture[],
  accumulator: WindowAccumulator,
  deadline: number,
  config: SoakConfig,
  workerIndex: number,
): Promise<void> => {
  while (Date.now() < deadline) {
    const operation = pickWorkload();
    const fixture = fixtures[randomInt(fixtures.length)];
    const startedAt = performance.now();

    try {
      await executeWorkload(harness, fixture, operation, workerIndex);
      recordOperation(accumulator, operation, performance.now() - startedAt, true);
    } catch {
      recordOperation(accumulator, operation, performance.now() - startedAt, false);
    }

    await sleep(randomInt(config.think_time_min_ms, config.think_time_max_ms + 1));
  }
};

const executeWorkload = async (
  harness: RaceTestHarness,
  fixture: SoakTenantFixture,
  operation: WorkloadName,
  workerIndex: number,
): Promise<void> => {
  switch (operation) {
    case 'finance_post':
      fixture.finance_counter += 1;
      await runInTenantContext(
        harness,
        fixture.tenant_id,
        () =>
          harness.transactionService.postTransaction({
            idempotency_key: `soak-finance:${fixture.tenant_id}:${workerIndex}:${randomUUID()}`,
            reference: `SOAK-FIN-${fixture.finance_counter}-${workerIndex}`,
            description: `Soak finance transaction ${fixture.finance_counter}`,
            metadata: {
              source: 'soak-load',
              worker_index: workerIndex,
            },
            entries: [
              {
                account_id: fixture.debit_account_id,
                direction: 'debit',
                amount_minor: randomAmountMinor(),
                description: 'Debit leg',
              },
              {
                account_id: fixture.credit_account_id,
                direction: 'credit',
                amount_minor: randomAmountMinor.last_amount_minor,
                description: 'Credit leg',
              },
            ],
          }),
        {
          method: 'POST',
          path: '/finance/transactions',
        },
      );
      return;
    case 'finance_balance':
      await runInTenantContext(
        harness,
        fixture.tenant_id,
        () => harness.transactionService.getAccountBalance(pickRandomAccountId(fixture)),
        {
          method: 'GET',
          path: '/finance/accounts/balance',
        },
      );
      return;
    case 'attendance_upsert': {
      const studentId = pickRandomStudentId(fixture);
      await runInTenantContext(
        harness,
        fixture.tenant_id,
        () =>
          harness.attendanceService.upsertStudentAttendance(studentId, randomAttendanceDate(), {
            status: pickAttendanceStatus(),
            last_modified_at: new Date().toISOString(),
            notes: `soak-attendance-${randomUUID().slice(0, 8)}`,
            metadata: {
              source: 'soak-load',
            },
          }),
        {
          method: 'PUT',
          path: `/students/${studentId}/attendance`,
        },
      );
      return;
    }
    case 'attendance_list': {
      const studentId = pickRandomStudentId(fixture);
      await runInTenantContext(
        harness,
        fixture.tenant_id,
        () =>
          harness.attendanceService.listStudentAttendance(studentId, {
            from: thirtyDaysAgoDate(),
            to: todayDate(),
            limit: 60,
          }),
        {
          method: 'GET',
          path: `/students/${studentId}/attendance`,
        },
      );
      return;
    }
    case 'sync_push': {
      const device = fixture.devices[randomInt(fixture.devices.length)];
      const studentId = pickRandomStudentId(fixture);
      const operationPayload: SyncPushOperationDto = {
        op_id: randomUUID(),
        entity: 'attendance',
        version: device.next_version,
        payload: {
          action: 'upsert',
          record_id: randomUUID(),
          student_id: studentId,
          attendance_date: randomAttendanceDate(),
          status: pickAttendanceStatus(),
          last_modified_at: new Date().toISOString(),
          notes: `sync-push-${randomUUID().slice(0, 6)}`,
          metadata: {
            source: 'soak-load',
          },
        },
      };
      device.next_version += 1;
      await device.simulator.push([operationPayload]);
      return;
    }
    case 'sync_pull': {
      const device = fixture.devices[randomInt(fixture.devices.length)];
      await device.simulator.pull({
        entities: ['attendance', 'finance'],
        limit: 25,
      });
      return;
    }
    case 'billing_invoice':
      fixture.invoice_counter += 1;
      await runInTenantContext(
        harness,
        fixture.tenant_id,
        () =>
          harness.billingService.createInvoice({
            description: `Soak invoice ${fixture.invoice_counter}`,
            total_amount_minor: randomAmountMinor(),
            billing_phone_number: '254700999001',
            metadata: {
              source: 'soak-load',
              worker_index: workerIndex,
            },
          }),
        {
          method: 'POST',
          path: '/billing/invoices',
        },
      );
      return;
    case 'billing_read':
      await runInTenantContext(
        harness,
        fixture.tenant_id,
        async () => {
          if (fixture.invoice_counter > 0 && Math.random() < 0.5) {
            const invoiceIds = await harness.databaseService.query<{ id: string }>(
              `
                SELECT id
                FROM invoices
                WHERE tenant_id = $1
                ORDER BY created_at DESC
                LIMIT 10
              `,
              [fixture.tenant_id],
            );

            if (invoiceIds.rows[0]) {
              await harness.billingService.getInvoice(invoiceIds.rows[randomInt(invoiceIds.rows.length)].id);
              return;
            }
          }

          await harness.billingService.getCurrentSubscription();
        },
        {
          method: 'GET',
          path: '/billing',
        },
      );
      return;
  }
};

const startSampler = (
  harness: RaceTestHarness,
  queueProbe: Awaited<ReturnType<typeof createSoakQueueProbe>>,
  accumulator: WindowAccumulator,
  eventLoopDelay: ReturnType<typeof monitorEventLoopDelay>,
  samples: SoakSample[],
  startedAtEpochMs: number,
  config: SoakConfig,
): NodeJS.Timeout =>
  setInterval(() => {
    void captureSample(
      harness,
      queueProbe,
      accumulator,
      eventLoopDelay,
      startedAtEpochMs,
      config.sample_interval_ms,
    ).then((sample) => {
      samples.push(sample);
    });
  }, config.sample_interval_ms);

const captureSample = async (
  harness: RaceTestHarness,
  queueProbe: Awaited<ReturnType<typeof createSoakQueueProbe>>,
  accumulator: WindowAccumulator,
  eventLoopDelay: ReturnType<typeof monitorEventLoopDelay>,
  startedAtEpochMs: number,
  sampleIntervalMs: number,
): Promise<SoakSample> => {
  const memoryUsage = process.memoryUsage();
  const queue = await queueProbe.sample();
  const workload = drainAccumulator(accumulator, sampleIntervalMs);
  const eventLoop = {
    mean: roundToTwoDecimals(eventLoopDelay.mean / 1_000_000),
    max: roundToTwoDecimals(eventLoopDelay.max / 1_000_000),
    p95: roundToTwoDecimals(eventLoopDelay.percentile(95) / 1_000_000),
  };
  eventLoopDelay.reset();

  return {
    captured_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAtEpochMs,
    memory_mb: {
      rss: toMegabytes(memoryUsage.rss),
      heap_used: toMegabytes(memoryUsage.heapUsed),
      heap_total: toMegabytes(memoryUsage.heapTotal),
      external: toMegabytes(memoryUsage.external),
      array_buffers: toMegabytes(memoryUsage.arrayBuffers),
    },
    event_loop_ms: eventLoop,
    database_connections: harness.databaseService.getPoolMetrics(),
    queue,
    workload,
  };
};

const analyzeRun = (
  config: SoakConfig,
  fixtures: SoakTenantFixture[],
  samples: SoakSample[],
  startedAt: Date,
  endedAt: Date,
  queueMode: QueueProbeSnapshot['mode'],
): SoakReport => {
  const analyzableSamples = samples.filter((sample) => sample.elapsed_ms >= config.warmup_ms);
  const baselineSamples = analyzableSamples.length > 0 ? analyzableSamples : samples;
  const latencySamples = baselineSamples.filter((sample) => sample.workload.operation_count > 0);
  const failures: SoakFailure[] = [];

  const totalOperations = baselineSamples.reduce(
    (total, sample) => total + sample.workload.operation_count,
    0,
  );
  const successfulOperations = baselineSamples.reduce(
    (total, sample) => total + sample.workload.success_count,
    0,
  );
  const failedOperations = baselineSamples.reduce(
    (total, sample) => total + sample.workload.error_count,
    0,
  );
  const errorRate = totalOperations === 0 ? 0 : failedOperations / totalOperations;
  const peakHeapUsedMb = maxOfSamples(baselineSamples, (sample) => sample.memory_mb.heap_used);
  const peakRssMb = maxOfSamples(baselineSamples, (sample) => sample.memory_mb.rss);
  const peakQueueBacklog = maxOfSamples(baselineSamples, (sample) => sample.queue.pending_backlog);
  const peakDbTotalConnections = maxOfSamples(
    baselineSamples,
    (sample) => sample.database_connections.total_connections,
  );
  const peakDbWaitingRequests = maxOfSamples(
    baselineSamples,
    (sample) => sample.database_connections.waiting_requests,
  );
  const heapSlopeMbPerHour = computeSlopePerHour(
    baselineSamples,
    (sample) => sample.memory_mb.heap_used,
  );
  const rssSlopeMbPerHour = computeSlopePerHour(
    baselineSamples,
    (sample) => sample.memory_mb.rss,
  );
  const analysisDurationHours =
    baselineSamples.length < 2
      ? 0
      : (baselineSamples[baselineSamples.length - 1].elapsed_ms - baselineSamples[0].elapsed_ms) /
        3_600_000;
  const { firstQuartileP95Ms, lastQuartileP95Ms } = computeLatencyQuartiles(latencySamples);
  const latencyGrowthRatio =
    firstQuartileP95Ms <= 0 || lastQuartileP95Ms <= 0
      ? 1
      : lastQuartileP95Ms / firstQuartileP95Ms;
  const latencyP95IncreaseMs =
    firstQuartileP95Ms <= 0 || lastQuartileP95Ms <= 0
      ? 0
      : lastQuartileP95Ms - firstQuartileP95Ms;

  if (
    analysisDurationHours >= config.min_analysis_hours_for_slope_checks &&
    heapSlopeMbPerHour > config.fail_memory_slope_mb_per_hour
  ) {
    failures.push({
      check: 'heap_slope_mb_per_hour',
      message: 'Heap usage is growing faster than the allowed leak threshold',
      observed: roundToTwoDecimals(heapSlopeMbPerHour),
      threshold: config.fail_memory_slope_mb_per_hour,
    });
  }

  if (
    analysisDurationHours >= config.min_analysis_hours_for_slope_checks &&
    rssSlopeMbPerHour > config.fail_rss_slope_mb_per_hour
  ) {
    failures.push({
      check: 'rss_slope_mb_per_hour',
      message: 'RSS growth indicates sustained memory pressure over time',
      observed: roundToTwoDecimals(rssSlopeMbPerHour),
      threshold: config.fail_rss_slope_mb_per_hour,
    });
  }

  if (
    latencyGrowthRatio > config.fail_latency_growth_ratio &&
    latencyP95IncreaseMs > config.fail_latency_p95_increase_ms
  ) {
    failures.push({
      check: 'latency_growth_ratio',
      message: 'p95 latency degraded between the first and last quartiles of the soak run',
      observed: roundToTwoDecimals(latencyGrowthRatio),
      threshold: config.fail_latency_growth_ratio,
    });
  }

  if (peakQueueBacklog > config.fail_queue_backlog) {
    failures.push({
      check: 'peak_queue_backlog',
      message: 'Queue backlog exceeded the tolerated threshold',
      observed: peakQueueBacklog,
      threshold: config.fail_queue_backlog,
    });
  }

  if (peakDbWaitingRequests > config.fail_db_waiting_requests) {
    failures.push({
      check: 'peak_db_waiting_requests',
      message: 'Connection-pool waiters accumulated above the acceptable threshold',
      observed: peakDbWaitingRequests,
      threshold: config.fail_db_waiting_requests,
    });
  }

  if (peakDbTotalConnections > config.fail_db_total_connections) {
    failures.push({
      check: 'peak_db_total_connections',
      message: 'Database connection usage exceeded the allowed threshold',
      observed: peakDbTotalConnections,
      threshold: config.fail_db_total_connections,
    });
  }

  if (errorRate > config.fail_error_rate) {
    failures.push({
      check: 'error_rate',
      message: 'Operation error rate exceeded the configured maximum',
      observed: roundToTwoDecimals(errorRate),
      threshold: config.fail_error_rate,
    });
  }

  return {
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    status: failures.length === 0 ? 'passed' : 'failed',
    config,
    queue_mode: queueMode,
    tenant_ids: fixtures.map((fixture) => fixture.tenant_id),
    summary: {
      total_operations: totalOperations,
      successful_operations: successfulOperations,
      failed_operations: failedOperations,
      error_rate: roundToTwoDecimals(errorRate),
      peak_heap_used_mb: peakHeapUsedMb,
      peak_rss_mb: peakRssMb,
      peak_queue_backlog: peakQueueBacklog,
      peak_db_total_connections: peakDbTotalConnections,
      peak_db_waiting_requests: peakDbWaitingRequests,
      first_quartile_p95_ms: roundToTwoDecimals(firstQuartileP95Ms),
      last_quartile_p95_ms: roundToTwoDecimals(lastQuartileP95Ms),
      latency_growth_ratio: roundToTwoDecimals(latencyGrowthRatio),
      latency_p95_increase_ms: roundToTwoDecimals(latencyP95IncreaseMs),
      heap_slope_mb_per_hour: roundToTwoDecimals(heapSlopeMbPerHour),
      rss_slope_mb_per_hour: roundToTwoDecimals(rssSlopeMbPerHour),
    },
    failures,
    samples,
  };
};

const createWindowAccumulator = (): WindowAccumulator => ({
  operation_count: 0,
  success_count: 0,
  error_count: 0,
  latencies_ms: [],
  per_operation: {
    finance_post: { count: 0, errors: 0 },
    finance_balance: { count: 0, errors: 0 },
    attendance_upsert: { count: 0, errors: 0 },
    attendance_list: { count: 0, errors: 0 },
    sync_push: { count: 0, errors: 0 },
    sync_pull: { count: 0, errors: 0 },
    billing_invoice: { count: 0, errors: 0 },
    billing_read: { count: 0, errors: 0 },
  },
});

const recordOperation = (
  accumulator: WindowAccumulator,
  operation: WorkloadName,
  latencyMs: number,
  succeeded: boolean,
): void => {
  accumulator.operation_count += 1;
  accumulator.latencies_ms.push(latencyMs);
  accumulator.per_operation[operation].count += 1;

  if (succeeded) {
    accumulator.success_count += 1;
    return;
  }

  accumulator.error_count += 1;
  accumulator.per_operation[operation].errors += 1;
};

const drainAccumulator = (
  accumulator: WindowAccumulator,
  sampleIntervalMs: number,
): WindowSummary => {
  const latencies = accumulator.latencies_ms.slice().sort((left, right) => left - right);
  const operationCount = accumulator.operation_count;
  const successCount = accumulator.success_count;
  const errorCount = accumulator.error_count;
  const windowSummary: WindowSummary = {
    operation_count: operationCount,
    success_count: successCount,
    error_count: errorCount,
    error_rate: operationCount === 0 ? 0 : errorCount / operationCount,
    throughput_ops_per_minute:
      sampleIntervalMs <= 0 ? 0 : roundToTwoDecimals((operationCount * 60_000) / sampleIntervalMs),
    latency_ms: {
      min: latencies[0] ? roundToTwoDecimals(latencies[0]) : 0,
      avg:
        latencies.length === 0
          ? 0
          : roundToTwoDecimals(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length === 0 ? 0 : roundToTwoDecimals(latencies[latencies.length - 1]),
    },
    per_operation: accumulator.per_operation,
  };

  accumulator.operation_count = 0;
  accumulator.success_count = 0;
  accumulator.error_count = 0;
  accumulator.latencies_ms = [];
  accumulator.per_operation = createWindowAccumulator().per_operation;

  return windowSummary;
};

const computeLatencyQuartiles = (
  samples: SoakSample[],
): { firstQuartileP95Ms: number; lastQuartileP95Ms: number } => {
  if (samples.length === 0) {
    return { firstQuartileP95Ms: 0, lastQuartileP95Ms: 0 };
  }

  const quartileSize = Math.max(1, Math.floor(samples.length / 4));
  const firstQuartile = samples.slice(0, quartileSize);
  const lastQuartile = samples.slice(-quartileSize);

  return {
    firstQuartileP95Ms: averageOfSamples(firstQuartile, (sample) => sample.workload.latency_ms.p95),
    lastQuartileP95Ms: averageOfSamples(lastQuartile, (sample) => sample.workload.latency_ms.p95),
  };
};

const computeSlopePerHour = (
  samples: SoakSample[],
  valueSelector: (sample: SoakSample) => number,
): number => {
  if (samples.length < 2) {
    return 0;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedHours = (last.elapsed_ms - first.elapsed_ms) / 3_600_000;

  if (elapsedHours <= 0) {
    return 0;
  }

  return (valueSelector(last) - valueSelector(first)) / elapsedHours;
};

const percentile = (values: number[], percentileValue: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * values.length) - 1),
  );
  return roundToTwoDecimals(values[index]);
};

const maxOfSamples = (
  samples: SoakSample[],
  selector: (sample: SoakSample) => number,
): number => samples.reduce((max, sample) => Math.max(max, selector(sample)), 0);

const averageOfSamples = (
  samples: SoakSample[],
  selector: (sample: SoakSample) => number,
): number => {
  if (samples.length === 0) {
    return 0;
  }

  return (
    samples.reduce((sum, sample) => sum + selector(sample), 0) / samples.length
  );
};

const pickWorkload = (): WorkloadName => {
  const roll = Math.random();

  if (roll < 0.22) {
    return 'finance_post';
  }

  if (roll < 0.34) {
    return 'finance_balance';
  }

  if (roll < 0.58) {
    return 'attendance_upsert';
  }

  if (roll < 0.70) {
    return 'attendance_list';
  }

  if (roll < 0.82) {
    return 'sync_push';
  }

  if (roll < 0.92) {
    return 'sync_pull';
  }

  if (roll < 0.97) {
    return 'billing_invoice';
  }

  return 'billing_read';
};

const pickRandomStudentId = (fixture: SoakTenantFixture): string =>
  fixture.student_ids[randomInt(fixture.student_ids.length)];

const pickRandomAccountId = (fixture: SoakTenantFixture): string =>
  Math.random() < 0.5 ? fixture.debit_account_id : fixture.credit_account_id;

const pickAttendanceStatus = (): 'present' | 'absent' | 'late' | 'excused' => {
  const options: Array<'present' | 'absent' | 'late' | 'excused'> = [
    'present',
    'present',
    'absent',
    'late',
    'excused',
  ];

  return options[randomInt(options.length)];
};

const randomAttendanceDate = (): string => {
  const now = new Date();
  const offsetDays = randomInt(30);
  now.setUTCDate(now.getUTCDate() - offsetDays);
  return now.toISOString().slice(0, 10);
};

const todayDate = (): string => new Date().toISOString().slice(0, 10);

const thirtyDaysAgoDate = (): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
};

const randomAmountMinor = Object.assign(
  (): string => {
    const amountMinor = `${(randomInt(5, 250) * 100).toString()}`;
    randomAmountMinor.last_amount_minor = amountMinor;
    return amountMinor;
  },
  {
    last_amount_minor: '1000',
  },
);

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

const parseQueueMode = (
  value: string | undefined,
): 'auto' | 'bullmq' | 'simulated' => {
  if (!value) {
    return 'auto';
  }

  if (value === 'auto' || value === 'bullmq' || value === 'simulated') {
    return value;
  }

  throw new Error(`Unsupported SOAK_QUEUE_MODE "${value}"`);
};

const roundToTwoDecimals = (value: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : value;

const toMegabytes = (value: number): number => roundToTwoDecimals(value / (1024 * 1024));

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
