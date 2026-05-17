import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AUTH_ANONYMOUS_USER_ID } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

interface RateLimitPolicy {
  bucket: string;
  max_requests: number;
  window_seconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retry_after_seconds: number;
  reset_at: string;
  route_key: string;
  actor_key: string;
  total_hits: number;
}

@Injectable()
export class RateLimitService {
  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly redisService: RedisService,
  ) {}

  async evaluateRequest(request: Request): Promise<RateLimitDecision> {
    const requestContext = this.requestContext.requireStore();
    const routeKey = this.resolveRouteKey(request);
    const policy = this.resolvePolicy(routeKey);
    const tenantId = requestContext.tenant_id ?? 'anonymous';
    const actorKey =
      requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
        ? `user:${requestContext.user_id}`
        : `ip:${requestContext.client_ip ?? 'unknown'}`;
    const bucketId = `${tenantId}:${routeKey}:${actorKey}`;

    return this.consume(policy, bucketId, routeKey, actorKey);
  }

  private async consume(
    policy: RateLimitPolicy,
    bucketId: string,
    routeKey: string,
    actorKey: string,
  ): Promise<RateLimitDecision> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowSlot = Math.floor(nowSeconds / policy.window_seconds);
    const redisKey = `rate-limit:${policy.bucket}:${bucketId}:${windowSlot}`;
    const redisClient = this.redisService.getClient();
    const totalHits = await redisClient.incr(redisKey);

    if (totalHits === 1) {
      await redisClient.expire(redisKey, policy.window_seconds);
    }

    const ttl = Math.max(await redisClient.ttl(redisKey), 1);
    return {
      allowed: totalHits <= policy.max_requests,
      limit: policy.max_requests,
      remaining: Math.max(policy.max_requests - totalHits, 0),
      retry_after_seconds: ttl,
      reset_at: new Date((nowSeconds + ttl) * 1000).toISOString(),
      route_key: routeKey,
      actor_key: actorKey,
      total_hits: totalHits,
    };
  }

  private resolvePolicy(routeKey: string): RateLimitPolicy {
    const windowSeconds = Number(
      this.configService.get<number>('security.rateLimitWindowSeconds') ?? 60,
    );
    const defaultMaxRequests = Number(
      this.configService.get<number>('security.rateLimitMaxRequests') ?? 120,
    );

    if (routeKey === 'auth-session') {
      return {
        bucket: routeKey,
        max_requests: Number(
          this.configService.get<number>('security.authSessionRateLimitMaxRequests') ?? 10,
        ),
        window_seconds: windowSeconds,
      };
    }

    if (routeKey === 'auth-recovery') {
      return {
        bucket: routeKey,
        max_requests: Number(
          this.configService.get<number>('security.authRecoveryRateLimitMaxRequests') ?? 5,
        ),
        window_seconds: windowSeconds,
      };
    }

    if (routeKey === 'auth-parent-otp') {
      return {
        bucket: routeKey,
        max_requests: Number(
          this.configService.get<number>('security.parentOtpRateLimitMaxRequests') ?? 5,
        ),
        window_seconds: windowSeconds,
      };
    }

    if (routeKey === 'auth') {
      return {
        bucket: routeKey,
        max_requests: Number(
          this.configService.get<number>('security.authRateLimitMaxRequests') ?? 20,
        ),
        window_seconds: windowSeconds,
      };
    }

    if (routeKey === 'mpesa-callback') {
      return {
        bucket: routeKey,
        max_requests: Number(
          this.configService.get<number>('security.mpesaCallbackRateLimitMaxRequests') ?? 60,
        ),
        window_seconds: windowSeconds,
      };
    }

    return {
      bucket: routeKey,
      max_requests: defaultMaxRequests,
      window_seconds: windowSeconds,
    };
  }

  private resolveRouteKey(request: Request): string {
    const path = (request.path || request.originalUrl || request.url).toLowerCase();

    if (path.startsWith('/auth/parent/otp')) {
      return 'auth-parent-otp';
    }

    if (
      path.startsWith('/auth/password-recovery')
      || path.startsWith('/auth/password/forgot')
      || path.startsWith('/auth/password/reset')
      || path.startsWith('/auth/email-verification')
      || path.startsWith('/auth/magic-link')
      || path.startsWith('/auth/invitations/accept')
    ) {
      return 'auth-recovery';
    }

    if (path.startsWith('/auth/login') || path.startsWith('/auth/refresh')) {
      return 'auth-session';
    }

    if (path.startsWith('/auth')) {
      return 'auth';
    }

    if (
      path.startsWith('/payments/mpesa/callback')
      || path.startsWith('/mpesa/callback')
      || path.startsWith('/payments/mpesa/c2b')
      || path.startsWith('/mpesa/c2b')
    ) {
      return 'mpesa-callback';
    }

    if (path.startsWith('/sync')) {
      return 'sync';
    }

    return 'api';
  }
}
