import {
  RaceTestHarness,
  closeRaceTestHarness,
  createRaceTestHarness,
} from './support/race-harness';
import {
  runAttendanceHotRowStorm,
  runBillingSubscriptionStorm,
  runFinanceIdempotencyStorm,
  runFinanceSharedAccountStorm,
  runSyncHotRowStorm,
} from './support/race-scenarios';

jest.setTimeout(900000);

describe('Distributed race-condition hardening', () => {
  let harness: RaceTestHarness;

  beforeAll(async () => {
    harness = await createRaceTestHarness();
  });

  afterAll(async () => {
    await closeRaceTestHarness(harness);
  });

  test('finance idempotency survives a 100-request storm without duplicate postings', async () => {
    const result = await runFinanceIdempotencyStorm(harness, 100);

    expect(result.metrics.distinct_transaction_ids).toBe(1);
    expect(result.metrics.persisted_transactions).toBe(1);
    expect(result.metrics.persisted_ledger_entries).toBe(2);
    expect(result.metrics.completed_idempotency_keys).toBe(1);
    expect(result.metrics.imbalance_count).toBe(0);
  });

  test('finance shared-account load keeps balances correct across 100 concurrent writes', async () => {
    const result = await runFinanceSharedAccountStorm(harness, 100);

    expect(result.metrics.persisted_transactions).toBe(100);
    expect(result.metrics.persisted_ledger_entries).toBe(200);
    expect(result.metrics.debit_balance_minor).toBe(result.metrics.expected_total_minor);
    expect(result.metrics.credit_balance_minor).toBe(result.metrics.expected_total_minor);
    expect(result.metrics.imbalance_count).toBe(0);
  });

  test('attendance hot-row storms do not allow an older write to overwrite the newest state', async () => {
    const result = await runAttendanceHotRowStorm(harness, 100);

    expect(result.metrics.attendance_rows).toBe(1);
    expect(result.metrics.final_notes).toBe('attendance-update-100');
    expect(result.metrics.final_last_modified_at).toBe(
      result.metrics.expected_last_modified_at,
    );
    expect(result.metrics.sync_operations_persisted).toBeGreaterThan(0);
    expect(result.metrics.sync_operations_persisted).toBeLessThanOrEqual(100);
    expect(result.metrics.usage_records_persisted).toBe(
      result.metrics.sync_operations_persisted,
    );
  });

  test('sync hot-row storms keep last-write-wins semantics and reject stale device updates', async () => {
    const result = await runSyncHotRowStorm(harness, 100);

    expect(result.metrics.applied_results).toBeGreaterThan(0);
    expect(result.metrics.rejected_results).toBeGreaterThan(0);
    expect(result.metrics.duplicate_results).toBe(0);
    expect(
      Number(result.metrics.applied_results) + Number(result.metrics.rejected_results),
    ).toBe(100);
    expect(result.metrics.final_notes).toBe('sync-update-100');
    expect(result.metrics.final_last_modified_at).toBe(
      result.metrics.expected_last_modified_at,
    );
    expect(result.metrics.persisted_sync_operations).toBe(result.metrics.applied_results);
  });

  test('billing subscription storms preserve a single mutable subscription for the tenant', async () => {
    const result = await runBillingSubscriptionStorm(harness, 100);

    expect(result.metrics.mutable_subscriptions).toBe(1);
    expect(result.metrics.total_subscriptions).toBe(100);
    expect(result.metrics.distinct_response_ids).toBe(100);
    expect(result.metrics.current_subscription_status).toBe('active');
  });
});
