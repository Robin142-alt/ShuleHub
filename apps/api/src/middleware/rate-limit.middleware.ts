import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { StructuredLoggerService } from '../modules/observability/structured-logger.service';
import { RateLimitService } from '../modules/security/rate-limit.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      if (this.shouldSkip(request)) {
        next();
        return;
      }

      const decision = await this.rateLimitService.evaluateRequest(request);

      response.setHeader('x-ratelimit-limit', decision.limit);
      response.setHeader('x-ratelimit-remaining', decision.remaining);
      response.setHeader('x-ratelimit-reset', decision.reset_at);

      if (!decision.allowed) {
        response.setHeader('retry-after', decision.retry_after_seconds);
        this.logger.warn(
          {
            event: 'rate_limit.exceeded',
            route_key: decision.route_key,
            actor_key: decision.actor_key,
            total_hits: decision.total_hits,
            retry_after_seconds: decision.retry_after_seconds,
          },
          RateLimitMiddleware.name,
        );
        next(new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS));
        return;
      }

      next();
    } catch (error) {
      next(error as Error);
    }
  }

  private shouldSkip(request: Request): boolean {
    const path = (request.path || request.originalUrl || request.url).toLowerCase();
    return path === '/health';
  }
}
