export type SloSubsystemKey = 'api' | 'mpesa' | 'sync' | 'queue' | 'database';

export type SloStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type SloSeverity = 'warning' | 'critical';
export type SloComparator = 'gte' | 'lte';
export type SloUnit = 'ratio' | 'milliseconds' | 'count';

export interface SloObjectiveDefinition {
  id: string;
  subsystem: SloSubsystemKey;
  title: string;
  description: string;
  target_value: number;
  comparator: SloComparator;
  unit: SloUnit;
  window_seconds: number;
  severity: SloSeverity;
}

export interface SloObjectiveEvaluation {
  id: string;
  title: string;
  description: string;
  status: SloStatus;
  observed_value: number | null;
  target_value: number;
  comparator: SloComparator;
  unit: SloUnit;
  sample_size: number;
  message: string;
}

export interface SloAlert {
  id: string;
  subsystem: SloSubsystemKey;
  severity: SloSeverity;
  status: 'open';
  objective_id: string;
  title: string;
  message: string;
  observed_value: number | null;
  target_value: number;
  comparator: SloComparator;
  unit: SloUnit;
  triggered_at: string;
  last_evaluated_at: string;
}

export interface SloSubsystemCard {
  subsystem: SloSubsystemKey;
  display_name: string;
  status: SloStatus;
  objectives: SloObjectiveEvaluation[];
  summary: Record<string, number | string | null>;
  live_gauges: Record<string, unknown>;
}

export interface SloInfrastructureStatus {
  postgres: 'up' | 'down' | 'unknown';
  redis: 'up' | 'down' | 'unknown';
}

export interface SloDashboardSnapshot {
  generated_at: string;
  overall_status: SloStatus;
  window_seconds: number;
  infrastructure: SloInfrastructureStatus;
  subsystem_cards: SloSubsystemCard[];
  active_alerts: SloAlert[];
}

export interface SloMetricsResponse {
  generated_at: string;
  window_seconds: number;
  event_counts: Record<SloSubsystemKey, number>;
  subsystem_metrics: Record<string, Record<string, number | string | null>>;
  live_gauges: Record<string, unknown>;
}

export type MetricOutcome = 'success' | 'failure' | 'ignored';

export type MetricOperation =
  | 'request'
  | 'stk_push'
  | 'callback_process'
  | 'sync_register'
  | 'sync_push'
  | 'sync_pull'
  | 'queue_enqueue'
  | 'queue_process'
  | 'db_query';

export interface SloMetricEvent {
  timestamp_ms: number;
  subsystem: SloSubsystemKey;
  operation: MetricOperation;
  outcome: MetricOutcome;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
}
