import { Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { DatabaseService } from '../../src/database/database.service';
import { StructuredLoggerService } from '../../src/modules/observability/structured-logger.service';

@Injectable()
export class TraceQueueProbeService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly structuredLogger: StructuredLoggerService,
  ) {}

  async simulateQueuedHop(): Promise<{
    request_id: string;
    trace_id: string;
    queue_name: string;
    job_name: string;
  }> {
    const store = this.requestContext.requireStore();
    const queueName = 'trace-probe-queue';
    const jobName = 'trace.probe';
    const jobId = `trace-probe:${store.request_id}`;
    const enqueuedAt = new Date().toISOString();
    const queueLagMs = 0;

    this.structuredLogger.logEvent('queue.job.enqueued', {
      queue_name: queueName,
      job_name: jobName,
      job_id: jobId,
      queue_lag_ms: queueLagMs,
    });

    const startedAt = performance.now();

    this.structuredLogger.logEvent(
      'queue.job.started',
      {
        trace_id: store.trace_id,
        request_id: store.request_id,
        tenant_id: store.tenant_id,
        user_id: store.user_id,
        parent_span_id: store.span_id,
        queue_name: queueName,
        job_name: jobName,
        job_id: jobId,
        queue_lag_ms: queueLagMs,
      },
      'debug',
    );

    await this.requestContext.run(
      {
        request_id: store.request_id,
        trace_id: store.trace_id,
        parent_span_id: store.span_id,
        tenant_id: store.tenant_id,
        user_id: store.user_id,
        role: store.role,
        session_id: store.session_id,
        permissions: store.permissions,
        is_authenticated: store.is_authenticated,
        client_ip: null,
        user_agent: 'system:trace-queue-probe',
        method: 'WORKER',
        path: '/internal/trace-probe/queue',
        started_at: enqueuedAt,
      },
      async () => {
        await this.databaseService.query('SELECT 1 AS ok');
      },
    );

    this.structuredLogger.logEvent('queue.job.completed', {
      trace_id: store.trace_id,
      request_id: store.request_id,
      tenant_id: store.tenant_id,
      user_id: store.user_id,
      parent_span_id: store.span_id,
      queue_name: queueName,
      job_name: jobName,
      job_id: jobId,
      queue_lag_ms: queueLagMs,
      duration_ms: Number((performance.now() - startedAt).toFixed(2)),
    });

    return {
      request_id: store.request_id,
      trace_id: store.trace_id,
      queue_name: queueName,
      job_name: jobName,
    };
  }
}
