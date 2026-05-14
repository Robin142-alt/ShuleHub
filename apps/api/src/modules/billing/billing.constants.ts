import { SubscriptionAccessMode, SubscriptionLifecycleState, SubscriptionStatus } from './billing.types';

export const FEATURE_GATE_KEY = 'billing:feature-gate';
export const BILLING_DEFAULT_CURRENCY_CODE = 'KES';
export const BILLING_INVOICE_NUMBER_PREFIX = 'INV';
export const BILLING_MPESA_FEATURE = 'billing.mpesa';

export const BILLING_ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'restricted',
];
export const BILLING_MUTABLE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'restricted',
];
export const BILLING_FULL_ACCESS_MODE: SubscriptionAccessMode = 'full';
export const BILLING_READ_ONLY_ACCESS_MODE: SubscriptionAccessMode = 'read_only';
export const BILLING_BILLING_ONLY_ACCESS_MODE: SubscriptionAccessMode = 'billing_only';
export const BILLING_EXPIRING_WINDOW_DAYS = 5;
export const BILLING_GRACE_PERIOD_DAYS = 7;
export const BILLING_RESTRICTED_PERIOD_DAYS = 7;
export const BILLING_ALLOWED_EXPORT_PATH_PREFIXES = ['/compliance/me/export'];
export const BILLING_ALLOWED_BILLING_PATH_PREFIXES = [
  '/billing',
  '/health',
  '/auth',
  '/observability',
  '/platform',
  '/support',
];
export const BILLING_ALLOWED_SYSTEM_EXACT_PATHS = ['/', '/dashboard', '/app', '/ops'];
export const BILLING_ALLOWED_READ_ONLY_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;
export const BILLING_RENEWAL_INVOICE_METADATA_KEY = 'renewal_window';
export const BILLING_NOTIFICATION_CHANNELS = ['admin', 'sms', 'email'] as const;
export const BILLING_LIFECYCLE_STATES: readonly SubscriptionLifecycleState[] = [
  'ACTIVE',
  'TRIAL',
  'EXPIRING',
  'GRACE_PERIOD',
  'RESTRICTED',
  'SUSPENDED',
];

export const BILLING_PLAN_CATALOG = {
  trial: {
    code: 'trial',
    name: 'Trial',
    features: ['students', 'billing.mpesa'],
    limits: {
      'students.max_active': 250,
      'usage.events.monthly': 10000,
    },
    period_days: 14,
    default_status: 'trialing',
  },
  starter: {
    code: 'starter',
    name: 'Starter',
    features: ['students', 'billing.mpesa'],
    limits: {
      'students.max_active': 1000,
      'usage.events.monthly': 50000,
    },
    period_days: 30,
    default_status: 'active',
  },
  growth: {
    code: 'growth',
    name: 'Growth',
    features: ['students', 'billing.mpesa'],
    limits: {
      'students.max_active': 5000,
      'usage.events.monthly': 250000,
    },
    period_days: 30,
    default_status: 'active',
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise',
    features: ['*'],
    limits: {},
    period_days: 30,
    default_status: 'active',
  },
} as const;

export const BILLING_SUPPORTED_PLAN_CODES = Object.keys(BILLING_PLAN_CATALOG) as Array<
  keyof typeof BILLING_PLAN_CATALOG
>;
