import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MetricOperation,
  MetricOutcome,
  SloMetricEvent,
  SloSubsystemKey,
} from './slo-monitoring.types';

@Injectable()
export class SloMetricsService {
  private readonly events: SloMetricEvent[] = [];

  constructor(private readonly configService: ConfigService) {}

  recordApiRequest(input: {
    outcome: Extract<MetricOutcome, 'success' | 'failure'>;
    duration_ms: number;
    status_code: number;
    method: string;
    path: string;
    event: 'request.completed' | 'request.aborted';
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'api',
      operation: 'request',
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        status_code: input.status_code,
        method: input.method,
        path: input.path,
        event: input.event,
      },
    });
  }

  recordMpesaStkPush(input: {
    outcome: Extract<MetricOutcome, 'success' | 'failure'>;
    duration_ms: number;
    tenant_id?: string | null;
    payment_intent_id?: string | null;
    error_message?: string | null;
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'mpesa',
      operation: 'stk_push',
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        tenant_id: input.tenant_id ?? null,
        payment_intent_id: input.payment_intent_id ?? null,
        error_message: input.error_message ?? null,
      },
    });
  }

  recordMpesaCallbackProcessing(input: {
    outcome: MetricOutcome;
    duration_ms: number;
    tenant_id?: string | null;
    payment_intent_id?: string | null;
    checkout_request_id?: string | null;
    callback_delay_ms?: number | null;
    payment_status?: string | null;
    error_message?: string | null;
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'mpesa',
      operation: 'callback_process',
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        tenant_id: input.tenant_id ?? null,
        payment_intent_id: input.payment_intent_id ?? null,
        checkout_request_id: input.checkout_request_id ?? null,
        callback_delay_ms: input.callback_delay_ms ?? null,
        payment_status: input.payment_status ?? null,
        error_message: input.error_message ?? null,
      },
    });
  }

  recordSyncOperation(input: {
    operation: Extract<MetricOperation, 'sync_register' | 'sync_push' | 'sync_pull'>;
    outcome: Extract<MetricOutcome, 'success' | 'failure'>;
    duration_ms: number;
    tenant_id?: string | null;
    device_id?: string | null;
    results?: Record<string, unknown>;
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'sync',
      operation: input.operation,
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        tenant_id: input.tenant_id ?? null,
        device_id: input.device_id ?? null,
        results: input.results ?? null,
      },
    });
  }

  recordQueueEnqueue(input: {
    queue_name: string;
    job_name: string;
    outcome: Extract<MetricOutcome, 'success' | 'failure'>;
    duration_ms: number;
    error_message?: string | null;
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'queue',
      operation: 'queue_enqueue',
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        queue_name: input.queue_name,
        job_name: input.job_name,
        error_message: input.error_message ?? null,
      },
    });
  }

  recordQueueProcessing(input: {
    queue_name: string;
    job_name: string;
    outcome: Extract<MetricOutcome, 'success' | 'failure'>;
    duration_ms: number | null;
    queue_lag_ms?: number | null;
    error_message?: string | null;
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'queue',
      operation: 'queue_process',
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        queue_name: input.queue_name,
        job_name: input.job_name,
        queue_lag_ms: input.queue_lag_ms ?? null,
        error_message: input.error_message ?? null,
      },
    });
  }

  recordDatabaseQuery(input: {
    outcome: Extract<MetricOutcome, 'success' | 'failure'>;
    duration_ms: number;
    statement_type: string;
    query_fingerprint: string;
    row_count?: number | null;
    error_message?: string | null;
    timestamp_ms?: number;
  }): void {
    this.record({
      subsystem: 'database',
      operation: 'db_query',
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      timestamp_ms: input.timestamp_ms,
      metadata: {
        statement_type: input.statement_type,
        query_fingerprint: input.query_fingerprint,
        row_count: input.row_count ?? null,
        error_message: input.error_message ?? null,
      },
    });
  }

  getWindowSeconds(): number {
    return Number(this.configService.get<number>('observability.sloWindowSeconds') ?? 900);
  }

  getWindowStartMs(nowMs = Date.now()): number {
    return nowMs - this.getWindowSeconds() * 1000;
  }

  getEvents(input: {
    now_ms?: number;
    subsystem?: SloSubsystemKey;
    operation?: MetricOperation;
  } = {}): SloMetricEvent[] {
    const nowMs = input.now_ms ?? Date.now();
    const windowStartMs = this.getWindowStartMs(nowMs);

    this.prune(windowStartMs);

    return this.events.filter((event) => {
      if (event.timestamp_ms < windowStartMs) {
        return false;
      }

      if (input.subsystem && event.subsystem !== input.subsystem) {
        return false;
      }

      if (input.operation && event.operation !== input.operation) {
        return false;
      }

      return true;
    });
  }

  reset(): void {
    this.events.length = 0;
  }

  private record(input: {
    subsystem: SloSubsystemKey;
    operation: MetricOperation;
    outcome: MetricOutcome;
    duration_ms: number | null;
    metadata?: Record<string, unknown>;
    timestamp_ms?: number;
  }): void {
    const timestampMs = input.timestamp_ms ?? Date.now();

    this.prune(this.getWindowStartMs(timestampMs));
    this.events.push({
      timestamp_ms: timestampMs,
      subsystem: input.subsystem,
      operation: input.operation,
      outcome: input.outcome,
      duration_ms: input.duration_ms == null ? null : Number(input.duration_ms.toFixed(2)),
      metadata: input.metadata ?? {},
    });
  }

  private prune(windowStartMs: number): void {
    while (this.events.length > 0 && this.events[0].timestamp_ms < windowStartMs) {
      this.events.shift();
    }
  }
}
