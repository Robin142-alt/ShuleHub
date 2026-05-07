import type { AuthAudience } from '../../auth/auth.interfaces';
import type { PoolClient } from 'pg';

export interface BillingAccessContextState {
  subscription_id: string | null;
  plan_code: string | null;
  status: string | null;
  lifecycle_state: string | null;
  access_mode: 'full' | 'read_only' | 'billing_only' | null;
  features: string[];
  limits: Record<string, number | string | boolean | null>;
  current_period_start: string | null;
  current_period_end: string | null;
  warning_starts_at: string | null;
  grace_period_ends_at: string | null;
  restricted_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  renewal_required: boolean;
  is_active: boolean;
}

export interface RequestContextState {
  request_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  tenant_id: string | null;
  audience: AuthAudience | null;
  user_id: string;
  role: string | null;
  session_id: string | null;
  permissions: string[];
  is_authenticated: boolean;
  client_ip: string | null;
  user_agent: string | null;
  method: string;
  path: string;
  started_at: string;
  billing?: BillingAccessContextState;
  db_client?: PoolClient;
}

export type RequestContextSeed = Omit<
  RequestContextState,
  'trace_id' | 'span_id' | 'parent_span_id' | 'audience'
> & {
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string | null;
  audience?: AuthAudience | null;
};
