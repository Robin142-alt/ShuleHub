import { BaseEntity } from '../../../database/entities/base.entity';

export class FinancialTransactionEntity extends BaseEntity {
  idempotency_key_id!: string;
  reference!: string;
  description!: string;
  currency_code!: string;
  total_amount_minor!: string;
  entry_count!: number;
  effective_at!: Date;
  posted_at!: Date;
  created_by_user_id!: string | null;
  request_id!: string | null;
  metadata!: Record<string, unknown>;
}

