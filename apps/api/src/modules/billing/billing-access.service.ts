import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { BillingAccessContextState } from '../../common/request-context/request-context.types';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';

export interface BillingAccessCacheMetricsSnapshot {
  enabled: boolean;
  hit_count: number;
  miss_count: number;
  write_count: number;
  invalidation_count: number;
  error_count: number;
  hit_rate: number | null;
}

@Injectable()
export class BillingAccessService {
  private readonly cacheTtlSeconds: number;
  private readonly cacheMetrics = {
    hit_count: 0,
    miss_count: 0,
    write_count: 0,
    invalidation_count: 0,
    error_count: 0,
  };

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly billingLifecycleService: BillingLifecycleService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.cacheTtlSeconds = Math.max(
      0,
      Number(this.configService?.get<number>('billing.accessCacheTtlSeconds') ?? 60),
    );
  }

  async resolveForTenant(tenantId: string): Promise<BillingAccessContextState> {
    const currentAccess = this.requestContext.getStore()?.billing;

    if (currentAccess && this.requestContext.getStore()?.tenant_id === tenantId) {
      return currentAccess;
    }

    const cachedAccess = await this.readFromCache(tenantId);

    if (cachedAccess && !this.shouldBypassCache(cachedAccess)) {
      this.cacheMetrics.hit_count += 1;
      return cachedAccess;
    }

    this.cacheMetrics.miss_count += 1;
    const { subscription, overview } =
      await this.billingLifecycleService.ensureCurrentLifecycle(tenantId);
    const access = this.buildAccessState(subscription, overview);

    await this.writeToCache(tenantId, access);
    return access;
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    if (!this.isCacheEnabled()) {
      return;
    }

    try {
      await this.redisService!.getClient().del(this.cacheKey(tenantId));
      this.cacheMetrics.invalidation_count += 1;
    } catch {
      this.cacheMetrics.error_count += 1;
    }
  }

  getCacheMetricsSnapshot(): BillingAccessCacheMetricsSnapshot {
    const totalReads = this.cacheMetrics.hit_count + this.cacheMetrics.miss_count;

    return {
      enabled: this.isCacheEnabled(),
      hit_count: this.cacheMetrics.hit_count,
      miss_count: this.cacheMetrics.miss_count,
      write_count: this.cacheMetrics.write_count,
      invalidation_count: this.cacheMetrics.invalidation_count,
      error_count: this.cacheMetrics.error_count,
      hit_rate:
        totalReads === 0
          ? null
          : Number((this.cacheMetrics.hit_count / totalReads).toFixed(4)),
    };
  }

  resetCacheMetrics(): void {
    this.cacheMetrics.hit_count = 0;
    this.cacheMetrics.miss_count = 0;
    this.cacheMetrics.write_count = 0;
    this.cacheMetrics.invalidation_count = 0;
    this.cacheMetrics.error_count = 0;
  }

  getCurrentAccess(): BillingAccessContextState | undefined {
    return this.requestContext.getStore()?.billing;
  }

  hasFeature(access: BillingAccessContextState | undefined, feature: string): boolean {
    if (!access?.is_active) {
      return false;
    }

    return access.features.includes('*') || access.features.includes(feature);
  }

  private buildAccessState(
    subscription: Awaited<ReturnType<SubscriptionsRepository['findCurrentByTenant']>> | null,
    overview: ReturnType<BillingLifecycleService['buildOverview']> | null,
  ): BillingAccessContextState {
    if (!subscription || !overview) {
      return {
        subscription_id: null,
        plan_code: null,
        status: null,
        lifecycle_state: null,
        access_mode: null,
        features: [],
        limits: {},
        current_period_start: null,
        current_period_end: null,
        warning_starts_at: null,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        renewal_required: false,
        is_active: false,
      };
    }

    return {
      subscription_id: subscription.id,
      plan_code: subscription.plan_code,
      status: subscription.status,
      lifecycle_state: overview.lifecycle_state,
      access_mode: overview.access_mode,
      features: subscription.features,
      limits: subscription.limits,
      current_period_start: subscription.current_period_start.toISOString(),
      current_period_end: subscription.current_period_end.toISOString(),
      warning_starts_at: overview.warning_starts_at,
      grace_period_ends_at: overview.grace_period_ends_at,
      restricted_at: overview.restricted_at,
      suspended_at: overview.suspended_at,
      suspension_reason: overview.suspension_reason,
      renewal_required: overview.renewal_required,
      is_active: overview.access_mode !== 'billing_only',
    };
  }

  private async readFromCache(tenantId: string): Promise<BillingAccessContextState | null> {
    if (!this.isCacheEnabled()) {
      return null;
    }

    try {
      const cachedValue = await this.redisService!.getClient().get(this.cacheKey(tenantId));

      if (!cachedValue) {
        return null;
      }

      return JSON.parse(cachedValue) as BillingAccessContextState;
    } catch {
      this.cacheMetrics.error_count += 1;
      return null;
    }
  }

  private async writeToCache(
    tenantId: string,
    access: BillingAccessContextState,
  ): Promise<void> {
    if (!this.isCacheEnabled() || this.shouldBypassCache(access)) {
      return;
    }

    try {
      await this.redisService!.getClient().set(
        this.cacheKey(tenantId),
        JSON.stringify(access),
        'EX',
        this.cacheTtlSeconds,
      );
      this.cacheMetrics.write_count += 1;
    } catch {
      this.cacheMetrics.error_count += 1;
    }
  }

  private shouldBypassCache(access: BillingAccessContextState): boolean {
    return Boolean(
      access.lifecycle_state
      && !['ACTIVE', 'TRIAL'].includes(access.lifecycle_state),
    );
  }

  private cacheKey(tenantId: string): string {
    return `billing:access:${tenantId}`;
  }

  private isCacheEnabled(): boolean {
    return Boolean(this.redisService) && this.cacheTtlSeconds > 0;
  }
}
