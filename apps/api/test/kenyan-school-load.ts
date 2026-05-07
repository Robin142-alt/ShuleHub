import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import { SyncPushOperationDto } from '../src/modules/sync/dto/sync-push-operation.dto';
import {
  closeKenyanSchoolLoadHarness,
  createKenyanSchoolLoadHarness,
  KenyanSchoolLoadHarness,
  runInKenyanTenantContext,
} from './support/kenyan-school-load-harness';
import {
  KenyanSchoolProfileDocument,
  KenyanSchoolTenantProfile,
  generateKenyanSchoolProfiles,
} from './support/kenyan-school-profiles';
import {
  SmsBurstQueue,
  SmsBurstQueueSnapshot,
  createSmsBurstQueue,
} from './support/kenyan-school-sms-burst';
import { MpesaMockServer } from './support/mpesa-mock-server';
import { SyncSimulatorDevice } from './support/sync-simulator';

type WorkloadName =
  | 'attendance_online'
  | 'attendance_offline'
  | 'mpesa_payment'
  | 'report_generation'
  | 'sms_burst';

const WORKLOAD_NAMES: WorkloadName[] = [
  'attendance_online',
  'attendance_offline',
  'mpesa_payment',
  'report_generation',
  'sms_burst',
];

type DayPhase = 'morning_peak' | 'evening_peak' | 'school_hours' | 'overnight';
type BusinessContext =
  | 'fee_deadline'
  | 'term_opening'
  | 'term_closing'
  | 'term_break'
  | 'routine';

interface KenyanLoadConfig {
  duration_ms: number;
  concurrency: number;
  tenant_count: number;
  sample_interval_ms: number;
  checkpoint_interval_ms: number;
  warmup_ms: number;
  think_time_min_ms: number;
  think_time_max_ms: number;
  profile_path: string | null;
  generated_profile_output_path: string | null;
  report_path: string | null;
  checkpoint_path: string | null;
  school_year: number;
  profile_seed: string;
  simulated_days_per_run: number;
  virtual_start_iso: string;
  min_seeded_students_per_tenant: number;
  max_seeded_students_per_tenant: number;
  devices_cap_per_tenant: number;
  sms_queue_mode: 'auto' | 'bullmq' | 'simulated';
  sms_worker_concurrency: number;
  fail_error_rate: number;
  fail_sms_backlog: number;
  fail_db_waiting_requests: number;
  fail_db_total_connections: number;
  fail_latency_growth_ratio: number;
  fail_latency_p95_increase_ms: number;
  fail_attendance_morning_share: number;
  fail_payment_evening_share: number;
  fail_payment_deadline_share: number;
  fail_report_term_closing_share: number;
  fail_sms_deadline_share: number;
  fail_workload_starvation_ms: number;
  min_pattern_samples: number;
  preflight_tenant_samples: number;
  force_workload_after_ms: number;
}

interface SeededStudentFixture {
  id: string;
  class_name: string;
  level_code: string;
  stream_name: string;
  monthly_fee_amount_minor: string;
}

interface TenantDeviceFixture {
  simulator: SyncSimulatorDevice;
  next_version: number;
}

interface TenantRuntimeFixture {
  profile: KenyanSchoolTenantProfile;
  students: SeededStudentFixture[];
  devices: TenantDeviceFixture[];
  invoice_counter: number;
  payment_counter: number;
}

interface WindowAccumulator {
  operation_count: number;
  success_count: number;
  error_count: number;
  latencies_ms: number[];
  per_operation: Record<WorkloadName, { count: number; errors: number }>;
}

interface PatternTracker {
  totals: Record<WorkloadName, number>;
  phases: Record<WorkloadName, Record<DayPhase, number>>;
  contexts: Record<WorkloadName, Record<BusinessContext, number>>;
}

interface WorkloadWindowSummary {
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

interface KenyanLoadSample {
  captured_at: string;
  elapsed_ms: number;
  virtual_now: string;
  memory_mb: {
    rss: number;
    heap_used: number;
    heap_total: number;
  };
  event_loop_ms: {
    mean: number;
    max: number;
    p95: number;
  };
  database_connections: ReturnType<KenyanSchoolLoadHarness['databaseService']['getPoolMetrics']>;
  sms_queue: SmsBurstQueueSnapshot;
  workload: WorkloadWindowSummary;
}

interface KenyanLoadFailure {
  check: string;
  message: string;
  observed: number;
  threshold: number;
}

interface KenyanLoadPreflightCheck {
  tenant_id: string;
  workload: WorkloadName;
  duration_ms: number;
  status: 'passed' | 'failed';
  error_message?: string;
}

interface KenyanLoadPreflightReport {
  tenant_samples: number;
  duration_ms: number;
  checks: KenyanLoadPreflightCheck[];
}

interface CoverageTrackerState {
  attempts: number;
  successes: number;
  forced_selections: number;
  last_seen_elapsed_ms: number | null;
  max_gap_ms: number;
}

type CoverageTracker = Record<WorkloadName, CoverageTrackerState>;

interface KenyanLoadCoverageSummary {
  force_after_ms: number;
  fail_starvation_ms: number;
  workloads: Record<WorkloadName, CoverageTrackerState>;
}

interface KenyanLoadCheckpointSummary {
  path: string | null;
  interval_ms: number;
  writes: number;
  last_written_at: string | null;
}

interface KenyanLoadCheckpointState {
  writes: number;
  last_written_at: string | null;
  last_written_elapsed_ms: number;
}

interface KenyanLoadCheckpointArtifact {
  kind: 'kenyan_school_load_checkpoint';
  started_at: string;
  captured_at: string;
  elapsed_ms: number;
  progress_ratio: number;
  status: 'running';
  config: {
    duration_ms: number;
    concurrency: number;
    tenant_count: number;
    sample_interval_ms: number;
    checkpoint_interval_ms: number;
    force_workload_after_ms: number;
    fail_workload_starvation_ms: number;
  };
  seeded: {
    tenant_count: number;
    student_count: number;
    device_count: number;
  };
  preflight: KenyanLoadPreflightReport;
  checkpoints: KenyanLoadCheckpointSummary;
  coverage: KenyanLoadCoverageSummary;
  latest_sample: KenyanLoadSample;
  sample_count: number;
}

interface KenyanLoadReport {
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: 'passed' | 'failed';
  config: KenyanLoadConfig;
  profile_summary: KenyanSchoolProfileDocument['summary'];
  seeded: {
    tenant_count: number;
    student_count: number;
    device_count: number;
  };
  sms_queue_mode: SmsBurstQueueSnapshot['mode'];
  preflight: KenyanLoadPreflightReport;
  checkpoints: KenyanLoadCheckpointSummary;
  coverage: KenyanLoadCoverageSummary;
  summary: {
    total_operations: number;
    successful_operations: number;
    failed_operations: number;
    error_rate: number;
    peak_sms_backlog: number;
    peak_db_total_connections: number;
    peak_db_waiting_requests: number;
    first_quartile_p95_ms: number;
    last_quartile_p95_ms: number;
    latency_growth_ratio: number;
    latency_p95_increase_ms: number;
  };
  realism: {
    attendance_morning_share: number;
    payment_evening_share: number;
    payment_deadline_share: number;
    report_term_closing_share: number;
    sms_deadline_share: number;
    totals: PatternTracker['totals'];
  };
  failures: KenyanLoadFailure[];
  samples: KenyanLoadSample[];
}

const main = async (): Promise<void> => {
  const config = parseConfig();
  const profileDocument = await loadOrGenerateProfiles(config);
  const selectedProfiles = profileDocument.profiles.slice(0, config.tenant_count);
  const callbackSecret = process.env.MPESA_CALLBACK_SECRET ?? 'kenyan-school-load-secret';
  const mpesaMockServer = new MpesaMockServer(callbackSecret);
  await mpesaMockServer.start();

  const harness = await createKenyanSchoolLoadHarness({
    mpesaBaseUrl: mpesaMockServer.baseUrl,
  });
  const smsQueue = await createSmsBurstQueue({
    mode: config.sms_queue_mode,
    queue_name: 'kenyan-school-sms',
    prefix: 'shule-hub-kenyan-school',
    worker_concurrency: config.sms_worker_concurrency,
    per_message_processing_ms: { min: 8, max: 35 },
  });
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  const accumulator = createWindowAccumulator();
  const patternTracker = createPatternTracker();
  const coverageTracker = createCoverageTracker();
  const checkpointState = createCheckpointState();
  const samples: KenyanLoadSample[] = [];

  try {
    eventLoopDelay.enable();
    const fixtures = await seedFixtures(harness, selectedProfiles, config);
    const preflight = await runCoveragePreflight(
      harness,
      mpesaMockServer,
      smsQueue,
      fixtures,
      config,
    );
    const startedAt = new Date();
    const startedAtEpochMs = startedAt.getTime();
    const deadline = Date.now() + config.duration_ms;
    const sampler = startSampler(
      harness,
      smsQueue,
      accumulator,
      eventLoopDelay,
      samples,
      startedAtEpochMs,
      startedAt.toISOString(),
      fixtures,
      preflight,
      coverageTracker,
      checkpointState,
      config,
    );
    const samplerStopHandle = setTimeout(() => {
      clearInterval(sampler);
    }, config.duration_ms);
    const workers = Array.from({ length: config.concurrency }, (_, workerIndex) =>
      runWorkerLoop(
        harness,
        mpesaMockServer,
        smsQueue,
        fixtures,
        accumulator,
        patternTracker,
        coverageTracker,
        startedAtEpochMs,
        deadline,
        config,
        workerIndex,
      ),
    );

    await Promise.all(workers);
    clearTimeout(samplerStopHandle);
    clearInterval(sampler);

    const finalSample = await captureSample(
      harness,
      smsQueue,
      accumulator,
      eventLoopDelay,
      startedAtEpochMs,
      config.sample_interval_ms,
      config,
    );

    if (finalSample.workload.operation_count > 0) {
      samples.push(finalSample);
    }

    await maybeWriteCheckpoint(
      finalSample,
      startedAt.toISOString(),
      fixtures,
      preflight,
      coverageTracker,
      checkpointState,
      samples.length,
      config,
      true,
    );

    const report = analyzeRun(
      config,
      profileDocument,
      fixtures,
      preflight,
      patternTracker,
      coverageTracker,
      checkpointState,
      samples,
      startedAt,
      new Date(),
      smsQueue.mode,
    );

    if (config.report_path) {
      const resolvedPath = path.resolve(config.report_path);
      await mkdir(path.dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (report.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    eventLoopDelay.disable();
    await smsQueue.stop();
    await closeKenyanSchoolLoadHarness(harness);
    await mpesaMockServer.stop();
  }
};

const parseConfig = (): KenyanLoadConfig => {
  const durationMinutes = parsePositiveNumber(
    process.env.KENYA_DURATION_MINUTES,
    24 * 60,
  );
  const thinkTimeMinMs = parsePositiveNumber(process.env.KENYA_THINK_TIME_MIN_MS, 20);
  const thinkTimeMaxMs = parsePositiveNumber(process.env.KENYA_THINK_TIME_MAX_MS, 140);

  if (thinkTimeMaxMs < thinkTimeMinMs) {
    throw new Error('KENYA_THINK_TIME_MAX_MS must be greater than or equal to KENYA_THINK_TIME_MIN_MS');
  }

  return {
    duration_ms: Math.round(durationMinutes * 60_000),
    concurrency: parseInteger(process.env.KENYA_CONCURRENCY, 48, 1, 1000),
    tenant_count: parseInteger(process.env.KENYA_TENANTS, 1000, 1, 10000),
    sample_interval_ms: parseInteger(process.env.KENYA_SAMPLE_INTERVAL_MS, 30_000, 1000, 300_000),
    checkpoint_interval_ms: parseInteger(
      process.env.KENYA_CHECKPOINT_INTERVAL_MS,
      300_000,
      1000,
      3_600_000,
    ),
    warmup_ms: Math.round(parsePositiveNumber(process.env.KENYA_WARMUP_MINUTES, 5) * 60_000),
    think_time_min_ms: thinkTimeMinMs,
    think_time_max_ms: thinkTimeMaxMs,
    profile_path: process.env.KENYA_PROFILE_PATH?.trim() || null,
    generated_profile_output_path:
      process.env.KENYA_PROFILE_OUTPUT_PATH?.trim()
      || path.join(process.cwd(), 'artifacts', 'kenyan-school-profiles.json'),
    report_path:
      process.env.KENYA_REPORT_PATH?.trim()
      || path.join(process.cwd(), 'artifacts', 'kenyan-school-load-report.json'),
    checkpoint_path:
      process.env.KENYA_CHECKPOINT_PATH?.trim()
      || path.join(process.cwd(), 'artifacts', 'kenyan-school-load-checkpoint.json'),
    school_year: parseInteger(process.env.KENYA_SCHOOL_YEAR, new Date().getUTCFullYear(), 2020, 2100),
    profile_seed: process.env.KENYA_PROFILE_SEED?.trim() || 'kenyan-school-load-2026',
    simulated_days_per_run: parsePositiveNumber(process.env.KENYA_SIMULATED_DAYS_PER_RUN, 330),
    virtual_start_iso:
      process.env.KENYA_VIRTUAL_START_ISO
      || `${new Date().getUTCFullYear()}-01-06T04:00:00.000Z`,
    min_seeded_students_per_tenant: parseInteger(
      process.env.KENYA_MIN_SEEDED_STUDENTS_PER_TENANT,
      24,
      1,
      2000,
    ),
    max_seeded_students_per_tenant: parseInteger(
      process.env.KENYA_MAX_SEEDED_STUDENTS_PER_TENANT,
      96,
      1,
      2000,
    ),
    devices_cap_per_tenant: parseInteger(process.env.KENYA_DEVICES_CAP_PER_TENANT, 12, 1, 200),
    sms_queue_mode: parseQueueMode(process.env.KENYA_SMS_QUEUE_MODE),
    sms_worker_concurrency: parseInteger(
      process.env.KENYA_SMS_WORKER_CONCURRENCY,
      32,
      1,
      1000,
    ),
    fail_error_rate: parsePositiveNumber(process.env.KENYA_FAIL_ERROR_RATE, 0.03),
    fail_sms_backlog: parsePositiveNumber(process.env.KENYA_FAIL_SMS_BACKLOG, 1500),
    fail_db_waiting_requests: parsePositiveNumber(
      process.env.KENYA_FAIL_DB_WAITING_REQUESTS,
      15,
    ),
    fail_db_total_connections: parsePositiveNumber(
      process.env.KENYA_FAIL_DB_TOTAL_CONNECTIONS,
      40,
    ),
    fail_latency_growth_ratio: parsePositiveNumber(
      process.env.KENYA_FAIL_LATENCY_GROWTH_RATIO,
      2.5,
    ),
    fail_latency_p95_increase_ms: parsePositiveNumber(
      process.env.KENYA_FAIL_LATENCY_P95_INCREASE_MS,
      100,
    ),
    fail_attendance_morning_share: parsePositiveNumber(
      process.env.KENYA_FAIL_ATTENDANCE_MORNING_SHARE,
      0.4,
    ),
    fail_payment_evening_share: parsePositiveNumber(
      process.env.KENYA_FAIL_PAYMENT_EVENING_SHARE,
      0.28,
    ),
    fail_payment_deadline_share: parsePositiveNumber(
      process.env.KENYA_FAIL_PAYMENT_DEADLINE_SHARE,
      0.16,
    ),
    fail_report_term_closing_share: parsePositiveNumber(
      process.env.KENYA_FAIL_REPORT_TERM_CLOSING_SHARE,
      0.22,
    ),
    fail_sms_deadline_share: parsePositiveNumber(
      process.env.KENYA_FAIL_SMS_DEADLINE_SHARE,
      0.42,
    ),
    fail_workload_starvation_ms: parsePositiveNumber(
      process.env.KENYA_FAIL_WORKLOAD_STARVATION_MS,
      60 * 60 * 1000,
    ),
    min_pattern_samples: parseInteger(process.env.KENYA_MIN_PATTERN_SAMPLES, 25, 1, 1000000),
    preflight_tenant_samples: parseInteger(process.env.KENYA_PREFLIGHT_TENANT_SAMPLES, 3, 1, 25),
    force_workload_after_ms: parsePositiveNumber(
      process.env.KENYA_FORCE_WORKLOAD_AFTER_MS,
      20 * 60 * 1000,
    ),
  };
};

const loadOrGenerateProfiles = async (
  config: KenyanLoadConfig,
): Promise<KenyanSchoolProfileDocument> => {
  if (config.profile_path) {
    const fileContents = await readFile(path.resolve(config.profile_path), 'utf8');
    return JSON.parse(fileContents) as KenyanSchoolProfileDocument;
  }

  const document = generateKenyanSchoolProfiles({
    tenant_count: config.tenant_count,
    min_students: 300,
    max_students: 2000,
    min_teachers: 20,
    max_teachers: 80,
    school_year: config.school_year,
    seed: config.profile_seed,
  });

  if (config.generated_profile_output_path) {
    const resolvedPath = path.resolve(config.generated_profile_output_path);
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(resolvedPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }

  return document;
};

const seedFixtures = async (
  harness: KenyanSchoolLoadHarness,
  profiles: KenyanSchoolTenantProfile[],
  config: KenyanLoadConfig,
): Promise<TenantRuntimeFixture[]> => {
  const fixtures: TenantRuntimeFixture[] = [];
  const runSuffix = randomUUID().replace(/-/g, '').slice(0, 6);

  for (const [profileIndex, profile] of profiles.entries()) {
    const runtimeTenantId = buildRuntimeTenantId(profile.tenant_id, runSuffix, profileIndex + 1);
    const runtimeProfile: KenyanSchoolTenantProfile = {
      ...profile,
      tenant_id: runtimeTenantId,
      subdomain: runtimeTenantId,
      metadata: {
        ...profile.metadata,
        source_profile_tenant_id: profile.tenant_id,
        runtime_tenant_id: runtimeTenantId,
      },
    };

    await runInKenyanTenantContext(
      harness,
      runtimeProfile.tenant_id,
      () =>
        harness.billingService.createSubscription({
          plan_code: runtimeProfile.plan_code,
          status: 'active',
          billing_phone_number: buildPhoneNumber(runtimeProfile, 0),
          seats_allocated: Math.max(runtimeProfile.teacher_count + 8, 32),
          metadata: {
            seeded_by: 'kenyan-school-load',
            school_name: runtimeProfile.school_name,
            county: runtimeProfile.county,
          },
        }),
      {
        method: 'POST',
        path: '/billing/subscriptions',
      },
    );

    await ensureTenantFinanceAccounts(harness, runtimeProfile.tenant_id);
    const students = await seedStudentsForTenant(harness, runtimeProfile, config);
    const deviceCount = clamp(
      Math.max(2, Math.ceil(runtimeProfile.devices_count / 6)),
      2,
      config.devices_cap_per_tenant,
    );
    const devices = Array.from({ length: deviceCount }, (_, deviceIndex) => ({
      simulator: new SyncSimulatorDevice(
        harness as never,
        runtimeProfile.tenant_id,
        `kenya-device-${runtimeProfile.tenant_id}-${deviceIndex + 1}`,
      ),
      next_version: 1,
    }));

    fixtures.push({
      profile: runtimeProfile,
      students,
      devices,
      invoice_counter: 0,
      payment_counter: 0,
    });
  }

  return fixtures;
};

const runCoveragePreflight = async (
  harness: KenyanSchoolLoadHarness,
  mpesaMockServer: MpesaMockServer,
  smsQueue: SmsBurstQueue,
  fixtures: TenantRuntimeFixture[],
  config: KenyanLoadConfig,
): Promise<KenyanLoadPreflightReport> => {
  const startedAt = performance.now();
  const checks: KenyanLoadPreflightCheck[] = [];
  const sampledFixtures = fixtures.slice(0, Math.min(fixtures.length, config.preflight_tenant_samples));

  for (const fixture of sampledFixtures) {
    const attendanceDate = buildTermOpeningMorningDate(fixture.profile);
    const offlineDate = addHours(attendanceDate, 1);
    const reportDate = buildTermClosingReportDate(fixture.profile);
    const paymentDate = buildFeeDeadlineEveningDate(fixture.profile);
    const smsDate = addMinutes(paymentDate, 15);
    const smsSignal = describeWorkloadWindow(fixture.profile, smsDate);

    checks.push(await runPreflightCheck(fixture.profile.tenant_id, 'attendance_online', () =>
      executeOnlineAttendance(harness, fixture, attendanceDate),
    ));
    checks.push(await runPreflightCheck(fixture.profile.tenant_id, 'attendance_offline', () =>
      executeOfflineAttendance(harness, fixture, offlineDate),
    ));
    checks.push(await runPreflightCheck(fixture.profile.tenant_id, 'report_generation', () =>
      executeReportGeneration(harness, fixture, reportDate),
    ));
    checks.push(await runPreflightCheck(fixture.profile.tenant_id, 'sms_burst', () =>
      executeSmsBurst(smsQueue, fixture, smsSignal, smsDate),
    ));
    checks.push(await runPreflightCheck(fixture.profile.tenant_id, 'mpesa_payment', () =>
      executeMpesaPayment(harness, mpesaMockServer, fixture, paymentDate, 0),
    ));
  }

  return {
    tenant_samples: sampledFixtures.length,
    duration_ms: roundToTwoDecimals(performance.now() - startedAt),
    checks,
  };
};

const runPreflightCheck = async (
  tenantId: string,
  workload: WorkloadName,
  callback: () => Promise<void>,
): Promise<KenyanLoadPreflightCheck> => {
  const startedAt = performance.now();

  try {
    await callback();

    return {
      tenant_id: tenantId,
      workload,
      duration_ms: roundToTwoDecimals(performance.now() - startedAt),
      status: 'passed',
    };
  } catch (error) {
    return {
      tenant_id: tenantId,
      workload,
      duration_ms: roundToTwoDecimals(performance.now() - startedAt),
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
};

const runWorkerLoop = async (
  harness: KenyanSchoolLoadHarness,
  mpesaMockServer: MpesaMockServer,
  smsQueue: SmsBurstQueue,
  fixtures: TenantRuntimeFixture[],
  accumulator: WindowAccumulator,
  patternTracker: PatternTracker,
  coverageTracker: CoverageTracker,
  startedAtEpochMs: number,
  deadline: number,
  config: KenyanLoadConfig,
  workerIndex: number,
): Promise<void> => {
  while (Date.now() < deadline) {
    const nowEpochMs = Date.now();
    const elapsedMs = nowEpochMs - startedAtEpochMs;
    const virtualNow = deriveVirtualNow(config, startedAtEpochMs, nowEpochMs);
    const fixture = pickTenantFixture(fixtures);
    const signal = describeWorkloadWindow(fixture.profile, virtualNow);
    const forcedWorkload = pickStarvedWorkload(
      coverageTracker,
      elapsedMs,
      config.force_workload_after_ms,
    );
    const workload = forcedWorkload ?? pickWorkload(signal, fixture, workerIndex);
    recordCoverageAttempt(coverageTracker, workload, elapsedMs, forcedWorkload === workload);
    const startedAt = performance.now();

    try {
      await executeWorkload(
        harness,
        mpesaMockServer,
        smsQueue,
        fixture,
        workload,
        signal,
        virtualNow,
        workerIndex,
      );
      recordOperation(accumulator, workload, performance.now() - startedAt, true);
      recordPattern(patternTracker, workload, signal);
      recordCoverageSuccess(coverageTracker, workload);
    } catch (error) {
      recordOperation(accumulator, workload, performance.now() - startedAt, false);

      if (process.env.KENYA_LOG_ERRORS === '1') {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        process.stderr.write(
          `[kenyan-school-load] workload=${workload} tenant=${fixture.profile.tenant_id} error=${message}\n`,
        );
      }
    }

    const thinkDelay = computeThinkDelay(config, signal);
    await sleep(thinkDelay);
  }
};

const executeWorkload = async (
  harness: KenyanSchoolLoadHarness,
  mpesaMockServer: MpesaMockServer,
  smsQueue: SmsBurstQueue,
  fixture: TenantRuntimeFixture,
  workload: WorkloadName,
  signal: ReturnType<typeof describeWorkloadWindow>,
  virtualNow: Date,
  workerIndex: number,
): Promise<void> => {
  switch (workload) {
    case 'attendance_online':
      await executeOnlineAttendance(harness, fixture, virtualNow);
      return;
    case 'attendance_offline':
      await executeOfflineAttendance(harness, fixture, virtualNow);
      return;
    case 'mpesa_payment':
      await executeMpesaPayment(harness, mpesaMockServer, fixture, virtualNow, workerIndex);
      return;
    case 'report_generation':
      await executeReportGeneration(harness, fixture, virtualNow);
      return;
    case 'sms_burst':
      await executeSmsBurst(smsQueue, fixture, signal, virtualNow);
      return;
  }
};

const executeOnlineAttendance = async (
  harness: KenyanSchoolLoadHarness,
  fixture: TenantRuntimeFixture,
  virtualNow: Date,
): Promise<void> => {
  const student = pickOne(fixture.students);

  await runInKenyanTenantContext(
    harness,
    fixture.profile.tenant_id,
    () =>
      harness.attendanceService.upsertStudentAttendance(
        student.id,
        formatDateOnly(virtualNow),
        {
          status: pickAttendanceStatus(),
          last_modified_at: virtualNow.toISOString(),
          notes: `register-${student.class_name}`,
          metadata: {
            source: 'kenyan-school-load',
            class_name: student.class_name,
            stream_name: student.stream_name,
          },
        },
      ),
    {
      method: 'PUT',
      path: `/students/${student.id}/attendance/${formatDateOnly(virtualNow)}`,
      user_agent: 'kenyan-school-load:attendance-online',
    },
  );
};

const executeOfflineAttendance = async (
  harness: KenyanSchoolLoadHarness,
  fixture: TenantRuntimeFixture,
  virtualNow: Date,
): Promise<void> => {
  const student = pickOne(fixture.students);
  const device = pickOne(fixture.devices);
  const operation: SyncPushOperationDto = {
    op_id: randomUUID(),
    entity: 'attendance',
    version: device.next_version,
    payload: {
      action: 'upsert',
      record_id: randomUUID(),
      student_id: student.id,
      attendance_date: formatDateOnly(virtualNow),
      status: pickAttendanceStatus(),
      last_modified_at: virtualNow.toISOString(),
      notes: `offline-${student.stream_name}`,
      metadata: {
        source: 'kenyan-school-load',
        class_name: student.class_name,
        stream_name: student.stream_name,
      },
    },
  };
  device.next_version += 1;
  await device.simulator.push([operation]);

  if (Math.random() < 0.35) {
    await device.simulator.pull({
      entities: ['attendance', 'finance'],
      limit: 25,
    });
  }
};

const executeMpesaPayment = async (
  harness: KenyanSchoolLoadHarness,
  mpesaMockServer: MpesaMockServer,
  fixture: TenantRuntimeFixture,
  virtualNow: Date,
  workerIndex: number,
): Promise<void> => {
  const student = pickOne(fixture.students);
  const phoneNumber = buildPhoneNumber(fixture.profile, fixture.payment_counter + workerIndex + 1);
  fixture.invoice_counter += 1;
  fixture.payment_counter += 1;

  const invoice = await runInKenyanTenantContext(
    harness,
    fixture.profile.tenant_id,
    () =>
      harness.billingService.createInvoice({
        description: `School fees ${student.class_name} invoice ${fixture.invoice_counter}`,
        total_amount_minor: student.monthly_fee_amount_minor,
        billing_phone_number: phoneNumber,
        metadata: {
          source: 'kenyan-school-load',
          class_name: student.class_name,
          student_id: student.id,
          simulated_date: formatDateOnly(virtualNow),
        },
      }),
    {
      method: 'POST',
      path: '/billing/invoices',
      user_agent: 'kenyan-school-load:invoice',
    },
  );

  const merchantRequestId = `merchant-${randomUUID().slice(0, 12)}`;
  const checkoutRequestId = `checkout-${randomUUID().slice(0, 12)}`;
  mpesaMockServer.enqueueScenario({
    type: 'accepted',
    tenant_id: fixture.profile.tenant_id,
    merchant_request_id: merchantRequestId,
    checkout_request_id: checkoutRequestId,
    callbacks: [],
    response_delay_ms: randomInt(20, 90),
  });

  const payableInvoice = await runInKenyanTenantContext(
    harness,
    fixture.profile.tenant_id,
    () =>
      harness.billingMpesaService.createInvoicePaymentIntent(invoice.id, {
        idempotency_key: `kenya-mpesa:${fixture.profile.tenant_id}:${fixture.payment_counter}`,
        phone_number: phoneNumber,
      }),
    {
      method: 'POST',
      path: `/billing/invoices/${invoice.id}/pay`,
      user_agent: 'kenyan-school-load:mpesa',
    },
  );

  const paymentIntentRow = await runInKenyanTenantContext(
    harness,
    fixture.profile.tenant_id,
    async () => {
      const result = await harness.databaseService.query<{
        merchant_request_id: string;
        checkout_request_id: string;
      }>(
        `
          SELECT
            merchant_request_id,
            checkout_request_id
          FROM payment_intents
          WHERE tenant_id = $1
            AND id = $2::uuid
          LIMIT 1
        `,
        [fixture.profile.tenant_id, payableInvoice.payment_intent_id],
      );

      if (!result.rows[0]) {
        throw new Error(`Payment intent "${payableInvoice.payment_intent_id}" was not found`);
      }

      return result.rows[0];
    },
    {
      method: 'GET',
      path: `/billing/invoices/${invoice.id}`,
    },
  );

  await sleep(randomInt(20, 180));
  const callbackPayload = buildSuccessfulCallbackPayload({
    merchant_request_id: paymentIntentRow.merchant_request_id,
    checkout_request_id: paymentIntentRow.checkout_request_id,
    amount_minor: student.monthly_fee_amount_minor,
    phone_number: phoneNumber,
    virtual_now: virtualNow,
  });
  const callbackLog = await runInKenyanTenantContext(
    harness,
    fixture.profile.tenant_id,
    () =>
      harness.callbackLogsRepository.createLog({
        tenant_id: fixture.profile.tenant_id,
        merchant_request_id: paymentIntentRow.merchant_request_id,
        checkout_request_id: paymentIntentRow.checkout_request_id,
        delivery_id: `delivery-${randomUUID().slice(0, 10)}`,
        request_fingerprint: randomUUID().replace(/-/g, ''),
        event_timestamp: virtualNow.toISOString(),
        signature: 'simulated-valid-signature',
        signature_verified: true,
        headers: {
          'content-type': 'application/json',
          'x-kenyan-school-load': 'true',
        },
        raw_body: JSON.stringify(callbackPayload),
        raw_payload: callbackPayload,
        source_ip: '127.0.0.1',
      }),
    {
      method: 'POST',
      path: '/payments/mpesa/callback',
      user_agent: 'kenyan-school-load:mpesa-callback',
    },
  );

  await harness.mpesaCallbackProcessorService.process({
    callback_log_id: callbackLog.id,
    tenant_id: fixture.profile.tenant_id,
    request_id: `kenya-mpesa-callback:${randomUUID()}`,
  });
};

const executeReportGeneration = async (
  harness: KenyanSchoolLoadHarness,
  fixture: TenantRuntimeFixture,
  virtualNow: Date,
): Promise<void> => {
  await runInKenyanTenantContext(
    harness,
    fixture.profile.tenant_id,
    async () => {
      await harness.databaseService.query(
        `
          SELECT
            students.metadata ->> 'level_code' AS level_code,
            students.metadata ->> 'stream_name' AS stream_name,
            COUNT(students.id)::int AS active_students,
            COUNT(attendance_records.id) FILTER (
              WHERE attendance_records.attendance_date = $2::date
                AND attendance_records.status = 'present'
            )::int AS present_today
          FROM students
          LEFT JOIN attendance_records
            ON attendance_records.tenant_id = students.tenant_id
           AND attendance_records.student_id = students.id
           AND attendance_records.attendance_date >= $3::date
          WHERE students.tenant_id = $1
            AND students.status = 'active'
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
          LIMIT 60
        `,
        [
          fixture.profile.tenant_id,
          formatDateOnly(virtualNow),
          addDays(formatDateOnly(virtualNow), -14),
        ],
      );
      await harness.databaseService.query(
        `
          SELECT
            invoices.status,
            COUNT(invoices.id)::int AS invoice_count,
            COALESCE(SUM(invoices.total_amount_minor), 0)::bigint AS total_amount_minor,
            COALESCE(SUM(invoices.amount_paid_minor), 0)::bigint AS amount_paid_minor
          FROM invoices
          WHERE invoices.tenant_id = $1
            AND invoices.created_at >= $2::timestamptz
          GROUP BY invoices.status
          ORDER BY invoices.status ASC
        `,
        [
          fixture.profile.tenant_id,
          new Date(virtualNow.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        ],
      );
    },
    {
      method: 'GET',
      path: '/reports/daily',
      user_agent: 'kenyan-school-load:reports',
    },
  );
};

const executeSmsBurst = async (
  smsQueue: SmsBurstQueue,
  fixture: TenantRuntimeFixture,
  signal: ReturnType<typeof describeWorkloadWindow>,
  virtualNow: Date,
): Promise<void> => {
  const baseRecipients = Math.max(
    30,
    Math.round(fixture.profile.student_count * fixture.profile.sms_opt_in_ratio * 0.06),
  );
  const recipients = clamp(
    Math.round(baseRecipients * signal.intensity_multiplier),
    20,
    2000,
  );

  await smsQueue.enqueueBurst({
    tenant_id: fixture.profile.tenant_id,
    burst_type: `${signal.business_context}:${signal.day_phase}`,
    recipients,
    virtual_timestamp: virtualNow.toISOString(),
  });
};

const ensureTenantFinanceAccounts = async (
  harness: KenyanSchoolLoadHarness,
  tenantId: string,
): Promise<void> => {
  await runInKenyanTenantContext(harness, tenantId, () =>
    harness.databaseService.query(
      `
        INSERT INTO accounts (
          tenant_id,
          code,
          name,
          category,
          normal_balance,
          currency_code,
          allow_manual_entries,
          is_active,
          metadata
        )
        VALUES
          ($1, '1100-MPESA-CLEARING', 'MPESA Clearing', 'asset', 'debit', 'KES', TRUE, TRUE, '{"seed":"kenyan-school-load"}'::jsonb),
          ($1, '2100-CUSTOMER-DEPOSITS', 'Customer Deposits', 'liability', 'credit', 'KES', TRUE, TRUE, '{"seed":"kenyan-school-load"}'::jsonb)
        ON CONFLICT (tenant_id, code)
        DO NOTHING
      `,
      [tenantId],
    ),
  );
};

const seedStudentsForTenant = async (
  harness: KenyanSchoolLoadHarness,
  profile: KenyanSchoolTenantProfile,
  config: KenyanLoadConfig,
): Promise<SeededStudentFixture[]> => {
  const targetStudentCount = clamp(
    Math.min(profile.student_count, config.max_seeded_students_per_tenant),
    Math.min(config.min_seeded_students_per_tenant, profile.student_count),
    config.max_seeded_students_per_tenant,
  );
  const fixtures: SeededStudentFixture[] = [];

  for (let index = 0; index < targetStudentCount; index += 1) {
    const classProfile = profile.classes[index % profile.classes.length];
    const student = await runInKenyanTenantContext(
      harness,
      profile.tenant_id,
      () =>
        harness.studentsRepository.createStudent({
          tenant_id: profile.tenant_id,
          admission_number: `${profile.subdomain.slice(0, 12).toUpperCase()}-${(index + 1).toString().padStart(5, '0')}`,
          first_name: `Student${(index % 120) + 1}`,
          last_name: classProfile.level_code.replace(/\s+/g, ''),
          middle_name: null,
          status: 'active',
          date_of_birth: null,
          gender: index % 2 === 0 ? 'female' : 'male',
          primary_guardian_name: `Guardian ${index + 1}`,
          primary_guardian_phone: buildPhoneNumber(profile, index + 1),
          metadata: {
            source: 'kenyan-school-load',
            class_name: classProfile.class_name,
            level_code: classProfile.level_code,
            stream_name: classProfile.stream_name,
            profile_student_count: profile.student_count,
          },
          created_by_user_id: null,
        }),
      {
        method: 'POST',
        path: '/students',
      },
    );

    fixtures.push({
      id: student.id,
      class_name: classProfile.class_name,
      level_code: classProfile.level_code,
      stream_name: classProfile.stream_name,
      monthly_fee_amount_minor: classProfile.monthly_fee_amount_minor,
    });
  }

  return fixtures;
};

const startSampler = (
  harness: KenyanSchoolLoadHarness,
  smsQueue: SmsBurstQueue,
  accumulator: WindowAccumulator,
  eventLoopDelay: ReturnType<typeof monitorEventLoopDelay>,
  samples: KenyanLoadSample[],
  startedAtEpochMs: number,
  startedAtIso: string,
  fixtures: TenantRuntimeFixture[],
  preflight: KenyanLoadPreflightReport,
  coverageTracker: CoverageTracker,
  checkpointState: KenyanLoadCheckpointState,
  config: KenyanLoadConfig,
): NodeJS.Timeout => {
  let samplingInFlight = false;

  return setInterval(() => {
    if (samplingInFlight) {
      return;
    }

    samplingInFlight = true;

    void captureSample(
      harness,
      smsQueue,
      accumulator,
      eventLoopDelay,
      startedAtEpochMs,
      config.sample_interval_ms,
      config,
    )
      .then(async (sample) => {
        samples.push(sample);
        await maybeWriteCheckpoint(
          sample,
          startedAtIso,
          fixtures,
          preflight,
          coverageTracker,
          checkpointState,
          samples.length,
          config,
          false,
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        process.stderr.write(`[kenyan-school-load] sampler_error=${message}\n`);
      })
      .finally(() => {
        samplingInFlight = false;
      });
  }, config.sample_interval_ms);
};

const captureSample = async (
  harness: KenyanSchoolLoadHarness,
  smsQueue: SmsBurstQueue,
  accumulator: WindowAccumulator,
  eventLoopDelay: ReturnType<typeof monitorEventLoopDelay>,
  startedAtEpochMs: number,
  sampleIntervalMs: number,
  config: KenyanLoadConfig,
): Promise<KenyanLoadSample> => {
  const memoryUsage = process.memoryUsage();
  const smsQueueSnapshot = await smsQueue.sample();
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
    virtual_now: deriveVirtualNow(config, startedAtEpochMs, Date.now()).toISOString(),
    memory_mb: {
      rss: toMegabytes(memoryUsage.rss),
      heap_used: toMegabytes(memoryUsage.heapUsed),
      heap_total: toMegabytes(memoryUsage.heapTotal),
    },
    event_loop_ms: eventLoop,
    database_connections: harness.databaseService.getPoolMetrics(),
    sms_queue: smsQueueSnapshot,
    workload,
  };
};

const analyzeRun = (
  config: KenyanLoadConfig,
  profileDocument: KenyanSchoolProfileDocument,
  fixtures: TenantRuntimeFixture[],
  preflight: KenyanLoadPreflightReport,
  patternTracker: PatternTracker,
  coverageTracker: CoverageTracker,
  checkpointState: KenyanLoadCheckpointState,
  samples: KenyanLoadSample[],
  startedAt: Date,
  endedAt: Date,
  smsQueueMode: SmsBurstQueueSnapshot['mode'],
): KenyanLoadReport => {
  const wallClockDurationMs = endedAt.getTime() - startedAt.getTime();
  const measuredDurationMs = Math.min(wallClockDurationMs, config.duration_ms);
  const measuredSamples = samples.filter((sample) => sample.elapsed_ms <= measuredDurationMs);
  const sampleWindow = measuredSamples.length > 0 ? measuredSamples : samples;
  const analyzableSamples = sampleWindow.filter((sample) => sample.elapsed_ms >= config.warmup_ms);
  const baselineSamples = analyzableSamples.length > 0 ? analyzableSamples : sampleWindow;
  const latencySamples = baselineSamples.filter((sample) => sample.workload.operation_count > 0);
  const totalOperations = baselineSamples.reduce(
    (sum, sample) => sum + sample.workload.operation_count,
    0,
  );
  const successfulOperations = baselineSamples.reduce(
    (sum, sample) => sum + sample.workload.success_count,
    0,
  );
  const failedOperations = baselineSamples.reduce(
    (sum, sample) => sum + sample.workload.error_count,
    0,
  );
  const errorRate = totalOperations === 0 ? 0 : failedOperations / totalOperations;
  const peakSmsBacklog = maxOfSamples(
    baselineSamples,
    (sample) => sample.sms_queue.pending_backlog,
  );
  const peakDbWaitingRequests = maxOfSamples(
    baselineSamples,
    (sample) => sample.database_connections.waiting_requests,
  );
  const peakDbTotalConnections = maxOfSamples(
    baselineSamples,
    (sample) => sample.database_connections.total_connections,
  );
  const { firstQuartileP95Ms, lastQuartileP95Ms } = computeLatencyQuartiles(latencySamples);
  const latencyGrowthRatio =
    firstQuartileP95Ms <= 0 || lastQuartileP95Ms <= 0
      ? 1
      : lastQuartileP95Ms / firstQuartileP95Ms;
  const latencyP95IncreaseMs =
    firstQuartileP95Ms <= 0 || lastQuartileP95Ms <= 0
      ? 0
      : lastQuartileP95Ms - firstQuartileP95Ms;
  const attendanceTotal =
    patternTracker.totals.attendance_online + patternTracker.totals.attendance_offline;
  const attendanceMorningShare =
    attendanceTotal === 0
      ? 0
      : (
          patternTracker.phases.attendance_online.morning_peak
          + patternTracker.phases.attendance_offline.morning_peak
        ) / attendanceTotal;
  const paymentEveningShare =
    patternTracker.totals.mpesa_payment === 0
      ? 0
      : patternTracker.phases.mpesa_payment.evening_peak / patternTracker.totals.mpesa_payment;
  const paymentDeadlineShare =
    patternTracker.totals.mpesa_payment === 0
      ? 0
      : (
          patternTracker.contexts.mpesa_payment.fee_deadline
          + patternTracker.contexts.mpesa_payment.term_opening
        ) / patternTracker.totals.mpesa_payment;
  const reportTermClosingShare =
    patternTracker.totals.report_generation === 0
      ? 0
      : patternTracker.contexts.report_generation.term_closing
        / patternTracker.totals.report_generation;
  const smsDeadlineShare =
    patternTracker.totals.sms_burst === 0
      ? 0
      : (
          patternTracker.contexts.sms_burst.fee_deadline
          + patternTracker.contexts.sms_burst.term_opening
        ) / patternTracker.totals.sms_burst;
  const coverage = summarizeCoverage(
    coverageTracker,
    measuredDurationMs,
    config.force_workload_after_ms,
    config.fail_workload_starvation_ms,
  );
  const failures: KenyanLoadFailure[] = [];
  const preflightFailures = preflight.checks.filter((check) => check.status === 'failed');

  for (const check of preflightFailures) {
    failures.push({
      check: `preflight:${check.workload}`,
      message: `Preflight ${check.workload} failed for tenant "${check.tenant_id}": ${check.error_message ?? 'Unknown error'}`,
      observed: 1,
      threshold: 0,
    });
  }

  if (errorRate > config.fail_error_rate) {
    failures.push({
      check: 'error_rate',
      message: 'Operation error rate exceeded the allowed threshold',
      observed: roundToTwoDecimals(errorRate),
      threshold: config.fail_error_rate,
    });
  }

  if (peakSmsBacklog > config.fail_sms_backlog) {
    failures.push({
      check: 'sms_queue_backlog',
      message: 'SMS queue backlog exceeded the tolerated threshold',
      observed: peakSmsBacklog,
      threshold: config.fail_sms_backlog,
    });
  }

  if (peakDbWaitingRequests > config.fail_db_waiting_requests) {
    failures.push({
      check: 'db_waiting_requests',
      message: 'Database pool waiters accumulated above the allowed threshold',
      observed: peakDbWaitingRequests,
      threshold: config.fail_db_waiting_requests,
    });
  }

  if (peakDbTotalConnections > config.fail_db_total_connections) {
    failures.push({
      check: 'db_total_connections',
      message: 'Database connections exceeded the configured threshold',
      observed: peakDbTotalConnections,
      threshold: config.fail_db_total_connections,
    });
  }

  if (
    latencyGrowthRatio > config.fail_latency_growth_ratio &&
    latencyP95IncreaseMs > config.fail_latency_p95_increase_ms
  ) {
    failures.push({
      check: 'latency_growth_ratio',
      message: 'p95 latency degraded over the course of the run',
      observed: roundToTwoDecimals(latencyGrowthRatio),
      threshold: config.fail_latency_growth_ratio,
    });
  }

  pushPatternFailure(
    failures,
    'attendance_morning_share',
    'Attendance activity was not concentrated in the 7-9am peak as expected',
    attendanceMorningShare,
    config.fail_attendance_morning_share,
    attendanceTotal,
    config.min_pattern_samples,
  );
  pushPatternFailure(
    failures,
    'payment_evening_share',
    'MPESA activity was not concentrated in the 4-8pm parent-payment peak',
    paymentEveningShare,
    config.fail_payment_evening_share,
    patternTracker.totals.mpesa_payment,
    config.min_pattern_samples,
  );
  pushPatternFailure(
    failures,
    'payment_deadline_share',
    'MPESA traffic did not spike sufficiently around fee deadlines and term openings',
    paymentDeadlineShare,
    config.fail_payment_deadline_share,
    patternTracker.totals.mpesa_payment,
    config.min_pattern_samples,
  );
  pushPatternFailure(
    failures,
    'report_term_closing_share',
    'Report generation did not cluster around term-closing windows',
    reportTermClosingShare,
    config.fail_report_term_closing_share,
    patternTracker.totals.report_generation,
    config.min_pattern_samples,
  );
  pushPatternFailure(
    failures,
    'sms_deadline_share',
    'SMS bursts were not concentrated around fee deadlines and term openings',
    smsDeadlineShare,
    config.fail_sms_deadline_share,
    patternTracker.totals.sms_burst,
    config.min_pattern_samples,
  );

  for (const workload of WORKLOAD_NAMES) {
    const workloadCoverage = coverage.workloads[workload];

    if (workloadCoverage.max_gap_ms > config.fail_workload_starvation_ms) {
      failures.push({
        check: `workload_starvation:${workload}`,
        message: `Workload "${workload}" went too long without coverage during the measured run`,
        observed: roundToTwoDecimals(workloadCoverage.max_gap_ms),
        threshold: config.fail_workload_starvation_ms,
      });
    }
  }

  return {
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: wallClockDurationMs,
    status: failures.length === 0 ? 'passed' : 'failed',
    config,
    profile_summary: profileDocument.summary,
    seeded: {
      tenant_count: fixtures.length,
      student_count: fixtures.reduce((sum, fixture) => sum + fixture.students.length, 0),
      device_count: fixtures.reduce((sum, fixture) => sum + fixture.devices.length, 0),
    },
    sms_queue_mode: smsQueueMode,
    preflight,
    checkpoints: {
      path: config.checkpoint_path,
      interval_ms: config.checkpoint_interval_ms,
      writes: checkpointState.writes,
      last_written_at: checkpointState.last_written_at,
    },
    coverage,
    summary: {
      total_operations: totalOperations,
      successful_operations: successfulOperations,
      failed_operations: failedOperations,
      error_rate: roundToTwoDecimals(errorRate),
      peak_sms_backlog: peakSmsBacklog,
      peak_db_total_connections: peakDbTotalConnections,
      peak_db_waiting_requests: peakDbWaitingRequests,
      first_quartile_p95_ms: roundToTwoDecimals(firstQuartileP95Ms),
      last_quartile_p95_ms: roundToTwoDecimals(lastQuartileP95Ms),
      latency_growth_ratio: roundToTwoDecimals(latencyGrowthRatio),
      latency_p95_increase_ms: roundToTwoDecimals(latencyP95IncreaseMs),
    },
    realism: {
      attendance_morning_share: roundToTwoDecimals(attendanceMorningShare),
      payment_evening_share: roundToTwoDecimals(paymentEveningShare),
      payment_deadline_share: roundToTwoDecimals(paymentDeadlineShare),
      report_term_closing_share: roundToTwoDecimals(reportTermClosingShare),
      sms_deadline_share: roundToTwoDecimals(smsDeadlineShare),
      totals: patternTracker.totals,
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
    attendance_online: { count: 0, errors: 0 },
    attendance_offline: { count: 0, errors: 0 },
    mpesa_payment: { count: 0, errors: 0 },
    report_generation: { count: 0, errors: 0 },
    sms_burst: { count: 0, errors: 0 },
  },
});

const createPatternTracker = (): PatternTracker => ({
  totals: {
    attendance_online: 0,
    attendance_offline: 0,
    mpesa_payment: 0,
    report_generation: 0,
    sms_burst: 0,
  },
  phases: {
    attendance_online: emptyPhaseCounts(),
    attendance_offline: emptyPhaseCounts(),
    mpesa_payment: emptyPhaseCounts(),
    report_generation: emptyPhaseCounts(),
    sms_burst: emptyPhaseCounts(),
  },
  contexts: {
    attendance_online: emptyContextCounts(),
    attendance_offline: emptyContextCounts(),
    mpesa_payment: emptyContextCounts(),
    report_generation: emptyContextCounts(),
    sms_burst: emptyContextCounts(),
  },
});

const createCoverageTracker = (): CoverageTracker =>
  Object.fromEntries(
    WORKLOAD_NAMES.map((workload) => [
      workload,
      {
        attempts: 0,
        successes: 0,
        forced_selections: 0,
        last_seen_elapsed_ms: null,
        max_gap_ms: 0,
      },
    ]),
  ) as CoverageTracker;

const createCheckpointState = (): KenyanLoadCheckpointState => ({
  writes: 0,
  last_written_at: null,
  last_written_elapsed_ms: -1,
});

const emptyPhaseCounts = (): Record<DayPhase, number> => ({
  morning_peak: 0,
  evening_peak: 0,
  school_hours: 0,
  overnight: 0,
});

const emptyContextCounts = (): Record<BusinessContext, number> => ({
  fee_deadline: 0,
  term_opening: 0,
  term_closing: 0,
  term_break: 0,
  routine: 0,
});

const recordOperation = (
  accumulator: WindowAccumulator,
  workload: WorkloadName,
  latencyMs: number,
  succeeded: boolean,
): void => {
  accumulator.operation_count += 1;
  accumulator.latencies_ms.push(latencyMs);
  accumulator.per_operation[workload].count += 1;

  if (succeeded) {
    accumulator.success_count += 1;
    return;
  }

  accumulator.error_count += 1;
  accumulator.per_operation[workload].errors += 1;
};

const recordPattern = (
  tracker: PatternTracker,
  workload: WorkloadName,
  signal: ReturnType<typeof describeWorkloadWindow>,
): void => {
  tracker.totals[workload] += 1;
  tracker.phases[workload][signal.day_phase] += 1;
  tracker.contexts[workload][signal.business_context] += 1;
};

const recordCoverageAttempt = (
  tracker: CoverageTracker,
  workload: WorkloadName,
  elapsedMs: number,
  forced: boolean,
): void => {
  const state = tracker[workload];
  const gap = state.last_seen_elapsed_ms === null
    ? Math.max(0, elapsedMs)
    : Math.max(0, elapsedMs - state.last_seen_elapsed_ms);

  state.attempts += 1;
  state.last_seen_elapsed_ms = elapsedMs;
  state.max_gap_ms = Math.max(state.max_gap_ms, gap);

  if (forced) {
    state.forced_selections += 1;
  }
};

const recordCoverageSuccess = (
  tracker: CoverageTracker,
  workload: WorkloadName,
): void => {
  tracker[workload].successes += 1;
};

const pickStarvedWorkload = (
  tracker: CoverageTracker,
  elapsedMs: number,
  forceAfterMs: number,
): WorkloadName | null => {
  for (const workload of WORKLOAD_NAMES) {
    if (tracker[workload].attempts === 0) {
      return workload;
    }
  }

  if (forceAfterMs <= 0) {
    return null;
  }

  let selected: { workload: WorkloadName; gap_ms: number } | null = null;

  for (const workload of WORKLOAD_NAMES) {
    const state = tracker[workload];
    const gapMs = state.last_seen_elapsed_ms === null
      ? Math.max(0, elapsedMs)
      : Math.max(0, elapsedMs - state.last_seen_elapsed_ms);

    if (gapMs < forceAfterMs) {
      continue;
    }

    if (!selected || gapMs > selected.gap_ms) {
      selected = { workload, gap_ms: gapMs };
    }
  }

  return selected?.workload ?? null;
};

const summarizeCoverage = (
  tracker: CoverageTracker,
  totalDurationMs: number,
  forceAfterMs: number,
  failStarvationMs: number,
): KenyanLoadCoverageSummary => ({
  force_after_ms: forceAfterMs,
  fail_starvation_ms: failStarvationMs,
  workloads: Object.fromEntries(
    WORKLOAD_NAMES.map((workload) => {
      const state = tracker[workload];
      const tailGap = state.last_seen_elapsed_ms === null
        ? Math.max(0, totalDurationMs)
        : Math.max(0, totalDurationMs - state.last_seen_elapsed_ms);

      return [
        workload,
        {
          attempts: state.attempts,
          successes: state.successes,
          forced_selections: state.forced_selections,
          last_seen_elapsed_ms: state.last_seen_elapsed_ms,
          max_gap_ms: Math.max(state.max_gap_ms, tailGap),
        },
      ];
    }),
  ) as Record<WorkloadName, CoverageTrackerState>,
});

const maybeWriteCheckpoint = async (
  latestSample: KenyanLoadSample,
  startedAtIso: string,
  fixtures: TenantRuntimeFixture[],
  preflight: KenyanLoadPreflightReport,
  coverageTracker: CoverageTracker,
  checkpointState: KenyanLoadCheckpointState,
  sampleCount: number,
  config: KenyanLoadConfig,
  force: boolean,
): Promise<void> => {
  if (!config.checkpoint_path) {
    return;
  }

  const enoughTimeElapsed =
    latestSample.elapsed_ms - checkpointState.last_written_elapsed_ms >= config.checkpoint_interval_ms;

  if (!force && !enoughTimeElapsed) {
    return;
  }

  const checkpoint = buildCheckpointArtifact(
    latestSample,
    startedAtIso,
    fixtures,
    preflight,
    coverageTracker,
    checkpointState,
    sampleCount,
    config,
  );
  const resolvedPath = path.resolve(config.checkpoint_path);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  checkpointState.writes += 1;
  checkpointState.last_written_at = checkpoint.captured_at;
  checkpointState.last_written_elapsed_ms = latestSample.elapsed_ms;
};

const buildCheckpointArtifact = (
  latestSample: KenyanLoadSample,
  startedAtIso: string,
  fixtures: TenantRuntimeFixture[],
  preflight: KenyanLoadPreflightReport,
  coverageTracker: CoverageTracker,
  checkpointState: KenyanLoadCheckpointState,
  sampleCount: number,
  config: KenyanLoadConfig,
): KenyanLoadCheckpointArtifact => ({
  kind: 'kenyan_school_load_checkpoint',
  started_at: startedAtIso,
  captured_at: latestSample.captured_at,
  elapsed_ms: latestSample.elapsed_ms,
  progress_ratio:
    config.duration_ms <= 0
      ? 1
      : roundToTwoDecimals(Math.min(1, latestSample.elapsed_ms / config.duration_ms)),
  status: 'running',
  config: {
    duration_ms: config.duration_ms,
    concurrency: config.concurrency,
    tenant_count: config.tenant_count,
    sample_interval_ms: config.sample_interval_ms,
    checkpoint_interval_ms: config.checkpoint_interval_ms,
    force_workload_after_ms: config.force_workload_after_ms,
    fail_workload_starvation_ms: config.fail_workload_starvation_ms,
  },
  seeded: {
    tenant_count: fixtures.length,
    student_count: fixtures.reduce((sum, fixture) => sum + fixture.students.length, 0),
    device_count: fixtures.reduce((sum, fixture) => sum + fixture.devices.length, 0),
  },
  preflight,
  checkpoints: {
    path: config.checkpoint_path,
    interval_ms: config.checkpoint_interval_ms,
    writes: checkpointState.writes,
    last_written_at: checkpointState.last_written_at,
  },
  coverage: summarizeCoverage(
    coverageTracker,
    latestSample.elapsed_ms,
    config.force_workload_after_ms,
    config.fail_workload_starvation_ms,
  ),
  latest_sample: latestSample,
  sample_count: sampleCount,
});

const drainAccumulator = (
  accumulator: WindowAccumulator,
  sampleIntervalMs: number,
): WorkloadWindowSummary => {
  const latencies = accumulator.latencies_ms.slice().sort((left, right) => left - right);
  const operationCount = accumulator.operation_count;
  const successCount = accumulator.success_count;
  const errorCount = accumulator.error_count;
  const perOperation = accumulator.per_operation;

  const summary: WorkloadWindowSummary = {
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
    per_operation: perOperation,
  };

  accumulator.operation_count = 0;
  accumulator.success_count = 0;
  accumulator.error_count = 0;
  accumulator.latencies_ms = [];
  accumulator.per_operation = createWindowAccumulator().per_operation;

  return summary;
};

const describeWorkloadWindow = (
  profile: KenyanSchoolTenantProfile,
  virtualNow: Date,
): {
  day_phase: DayPhase;
  business_context: BusinessContext;
  school_day: boolean;
  intensity_multiplier: number;
} => {
  const virtualDate = formatDateOnly(virtualNow);
  const dayPhase = resolveDayPhase(virtualNow);
  const term = profile.terms.find(
    (candidate) => virtualDate >= candidate.opens_on && virtualDate <= candidate.closes_on,
  );
  const schoolDay = Boolean(term) && !isWeekend(virtualNow);
  let businessContext: BusinessContext = 'routine';

  if (!term) {
    businessContext = 'term_break';
  } else if (daysBetween(virtualDate, term.fee_deadline_on) <= 2) {
    businessContext = 'fee_deadline';
  } else if (daysBetween(virtualDate, term.opens_on) <= 4) {
    businessContext = 'term_opening';
  } else if (virtualDate >= term.report_window_starts_on) {
    businessContext = 'term_closing';
  }

  let intensityMultiplier = 1;

  if (schoolDay && dayPhase === 'morning_peak') {
    intensityMultiplier *= profile.load_shape.morning_peak_multiplier;
  }

  if (dayPhase === 'evening_peak') {
    intensityMultiplier *= profile.load_shape.evening_peak_multiplier;
  }

  if (businessContext === 'term_opening') {
    intensityMultiplier *= profile.load_shape.term_opening_multiplier;
  }

  if (businessContext === 'fee_deadline') {
    intensityMultiplier *= profile.load_shape.fee_deadline_multiplier;
  }

  if (businessContext === 'term_closing') {
    intensityMultiplier *= profile.load_shape.term_closing_multiplier;
  }

  if (!schoolDay) {
    intensityMultiplier *= 0.75;
  }

  return {
    day_phase: dayPhase,
    business_context: businessContext,
    school_day: schoolDay,
    intensity_multiplier: roundToTwoDecimals(intensityMultiplier),
  };
};

const pickWorkload = (
  signal: ReturnType<typeof describeWorkloadWindow>,
  fixture: TenantRuntimeFixture,
  workerIndex: number,
): WorkloadName => {
  const weights: Record<WorkloadName, number> = {
    attendance_online:
      (signal.school_day ? 0.28 : 0.06)
      * fixture.profile.attendance_adoption_ratio
      * Math.max(0.1, 1 - fixture.profile.offline_attendance_ratio),
    attendance_offline:
      (signal.school_day ? 0.22 : 0.04)
      * fixture.profile.attendance_adoption_ratio
      * Math.max(0.1, fixture.profile.offline_attendance_ratio),
    mpesa_payment: 0.18 * fixture.profile.mpesa_adoption_ratio,
    report_generation: 0.12 * fixture.profile.report_generation_ratio,
    sms_burst: 0.2 * fixture.profile.sms_opt_in_ratio,
  };

  if (signal.day_phase === 'morning_peak') {
    weights.attendance_online += 0.16;
    weights.attendance_offline += 0.14;
    weights.mpesa_payment -= 0.04;
  } else if (signal.day_phase === 'evening_peak') {
    weights.mpesa_payment += 0.16;
    weights.sms_burst += 0.14;
    weights.report_generation += 0.04;
    weights.attendance_online -= 0.06;
    weights.attendance_offline -= 0.05;
  } else if (signal.day_phase === 'overnight') {
    weights.report_generation += 0.03;
    weights.sms_burst -= 0.06;
  }

  if (signal.business_context === 'fee_deadline') {
    weights.mpesa_payment += 0.22;
    weights.sms_burst += 0.12;
  } else if (signal.business_context === 'term_opening') {
    weights.attendance_online += 0.08;
    weights.attendance_offline += 0.08;
    weights.sms_burst += 0.09;
    weights.mpesa_payment += 0.08;
  } else if (signal.business_context === 'term_closing') {
    weights.report_generation += 0.16;
    weights.sms_burst += 0.05;
  } else if (signal.business_context === 'term_break') {
    weights.attendance_online *= 0.35;
    weights.attendance_offline *= 0.25;
    weights.report_generation += 0.06;
  }

  applyWorkerAffinity(weights, fixture.profile, workerIndex);

  return pickWeightedWorkload(weights);
};

const applyWorkerAffinity = (
  weights: Record<WorkloadName, number>,
  profile: KenyanSchoolTenantProfile,
  workerIndex: number,
): void => {
  const slot = workerIndex % 8;

  if (slot <= 2) {
    if (profile.offline_attendance_ratio >= 0.35) {
      weights.attendance_offline *= 3.2;
      weights.attendance_online *= 1.4;
    } else {
      weights.attendance_online *= 3.2;
      weights.attendance_offline *= 1.4;
    }
    return;
  }

  if (slot === 3) {
    weights.mpesa_payment *= 3;
    weights.sms_burst *= 1.35;
    return;
  }

  if (slot === 4) {
    weights.report_generation *= 3;
    weights.attendance_online *= 0.8;
    weights.attendance_offline *= 0.8;
    return;
  }

  if (slot === 5) {
    weights.sms_burst *= 3.2;
    weights.mpesa_payment *= 1.3;
    return;
  }

  if (slot === 6) {
    weights.attendance_online *= 1.8;
    weights.attendance_offline *= 1.8;
    weights.report_generation *= 1.2;
    return;
  }

  weights.mpesa_payment *= 1.8;
  weights.sms_burst *= 1.8;
  weights.report_generation *= 1.2;
};

const pickWeightedWorkload = (weights: Record<WorkloadName, number>): WorkloadName => {
  const entries = Object.entries(weights) as Array<[WorkloadName, number]>;
  const normalizedEntries = entries.map(([key, weight]) => [key, Math.max(weight, 0.01)] as const);
  const totalWeight = normalizedEntries.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = Math.random() * totalWeight;
  let threshold = 0;

  for (const [workload, weight] of normalizedEntries) {
    threshold += weight;

    if (roll <= threshold) {
      return workload;
    }
  }

  return normalizedEntries[normalizedEntries.length - 1][0];
};

const pickTenantFixture = (fixtures: TenantRuntimeFixture[]): TenantRuntimeFixture => {
  const totalWeight = fixtures.reduce(
    (sum, fixture) => sum + fixture.profile.student_count + fixture.profile.teacher_count * 5,
    0,
  );
  const roll = Math.random() * totalWeight;
  let threshold = 0;

  for (const fixture of fixtures) {
    threshold += fixture.profile.student_count + fixture.profile.teacher_count * 5;

    if (roll <= threshold) {
      return fixture;
    }
  }

  return fixtures[fixtures.length - 1];
};

const computeThinkDelay = (
  config: KenyanLoadConfig,
  signal: ReturnType<typeof describeWorkloadWindow>,
): number => {
  const baseDelay = randomInt(config.think_time_min_ms, config.think_time_max_ms + 1);
  return Math.max(1, Math.round(baseDelay / Math.max(signal.intensity_multiplier, 0.25)));
};

const deriveVirtualNow = (
  config: KenyanLoadConfig,
  startedAtEpochMs: number,
  nowEpochMs: number,
): Date => {
  const elapsedMs = Math.max(0, nowEpochMs - startedAtEpochMs);
  const progress = config.duration_ms <= 0 ? 1 : Math.min(1, elapsedMs / config.duration_ms);
  const virtualStartMs = new Date(config.virtual_start_iso).getTime();
  const virtualSpanMs = config.simulated_days_per_run * 24 * 60 * 60 * 1000;

  return new Date(virtualStartMs + progress * virtualSpanMs);
};

const resolveDayPhase = (virtualNow: Date): DayPhase => {
  const hour = getNairobiHour(virtualNow);

  if (hour >= 7 && hour < 9) {
    return 'morning_peak';
  }

  if (hour >= 16 && hour < 20) {
    return 'evening_peak';
  }

  if (hour >= 9 && hour < 16) {
    return 'school_hours';
  }

  return 'overnight';
};

const buildSuccessfulCallbackPayload = (input: {
  merchant_request_id: string;
  checkout_request_id: string;
  amount_minor: string;
  phone_number: string;
  virtual_now: Date;
}): Record<string, unknown> => ({
  Body: {
    stkCallback: {
      MerchantRequestID: input.merchant_request_id,
      CheckoutRequestID: input.checkout_request_id,
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          {
            Name: 'Amount',
            Value: Number(input.amount_minor) / 100,
          },
          {
            Name: 'MpesaReceiptNumber',
            Value: `RCP${input.checkout_request_id.slice(-6).toUpperCase()}`,
          },
          {
            Name: 'TransactionDate',
            Value: Number(formatMpesaTimestamp(input.virtual_now)),
          },
          {
            Name: 'PhoneNumber',
            Value: Number(input.phone_number),
          },
        ],
      },
    },
  },
});

const buildPhoneNumber = (
  profile: KenyanSchoolTenantProfile,
  sequence: number,
): string => {
  const numericSeed = profile.tenant_id
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const suffix = ((numericSeed * 97) + sequence * 17) % 100000000;
  return `2547${suffix.toString().padStart(8, '0')}`;
};

const buildRuntimeTenantId = (
  sourceTenantId: string,
  runSuffix: string,
  ordinal: number,
): string => {
  const ordinalSuffix = ordinal.toString().padStart(4, '0');
  const suffix = `${runSuffix}${ordinalSuffix}`;
  const maxBaseLength = Math.max(8, 63 - suffix.length - 1);
  const trimmedBase = sourceTenantId.slice(0, maxBaseLength).replace(/-+$/g, '');

  return `${trimmedBase}-${suffix}`;
};

const pickAttendanceStatus = (): 'present' | 'absent' | 'late' | 'excused' => {
  const options: Array<'present' | 'absent' | 'late' | 'excused'> = [
    'present',
    'present',
    'present',
    'late',
    'excused',
    'absent',
  ];

  return options[randomInt(options.length)];
};

const formatMpesaTimestamp = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = new Map(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${parts.get('year')}${parts.get('month')}${parts.get('day')}${parts.get('hour')}${parts.get('minute')}${parts.get('second')}`;
};

const buildTermOpeningMorningDate = (profile: KenyanSchoolTenantProfile): Date =>
  buildNairobiDate(profile.terms[0].opens_on, 7, 20);

const buildFeeDeadlineEveningDate = (profile: KenyanSchoolTenantProfile): Date =>
  buildNairobiDate(profile.terms[0].fee_deadline_on, 18, 10);

const buildTermClosingReportDate = (profile: KenyanSchoolTenantProfile): Date =>
  buildNairobiDate(profile.terms[0].report_window_starts_on, 15, 30);

const buildNairobiDate = (
  dateValue: string,
  hour: number,
  minute: number,
): Date => new Date(`${dateValue}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00+03:00`);

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (dateValue: string, offsetDays: number): string => {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatDateOnly(date);
};

const addHours = (date: Date, hours: number): Date =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60 * 1000);

const daysBetween = (leftDate: string, rightDate: string): number => {
  const left = new Date(`${leftDate}T00:00:00.000Z`).getTime();
  const right = new Date(`${rightDate}T00:00:00.000Z`).getTime();
  return Math.abs(Math.round((left - right) / (24 * 60 * 60 * 1000)));
};

const isWeekend = (date: Date): boolean => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
  }).format(date);

  return weekday === 'Sat' || weekday === 'Sun';
};

const getNairobiHour = (date: Date): number =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      hour12: false,
    }).format(date),
  );

const computeLatencyQuartiles = (
  samples: KenyanLoadSample[],
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

const maxOfSamples = <T>(
  samples: readonly T[],
  selector: (sample: T) => number,
): number => samples.reduce((max, sample) => Math.max(max, selector(sample)), 0);

const averageOfSamples = <T>(
  samples: readonly T[],
  selector: (sample: T) => number,
): number => {
  if (samples.length === 0) {
    return 0;
  }

  return samples.reduce((sum, sample) => sum + selector(sample), 0) / samples.length;
};

const pushPatternFailure = (
  failures: KenyanLoadFailure[],
  check: string,
  message: string,
  observedShare: number,
  threshold: number,
  sampleCount: number,
  minPatternSamples: number,
): void => {
  if (sampleCount < minPatternSamples) {
    return;
  }

  if (observedShare < threshold) {
    failures.push({
      check,
      message,
      observed: roundToTwoDecimals(observedShare),
      threshold,
    });
  }
};

const pickOne = <T>(values: readonly T[]): T => values[randomInt(values.length)];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundToTwoDecimals = (value: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : value;

const toMegabytes = (value: number): number => roundToTwoDecimals(value / (1024 * 1024));

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

  throw new Error(`Unsupported KENYA_SMS_QUEUE_MODE "${value}"`);
};

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
