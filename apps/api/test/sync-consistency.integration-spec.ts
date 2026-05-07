import { randomUUID } from 'node:crypto';

import {
  closeRaceTestHarness,
  createRaceTestHarness,
  ensureFinanceAccounts,
  queryRow,
  queryRows,
  queryScalar,
  RaceTestHarness,
  registerTenantId,
  runInTenantContext,
  seedActiveSubscription,
  seedStudent,
} from './support/race-harness';
import { SyncSimulatorDevice } from './support/sync-simulator';

jest.setTimeout(900000);

describe('Offline-first sync consistency', () => {
  let harness: RaceTestHarness;

  beforeAll(async () => {
    harness = await createRaceTestHarness();
  });

  afterAll(async () => {
    if (harness) {
      await closeRaceTestHarness(harness);
    }
  });

  it('keeps multiple devices converged on the newest attendance edit', async () => {
    const tenantId = registerTenantId('sync-multi-device');
    await seedActiveSubscription(harness, tenantId);
    const student = await seedStudent(harness, tenantId, 'sync-multi-device');
    const recordId = randomUUID();
    const deviceA = new SyncSimulatorDevice(harness, tenantId, 'sync-device-a');
    const deviceB = new SyncSimulatorDevice(harness, tenantId, 'sync-device-b');
    const deviceC = new SyncSimulatorDevice(harness, tenantId, 'sync-device-c');

    await deviceA.push([
      buildAttendanceOperation({
        opId: randomUUID(),
        version: 1,
        recordId,
        studentId: student.id,
        attendanceDate: '2026-05-01',
        status: 'absent',
        lastModifiedAt: '2026-05-01T07:00:00.000Z',
        notes: 'device-a:first-write',
      }),
    ]);
    await deviceB.push([
      buildAttendanceOperation({
        opId: randomUUID(),
        version: 1,
        recordId,
        studentId: student.id,
        attendanceDate: '2026-05-01',
        status: 'present',
        lastModifiedAt: '2026-05-01T07:05:00.000Z',
        notes: 'device-b:newest-write',
      }),
    ]);

    await deviceA.pullUntilDrained({ entities: ['attendance'], limit: 10 });
    await deviceB.pullUntilDrained({ entities: ['attendance'], limit: 10 });
    await deviceC.pullUntilDrained({ entities: ['attendance'], limit: 10 });

    const serverAttendance = await fetchAttendanceSnapshot(harness, tenantId);

    expect(deviceA.getAttendanceSnapshot()).toEqual(serverAttendance);
    expect(deviceB.getAttendanceSnapshot()).toEqual(serverAttendance);
    expect(deviceC.getAttendanceSnapshot()).toEqual(serverAttendance);
    expect(serverAttendance).toEqual([
      {
        record_id: recordId,
        student_id: student.id,
        attendance_date: '2026-05-01',
        status: 'present',
        last_modified_at: '2026-05-01T07:05:00.000Z',
        notes: 'device-b:newest-write',
        metadata: {},
        source_device_id: 'sync-device-b',
        last_operation_id: expect.any(String),
        sync_version: expect.any(String),
      },
    ]);
  });

  it('rejects out-of-order stale attendance writes even when client versions are higher', async () => {
    const tenantId = registerTenantId('sync-out-of-order');
    await seedActiveSubscription(harness, tenantId);
    const student = await seedStudent(harness, tenantId, 'sync-out-of-order');
    const recordId = randomUUID();
    const deviceA = new SyncSimulatorDevice(harness, tenantId, 'sync-device-out-order-a');
    const deviceB = new SyncSimulatorDevice(harness, tenantId, 'sync-device-out-order-b');
    const observer = new SyncSimulatorDevice(harness, tenantId, 'sync-device-out-order-c');

    const newerWrite = await deviceA.push([
      buildAttendanceOperation({
        opId: randomUUID(),
        version: 99,
        recordId,
        studentId: student.id,
        attendanceDate: '2026-05-02',
        status: 'late',
        lastModifiedAt: '2026-05-02T08:10:00.000Z',
        notes: 'newer-write',
      }),
    ]);
    const staleWrite = await deviceB.push([
      buildAttendanceOperation({
        opId: randomUUID(),
        version: 1000,
        recordId,
        studentId: student.id,
        attendanceDate: '2026-05-02',
        status: 'absent',
        lastModifiedAt: '2026-05-02T08:00:00.000Z',
        notes: 'stale-write',
      }),
    ]);

    expect((newerWrite.results[0] as { status: string }).status).toBe('applied');
    expect((staleWrite.results[0] as { status: string }).status).toBe('rejected');
    expect((staleWrite.results[0] as { conflict_policy: string }).conflict_policy).toBe(
      'last-write-wins',
    );

    await observer.pullUntilDrained({ entities: ['attendance'], limit: 10 });

    expect(await queryScalar<number>(
      harness,
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND entity = 'attendance'
      `,
      [tenantId],
    )).toBe(1);
    expect(await fetchAttendanceSnapshot(harness, tenantId)).toEqual(
      observer.getAttendanceSnapshot(),
    );
    expect(observer.getAttendanceSnapshot()[0]).toMatchObject({
      record_id: recordId,
      status: 'late',
      notes: 'newer-write',
      last_modified_at: '2026-05-02T08:10:00.000Z',
    });
  });

  it('deduplicates repeated operations across same-batch and retried pushes', async () => {
    const tenantId = registerTenantId('sync-duplicate-ops');
    await seedActiveSubscription(harness, tenantId);
    const student = await seedStudent(harness, tenantId, 'sync-duplicate-ops');
    const device = new SyncSimulatorDevice(harness, tenantId, 'sync-device-duplicates');
    const observer = new SyncSimulatorDevice(harness, tenantId, 'sync-device-duplicates-observer');
    const duplicateOperation = buildAttendanceOperation({
      opId: randomUUID(),
      version: 1,
      recordId: randomUUID(),
      studentId: student.id,
      attendanceDate: '2026-05-03',
      status: 'present',
      lastModifiedAt: '2026-05-03T07:00:00.000Z',
      notes: 'duplicate-target',
    });
    const operations = [
      duplicateOperation,
      buildAttendanceOperation({
        opId: randomUUID(),
        version: 2,
        recordId: randomUUID(),
        studentId: student.id,
        attendanceDate: '2026-05-04',
        status: 'absent',
        lastModifiedAt: '2026-05-04T07:00:00.000Z',
        notes: 'unique-2',
      }),
      buildAttendanceOperation({
        opId: randomUUID(),
        version: 3,
        recordId: randomUUID(),
        studentId: student.id,
        attendanceDate: '2026-05-05',
        status: 'late',
        lastModifiedAt: '2026-05-05T07:00:00.000Z',
        notes: 'unique-3',
      }),
      duplicateOperation,
    ];

    const firstAttempt = await device.push(operations);
    const secondAttempt = await device.push(operations);

    expect(firstAttempt.results.map((result) => (result as { status: string }).status)).toEqual([
      'applied',
      'applied',
      'applied',
      'duplicate',
    ]);
    expect(secondAttempt.results.map((result) => (result as { status: string }).status)).toEqual([
      'duplicate',
      'duplicate',
      'duplicate',
      'duplicate',
    ]);

    await observer.pullUntilDrained({ entities: ['attendance'], limit: 20 });

    expect(await queryScalar<number>(
      harness,
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM attendance_records
        WHERE tenant_id = $1
      `,
      [tenantId],
    )).toBe(3);
    expect(await queryScalar<number>(
      harness,
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND entity = 'attendance'
      `,
      [tenantId],
    )).toBe(3);
    expect(observer.getObservedOperationIds()).toHaveLength(3);
  });

  it('paginates large mixed sync batches without data loss and with correct cursors', async () => {
    const tenantId = registerTenantId('sync-large-batch');
    await seedActiveSubscription(harness, tenantId);
    const student = await seedStudent(harness, tenantId, 'sync-large-batch');
    const accounts = await ensureFinanceAccounts(harness, tenantId, '1100-CASH', '4100-TUITION');
    const device = new SyncSimulatorDevice(harness, tenantId, 'sync-device-large-batch');

    await createAttendanceOperations(harness, tenantId, student.id, 120, '2026-06-01');
    await createFinanceTransactions(harness, tenantId, accounts, 18);

    const drainResult = await device.pullUntilDrained({
      entities: ['attendance', 'finance'],
      limit: 17,
    });
    const serverAttendance = await fetchAttendanceSnapshot(harness, tenantId);
    const serverFinance = await fetchFinanceSnapshot(harness, tenantId);
    const latestCursors = await fetchLatestCursors(harness, tenantId);
    const totalServerOperations = await queryScalar<number>(
      harness,
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND entity = ANY($2::text[])
      `,
      [tenantId, ['attendance', 'finance']],
    );

    expect(drainResult.total_operations).toBe(totalServerOperations);
    expect(drainResult.unique_operations).toBe(totalServerOperations);
    expect(device.getAttendanceSnapshot()).toEqual(serverAttendance);
    expect(device.getFinanceSnapshot()).toEqual(serverFinance);
    expect(device.getCursors()).toEqual(latestCursors);
    expect(drainResult.pages).toBeGreaterThan(5);
  });

  it('replays interrupted pull windows without losing or skipping operations', async () => {
    const tenantId = registerTenantId('sync-network-interruption');
    await seedActiveSubscription(harness, tenantId);
    const student = await seedStudent(harness, tenantId, 'sync-network-interruption');
    const accounts = await ensureFinanceAccounts(harness, tenantId, '1200-CASH', '4200-FEES');
    const device = new SyncSimulatorDevice(harness, tenantId, 'sync-device-network');

    await createAttendanceOperations(harness, tenantId, student.id, 40, '2026-07-01');
    await createFinanceTransactions(harness, tenantId, accounts, 8);

    const pageOne = await device.pull({
      entities: ['attendance', 'finance'],
      limit: 11,
    });
    const lostPageTwo = await device.pull({
      entities: ['attendance', 'finance'],
      limit: 11,
      apply_operations: false,
      persist_returned_cursors: false,
    });
    const replayedPageTwo = await device.pull({
      entities: ['attendance', 'finance'],
      limit: 11,
    });
    const drainResult = await device.pullUntilDrained({
      entities: ['attendance', 'finance'],
      limit: 11,
    });
    const latestCursors = await fetchLatestCursors(harness, tenantId);
    const totalServerOperations = await queryScalar<number>(
      harness,
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND entity = ANY($2::text[])
      `,
      [tenantId, ['attendance', 'finance']],
    );

    expect(pageOne.operations).not.toHaveLength(0);
    expect(lostPageTwo.operations.map((operation) => operation.op_id)).toEqual(
      replayedPageTwo.operations.map((operation) => operation.op_id),
    );
    expect(lostPageTwo.cursors).toEqual(replayedPageTwo.cursors);
    expect(device.getObservedOperationIds()).toHaveLength(totalServerOperations);
    expect(drainResult.unique_operations + pageOne.operations.length + replayedPageTwo.operations.length)
      .toBeGreaterThanOrEqual(totalServerOperations);
    expect(device.getCursors()).toEqual(latestCursors);
  });
});

const buildAttendanceOperation = ({
  opId,
  version,
  recordId,
  studentId,
  attendanceDate,
  status,
  lastModifiedAt,
  notes,
}: {
  opId: string;
  version: number;
  recordId: string;
  studentId: string;
  attendanceDate: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  lastModifiedAt: string;
  notes: string;
}): {
  op_id: string;
  entity: 'attendance';
  version: number;
  payload: {
    action: 'upsert';
    record_id: string;
    student_id: string;
    attendance_date: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    last_modified_at: string;
    notes: string;
    metadata: Record<string, unknown>;
  };
} => ({
  op_id: opId,
  entity: 'attendance',
  version,
  payload: {
    action: 'upsert',
    record_id: recordId,
    student_id: studentId,
    attendance_date: attendanceDate,
    status,
    last_modified_at: lastModifiedAt,
    notes,
    metadata: {},
  },
});

const createAttendanceOperations = async (
  harness: RaceTestHarness,
  tenantId: string,
  studentId: string,
  count: number,
  dateSeed: string,
): Promise<void> => {
  const baseDate = new Date(`${dateSeed}T00:00:00.000Z`);

  for (let index = 0; index < count; index += 1) {
    const attendanceDate = new Date(baseDate.getTime() + index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const lastModifiedAt = new Date(baseDate.getTime() + index * 60 * 1000).toISOString();
    await runInTenantContext(harness, tenantId, () =>
      harness.attendanceService.upsertStudentAttendance(studentId, attendanceDate, {
        status: index % 2 === 0 ? 'present' : 'absent',
        last_modified_at: lastModifiedAt,
        notes: `server-attendance-${index + 1}`,
        metadata: {
          batch: 'large-sync',
          ordinal: index + 1,
        },
      }),
    );
  }
};

const createFinanceTransactions = async (
  harness: RaceTestHarness,
  tenantId: string,
  accounts: Awaited<ReturnType<typeof ensureFinanceAccounts>>,
  count: number,
): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await runInTenantContext(harness, tenantId, () =>
      harness.transactionService.postTransaction({
        idempotency_key: `sync-finance-${index + 1}-${randomUUID()}`,
        reference: `SYNC-FIN-${index + 1}`,
        description: `Offline finance sync seed ${index + 1}`,
        metadata: {
          batch: 'large-sync',
          ordinal: index + 1,
        },
        entries: [
          {
            account_id: accounts.debit_account_id,
            direction: 'debit',
            amount_minor: '1500',
            description: `Debit ${index + 1}`,
          },
          {
            account_id: accounts.credit_account_id,
            direction: 'credit',
            amount_minor: '1500',
            description: `Credit ${index + 1}`,
          },
        ],
      }),
    );
  }
};

const fetchAttendanceSnapshot = async (
  harness: RaceTestHarness,
  tenantId: string,
): Promise<
  Array<{
    record_id: string;
    student_id: string;
    attendance_date: string;
    status: string;
    last_modified_at: string;
    notes: string | null;
    metadata: Record<string, unknown>;
    source_device_id: string | null;
    last_operation_id: string | null;
    sync_version: string | null;
  }>
> => {
  const rows = await queryRows<{
    record_id: string;
    student_id: string;
    attendance_date: string;
    status: string;
    last_modified_at: Date;
    notes: string | null;
    metadata: Record<string, unknown> | null;
    source_device_id: string | null;
    last_operation_id: string | null;
    sync_version: string | null;
  }>(
    harness,
    tenantId,
    `
      SELECT
        id AS record_id,
        student_id,
        attendance_date::text,
        status,
        last_modified_at,
        notes,
        metadata,
        source_device_id,
        last_operation_id,
        sync_version::text
      FROM attendance_records
      WHERE tenant_id = $1
      ORDER BY student_id ASC, attendance_date ASC
    `,
    [tenantId],
  );

  return rows.map((row) => ({
    record_id: row.record_id,
    student_id: row.student_id,
    attendance_date: row.attendance_date,
    status: row.status,
    last_modified_at: row.last_modified_at.toISOString(),
    notes: row.notes,
    metadata: row.metadata ?? {},
    source_device_id: row.source_device_id,
    last_operation_id: row.last_operation_id,
    sync_version: row.sync_version,
  }));
};

const fetchFinanceSnapshot = async (
  harness: RaceTestHarness,
  tenantId: string,
): Promise<
  Array<{
    transaction_id: string;
    reference: string;
    description: string;
    total_amount_minor: string;
    currency_code: string;
    entry_count: number;
    posted_at: string;
    metadata: Record<string, unknown>;
    source: 'server' | undefined;
    sync_version: string;
    op_id: string;
  }>
> => {
  const rows = await queryRows<{
    op_id: string;
    payload: {
      transaction_id: string;
      reference: string;
      description: string;
      total_amount_minor: string;
      currency_code: string;
      entry_count: number;
      posted_at: string;
      metadata?: Record<string, unknown>;
      source?: 'server';
    };
    version: string;
  }>(
    harness,
    tenantId,
    `
      SELECT
        op_id,
        payload,
        version::text
      FROM sync_operation_logs
      WHERE tenant_id = $1
        AND entity = 'finance'
      ORDER BY version ASC
    `,
    [tenantId],
  );

  return rows
    .map((row) => ({
    transaction_id: row.payload.transaction_id,
    reference: row.payload.reference,
    description: row.payload.description,
    total_amount_minor: row.payload.total_amount_minor,
    currency_code: row.payload.currency_code,
    entry_count: row.payload.entry_count,
    posted_at: row.payload.posted_at,
    metadata: row.payload.metadata ?? {},
    source: row.payload.source,
    sync_version: row.version,
    op_id: row.op_id,
    }))
    .sort((left, right) => left.transaction_id.localeCompare(right.transaction_id));
};

const fetchLatestCursors = async (
  harness: RaceTestHarness,
  tenantId: string,
): Promise<Array<{ entity: 'attendance' | 'finance'; last_version: string }>> => {
  const attendanceCursor = await queryRow<{ value: string }>(
    harness,
    tenantId,
    `
      SELECT COALESCE(MAX(version)::text, '0') AS value
      FROM sync_operation_logs
      WHERE tenant_id = $1
        AND entity = 'attendance'
    `,
    [tenantId],
  );
  const financeCursor = await queryRow<{ value: string }>(
    harness,
    tenantId,
    `
      SELECT COALESCE(MAX(version)::text, '0') AS value
      FROM sync_operation_logs
      WHERE tenant_id = $1
        AND entity = 'finance'
    `,
    [tenantId],
  );

  return [
    {
      entity: 'attendance',
      last_version: attendanceCursor.value,
    },
    {
      entity: 'finance',
      last_version: financeCursor.value,
    },
  ];
};
