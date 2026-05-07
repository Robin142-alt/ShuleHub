import { SyncConflictPolicy, SyncPushOperationStatus } from '../sync.types';

export class SyncPushOperationResultDto {
  op_id!: string;
  entity!: string;
  status!: SyncPushOperationStatus;
  client_version!: number;
  server_version!: string | null;
  reason!: string | null;
  conflict_policy!: SyncConflictPolicy | null;
  server_state!: Record<string, unknown> | null;
}

export class SyncPushResponseDto {
  device!: {
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
  };
  results!: SyncPushOperationResultDto[];
  cursors!: Array<{
    entity: string;
    last_version: string;
  }>;
}
