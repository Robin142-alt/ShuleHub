export type SyncEntity = 'finance';
export type SyncConflictPolicy = 'server-authoritative';
export type SyncPushOperationStatus = 'applied' | 'duplicate' | 'rejected';

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
