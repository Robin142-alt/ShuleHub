export class SubscriptionResponseDto {
  id!: string;
  tenant_id!: string;
  plan_code!: string;
  status!: string;
  billing_phone_number!: string | null;
  currency_code!: string;
  features!: string[];
  limits!: Record<string, number | string | boolean | null>;
  seats_allocated!: number;
  current_period_start!: string;
  current_period_end!: string;
  trial_ends_at!: string | null;
  grace_period_ends_at!: string | null;
  restricted_at!: string | null;
  suspended_at!: string | null;
  suspension_reason!: string | null;
  lifecycle_state!: string;
  access_mode!: string;
  renewal_required!: boolean;
  activated_at!: string | null;
  canceled_at!: string | null;
  last_invoice_at!: string | null;
  metadata!: Record<string, unknown>;
  created_at!: string;
  updated_at!: string;
}
