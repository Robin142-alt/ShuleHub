export class SyncPullOperationDto {
  op_id!: string;
  tenant_id!: string;
  device_id!: string;
  entity!: string;
  payload!: Record<string, unknown>;
  version!: string;
  created_at!: string;
  updated_at!: string;
}

export class SyncPullResponseDto {
  operations!: SyncPullOperationDto[];
  cursors!: Array<{
    entity: string;
    last_version: string;
  }>;
  has_more!: boolean;
}
