import { BaseEntity } from '../../../database/entities/base.entity';
import { SubscriptionStatus } from '../billing.types';

export class SubscriptionEntity extends BaseEntity {
  plan_code!: string;
  status!: SubscriptionStatus;
  billing_phone_number!: string | null;
  currency_code!: string;
  features!: string[];
  limits!: Record<string, number | string | boolean | null>;
  seats_allocated!: number;
  current_period_start!: Date;
  current_period_end!: Date;
  trial_ends_at!: Date | null;
  grace_period_ends_at!: Date | null;
  restricted_at!: Date | null;
  suspended_at!: Date | null;
  suspension_reason!: string | null;
  activated_at!: Date | null;
  canceled_at!: Date | null;
  last_invoice_at!: Date | null;
  metadata!: Record<string, unknown>;
}
