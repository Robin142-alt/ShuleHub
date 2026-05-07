import { BaseEntity } from '../../../database/entities/base.entity';

export class SyncDeviceEntity extends BaseEntity {
  device_id!: string;
  platform!: string;
  app_version!: string | null;
  metadata!: Record<string, unknown>;
  last_seen_at!: Date;
  last_push_at!: Date | null;
  last_pull_at!: Date | null;
}
