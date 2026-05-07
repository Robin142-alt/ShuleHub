export class UsageRecordResponseDto {
  id!: string;
  tenant_id!: string;
  subscription_id!: string;
  feature_key!: string;
  quantity!: string;
  unit!: string;
  idempotency_key!: string;
  recorded_at!: string;
  period_start!: string;
  period_end!: string;
  metadata!: Record<string, unknown>;
  created_at!: string;
  updated_at!: string;
}
