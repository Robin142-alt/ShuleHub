import {
  RaceTestHarness,
  closeRaceTestHarness,
  createRaceTestHarness,
} from './support/race-harness';
import {
  RaceScenarioResult,
  runAttendanceHotRowStorm,
  runBillingSubscriptionStorm,
  runBillingUsageIdempotencyStorm,
  runFinanceIdempotencyStorm,
  runFinanceSharedAccountStorm,
  runSyncHotRowStorm,
} from './support/race-scenarios';

type ScenarioName =
  | 'all'
  | 'finance-idempotency'
  | 'finance-shared-accounts'
  | 'attendance-hot-row'
  | 'sync-hot-row'
  | 'billing-subscriptions'
  | 'billing-usage-idempotency';

const main = async (): Promise<void> => {
  const scenario = parseScenario(process.env.RACE_SCENARIO);
  const concurrency = parseConcurrency(process.env.RACE_CONCURRENCY);
  const harness = await createRaceTestHarness();

  try {
    const startedAt = Date.now();
    const results = await runScenarios(harness, scenario, concurrency);

    process.stdout.write(
      `${JSON.stringify(
        {
          scenario,
          concurrency,
          duration_ms: Date.now() - startedAt,
          results,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await closeRaceTestHarness(harness);
  }
};

const runScenarios = async (
  harness: RaceTestHarness,
  scenario: ScenarioName,
  concurrency: number,
): Promise<RaceScenarioResult[]> => {
  switch (scenario) {
    case 'finance-idempotency':
      return [await runFinanceIdempotencyStorm(harness, concurrency)];
    case 'finance-shared-accounts':
      return [await runFinanceSharedAccountStorm(harness, concurrency)];
    case 'attendance-hot-row':
      return [await runAttendanceHotRowStorm(harness, concurrency)];
    case 'sync-hot-row':
      return [await runSyncHotRowStorm(harness, concurrency)];
    case 'billing-subscriptions':
      return [await runBillingSubscriptionStorm(harness, concurrency)];
    case 'billing-usage-idempotency':
      return [await runBillingUsageIdempotencyStorm(harness, concurrency)];
    case 'all':
    default:
      return [
        await runFinanceIdempotencyStorm(harness, concurrency),
        await runFinanceSharedAccountStorm(harness, concurrency),
        await runAttendanceHotRowStorm(harness, concurrency),
        await runSyncHotRowStorm(harness, concurrency),
        await runBillingSubscriptionStorm(harness, concurrency),
        await runBillingUsageIdempotencyStorm(harness, concurrency),
      ];
  }
};

const parseScenario = (value: string | undefined): ScenarioName => {
  const normalizedValue = value?.trim() as ScenarioName | undefined;
  const allowedValues = new Set<ScenarioName>([
    'all',
    'finance-idempotency',
    'finance-shared-accounts',
    'attendance-hot-row',
    'sync-hot-row',
    'billing-subscriptions',
    'billing-usage-idempotency',
  ]);

  if (!normalizedValue) {
    return 'all';
  }

  if (!allowedValues.has(normalizedValue)) {
    throw new Error(`Unsupported RACE_SCENARIO "${value}"`);
  }

  return normalizedValue;
};

const parseConcurrency = (value: string | undefined): number => {
  if (!value) {
    return 250;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 1000) {
    throw new Error('RACE_CONCURRENCY must be an integer between 100 and 1000');
  }

  return parsed;
};

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
