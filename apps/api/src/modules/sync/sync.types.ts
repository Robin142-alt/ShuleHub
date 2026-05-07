export type SyncEntity = 'attendance' | 'finance';
export type SyncConflictPolicy = 'last-write-wins' | 'server-authoritative';
export type SyncPushOperationStatus = 'applied' | 'duplicate' | 'rejected';

export interface AttendanceSyncPayload extends Record<string, unknown> {
  action: 'upsert';
  record_id: string;
  student_id: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  last_modified_at: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  client_version?: number;
  source?: 'device' | 'server';
}

export interface FinanceSyncPayload extends Record<string, unknown> {
  action: 'posted';
  transaction_id: string;
  reference: string;
  description: string;
  total_amount_minor: string;
  currency_code: string;
  entry_count: number;
  posted_at: string;
  source?: 'server';
  metadata?: Record<string, unknown>;
}

export interface SyncPayloadMap {
  attendance: AttendanceSyncPayload;
  finance: FinanceSyncPayload;
}

export interface SyncOperationLog<TEntity extends SyncEntity = SyncEntity> {
  op_id: string;
  tenant_id: string;
  device_id: string;
  entity: TEntity;
  payload: SyncPayloadMap[TEntity];
  version: string;
  created_at: string;
  updated_at: string;
}

export interface SyncCursorState<TEntity extends SyncEntity = SyncEntity> {
  tenant_id: string;
  device_id: string;
  entity: TEntity;
  last_version: string;
  updated_at: string;
}

export interface DeviceRegistration {
  id: string;
  tenant_id: string;
  device_id: string;
  platform: string;
  app_version: string | null;
  metadata: Record<string, unknown>;
  last_seen_at: string;
  last_push_at: string | null;
  last_pull_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecordState extends Record<string, unknown> {
  record_id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceSyncPayload['status'];
  last_modified_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  source_device_id: string | null;
  last_operation_id: string | null;
  sync_version: string | null;
}

export interface SyncPushOperationInput<TEntity extends SyncEntity = SyncEntity> {
  op_id: string;
  entity: TEntity;
  payload: SyncPayloadMap[TEntity];
  version: number;
}

export interface SyncPushOperationResult<TEntity extends SyncEntity = SyncEntity> {
  op_id: string;
  entity: TEntity;
  status: SyncPushOperationStatus;
  client_version: number;
  server_version: string | null;
  reason: string | null;
  conflict_policy: SyncConflictPolicy | null;
  server_state?: Record<string, unknown> | null;
}

export interface SyncPullResult {
  operations: SyncOperationLog[];
  cursors: Array<{
    entity: SyncEntity;
    last_version: string;
  }>;
  has_more: boolean;
}

export interface SyncPushResult {
  device: DeviceRegistration;
  results: SyncPushOperationResult[];
  cursors: Array<{
    entity: SyncEntity;
    last_version: string;
  }>;
}
