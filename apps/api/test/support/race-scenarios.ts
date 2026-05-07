import { randomUUID } from 'node:crypto';

import { AUTH_ANONYMOUS_USER_ID } from '../../src/auth/auth.constants';
import { RequestContextState } from '../../src/common/request-context/request-context.types';
import { generateSpanId } from '../../src/common/request-context/trace.utils';
import { PostFinancialTransactionInput } from '../../src/modules/finance/finance.types';
import { RaceTestHarness, ensureFinanceAccounts, queryRow, queryRows, queryScalar, registerTenantId, runInTenantContext, seedActiveSubscription, seedAttendanceRecord, seedStudent, sleep } from './race-harness';

export interface RaceScenarioResult {
  scenario: string;
  tenant_id: string;
  concurrency: number;
  duration_ms: number;
  metrics: Record<string, boolean | number | string>;
}

export const runFinanceIdempotencyStorm = async (
  harness: RaceTestHarness,
  concurrency: number,
): Promise<RaceScenarioResult> => {
  const tenantId = registerTenantId('race-fin-idem');
  const accounts = await ensureFinanceAccounts(harness, tenantId);
  const sharedIdempotencyKey = `storm:${tenantId}:shared`;
  const sharedReference = `FIN-IDEM-${tenantId}`;
  const startedAt = Date.now();

  const results = await Promise.all(
    Array.from({ length: concurrency }, async () =>
      runInTenantContext(harness, tenantId, () =>
        harness.transactionService.postTransaction(
          buildFinancialTransactionInput(
            accounts,
            sharedIdempotencyKey,
            sharedReference,
            '5000',
            'Idempotent concurrency storm',
          ),
        ),
      ),
    ),
  );

  const distinctTransactionIds = new Set(results.map((result) => result.transaction_id));
  const transactionCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM transactions
      WHERE tenant_id = $1
        AND reference = $2
    `,
    [tenantId, sharedReference],
  );
  const ledgerEntryCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM ledger_entries
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const completedIdempotencyKeys = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM idempotency_keys
      WHERE tenant_id = $1
        AND scope = 'finance:ledger:post'
        AND idempotency_key = $2
        AND status = 'completed'
    `,
    [tenantId, sharedIdempotencyKey],
  );
  const imbalanceCount = await countLedgerImbalances(harness, tenantId);

  return {
    scenario: 'finance-idempotency-storm',
    tenant_id: tenantId,
    concurrency,
    duration_ms: Date.now() - startedAt,
    metrics: {
      distinct_transaction_ids: distinctTransactionIds.size,
      persisted_transactions: transactionCount,
      persisted_ledger_entries: ledgerEntryCount,
      completed_idempotency_keys: completedIdempotencyKeys,
      imbalance_count: imbalanceCount,
    },
  };
};

export const runFinanceSharedAccountStorm = async (
  harness: RaceTestHarness,
  concurrency: number,
): Promise<RaceScenarioResult> => {
  const tenantId = registerTenantId('race-fin-load');
  const accounts = await ensureFinanceAccounts(harness, tenantId);
  const amountMinor = 2500n;
  const startedAt = Date.now();

  await Promise.all(
    Array.from({ length: concurrency }, async (_, index) =>
      runInTenantContext(harness, tenantId, () =>
        harness.transactionService.postTransaction(
          buildFinancialTransactionInput(
            accounts,
            `storm:${tenantId}:${index}`,
            `FIN-LOAD-${tenantId}-${index}`,
            amountMinor.toString(),
            `Shared-account storm payment ${index + 1}`,
          ),
        ),
      ),
    ),
  );

  const transactionCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM transactions
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const ledgerEntryCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM ledger_entries
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const debitBalance = await runInTenantContext(harness, tenantId, () =>
    harness.transactionService.getAccountBalance(accounts.debit_account_id),
  );
  const creditBalance = await runInTenantContext(harness, tenantId, () =>
    harness.transactionService.getAccountBalance(accounts.credit_account_id),
  );
  const imbalanceCount = await countLedgerImbalances(harness, tenantId);

  return {
    scenario: 'finance-shared-account-storm',
    tenant_id: tenantId,
    concurrency,
    duration_ms: Date.now() - startedAt,
    metrics: {
      persisted_transactions: transactionCount,
      persisted_ledger_entries: ledgerEntryCount,
      debit_balance_minor: debitBalance.balance_minor,
      credit_balance_minor: creditBalance.balance_minor,
      expected_total_minor: (amountMinor * BigInt(concurrency)).toString(),
      imbalance_count: imbalanceCount,
    },
  };
};

export const runAttendanceHotRowStorm = async (
  harness: RaceTestHarness,
  concurrency: number,
): Promise<RaceScenarioResult> => {
  const tenantId = registerTenantId('race-att');
  await seedActiveSubscription(harness, tenantId);
  const student = await seedStudent(harness, tenantId, tenantId.slice(-4));
  const attendanceDate = '2026-04-26';
  const seededRecord = await seedAttendanceRecord(
    harness,
    tenantId,
    student.id,
    attendanceDate,
    '2026-04-26T08:00:00.000Z',
  );
  const heldLock = await acquireAttendanceRecordLock(harness, tenantId, seededRecord.id);
  const baseTimestampMs = new Date('2026-04-26T09:00:00.000Z').getTime();
  const operations = Array.from({ length: concurrency }, (_, index) => {
    const sequence = concurrency - index;

    return {
      sequence,
      status: ATTENDANCE_STATUSES[sequence % ATTENDANCE_STATUSES.length],
      timestamp: new Date(baseTimestampMs + sequence * 1000).toISOString(),
      notes: `attendance-update-${sequence}`,
    };
  });
  const startedAt = Date.now();

  const pendingRequests = operations.map((operation) =>
    runInTenantContext(harness, tenantId, () =>
      harness.attendanceService.upsertStudentAttendance(student.id, attendanceDate, {
        status: operation.status,
        last_modified_at: operation.timestamp,
        notes: operation.notes,
        metadata: {
          sequence: operation.sequence,
        },
      }),
    ),
  );

  await sleep(75);
  await heldLock.release();

  const responses = await Promise.all(pendingRequests);
  const finalRecord = await queryRow<{
    status: string;
    notes: string | null;
    last_modified_at: string;
  }>(
    harness,
    tenantId,
    `
      SELECT
        status,
        notes,
        last_modified_at::text
      FROM attendance_records
      WHERE tenant_id = $1
        AND student_id = $2::uuid
        AND attendance_date = $3::date
      LIMIT 1
    `,
    [tenantId, student.id, attendanceDate],
  );
  const attendanceRowCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM attendance_records
      WHERE tenant_id = $1
        AND student_id = $2::uuid
        AND attendance_date = $3::date
    `,
    [tenantId, student.id, attendanceDate],
  );
  const syncOperationCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM sync_operation_logs
      WHERE tenant_id = $1
        AND entity = 'attendance'
    `,
    [tenantId],
  );
  const usageRecordCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM usage_records
      WHERE tenant_id = $1
        AND feature_key = 'attendance.upserts'
    `,
    [tenantId],
  );
  const expectedWinner = operations[0];
  const winnerResponses = responses.filter(
    (response) => response.notes === expectedWinner.notes,
  );

  return {
    scenario: 'attendance-hot-row-storm',
    tenant_id: tenantId,
    concurrency,
    duration_ms: Date.now() - startedAt,
    metrics: {
      attendance_rows: attendanceRowCount,
      final_status: finalRecord.status,
      final_notes: finalRecord.notes ?? '',
      final_last_modified_at: new Date(finalRecord.last_modified_at).toISOString(),
      expected_last_modified_at: expectedWinner.timestamp,
      sync_operations_persisted: syncOperationCount,
      usage_records_persisted: usageRecordCount,
      winner_response_count: winnerResponses.length,
    },
  };
};

export const runSyncHotRowStorm = async (
  harness: RaceTestHarness,
  concurrency: number,
): Promise<RaceScenarioResult> => {
  const tenantId = registerTenantId('race-sync');
  const student = await seedStudent(harness, tenantId, tenantId.slice(-4));
  const attendanceDate = '2026-04-26';
  const seededRecord = await seedAttendanceRecord(
    harness,
    tenantId,
    student.id,
    attendanceDate,
    '2026-04-26T08:00:00.000Z',
  );
  const heldLock = await acquireAttendanceRecordLock(harness, tenantId, seededRecord.id);
  const baseTimestampMs = new Date('2026-04-26T10:00:00.000Z').getTime();
  const operations = Array.from({ length: concurrency }, (_, index) => {
    const sequence = concurrency - index;

    return {
      sequence,
      op_id: randomUUID(),
      device_id: `device-${sequence.toString().padStart(4, '0')}`,
      status: ATTENDANCE_STATUSES[sequence % ATTENDANCE_STATUSES.length],
      timestamp: new Date(baseTimestampMs + sequence * 1000).toISOString(),
      notes: `sync-update-${sequence}`,
    };
  });
  const startedAt = Date.now();

  const pendingPushes = operations.map((operation) =>
    runInTenantContext(harness, tenantId, () =>
      harness.syncService.push({
        device_id: operation.device_id,
        platform: 'android',
        app_version: '1.0.0',
        metadata: {
          source: 'race-scenario',
        },
        cursors: [],
        operations: [
          {
            op_id: operation.op_id,
            entity: 'attendance',
            version: operation.sequence,
            payload: {
              record_id: seededRecord.id,
              student_id: student.id,
              attendance_date: attendanceDate,
              status: operation.status,
              last_modified_at: operation.timestamp,
              notes: operation.notes,
              metadata: {
                sequence: operation.sequence,
              },
            },
          },
        ],
      }),
    ),
  );

  await sleep(75);
  await heldLock.release();

  const pushResponses = await Promise.all(pendingPushes);
  const flattenedResults = pushResponses.flatMap((response) => response.results);
  const appliedCount = flattenedResults.filter((result) => result.status === 'applied').length;
  const rejectedCount = flattenedResults.filter((result) => result.status === 'rejected').length;
  const duplicateCount = flattenedResults.filter((result) => result.status === 'duplicate').length;
  const finalRecord = await queryRow<{
    status: string;
    notes: string | null;
    last_modified_at: string;
  }>(
    harness,
    tenantId,
    `
      SELECT
        status,
        notes,
        last_modified_at::text
      FROM attendance_records
      WHERE tenant_id = $1
        AND student_id = $2::uuid
        AND attendance_date = $3::date
      LIMIT 1
    `,
    [tenantId, student.id, attendanceDate],
  );
  const syncOperationCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM sync_operation_logs
      WHERE tenant_id = $1
        AND entity = 'attendance'
    `,
    [tenantId],
  );
  const expectedWinner = operations[0];

  return {
    scenario: 'sync-hot-row-storm',
    tenant_id: tenantId,
    concurrency,
    duration_ms: Date.now() - startedAt,
    metrics: {
      applied_results: appliedCount,
      rejected_results: rejectedCount,
      duplicate_results: duplicateCount,
      final_status: finalRecord.status,
      final_notes: finalRecord.notes ?? '',
      final_last_modified_at: new Date(finalRecord.last_modified_at).toISOString(),
      expected_last_modified_at: expectedWinner.timestamp,
      persisted_sync_operations: syncOperationCount,
    },
  };
};

export const runBillingSubscriptionStorm = async (
  harness: RaceTestHarness,
  concurrency: number,
): Promise<RaceScenarioResult> => {
  const tenantId = registerTenantId('race-bill');
  const startedAt = Date.now();

  const results = await Promise.all(
    Array.from({ length: concurrency }, async (_, index) =>
      runInTenantContext(harness, tenantId, () =>
        harness.billingService.createSubscription({
          plan_code: index % 2 === 0 ? 'starter' : 'growth',
          billing_phone_number: `254700${(100000 + index).toString().slice(-6)}`,
          seats_allocated: (index % 5) + 1,
          metadata: {
            sequence: index + 1,
          },
        }),
      ),
    ),
  );

  const mutableSubscriptionCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM subscriptions
      WHERE tenant_id = $1
        AND status IN ('trialing', 'active', 'past_due')
    `,
    [tenantId],
  );
  const totalSubscriptionCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM subscriptions
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const distinctResponseIds = new Set(results.map((result) => result.id));
  const currentSubscription = await queryRow<{
    id: string;
    status: string;
  }>(
    harness,
    tenantId,
    `
      SELECT id, status
      FROM subscriptions
      WHERE tenant_id = $1
        AND status IN ('trialing', 'active', 'past_due')
      LIMIT 1
    `,
    [tenantId],
  );

  return {
    scenario: 'billing-subscription-storm',
    tenant_id: tenantId,
    concurrency,
    duration_ms: Date.now() - startedAt,
    metrics: {
      mutable_subscriptions: mutableSubscriptionCount,
      total_subscriptions: totalSubscriptionCount,
      distinct_response_ids: distinctResponseIds.size,
      current_subscription_id: currentSubscription.id,
      current_subscription_status: currentSubscription.status,
    },
  };
};

export const runBillingUsageIdempotencyStorm = async (
  harness: RaceTestHarness,
  concurrency: number,
): Promise<RaceScenarioResult> => {
  const tenantId = registerTenantId('race-usage');
  await seedActiveSubscription(harness, tenantId);
  const sharedIdempotencyKey = `usage:${tenantId}:shared`;
  const startedAt = Date.now();

  const results = await Promise.all(
    Array.from({ length: concurrency }, async () =>
      runInTenantContext(harness, tenantId, () =>
        harness.usageMeterService.recordUsage({
          feature_key: 'students.created',
          quantity: '1',
          idempotency_key: sharedIdempotencyKey,
          metadata: {
            source: 'race-usage-storm',
          },
        }),
      ),
    ),
  );

  const distinctUsageRecordIds = new Set(results.map((result) => result.id));
  const persistedUsageRecordCount = await queryScalar<number>(
    harness,
    tenantId,
    `
      SELECT COUNT(*)::int AS value
      FROM usage_records
      WHERE tenant_id = $1
        AND idempotency_key = $2
    `,
    [tenantId, sharedIdempotencyKey],
  );

  return {
    scenario: 'billing-usage-idempotency-storm',
    tenant_id: tenantId,
    concurrency,
    duration_ms: Date.now() - startedAt,
    metrics: {
      distinct_usage_record_ids: distinctUsageRecordIds.size,
      persisted_usage_records: persistedUsageRecordCount,
    },
  };
};

const buildFinancialTransactionInput = (
  accounts: { debit_account_id: string; credit_account_id: string },
  idempotencyKey: string,
  reference: string,
  amountMinor: string,
  description: string,
): PostFinancialTransactionInput => ({
  idempotency_key: idempotencyKey,
  reference,
  description,
  entries: [
    {
      account_id: accounts.debit_account_id,
      direction: 'debit',
      amount_minor: amountMinor,
    },
    {
      account_id: accounts.credit_account_id,
      direction: 'credit',
      amount_minor: amountMinor,
    },
  ],
});

const countLedgerImbalances = async (
  harness: RaceTestHarness,
  tenantId: string,
): Promise<number> => {
  const violations = await queryRows<{ transaction_id: string }>(
    harness,
    tenantId,
    `
      SELECT
        t.id AS transaction_id
      FROM transactions t
      LEFT JOIN ledger_entries le
        ON le.tenant_id = t.tenant_id
       AND le.transaction_id = t.id
      WHERE t.tenant_id = $1
      GROUP BY t.id, t.entry_count
      HAVING COUNT(le.id) <> t.entry_count
         OR COALESCE(
              SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END),
              0
            ) <> COALESCE(
              SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END),
              0
            )
         OR COUNT(DISTINCT le.currency_code) <> 1
    `,
    [tenantId],
  );

  return violations.length;
};

const acquireAttendanceRecordLock = async (
  harness: RaceTestHarness,
  tenantId: string,
  recordId: string,
): Promise<{ release: () => Promise<void> }> => {
  const client = await harness.databaseService.acquireClient();
  const context: RequestContextState = {
    request_id: `race-lock:${randomUUID()}`,
    trace_id: `race-lock:${randomUUID()}`,
    span_id: generateSpanId(),
    parent_span_id: null,
    tenant_id: tenantId,
    audience: 'school',
    user_id: AUTH_ANONYMOUS_USER_ID,
    role: 'owner',
    session_id: null,
    permissions: ['*:*'],
    is_authenticated: true,
    client_ip: '127.0.0.1',
    user_agent: 'race-lock',
    method: 'TEST',
    path: '/integration/race/lock',
    started_at: new Date().toISOString(),
  };

  await harness.databaseService.initializeRequestSession(client, context);
  await client.query(
    `
      SELECT id
      FROM attendance_records
      WHERE tenant_id = $1
        AND id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [tenantId, recordId],
  );

  return {
    release: async (): Promise<void> => {
      try {
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    },
  };
};

const ATTENDANCE_STATUSES = ['present', 'late', 'excused', 'absent'] as const;
