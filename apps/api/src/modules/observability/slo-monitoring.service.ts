import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EVENTS_QUEUE_NAME } from '../events/events.constants';
import { MPESA_QUEUE_NAME } from '../payments/payments.constants';
import { DEFAULT_QUEUE_NAME } from '../../queue/queue.constants';
import { QueueService } from '../../queue/queue.service';
import { StructuredLoggerService } from './structured-logger.service';
import { SloMetricsService } from './slo-metrics.service';
import {
  MetricOperation,
  SloAlert,
  SloComparator,
  SloDashboardSnapshot,
  SloInfrastructureStatus,
  SloMetricEvent,
  SloMetricsResponse,
  SloObjectiveDefinition,
  SloObjectiveEvaluation,
  SloStatus,
  SloSubsystemCard,
  SloSubsystemKey,
  SloUnit,
} from './slo-monitoring.types';

interface QueueCountsSnapshot {
  queue_name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  backlog: number;
  oldest_waiting_age_ms: number | null;
  oldest_delayed_age_ms: number | null;
}

interface MpesaLiveSnapshot {
  overdue_intents_count: number;
  oldest_overdue_age_ms: number | null;
  query_error: string | null;
}

interface QueueLiveSnapshot {
  queues: QueueCountsSnapshot[];
  total_backlog: number;
  oldest_backlog_age_ms: number | null;
  query_error: string | null;
}

@Injectable()
export class SloMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SloMonitoringService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastSnapshot: SloDashboardSnapshot | null = null;
  private activeAlerts = new Map<string, SloAlert>();

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly metrics: SloMetricsService,
    private readonly structuredLogger: StructuredLoggerService,
  ) {}

  onModuleInit(): void {
    const isEnabled =
      this.configService.get<boolean>('observability.sloBackgroundEnabled') ?? true;

    if (!isEnabled) {
      this.logger.log('SLO background monitoring is disabled for this runtime');
      return;
    }

    const intervalMs = Number(
      this.configService.get<number>('observability.sloEvaluationIntervalSeconds') ?? 30,
    ) * 1000;

    this.refreshTimer = setInterval(() => {
      void this.refreshSnapshot().catch((error) => {
        this.logger.error(
          error instanceof Error ? error.message : 'Unknown SLO refresh error',
        );
      });
    }, intervalMs);
    this.refreshTimer.unref?.();
    void this.refreshSnapshot().catch((error) => {
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown initial SLO refresh error',
      );
    });
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getSloCatalog(): SloObjectiveDefinition[] {
    const windowSeconds = this.metrics.getWindowSeconds();

    return [
      this.objective('api.availability', 'api', 'API availability', 'Successful API request ratio over the rolling window', 0.999, 'gte', 'ratio', windowSeconds, 'critical'),
      this.objective('api.latency_p95', 'api', 'API p95 latency', '95th percentile API request latency over the rolling window', 750, 'lte', 'milliseconds', windowSeconds, 'warning'),
      this.objective('api.error_rate', 'api', 'API error rate', 'HTTP 5xx and aborted request ratio over the rolling window', 0.01, 'lte', 'ratio', windowSeconds, 'warning'),
      this.objective('mpesa.stk_success_rate', 'mpesa', 'MPESA STK success rate', 'Successful STK push acceptance ratio over the rolling window', 0.99, 'gte', 'ratio', windowSeconds, 'critical'),
      this.objective('mpesa.callback_processing_success_rate', 'mpesa', 'MPESA callback processing success rate', 'Successful callback processing ratio over the rolling window', 0.99, 'gte', 'ratio', windowSeconds, 'critical'),
      this.objective('mpesa.callback_delay_p95', 'mpesa', 'MPESA callback delay p95', '95th percentile delay between STK request and callback receipt', 600000, 'lte', 'milliseconds', windowSeconds, 'warning'),
      this.objective('mpesa.overdue_intents', 'mpesa', 'MPESA overdue intents', 'Overdue STK requests that still have no callback or ledger outcome', 0, 'lte', 'count', windowSeconds, 'critical'),
      this.objective('sync.success_rate', 'sync', 'Sync success rate', 'Successful sync register/push/pull ratio over the rolling window', 0.99, 'gte', 'ratio', windowSeconds, 'critical'),
      this.objective('sync.push_latency_p95', 'sync', 'Sync push p95 latency', '95th percentile sync push latency over the rolling window', 1500, 'lte', 'milliseconds', windowSeconds, 'warning'),
      this.objective('sync.pull_latency_p95', 'sync', 'Sync pull p95 latency', '95th percentile sync pull latency over the rolling window', 1200, 'lte', 'milliseconds', windowSeconds, 'warning'),
      this.objective('queue.enqueue_success_rate', 'queue', 'Queue enqueue success rate', 'Successful job enqueue ratio over the rolling window', 0.999, 'gte', 'ratio', windowSeconds, 'critical'),
      this.objective('queue.processing_success_rate', 'queue', 'Queue processing success rate', 'Successful worker completion ratio over the rolling window', 0.99, 'gte', 'ratio', windowSeconds, 'critical'),
      this.objective('queue.backlog', 'queue', 'Queue backlog', 'Aggregate pending queue backlog across monitored BullMQ queues', 250, 'lte', 'count', windowSeconds, 'warning'),
    ];
  }

  async getDashboard(): Promise<SloDashboardSnapshot> {
    return this.refreshSnapshot();
  }

  async getAlerts(): Promise<SloAlert[]> {
    const snapshot = await this.refreshSnapshot();
    return snapshot.active_alerts;
  }

  async getRealtimeHealth(): Promise<{
    generated_at: string;
    overall_status: SloStatus;
    active_alert_count: number;
    subsystem_statuses: Array<{
      subsystem: SloSubsystemKey;
      status: SloStatus;
    }>;
  }> {
    const snapshot = await this.refreshSnapshot();

    return {
      generated_at: snapshot.generated_at,
      overall_status: snapshot.overall_status,
      active_alert_count: snapshot.active_alerts.length,
      subsystem_statuses: snapshot.subsystem_cards.map((card) => ({
        subsystem: card.subsystem,
        status: card.status,
      })),
    };
  }

  async getMetrics(): Promise<SloMetricsResponse> {
    const snapshot = await this.refreshSnapshot();
    const events = this.metrics.getEvents();

    return {
      generated_at: snapshot.generated_at,
      window_seconds: snapshot.window_seconds,
      event_counts: {
        api: events.filter((event) => event.subsystem === 'api').length,
        mpesa: events.filter((event) => event.subsystem === 'mpesa').length,
        sync: events.filter((event) => event.subsystem === 'sync').length,
        queue: events.filter((event) => event.subsystem === 'queue').length,
        database: events.filter((event) => event.subsystem === 'database').length,
      },
      subsystem_metrics: Object.fromEntries(
        [
          ...snapshot.subsystem_cards.map((card) => [card.subsystem, card.summary] as const),
          ['database', this.buildDatabaseMetrics(events)],
        ],
      ),
      live_gauges: Object.fromEntries(
        [
          ...snapshot.subsystem_cards.map((card) => [card.subsystem, card.live_gauges] as const),
          [
            'database',
            {
              ...this.databaseService.getPoolMetrics(),
            },
          ] as const,
        ],
      ),
    };
  }

  async refreshSnapshot(): Promise<SloDashboardSnapshot> {
    const generatedAt = new Date().toISOString();
    const [infrastructure, mpesaLive, queueLive] = await Promise.all([
      this.loadInfrastructureStatus(),
      this.loadMpesaLiveSnapshot(),
      this.loadQueueLiveSnapshot(),
    ]);
    const events = this.metrics.getEvents();
    const cards = [
      this.evaluateApi(events),
      this.evaluateMpesa(events, mpesaLive),
      this.evaluateSync(events),
      this.evaluateQueue(events, queueLive),
    ];
    const activeAlerts = this.reconcileAlerts(cards, generatedAt);
    const snapshot: SloDashboardSnapshot = {
      generated_at: generatedAt,
      overall_status: this.mergeStatuses([
        ...cards.map((card) => card.status),
        infrastructure.postgres === 'down' || infrastructure.redis === 'down'
          ? 'critical'
          : infrastructure.postgres === 'unknown' || infrastructure.redis === 'unknown'
            ? 'unknown'
            : 'healthy',
      ]),
      window_seconds: this.metrics.getWindowSeconds(),
      infrastructure,
      subsystem_cards: cards,
      active_alerts: activeAlerts,
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  private evaluateApi(events: SloMetricEvent[]): SloSubsystemCard {
    const apiEvents = this.filterEvents(events, 'api', ['request']);
    const successes = apiEvents.filter((event) => event.outcome === 'success').length;
    const failures = apiEvents.filter((event) => event.outcome === 'failure').length;
    const total = successes + failures;
    const latencyValues = this.numericValues(apiEvents, 'duration_ms');
    const availability = total === 0 ? null : successes / total;
    const errorRate = total === 0 ? null : failures / total;
    const latencyP95 = latencyValues.length === 0 ? null : percentile(latencyValues, 95);
    const objectives = [
      this.evaluateObjective(this.definitionById('api.availability'), availability, total),
      this.evaluateObjective(this.definitionById('api.latency_p95'), latencyP95, latencyValues.length),
      this.evaluateObjective(this.definitionById('api.error_rate'), errorRate, total),
    ];

    return {
      subsystem: 'api',
      display_name: 'API',
      status: this.statusFromObjectives(objectives),
      objectives,
      summary: {
        request_count: total,
        success_count: successes,
        failure_count: failures,
        availability_ratio: availability == null ? null : roundToFour(availability),
        error_rate: errorRate == null ? null : roundToFour(errorRate),
        latency_p95_ms: latencyP95 == null ? null : roundToTwo(latencyP95),
      },
      live_gauges: {},
    };
  }

  private evaluateMpesa(
    events: SloMetricEvent[],
    liveSnapshot: MpesaLiveSnapshot,
  ): SloSubsystemCard {
    const stkEvents = this.filterEvents(events, 'mpesa', ['stk_push']);
    const callbackEvents = this.filterEvents(events, 'mpesa', ['callback_process']).filter(
      (event) => event.outcome !== 'ignored',
    );
    const stkSuccessRate = this.successRate(stkEvents);
    const callbackSuccessRate = this.successRate(callbackEvents);
    const callbackDelayValues = callbackEvents
      .map((event) => numberOrNull(event.metadata.callback_delay_ms))
      .filter((value): value is number => value != null);
    const callbackDelayP95 =
      callbackDelayValues.length === 0 ? null : percentile(callbackDelayValues, 95);
    const objectives = [
      this.evaluateObjective(
        this.definitionById('mpesa.stk_success_rate'),
        stkSuccessRate,
        stkEvents.length,
      ),
      this.evaluateObjective(
        this.definitionById('mpesa.callback_processing_success_rate'),
        callbackSuccessRate,
        callbackEvents.length,
      ),
      this.evaluateObjective(
        this.definitionById('mpesa.callback_delay_p95'),
        callbackDelayP95,
        callbackDelayValues.length,
      ),
      liveSnapshot.query_error
        ? this.failedGaugeObjective(
            this.definitionById('mpesa.overdue_intents'),
            `Unable to inspect overdue MPESA intents: ${liveSnapshot.query_error}`,
          )
        : this.evaluateObjective(
            this.definitionById('mpesa.overdue_intents'),
            liveSnapshot.overdue_intents_count,
            1,
          ),
    ];

    return {
      subsystem: 'mpesa',
      display_name: 'MPESA',
      status: this.statusFromObjectives(objectives),
      objectives,
      summary: {
        stk_push_count: stkEvents.length,
        callback_count: callbackEvents.length,
        stk_success_rate: stkSuccessRate == null ? null : roundToFour(stkSuccessRate),
        callback_success_rate:
          callbackSuccessRate == null ? null : roundToFour(callbackSuccessRate),
        callback_delay_p95_ms:
          callbackDelayP95 == null ? null : roundToTwo(callbackDelayP95),
        overdue_intents_count: liveSnapshot.overdue_intents_count,
      },
      live_gauges: {
        overdue_intents_count: liveSnapshot.overdue_intents_count,
        oldest_overdue_age_ms: liveSnapshot.oldest_overdue_age_ms,
        query_error: liveSnapshot.query_error,
      },
    };
  }

  private evaluateSync(events: SloMetricEvent[]): SloSubsystemCard {
    const syncEvents = this.filterEvents(events, 'sync', [
      'sync_register',
      'sync_push',
      'sync_pull',
    ]);
    const pushEvents = this.filterEvents(events, 'sync', ['sync_push']);
    const pullEvents = this.filterEvents(events, 'sync', ['sync_pull']);
    const successRate = this.successRate(syncEvents);
    const pushP95 = this.metricLatencyP95(pushEvents);
    const pullP95 = this.metricLatencyP95(pullEvents);
    const objectives = [
      this.evaluateObjective(
        this.definitionById('sync.success_rate'),
        successRate,
        syncEvents.length,
      ),
      this.evaluateObjective(
        this.definitionById('sync.push_latency_p95'),
        pushP95,
        pushEvents.length,
      ),
      this.evaluateObjective(
        this.definitionById('sync.pull_latency_p95'),
        pullP95,
        pullEvents.length,
      ),
    ];

    return {
      subsystem: 'sync',
      display_name: 'Sync Engine',
      status: this.statusFromObjectives(objectives),
      objectives,
      summary: {
        operation_count: syncEvents.length,
        success_rate: successRate == null ? null : roundToFour(successRate),
        push_count: pushEvents.length,
        pull_count: pullEvents.length,
        push_latency_p95_ms: pushP95 == null ? null : roundToTwo(pushP95),
        pull_latency_p95_ms: pullP95 == null ? null : roundToTwo(pullP95),
      },
      live_gauges: {},
    };
  }

  private evaluateQueue(
    events: SloMetricEvent[],
    liveSnapshot: QueueLiveSnapshot,
  ): SloSubsystemCard {
    const enqueueEvents = this.filterEvents(events, 'queue', ['queue_enqueue']);
    const processEvents = this.filterEvents(events, 'queue', ['queue_process']);
    const enqueueSuccessRate = this.successRate(enqueueEvents);
    const processSuccessRate = this.successRate(processEvents);
    const queueLagValues = processEvents
      .map((event) => numberOrNull(event.metadata.queue_lag_ms))
      .filter((value): value is number => value != null);
    const queueLagP95 = queueLagValues.length === 0 ? null : percentile(queueLagValues, 95);
    const objectives = [
      this.evaluateObjective(
        this.definitionById('queue.enqueue_success_rate'),
        enqueueSuccessRate,
        enqueueEvents.length,
      ),
      this.evaluateObjective(
        this.definitionById('queue.processing_success_rate'),
        processSuccessRate,
        processEvents.length,
      ),
      liveSnapshot.query_error
        ? this.failedGaugeObjective(
            this.definitionById('queue.backlog'),
            `Unable to inspect BullMQ backlog: ${liveSnapshot.query_error}`,
          )
        : this.evaluateObjective(
            this.definitionById('queue.backlog'),
            liveSnapshot.total_backlog,
            liveSnapshot.queues.length,
          ),
    ];

    return {
      subsystem: 'queue',
      display_name: 'Queue System',
      status: this.statusFromObjectives(objectives),
      objectives,
      summary: {
        enqueue_count: enqueueEvents.length,
        process_count: processEvents.length,
        enqueue_success_rate:
          enqueueSuccessRate == null ? null : roundToFour(enqueueSuccessRate),
        processing_success_rate:
          processSuccessRate == null ? null : roundToFour(processSuccessRate),
        total_backlog: liveSnapshot.total_backlog,
        queue_lag_p95_ms: queueLagP95 == null ? null : roundToTwo(queueLagP95),
      },
      live_gauges: {
        total_backlog: liveSnapshot.total_backlog,
        oldest_backlog_age_ms: liveSnapshot.oldest_backlog_age_ms,
        queues: liveSnapshot.queues,
        query_error: liveSnapshot.query_error,
      },
    };
  }

  private async loadInfrastructureStatus(): Promise<SloInfrastructureStatus> {
    const [postgres, redis] = await Promise.allSettled([
      this.databaseService.ping(),
      this.redisService.ping(),
    ]);

    return {
      postgres:
        postgres.status === 'fulfilled' ? 'up' : 'down',
      redis:
        redis.status === 'fulfilled' ? 'up' : 'down',
    };
  }

  private async loadMpesaLiveSnapshot(): Promise<MpesaLiveSnapshot> {
    try {
      const result = await this.databaseService.query<{
        overdue_intents_count: string;
        oldest_overdue_age_ms: string | null;
      }>(
        `
          SELECT
            COUNT(*)::text AS overdue_intents_count,
            MAX(EXTRACT(EPOCH FROM (NOW() - pi.expires_at)) * 1000)::text AS oldest_overdue_age_ms
          FROM payment_intents pi
          LEFT JOIN mpesa_transactions mt
            ON mt.tenant_id = pi.tenant_id
           AND mt.payment_intent_id = pi.id
          WHERE pi.status IN ('stk_requested', 'callback_received', 'processing')
            AND pi.expires_at IS NOT NULL
            AND pi.expires_at <= NOW()
            AND mt.id IS NULL
        `,
      );
      const row = result.rows[0];

      return {
        overdue_intents_count: Number(row?.overdue_intents_count ?? '0'),
        oldest_overdue_age_ms: row?.oldest_overdue_age_ms == null
          ? null
          : roundToTwo(Number(row.oldest_overdue_age_ms)),
        query_error: null,
      };
    } catch (error) {
      return {
        overdue_intents_count: 0,
        oldest_overdue_age_ms: null,
        query_error: error instanceof Error ? error.message : 'Unknown MPESA snapshot error',
      };
    }
  }

  private async loadQueueLiveSnapshot(): Promise<QueueLiveSnapshot> {
    try {
      const queueNames = [
        this.configService.get<string>('mpesa.queueName') ?? MPESA_QUEUE_NAME,
        this.configService.get<string>('events.queueName') ?? EVENTS_QUEUE_NAME,
        DEFAULT_QUEUE_NAME,
      ];
      const uniqueQueueNames = [...new Set(queueNames)];
      const queues = await Promise.all(
        uniqueQueueNames.map(async (queueName) => {
          const [counts, lagSnapshot] = await Promise.all([
            this.queueService.getJobCounts(queueName),
            this.queueService.getQueueLagSnapshot(queueName),
          ]);
          return {
            queue_name: queueName,
            waiting: counts.waiting,
            active: counts.active,
            delayed: counts.delayed,
            failed: counts.failed,
            completed: counts.completed,
            backlog: counts.waiting + counts.active + counts.delayed,
            oldest_waiting_age_ms: lagSnapshot.oldest_waiting_age_ms,
            oldest_delayed_age_ms: lagSnapshot.oldest_delayed_age_ms,
          };
        }),
      );
      const backlogAges = queues
        .flatMap((queue) => [queue.oldest_waiting_age_ms, queue.oldest_delayed_age_ms])
        .filter((value): value is number => value != null);

      return {
        queues,
        total_backlog: queues.reduce((sum, queue) => sum + queue.backlog, 0),
        oldest_backlog_age_ms:
          backlogAges.length === 0 ? null : Math.max(...backlogAges),
        query_error: null,
      };
    } catch (error) {
      return {
        queues: [],
        total_backlog: 0,
        oldest_backlog_age_ms: null,
        query_error: error instanceof Error ? error.message : 'Unknown queue snapshot error',
      };
    }
  }

  private buildDatabaseMetrics(events: SloMetricEvent[]): Record<string, number | string | null> {
    const databaseEvents = this.filterEvents(events, 'database', ['db_query']);
    const successes = databaseEvents.filter((event) => event.outcome === 'success').length;
    const failures = databaseEvents.filter((event) => event.outcome === 'failure').length;
    const total = successes + failures;
    const latencyValues = this.numericValues(databaseEvents, 'duration_ms');
    const latencyP95 = latencyValues.length === 0 ? null : percentile(latencyValues, 95);
    const errorRate = total === 0 ? null : failures / total;

    return {
      query_count: total,
      success_count: successes,
      failure_count: failures,
      error_rate: errorRate == null ? null : roundToFour(errorRate),
      latency_p95_ms: latencyP95 == null ? null : roundToTwo(latencyP95),
    };
  }

  private reconcileAlerts(cards: SloSubsystemCard[], evaluatedAt: string): SloAlert[] {
    const nextAlerts = new Map<string, SloAlert>();

    for (const card of cards) {
      for (const objective of card.objectives) {
        if (objective.status !== 'degraded' && objective.status !== 'critical') {
          continue;
        }

        const definition = this.definitionById(objective.id);
        const existingAlert = this.activeAlerts.get(objective.id);
        const alert: SloAlert = {
          id: objective.id,
          subsystem: definition.subsystem,
          severity: definition.severity,
          status: 'open',
          objective_id: objective.id,
          title: definition.title,
          message: objective.message,
          observed_value: objective.observed_value,
          target_value: objective.target_value,
          comparator: objective.comparator,
          unit: objective.unit,
          triggered_at: existingAlert?.triggered_at ?? evaluatedAt,
          last_evaluated_at: evaluatedAt,
        };

        nextAlerts.set(alert.id, alert);
      }
    }

    for (const [alertId, alert] of nextAlerts.entries()) {
      if (!this.activeAlerts.has(alertId)) {
        this.structuredLogger.logAlert('observability.slo.alert_raised', {
          alert_id: alert.id,
          subsystem: alert.subsystem,
          severity: alert.severity,
          observed_value: alert.observed_value,
          target_value: alert.target_value,
          comparator: alert.comparator,
          unit: alert.unit,
          message: alert.message,
        }, alert.severity === 'critical' ? 'error' : 'warn');
      }
    }

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (!nextAlerts.has(alertId)) {
        this.structuredLogger.logAlert('observability.slo.alert_cleared', {
          alert_id: alert.id,
          subsystem: alert.subsystem,
          severity: alert.severity,
          message: alert.message,
        });
      }
    }

    this.activeAlerts = nextAlerts;
    return [...this.activeAlerts.values()].sort((left, right) =>
      left.objective_id.localeCompare(right.objective_id),
    );
  }

  private objective(
    id: string,
    subsystem: SloSubsystemKey,
    title: string,
    description: string,
    targetValue: number,
    comparator: SloComparator,
    unit: SloUnit,
    windowSeconds: number,
    severity: 'warning' | 'critical',
  ): SloObjectiveDefinition {
    return {
      id,
      subsystem,
      title,
      description,
      target_value: targetValue,
      comparator,
      unit,
      window_seconds: windowSeconds,
      severity,
    };
  }

  private definitionById(id: string): SloObjectiveDefinition {
    const definition = this.getSloCatalog().find((candidate) => candidate.id === id);

    if (!definition) {
      throw new Error(`Unknown SLO definition "${id}"`);
    }

    return definition;
  }

  private evaluateObjective(
    definition: SloObjectiveDefinition,
    observedValue: number | null,
    sampleSize: number,
  ): SloObjectiveEvaluation {
    if (observedValue == null || sampleSize <= 0) {
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        status: 'unknown',
        observed_value: observedValue,
        target_value: definition.target_value,
        comparator: definition.comparator,
        unit: definition.unit,
        sample_size: sampleSize,
        message: 'No recent telemetry is available for this objective',
      };
    }

    const satisfied =
      definition.comparator === 'gte'
        ? observedValue >= definition.target_value
        : observedValue <= definition.target_value;

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      status: satisfied
        ? 'healthy'
        : definition.severity === 'critical'
          ? 'critical'
          : 'degraded',
      observed_value: roundForUnit(observedValue, definition.unit),
      target_value: definition.target_value,
      comparator: definition.comparator,
      unit: definition.unit,
      sample_size: sampleSize,
      message: satisfied
        ? 'Objective is currently meeting its target'
        : `Observed ${formatValue(observedValue, definition.unit)} ${definition.comparator === 'gte' ? 'below' : 'above'} target ${formatValue(definition.target_value, definition.unit)}`,
    };
  }

  private failedGaugeObjective(
    definition: SloObjectiveDefinition,
    message: string,
  ): SloObjectiveEvaluation {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      status: definition.severity === 'critical' ? 'critical' : 'degraded',
      observed_value: null,
      target_value: definition.target_value,
      comparator: definition.comparator,
      unit: definition.unit,
      sample_size: 1,
      message,
    };
  }

  private filterEvents(
    events: SloMetricEvent[],
    subsystem: SloSubsystemKey,
    operations: MetricOperation[],
  ): SloMetricEvent[] {
    const operationSet = new Set(operations);

    return events.filter(
      (event) => event.subsystem === subsystem && operationSet.has(event.operation),
    );
  }

  private successRate(events: SloMetricEvent[]): number | null {
    if (events.length === 0) {
      return null;
    }

    const successCount = events.filter((event) => event.outcome === 'success').length;
    const failureCount = events.filter((event) => event.outcome === 'failure').length;
    const total = successCount + failureCount;

    return total === 0 ? null : successCount / total;
  }

  private metricLatencyP95(events: SloMetricEvent[]): number | null {
    const latencyValues = this.numericValues(events, 'duration_ms');

    return latencyValues.length === 0 ? null : percentile(latencyValues, 95);
  }

  private numericValues(events: SloMetricEvent[], key: 'duration_ms'): number[] {
    return events
      .map((event) => event[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .sort((left, right) => left - right);
  }

  private statusFromObjectives(objectives: SloObjectiveEvaluation[]): SloStatus {
    return this.mergeStatuses(objectives.map((objective) => objective.status));
  }

  private mergeStatuses(statuses: SloStatus[]): SloStatus {
    if (statuses.includes('critical')) {
      return 'critical';
    }

    if (statuses.includes('degraded')) {
      return 'degraded';
    }

    if (statuses.every((status) => status === 'unknown')) {
      return 'unknown';
    }

    if (statuses.includes('healthy')) {
      return 'healthy';
    }

    return 'unknown';
  }
}

const numberOrNull = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const percentile = (values: number[], percentileValue: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.ceil((percentileValue / 100) * values.length) - 1);
  return values[Math.min(index, values.length - 1)];
};

const roundToTwo = (value: number): number => Number(value.toFixed(2));
const roundToFour = (value: number): number => Number(value.toFixed(4));

const roundForUnit = (value: number, unit: SloUnit): number => {
  if (unit === 'ratio') {
    return roundToFour(value);
  }

  return roundToTwo(value);
};

const formatValue = (value: number, unit: SloUnit): string => {
  if (unit === 'ratio') {
    return `${(value * 100).toFixed(2)}%`;
  }

  if (unit === 'milliseconds') {
    return `${roundToTwo(value)}ms`;
  }

  return `${roundToTwo(value)}`;
};
