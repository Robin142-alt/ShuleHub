import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';

import {
  AUTH_ANONYMOUS_USER_ID,
  AUTH_SYSTEM_ROLE,
} from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { SloMetricsService } from '../observability/slo-metrics.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { QueueService } from '../../queue/queue.service';
import { EVENTS_QUEUE_NAME, OUTBOX_EVENT_JOB_NAME } from './events.constants';
import { ClaimedOutboxEvent, DispatchOutboxEventJobPayload } from './events.types';
import { OutboxEventsRepository } from './repositories/outbox-events.repository';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private dispatchTimer: NodeJS.Timeout | null = null;
  private isDispatching = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly queueService: QueueService,
    private readonly outboxEventsRepository: OutboxEventsRepository,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
    @Optional() private readonly sloMetrics?: SloMetricsService,
  ) {}

  onModuleInit(): void {
    const isEnabled =
      this.configService.get<boolean>('events.dispatcherEnabled') ?? true;

    if (!isEnabled) {
      this.logger.log('Outbox dispatcher is disabled for this runtime');
      return;
    }

    const intervalMs = Number(this.configService.get<number>('events.dispatcherIntervalMs') ?? 1000);
    this.dispatchTimer = setInterval(() => {
      void this.dispatchPendingEvents();
    }, intervalMs);
    this.dispatchTimer.unref?.();
    void this.dispatchPendingEvents();
    this.logger.log(`Outbox dispatcher started with ${intervalMs}ms interval`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dispatchTimer) {
      clearInterval(this.dispatchTimer);
      this.dispatchTimer = null;
    }
  }

  async dispatchPendingEvents(): Promise<number> {
    if (this.isDispatching) {
      return 0;
    }

    this.isDispatching = true;

    try {
      const events = await this.requestContext.run(
        {
          request_id: 'outbox-dispatcher',
          tenant_id: null,
          user_id: AUTH_ANONYMOUS_USER_ID,
          role: AUTH_SYSTEM_ROLE,
          session_id: null,
          permissions: ['*:*'],
          is_authenticated: true,
          client_ip: null,
          user_agent: 'system:outbox-dispatcher',
          method: 'WORKER',
          path: '/internal/events/outbox-dispatcher',
          started_at: new Date().toISOString(),
        },
        async () =>
          this.databaseService.withRequestTransaction(async () =>
            this.outboxEventsRepository.lockPendingBatch(
              Number(this.configService.get<number>('events.dispatcherBatchSize') ?? 100),
              Number(this.configService.get<number>('events.staleProcessingAfterMs') ?? 30000),
            ),
          ),
      );

      if (events.length === 0) {
        return 0;
      }

      await this.enqueueEvents(events);

      return events.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown outbox dispatch error';
      this.logger.error(message);
      return 0;
    } finally {
      this.isDispatching = false;
    }
  }

  private async enqueueEvents(events: ClaimedOutboxEvent[]): Promise<void> {
    const queueName = this.configService.get<string>('events.queueName') ?? EVENTS_QUEUE_NAME;
    const enqueueStartedAt = performance.now();

    try {
      const enqueuedAt = new Date().toISOString();
      const payloads = events.map((event) => ({
        event,
        payload: {
          outbox_event_id: event.id,
          tenant_id: event.tenant_id,
          request_id: event.request_id,
          trace_id: event.trace_id,
          parent_span_id: event.span_id,
          user_id: event.user_id,
          role: event.role,
          session_id: event.session_id,
          enqueued_at: enqueuedAt,
        } satisfies DispatchOutboxEventJobPayload,
      }));
      const jobs = await this.queueService.addBulk(
        payloads.map(({ event, payload }) => ({
          job_name: OUTBOX_EVENT_JOB_NAME,
          payload,
          options: {
            jobId: event.id,
            attempts: 1,
          },
        })),
        queueName,
      );

      for (const [index, { event, payload }] of payloads.entries()) {
        const job = jobs[index];
        await this.requestContext.run(
          {
            request_id: payload.request_id,
            trace_id: payload.trace_id ?? payload.request_id,
            parent_span_id: payload.parent_span_id ?? null,
            tenant_id: event.tenant_id,
            user_id: payload.user_id ?? AUTH_ANONYMOUS_USER_ID,
            role: payload.role ?? AUTH_SYSTEM_ROLE,
            session_id: payload.session_id ?? null,
            permissions: ['*:*'],
            is_authenticated: true,
            client_ip: null,
            user_agent: 'system:outbox-dispatcher',
            method: 'WORKER',
            path: `/internal/events/${event.id}/enqueue`,
            started_at: enqueuedAt,
          },
          async () => {
            this.sloMetrics?.recordQueueEnqueue({
              queue_name: queueName,
              job_name: OUTBOX_EVENT_JOB_NAME,
              outcome: 'success',
              duration_ms: performance.now() - enqueueStartedAt,
            });
            this.structuredLogger?.logEvent('queue.job.enqueued', {
              queue_name: queueName,
              job_name: OUTBOX_EVENT_JOB_NAME,
              job_id: String(job?.id ?? event.id),
              outbox_event_id: event.id,
              queue_lag_ms: 0,
            });
          },
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown queue enqueue error';

      for (const event of events) {
        await this.requestContext.run(
          {
            request_id: event.request_id,
            trace_id: event.trace_id,
            parent_span_id: event.span_id,
            tenant_id: event.tenant_id,
            user_id: event.user_id,
            role: event.role,
            session_id: event.session_id,
            permissions: ['*:*'],
            is_authenticated: true,
            client_ip: null,
            user_agent: 'system:outbox-dispatcher',
            method: 'WORKER',
            path: `/internal/events/${event.id}/enqueue`,
            started_at: new Date().toISOString(),
          },
          async () => {
            this.sloMetrics?.recordQueueEnqueue({
              queue_name: queueName,
              job_name: OUTBOX_EVENT_JOB_NAME,
              outcome: 'failure',
              duration_ms: performance.now() - enqueueStartedAt,
              error_message: message,
            });
            this.structuredLogger?.logEvent(
              'queue.job.enqueue_failed',
              {
                queue_name: queueName,
                job_name: OUTBOX_EVENT_JOB_NAME,
                outbox_event_id: event.id,
                error_message: message,
              },
              'error',
              error instanceof Error ? error.stack : undefined,
            );

            await this.databaseService.withRequestTransaction(async () => {
              await this.outboxEventsRepository.markFailed(
                event.tenant_id,
                event.id,
                message,
                Number(this.configService.get<number>('events.retryDelayMs') ?? 5000),
                Number(this.configService.get<number>('events.maxAttempts') ?? 25),
              );
            });
          },
        );
      }

      throw error;
    }
  }
}
