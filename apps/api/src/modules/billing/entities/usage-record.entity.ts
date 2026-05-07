import { BaseEntity } from '../../../database/entities/base.entity';

export class UsageRecordEntity extends BaseEntity {
  subscription_id!: string;
  feature_key!: string;
  quantity!: string;
  unit!: string;
  idempotency_key!: string;
  recorded_at!: Date;
  period_start!: Date;
  period_end!: Date;
  metadata!: Record<string, unknown>;
}
