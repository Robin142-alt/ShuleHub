export class SubscriptionLifecycleResponseDto {
  subscription_id!: string;
  tenant_id!: string;
  plan_code!: string;
  status!: string;
  lifecycle_state!: string;
  access_mode!: 'full' | 'read_only' | 'billing_only';
  renewal_required!: boolean;
  warning_starts_at!: string | null;
  grace_period_ends_at!: string | null;
  restricted_at!: string | null;
  suspended_at!: string | null;
  suspension_reason!: string | null;
  current_period_start!: string;
  current_period_end!: string;
  trial_ends_at!: string | null;
}
