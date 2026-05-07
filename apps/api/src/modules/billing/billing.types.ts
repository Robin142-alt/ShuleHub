import { BillingAccessContextState } from '../../common/request-context/request-context.types';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'restricted'
  | 'suspended'
  | 'canceled'
  | 'expired';

export type SubscriptionLifecycleState =
  | 'ACTIVE'
  | 'TRIAL'
  | 'EXPIRING'
  | 'GRACE_PERIOD'
  | 'RESTRICTED'
  | 'SUSPENDED';

export type SubscriptionAccessMode = 'full' | 'read_only' | 'billing_only';

export type BillingNotificationChannel = 'admin' | 'sms' | 'email';

export type BillingNotificationStatus = 'queued' | 'sent' | 'failed' | 'dismissed';

export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'pending_payment'
  | 'paid'
  | 'void'
  | 'uncollectible';

export interface BillingPlanDefinition {
  code: string;
  name: string;
  features: string[];
  limits: Record<string, number>;
  period_days: number;
  default_status: SubscriptionStatus;
}

export interface SubscriptionFeatureGate {
  feature: string;
}

export interface SubscriptionLifecycleOverview {
  lifecycle_state: SubscriptionLifecycleState;
  access_mode: SubscriptionAccessMode;
  warning_starts_at: string | null;
  grace_period_ends_at: string | null;
  restricted_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  renewal_required: boolean;
}

export interface BillingAccessContext extends BillingAccessContextState {}

export interface UsageSummary {
  feature_key: string;
  total_quantity: string;
}
