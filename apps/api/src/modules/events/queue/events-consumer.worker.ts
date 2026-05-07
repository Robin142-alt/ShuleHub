import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { performance } from 'node:perf_hooks';

import { RedisService } from '../../../infrastructure/redis/redis.service';
import { SloMetricsService } from '../../observability/slo-metrics.service';
import { StructuredLoggerService } from '../../observability/structured-logger.service';
import { EVENTS_QUEUE_NAME, OUTBOX_EVENT_JOB_NAME } from '../events.constants';
import { EventConsumerService } from '../event-consumer.service';
import { DispatchOutboxEventJobPayload } from '../events.types';

@Injectable()
export class EventsConsumerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsConsumerWorker.name);
  private worker: Worker<DispatchOutboxEventJobPayload> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly eventConsumerService: EventConsumerService,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
    @Optional() private readonly sloMetrics?: SloMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const isEnabled =
      this.configService.get<boolean>('events.workerEnabled') ?? true;

    if (!isEnabled) {
      this.logger.log('Events BullMQ worker is disabled for this runtime');
      return;
    }

    const queueName = this.configService.get<string>('events.queueName') ?? EVENTS_QUEUE_NAME;

    this.worker = new Worker<DispatchOutboxEventJobPayload>(
      queueName,
      async (job: Job<DispatchOutboxEventJobPayload>) => {
        if (job.name !== OUTBOX_EVENT_JOB_NAME) {
          this.logger.warn(`Skipping unsupported outbox job "${job.name}"`);
          return;
        }

        const startedAt = performance.now();
        const queueLagMs = resolveQueueLagMs(job.data.enqueued_at, job.timestamp);
        this.structuredLogger?.logEvent('queue.job.started', {
          trace_id: job.data.trace_id ?? job.data.request_id,
          request_id: job.data.request_id,
          tenant_id: job.data.tenant_id,
          user_id: job.data.user_id ?? null,
          parent_span_id: job.data.parent_span_id ?? null,
          queue_name: queueName,
          job_name: job.name,
          job_id: String(job.id ?? 'unknown'),
          outbox_event_id: job.data.outbox_event_id,
          queue_lag_ms: queueLagMs,
        }, 'debug');

        try {
          await this.eventConsumerService.consume(job.data);
          this.structuredLogger?.logEvent('queue.job.completed', {
            trace_id: job.data.trace_id ?? job.data.request_id,
            request_id: job.data.request_id,
            tenant_id: job.data.tenant_id,
            user_id: job.data.user_id ?? null,
            parent_span_id: job.data.parent_span_id ?? null,
            queue_name: queueName,
            job_name: job.name,
            job_id: String(job.id ?? 'unknown'),
            outbox_event_id: job.data.outbox_event_id,
            queue_lag_ms: queueLagMs,
            duration_ms: Number((performance.now() - startedAt).toFixed(2)),
          });
          this.sloMetrics?.recordQueueProcessing({
            queue_name: queueName,
            job_name: job.name,
            outcome: 'success',
            duration_ms: performance.now() - startedAt,
            queue_lag_ms: queueLagMs,
          });
        } catch (error) {
          this.structuredLogger?.logEvent(
            'queue.job.failed',
            {
              trace_id: job.data.trace_id ?? job.data.request_id,
              request_id: job.data.request_id,
              tenant_id: job.data.tenant_id,
              user_id: job.data.user_id ?? null,
              parent_span_id: job.data.parent_span_id ?? null,
              queue_name: queueName,
              job_name: job.name,
              job_id: String(job.id ?? 'unknown'),
              outbox_event_id: job.data.outbox_event_id,
              queue_lag_ms: queueLagMs,
              duration_ms: Number((performance.now() - startedAt).toFixed(2)),
              error_message: error instanceof Error ? error.message : String(error),
            },
            'error',
            error instanceof Error ? error.stack : undefined,
          );
          this.sloMetrics?.recordQueueProcessing({
            queue_name: queueName,
            job_name: job.name,
            outcome: 'failure',
            duration_ms: performance.now() - startedAt,
            queue_lag_ms: queueLagMs,
            error_message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      {
        connection: this.redisService.getBullConnectionOptions(),
        prefix: this.configService.get<string>('queue.prefix') ?? 'shule-hub',
        concurrency: 10,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Completed outbox event job "${job.id}"`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Outbox event job "${job?.id ?? 'unknown'}" failed: ${error.message}`,
      );
    });

    this.logger.log(`BullMQ worker initialized for events queue "${queueName}"`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}

const resolveQueueLagMs = (enqueuedAt: string | undefined, jobTimestamp: number): number => {
  const enqueuedAtMs = typeof enqueuedAt === 'string' ? Date.parse(enqueuedAt) : Number.NaN;

  if (!Number.isNaN(enqueuedAtMs)) {
    return Math.max(0, Date.now() - enqueuedAtMs);
  }

  return Math.max(0, Date.now() - jobTimestamp);
};
