import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

import { SKIP_RESPONSE_ENVELOPE_KEY } from '../common/decorators/skip-response-envelope.decorator';
import { RequestContextService } from '../common/request-context/request-context.service';

type ResponseEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
};

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const shouldSkipEnvelope = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (request.method !== 'GET' || shouldSkipEnvelope) {
      return next.handle();
    }

    return next.handle().pipe(map((body) => this.wrap(body, request)));
  }

  private wrap<T>(body: T, request: Request): ResponseEnvelope<T> | T {
    if (this.isEnveloped(body)) {
      return body;
    }

    return {
      data: body,
      meta: this.buildMeta(body, request),
    };
  }

  private buildMeta(body: unknown, request: Request): Record<string, unknown> {
    const store = this.requestContext.getStore();
    const meta: Record<string, unknown> = {
      request_id: store?.request_id ?? null,
    };

    if (Array.isArray(body)) {
      meta.count = body.length;
    }

    const rawLimit = request.query.limit;

    if (typeof rawLimit === 'string' && rawLimit.trim() !== '') {
      const parsedLimit = Number(rawLimit);

      if (Number.isFinite(parsedLimit)) {
        meta.limit = parsedLimit;
      }
    }

    return meta;
  }

  private isEnveloped(body: unknown): body is ResponseEnvelope<unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return false;
    }

    const candidate = body as Record<string, unknown>;

    return Object.prototype.hasOwnProperty.call(candidate, 'data')
      && Object.prototype.hasOwnProperty.call(candidate, 'meta')
      && candidate.meta !== null
      && typeof candidate.meta === 'object'
      && !Array.isArray(candidate.meta);
  }
}
