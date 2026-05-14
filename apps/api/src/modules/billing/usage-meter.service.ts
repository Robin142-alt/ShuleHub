import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { BillingAccessService } from './billing-access.service';
import { RecordUsageDto } from './dto/record-usage.dto';
import { UsageRecordResponseDto } from './dto/usage-record-response.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';
import { SubscriptionEntity } from './entities/subscription.entity';
import { UsageRecordEntity } from './entities/usage-record.entity';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { UsageRecordsRepository } from './repositories/usage-records.repository';

@Injectable()
export class UsageMeterService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly billingAccessService: BillingAccessService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly usageRecordsRepository: UsageRecordsRepository,
  ) {}

  async recordUsage(dto: RecordUsageDto): Promise<UsageRecordResponseDto> {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const subscription = await this.requireActiveSubscription(tenantId, true);
      const normalizedFeatureKey = dto.feature_key.trim();
      const normalizedIdempotencyKey = dto.idempotency_key.trim();
      const existingRecord = await this.usageRecordsRepository.findByIdempotencyKey(
        tenantId,
        subscription.id,
        normalizedIdempotencyKey,
      );

      if (existingRecord) {
        return this.mapUsageRecord(existingRecord);
      }

      const quantity = this.parsePositiveQuantity(dto.quantity.trim(), normalizedFeatureKey);
      await this.assertUsageLimits(tenantId, subscription, normalizedFeatureKey, quantity);
      const record = await this.usageRecordsRepository.createUsageRecord({
        tenant_id: tenantId,
        subscription_id: subscription.id,
        feature_key: normalizedFeatureKey,
        quantity: quantity.toString(),
        unit: dto.unit?.trim() || 'count',
        idempotency_key: normalizedIdempotencyKey,
        recorded_at: dto.recorded_at
          ? this.resolveTimestamp(dto.recorded_at)
          : new Date().toISOString(),
        period_start: subscription.current_period_start.toISOString(),
        period_end: subscription.current_period_end.toISOString(),
        metadata: dto.metadata ?? {},
      });

      return this.mapUsageRecord(record);
    });
  }

  async getCurrentUsageSummary(): Promise<UsageSummaryResponseDto> {
    const tenantId = this.requireTenantId();
    const subscription = await this.subscriptionsRepository.findCurrentByTenant(tenantId);

    if (!subscription) {
      return Object.assign(new UsageSummaryResponseDto(), {
        subscription_id: null,
        period_start: null,
        period_end: null,
        usage: [],
      });
    }

    const usage = await this.usageRecordsRepository.summarizeUsage(
      tenantId,
      subscription.id,
      subscription.current_period_start.toISOString(),
      subscription.current_period_end.toISOString(),
    );

    return Object.assign(new UsageSummaryResponseDto(), {
      subscription_id: subscription.id,
      period_start: subscription.current_period_start.toISOString(),
      period_end: subscription.current_period_end.toISOString(),
      usage: usage.map((item) => ({
        feature_key: item.feature_key,
        total_quantity: item.total_quantity,
      })),
    });
  }

  private async requireActiveSubscription(
    tenantId: string,
    lockCurrentSubscription = false,
  ): Promise<SubscriptionEntity> {
    const subscription = lockCurrentSubscription
      ? await this.subscriptionsRepository.lockCurrentByTenant(tenantId)
      : await this.subscriptionsRepository.findCurrentByTenant(tenantId);
    const access = await this.billingAccessService.resolveForTenant(tenantId);

    if (!subscription) {
      throw new NotFoundException('No subscription exists for this tenant');
    }

    if (!access.is_active) {
      throw new ConflictException('An active subscription is required to meter usage');
    }

    return subscription;
  }

  private async assertUsageLimits(
    tenantId: string,
    subscription: SubscriptionEntity,
    featureKey: string,
    quantity: bigint,
  ): Promise<void> {
    const periodStart = subscription.current_period_start.toISOString();
    const periodEnd = subscription.current_period_end.toISOString();

    await this.assertUsageLimit(
      tenantId,
      subscription,
      'usage.events.monthly',
      quantity,
      periodStart,
      periodEnd,
    );

    const featureLimitKey = this.resolveFeatureLimitKey(featureKey);

    if (featureLimitKey) {
      await this.assertUsageLimit(
        tenantId,
        subscription,
        featureLimitKey,
        quantity,
        periodStart,
        periodEnd,
        featureKey,
      );
    }
  }

  private async assertUsageLimit(
    tenantId: string,
    subscription: SubscriptionEntity,
    limitKey: string,
    incrementBy: bigint,
    periodStart: string,
    periodEnd: string,
    featureKey?: string,
  ): Promise<void> {
    const configuredLimit = this.readPositiveLimit(subscription.limits[limitKey]);

    if (configuredLimit == null) {
      return;
    }

    const currentTotal = BigInt(
      await this.usageRecordsRepository.getTotalQuantity(
        tenantId,
        subscription.id,
        periodStart,
        periodEnd,
        featureKey,
      ),
    );

    if (currentTotal + incrementBy > configuredLimit) {
      throw new HttpException(
        `Current subscription limit "${limitKey}" has been reached`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private resolveFeatureLimitKey(featureKey: string): string | null {
    return null;
  }

  private readPositiveLimit(value: number | string | boolean | null | undefined): bigint | null {
    if (value == null || typeof value === 'boolean') {
      return null;
    }

    const normalizedValue = typeof value === 'number' ? value.toString() : value.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      return null;
    }

    const parsedValue = BigInt(normalizedValue);
    return parsedValue > 0n ? parsedValue : null;
  }

  private parsePositiveQuantity(value: string, featureKey: string): bigint {
    if (!/^[1-9][0-9]*$/.test(value)) {
      throw new ConflictException(
        `Usage quantity for feature "${featureKey}" must be a positive integer`,
      );
    }

    return BigInt(value);
  }

  private mapUsageRecord(record: UsageRecordEntity): UsageRecordResponseDto {
    return Object.assign(new UsageRecordResponseDto(), {
      id: record.id,
      tenant_id: record.tenant_id,
      subscription_id: record.subscription_id,
      feature_key: record.feature_key,
      quantity: record.quantity,
      unit: record.unit,
      idempotency_key: record.idempotency_key,
      recorded_at: record.recorded_at.toISOString(),
      period_start: record.period_start.toISOString(),
      period_end: record.period_end.toISOString(),
      metadata: record.metadata,
      created_at: record.created_at.toISOString(),
      updated_at: record.updated_at.toISOString(),
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for billing usage metering');
    }

    return tenantId;
  }

  private resolveTimestamp(value: string): string {
    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new ConflictException(`Invalid timestamp "${value}"`);
    }

    return parsedValue.toISOString();
  }
}
