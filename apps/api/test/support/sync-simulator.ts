import { randomUUID } from 'node:crypto';

import { SyncPushOperationDto } from '../../src/modules/sync/dto/sync-push-operation.dto';
import { SyncPushOperationResultDto } from '../../src/modules/sync/dto/sync-push-response.dto';
import { SyncEntity, SyncOperationLog } from '../../src/modules/sync/sync.types';
import { RaceTestHarness, runInTenantContext } from './race-harness';

interface LocalAttendanceState {
  record_id: string;
  student_id: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  last_modified_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  source_device_id: string | null;
  last_operation_id: string | null;
  sync_version: string | null;
}

interface LocalFinanceState {
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
}

interface PullOptions {
  entities?: SyncEntity[];
  limit?: number;
  apply_operations?: boolean;
  persist_returned_cursors?: boolean;
  override_cursors?: Array<{ entity: SyncEntity; last_version: string }>;
}

interface PushOptions {
  persist_returned_cursors?: boolean;
  override_cursors?: Array<{ entity: SyncEntity; last_version: string }>;
}

export class SyncSimulatorDevice {
  private readonly cursors = new Map<SyncEntity, string>();
  private readonly attendance = new Map<string, LocalAttendanceState>();
  private readonly finance = new Map<string, LocalFinanceState>();
  private readonly observedOperationIds = new Set<string>();

  constructor(
    private readonly harness: RaceTestHarness,
    private readonly tenantId: string,
    readonly deviceId = `device-${randomUUID().slice(0, 8)}`,
    private readonly platform = 'android',
  ) {}

  async pull(options: PullOptions = {}): Promise<{
    operations: SyncOperationLog[];
    cursors: Array<{ entity: SyncEntity; last_version: string }>;
    has_more: boolean;
  }> {
    const response = await runInTenantContext(
      this.harness,
      this.tenantId,
      () =>
        this.harness.syncService.pull({
          device_id: this.deviceId,
          platform: this.platform,
          app_version: '1.0.0',
          metadata: {},
          entities: options.entities,
          limit: options.limit,
          cursors: options.override_cursors ?? this.getCursors(),
        }),
      {
        method: 'POST',
        path: '/sync/pull',
        user_agent: `sync-simulator:${this.deviceId}`,
      },
    );

    if (options.apply_operations !== false) {
      for (const operation of response.operations as SyncOperationLog[]) {
        this.applyOperation(operation);
      }
    }

    if (options.persist_returned_cursors !== false) {
      this.mergeCursors(response.cursors as Array<{ entity: SyncEntity; last_version: string }>);
    }

    return {
      operations: response.operations as SyncOperationLog[],
      cursors: response.cursors as Array<{ entity: SyncEntity; last_version: string }>,
      has_more: response.has_more,
    };
  }

  async pullUntilDrained(
    options: Omit<PullOptions, 'apply_operations' | 'persist_returned_cursors'> = {},
  ): Promise<{
    pages: number;
    total_operations: number;
    unique_operations: number;
    cursors: Array<{ entity: SyncEntity; last_version: string }>;
  }> {
    let pages = 0;
    let totalOperations = 0;
    const uniqueOperations = new Set<string>();

    while (true) {
      const response = await this.pull(options);
      pages += 1;
      totalOperations += response.operations.length;

      for (const operation of response.operations) {
        uniqueOperations.add(operation.op_id);
      }

      if (!response.has_more) {
        return {
          pages,
          total_operations: totalOperations,
          unique_operations: uniqueOperations.size,
          cursors: this.getCursors(),
        };
      }
    }
  }

  async push(operations: SyncPushOperationDto[], options: PushOptions = {}): Promise<{
    results: SyncPushOperationResultDto[];
    cursors: Array<{ entity: SyncEntity; last_version: string }>;
  }> {
    const response = await runInTenantContext(
      this.harness,
      this.tenantId,
      () =>
        this.harness.syncService.push({
          device_id: this.deviceId,
          platform: this.platform,
          app_version: '1.0.0',
          metadata: {},
          cursors: options.override_cursors ?? this.getCursors(),
          operations,
        }),
      {
        method: 'POST',
        path: '/sync/push',
        user_agent: `sync-simulator:${this.deviceId}`,
      },
    );

    for (const result of response.results as SyncPushOperationResultDto[]) {
      if (result.entity === 'attendance' && result.server_state) {
        this.applyAttendanceServerState(result.server_state);
      }
    }

    if (options.persist_returned_cursors !== false) {
      this.mergeCursors(response.cursors as Array<{ entity: SyncEntity; last_version: string }>);
    }

    return {
      results: response.results as SyncPushOperationResultDto[],
      cursors: response.cursors as Array<{ entity: SyncEntity; last_version: string }>,
    };
  }

  getCursors(): Array<{ entity: SyncEntity; last_version: string }> {
    return [...this.cursors.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entity, lastVersion]) => ({
        entity,
        last_version: lastVersion,
      }));
  }

  getAttendanceSnapshot(): LocalAttendanceState[] {
    return [...this.attendance.values()].sort((left, right) => {
      const leftKey = `${left.student_id}:${left.attendance_date}`;
      const rightKey = `${right.student_id}:${right.attendance_date}`;
      return leftKey.localeCompare(rightKey);
    });
  }

  getFinanceSnapshot(): LocalFinanceState[] {
    return [...this.finance.values()].sort((left, right) =>
      left.transaction_id.localeCompare(right.transaction_id),
    );
  }

  getObservedOperationIds(): string[] {
    return [...this.observedOperationIds].sort((left, right) => left.localeCompare(right));
  }

  private mergeCursors(cursors: Array<{ entity: SyncEntity; last_version: string }>): void {
    for (const cursor of cursors) {
      const existingVersion = this.cursors.get(cursor.entity) ?? '0';
      this.cursors.set(
        cursor.entity,
        BigInt(existingVersion) >= BigInt(cursor.last_version)
          ? existingVersion
          : cursor.last_version,
      );
    }
  }

  private applyOperation(operation: SyncOperationLog): void {
    this.observedOperationIds.add(operation.op_id);

    if (operation.entity === 'attendance') {
      this.applyAttendanceOperation(operation as SyncOperationLog<'attendance'>);
      return;
    }

    this.applyFinanceOperation(operation as SyncOperationLog<'finance'>);
  }

  private applyAttendanceOperation(operation: SyncOperationLog<'attendance'>): void {
    const payload = operation.payload;
    const key = `${payload.student_id}:${payload.attendance_date}`;
    const incomingState: LocalAttendanceState = {
      record_id: payload.record_id,
      student_id: payload.student_id,
      attendance_date: payload.attendance_date,
      status: payload.status,
      last_modified_at: payload.last_modified_at,
      notes: payload.notes ?? null,
      metadata: payload.metadata ?? {},
      source_device_id: operation.device_id,
      last_operation_id: operation.op_id,
      sync_version: operation.version,
    };
    const existingState = this.attendance.get(key);

    if (!existingState || this.shouldReplaceAttendance(existingState, incomingState)) {
      this.attendance.set(key, incomingState);
    }
  }

  private applyFinanceOperation(operation: SyncOperationLog<'finance'>): void {
    const payload = operation.payload;

    this.finance.set(payload.transaction_id, {
      transaction_id: payload.transaction_id,
      reference: payload.reference,
      description: payload.description,
      total_amount_minor: payload.total_amount_minor,
      currency_code: payload.currency_code,
      entry_count: payload.entry_count,
      posted_at: payload.posted_at,
      metadata: payload.metadata ?? {},
      source: payload.source,
      sync_version: operation.version,
      op_id: operation.op_id,
    });
  }

  private applyAttendanceServerState(serverState: Record<string, unknown>): void {
    const normalizedState: LocalAttendanceState = {
      record_id: String(serverState.record_id),
      student_id: String(serverState.student_id),
      attendance_date: String(serverState.attendance_date),
      status: serverState.status as LocalAttendanceState['status'],
      last_modified_at: String(serverState.last_modified_at),
      notes:
        typeof serverState.notes === 'string' ? serverState.notes : serverState.notes == null ? null : String(serverState.notes),
      metadata:
        serverState.metadata && typeof serverState.metadata === 'object' && !Array.isArray(serverState.metadata)
          ? (serverState.metadata as Record<string, unknown>)
          : {},
      source_device_id:
        typeof serverState.source_device_id === 'string' ? serverState.source_device_id : null,
      last_operation_id:
        typeof serverState.last_operation_id === 'string' ? serverState.last_operation_id : null,
      sync_version:
        typeof serverState.sync_version === 'string' ? serverState.sync_version : null,
    };
    const key = `${normalizedState.student_id}:${normalizedState.attendance_date}`;
    const existingState = this.attendance.get(key);

    if (!existingState || this.shouldReplaceAttendance(existingState, normalizedState)) {
      this.attendance.set(key, normalizedState);
    }
  }

  private shouldReplaceAttendance(
    existingState: LocalAttendanceState,
    incomingState: LocalAttendanceState,
  ): boolean {
    const existingTimestamp = new Date(existingState.last_modified_at).getTime();
    const incomingTimestamp = new Date(incomingState.last_modified_at).getTime();

    if (incomingTimestamp > existingTimestamp) {
      return true;
    }

    if (incomingTimestamp < existingTimestamp) {
      return false;
    }

    return (
      (incomingState.last_operation_id ?? '').localeCompare(
        existingState.last_operation_id ?? '',
      ) >= 0
    );
  }
}
