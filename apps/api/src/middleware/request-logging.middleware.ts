import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { sanitizeRequestPath } from '../common/request-path.util';
import { SloMetricsService } from '../modules/observability/slo-metrics.service';
import { StructuredLoggerService } from '../modules/observability/structured-logger.service';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: StructuredLoggerService,
    @Optional() private readonly sloMetrics?: SloMetricsService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    let settled = false;
    const safePath = sanitizeRequestPath(request.originalUrl || request.url);

    this.logger.logRequest('request.received', {
      method: request.method,
      path: safePath,
    });

    const finalize = (event: 'request.completed' | 'request.aborted'): void => {
      if (settled) {
        return;
      }

      settled = true;
      response.removeListener('finish', onFinish);
      response.removeListener('close', onClose);

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const contentLengthHeader = response.getHeader('content-length');

      this.logger.logRequest(event, {
        status_code: response.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        content_length:
          typeof contentLengthHeader === 'number' || typeof contentLengthHeader === 'string'
            ? String(contentLengthHeader)
            : null,
      });
      this.sloMetrics?.recordApiRequest({
        outcome:
          event === 'request.completed' && response.statusCode < 500
            ? 'success'
            : 'failure',
        duration_ms: durationMs,
        status_code: response.statusCode,
        method: request.method,
        path: safePath,
        event,
      });
    };

    const onFinish = (): void => {
      finalize('request.completed');
    };

    const onClose = (): void => {
      if (!response.writableEnded) {
        finalize('request.aborted');
      }
    };

    response.once('finish', onFinish);
    response.once('close', onClose);

    next();
  }
}
