import { Injectable } from '@nestjs/common';

import { StructuredLoggerService } from '../observability/structured-logger.service';
import { SubscriptionLifecycleOverview } from './billing.types';
import { BillingNotificationResponseDto } from './dto/billing-notification-response.dto';
import { SubscriptionEntity } from './entities/subscription.entity';
import { BillingNotificationsRepository } from './repositories/billing-notifications.repository';

@Injectable()
export class BillingNotificationService {
  constructor(
    private readonly billingNotificationsRepository: BillingNotificationsRepository,
    private readonly structuredLogger: StructuredLoggerService,
  ) {}

  async queueLifecycleNotifications(
    subscription: SubscriptionEntity,
    overview: SubscriptionLifecycleOverview,
  ): Promise<void> {
    const descriptors = this.buildDescriptors(subscription, overview);

    for (const descriptor of descriptors) {
      await this.billingNotificationsRepository.createIfAbsent({
        tenant_id: subscription.tenant_id,
        subscription_id: subscription.id,
        notification_key: descriptor.notification_key,
        channel: descriptor.channel,
        audience: descriptor.audience,
        lifecycle_state: overview.lifecycle_state,
        status: descriptor.status,
        title: descriptor.title,
        body: descriptor.body,
        scheduled_for: descriptor.scheduled_for,
        delivered_at: descriptor.delivered_at,
        metadata: descriptor.metadata,
      });

      this.structuredLogger.logEvent('billing.lifecycle.notification_queued', {
        billing_subscription_id: subscription.id,
        billing_lifecycle_state: overview.lifecycle_state,
        billing_notification_channel: descriptor.channel,
        billing_notification_audience: descriptor.audience,
        billing_notification_key: descriptor.notification_key,
      });
    }
  }

  async listSubscriptionNotifications(
    tenantId: string,
    subscriptionId: string,
  ): Promise<BillingNotificationResponseDto[]> {
    const records = await this.billingNotificationsRepository.listBySubscription(
      tenantId,
      subscriptionId,
    );

    return records.map((record) =>
      Object.assign(new BillingNotificationResponseDto(), {
        id: record.id,
        tenant_id: record.tenant_id,
        subscription_id: record.subscription_id,
        notification_key: record.notification_key,
        channel: record.channel,
        audience: record.audience,
        lifecycle_state: record.lifecycle_state,
        status: record.status,
        title: record.title,
        body: record.body,
        scheduled_for: record.scheduled_for.toISOString(),
        delivered_at: record.delivered_at?.toISOString() ?? null,
        metadata: record.metadata,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      }),
    );
  }

  private buildDescriptors(
    subscription: SubscriptionEntity,
    overview: SubscriptionLifecycleOverview,
  ): Array<{
    notification_key: string;
    channel: 'admin' | 'sms' | 'email';
    audience: string;
    status: 'queued' | 'sent';
    title: string;
    body: string;
    scheduled_for: string;
    delivered_at: string | null;
    metadata: Record<string, unknown>;
  }> {
    if (!['EXPIRING', 'GRACE_PERIOD', 'RESTRICTED', 'SUSPENDED'].includes(overview.lifecycle_state)) {
      return [];
    }

    const periodKey = subscription.current_period_end.toISOString().slice(0, 10);
    const title = this.buildTitle(overview.lifecycle_state);
    const body = this.buildBody(subscription, overview);
    const scheduledFor =
      overview.warning_starts_at
      ?? overview.grace_period_ends_at
      ?? overview.restricted_at
      ?? overview.suspended_at
      ?? new Date().toISOString();

    return [
      {
        notification_key: `billing:${subscription.id}:${periodKey}:${overview.lifecycle_state}:admin`,
        channel: 'admin',
        audience: 'tenant_admins',
        status: 'sent',
        title,
        body,
        scheduled_for: scheduledFor,
        delivered_at: new Date().toISOString(),
        metadata: {
          type: 'subscription_lifecycle',
          access_mode: overview.access_mode,
        },
      },
      {
        notification_key: `billing:${subscription.id}:${periodKey}:${overview.lifecycle_state}:sms`,
        channel: 'sms',
        audience: 'billing_contact',
        status: 'queued',
        title,
        body,
        scheduled_for: scheduledFor,
        delivered_at: null,
        metadata: {
          type: 'subscription_lifecycle',
          target: 'billing_phone_number',
        },
      },
      {
        notification_key: `billing:${subscription.id}:${periodKey}:${overview.lifecycle_state}:email`,
        channel: 'email',
        audience: 'tenant_admins',
        status: 'queued',
        title,
        body,
        scheduled_for: scheduledFor,
        delivered_at: null,
        metadata: {
          type: 'subscription_lifecycle',
          target: 'tenant_admin_email',
        },
      },
    ];
  }

  private buildTitle(state: SubscriptionLifecycleOverview['lifecycle_state']): string {
    switch (state) {
      case 'EXPIRING':
        return 'Subscription renewal due soon';
      case 'GRACE_PERIOD':
        return 'Subscription is in grace period';
      case 'RESTRICTED':
        return 'Subscription access is now restricted';
      case 'SUSPENDED':
        return 'Subscription has been suspended';
      default:
        return 'Subscription update';
    }
  }

  private buildBody(
    subscription: SubscriptionEntity,
    overview: SubscriptionLifecycleOverview,
  ): string {
    switch (overview.lifecycle_state) {
      case 'EXPIRING':
        return `Your ${subscription.plan_code} plan renews on ${subscription.current_period_end.toISOString().slice(0, 10)}. Renew now to avoid access restrictions.`;
      case 'GRACE_PERIOD':
        return `Your billing period ended on ${subscription.current_period_end.toISOString().slice(0, 10)}. Full access remains available during the grace period, but renewal is now required.`;
      case 'RESTRICTED':
        return 'Your school workspace is now in restricted read-only mode. Billing, support, and data export remain available until renewal is completed.';
      case 'SUSPENDED':
        return 'Your subscription has been suspended. Billing, renewal, and data export remain available so you can restore service safely.';
      default:
        return 'Your subscription status has changed.';
    }
  }
}
