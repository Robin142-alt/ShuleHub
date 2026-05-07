import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import {
  BILLING_BILLING_ONLY_ACCESS_MODE,
  BILLING_EXPIRING_WINDOW_DAYS,
  BILLING_FULL_ACCESS_MODE,
  BILLING_GRACE_PERIOD_DAYS,
  BILLING_PLAN_CATALOG,
  BILLING_READ_ONLY_ACCESS_MODE,
  BILLING_RESTRICTED_PERIOD_DAYS,
} from './billing.constants';
import {
  SubscriptionAccessMode,
  SubscriptionLifecycleOverview,
  SubscriptionLifecycleState,
} from './billing.types';
import { SubscriptionLifecycleResponseDto } from './dto/subscription-lifecycle-response.dto';
import { SubscriptionEntity } from './entities/subscription.entity';
import { BillingNotificationService } from './billing-notification.service';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';

@Injectable()
export class BillingLifecycleService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly billingNotificationService: BillingNotificationService,
    private readonly structuredLogger: StructuredLoggerService,
  ) {}

  async ensureCurrentLifecycle(tenantId: string): Promise<{
    subscription: SubscriptionEntity | null;
    overview: SubscriptionLifecycleOverview | null;
  }> {
    return this.databaseService.withRequestTransaction(async () => {
      await this.subscriptionsRepository.acquireTenantMutationLock(tenantId);
      const currentSubscription = await this.subscriptionsRepository.lockCurrentByTenant(tenantId);

      if (!currentSubscription) {
        return {
          subscription: null,
          overview: null,
        };
      }

      const now = new Date();
      const previousOverview = this.buildOverview(currentSubscription, now);
      const nextLifecycle = this.resolveTransition(currentSubscription, now);

      let resolvedSubscription = currentSubscription;

      if (nextLifecycle.should_transition) {
        resolvedSubscription = await this.subscriptionsRepository.applyLifecycleWindow(
          tenantId,
          currentSubscription.id,
          {
            status: nextLifecycle.status,
            grace_period_ends_at: nextLifecycle.grace_period_ends_at,
            restricted_at: nextLifecycle.restricted_at,
            suspended_at: nextLifecycle.suspended_at,
            suspension_reason: nextLifecycle.suspension_reason,
          },
        );

        this.structuredLogger.logEvent('billing.lifecycle.transition_applied', {
          billing_subscription_id: resolvedSubscription.id,
          billing_previous_status: currentSubscription.status,
          billing_next_status: resolvedSubscription.status,
          billing_previous_lifecycle_state: previousOverview.lifecycle_state,
        });
      }

      const nextOverview = this.buildOverview(resolvedSubscription, now);

      if (
        ['EXPIRING', 'GRACE_PERIOD', 'RESTRICTED', 'SUSPENDED'].includes(
          nextOverview.lifecycle_state,
        )
      ) {
        await this.billingNotificationService.queueLifecycleNotifications(
          resolvedSubscription,
          nextOverview,
        );
      }

      return {
        subscription: resolvedSubscription,
        overview: nextOverview,
      };
    });
  }

  buildOverview(
    subscription: SubscriptionEntity,
    now = new Date(),
  ): SubscriptionLifecycleOverview {
    const renewalBoundary = this.getRenewalBoundary(subscription);
    const warningStartsAt = addDays(renewalBoundary, -BILLING_EXPIRING_WINDOW_DAYS);
    const gracePeriodEndsAt =
      subscription.grace_period_ends_at ?? addDays(renewalBoundary, BILLING_GRACE_PERIOD_DAYS);
    const restrictedAt = subscription.restricted_at;
    const suspendedAt =
      subscription.suspended_at
      ?? (restrictedAt ? addDays(restrictedAt, BILLING_RESTRICTED_PERIOD_DAYS) : null);

    if (['canceled', 'expired'].includes(subscription.status)) {
      return this.createOverview('SUSPENDED', BILLING_BILLING_ONLY_ACCESS_MODE, {
        warning_starts_at: warningStartsAt,
        grace_period_ends_at: gracePeriodEndsAt,
        restricted_at: restrictedAt,
        suspended_at: suspendedAt,
        suspension_reason: subscription.suspension_reason ?? subscription.status,
        renewal_required: true,
      });
    }

    if (subscription.status === 'suspended' || (suspendedAt && now >= suspendedAt)) {
      return this.createOverview('SUSPENDED', BILLING_BILLING_ONLY_ACCESS_MODE, {
        warning_starts_at: warningStartsAt,
        grace_period_ends_at: gracePeriodEndsAt,
        restricted_at: restrictedAt,
        suspended_at: suspendedAt ?? now,
        suspension_reason: subscription.suspension_reason,
        renewal_required: true,
      });
    }

    if (subscription.status === 'restricted' || (restrictedAt && now >= restrictedAt)) {
      return this.createOverview('RESTRICTED', BILLING_READ_ONLY_ACCESS_MODE, {
        warning_starts_at: warningStartsAt,
        grace_period_ends_at: gracePeriodEndsAt,
        restricted_at: restrictedAt ?? now,
        suspended_at: suspendedAt,
        suspension_reason: subscription.suspension_reason,
        renewal_required: true,
      });
    }

    if (subscription.status === 'past_due' || now > renewalBoundary) {
      return this.createOverview('GRACE_PERIOD', BILLING_FULL_ACCESS_MODE, {
        warning_starts_at: warningStartsAt,
        grace_period_ends_at: gracePeriodEndsAt,
        restricted_at: restrictedAt,
        suspended_at: suspendedAt,
        suspension_reason: subscription.suspension_reason,
        renewal_required: true,
      });
    }

    if (subscription.status === 'trialing') {
      return this.createOverview(
        now >= warningStartsAt ? 'EXPIRING' : 'TRIAL',
        BILLING_FULL_ACCESS_MODE,
        {
          warning_starts_at: warningStartsAt,
          grace_period_ends_at: gracePeriodEndsAt,
          restricted_at: restrictedAt,
          suspended_at: suspendedAt,
          suspension_reason: subscription.suspension_reason,
          renewal_required: now >= warningStartsAt,
        },
      );
    }

    if (now >= warningStartsAt) {
      return this.createOverview('EXPIRING', BILLING_FULL_ACCESS_MODE, {
        warning_starts_at: warningStartsAt,
        grace_period_ends_at: gracePeriodEndsAt,
        restricted_at: restrictedAt,
        suspended_at: suspendedAt,
        suspension_reason: subscription.suspension_reason,
        renewal_required: true,
      });
    }

    return this.createOverview('ACTIVE', BILLING_FULL_ACCESS_MODE, {
      warning_starts_at: warningStartsAt,
      grace_period_ends_at: gracePeriodEndsAt,
      restricted_at: restrictedAt,
      suspended_at: suspendedAt,
      suspension_reason: subscription.suspension_reason,
      renewal_required: false,
    });
  }

  toResponse(
    subscription: SubscriptionEntity,
    overview: SubscriptionLifecycleOverview,
  ): SubscriptionLifecycleResponseDto {
    return Object.assign(new SubscriptionLifecycleResponseDto(), {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      plan_code: subscription.plan_code,
      status: subscription.status,
      lifecycle_state: overview.lifecycle_state,
      access_mode: overview.access_mode,
      renewal_required: overview.renewal_required,
      warning_starts_at: overview.warning_starts_at,
      grace_period_ends_at: overview.grace_period_ends_at,
      restricted_at: overview.restricted_at,
      suspended_at: overview.suspended_at,
      suspension_reason: overview.suspension_reason,
      current_period_start: subscription.current_period_start.toISOString(),
      current_period_end: subscription.current_period_end.toISOString(),
      trial_ends_at: subscription.trial_ends_at?.toISOString() ?? null,
    });
  }

  getNextRenewalWindow(subscription: SubscriptionEntity): {
    start_at: Date;
    end_at: Date;
  } {
    const plan = BILLING_PLAN_CATALOG[
      subscription.plan_code as keyof typeof BILLING_PLAN_CATALOG
    ] ?? BILLING_PLAN_CATALOG.starter;
    const now = new Date();
    const nextStartAt =
      subscription.current_period_end > now
        ? subscription.current_period_end
        : now;

    return {
      start_at: nextStartAt,
      end_at: addDays(nextStartAt, plan.period_days),
    };
  }

  private resolveTransition(
    subscription: SubscriptionEntity,
    now: Date,
  ): {
    should_transition: boolean;
    status: SubscriptionEntity['status'];
    grace_period_ends_at?: string | null;
    restricted_at?: string | null;
    suspended_at?: string | null;
    suspension_reason?: string | null;
  } {
    const renewalBoundary = this.getRenewalBoundary(subscription);
    const computedGracePeriodEndsAt =
      subscription.grace_period_ends_at ?? addDays(renewalBoundary, BILLING_GRACE_PERIOD_DAYS);
    const computedRestrictedAt = subscription.restricted_at ?? now;
    const computedSuspendedAt =
      subscription.suspended_at
      ?? addDays(computedRestrictedAt, BILLING_RESTRICTED_PERIOD_DAYS);

    if (
      now > renewalBoundary
      && now <= computedGracePeriodEndsAt
      && subscription.status !== 'past_due'
    ) {
      return {
        should_transition: true,
        status: 'past_due',
        grace_period_ends_at: computedGracePeriodEndsAt.toISOString(),
      };
    }

    if (
      now > computedGracePeriodEndsAt
      && now < computedSuspendedAt
      && (subscription.status !== 'restricted'
        || !subscription.restricted_at
        || !subscription.suspended_at)
    ) {
      return {
        should_transition: true,
        status: 'restricted',
        grace_period_ends_at: computedGracePeriodEndsAt.toISOString(),
        restricted_at: (subscription.restricted_at ?? now).toISOString(),
        suspended_at: computedSuspendedAt.toISOString(),
        suspension_reason: 'renewal_required',
      };
    }

    if (
      now >= computedSuspendedAt
      && subscription.status !== 'suspended'
    ) {
      return {
        should_transition: true,
        status: 'suspended',
        grace_period_ends_at: computedGracePeriodEndsAt.toISOString(),
        restricted_at: (subscription.restricted_at ?? computedRestrictedAt).toISOString(),
        suspended_at: computedSuspendedAt.toISOString(),
        suspension_reason: subscription.suspension_reason ?? 'renewal_required',
      };
    }

    return {
      should_transition: false,
      status: subscription.status,
    };
  }

  private getRenewalBoundary(subscription: SubscriptionEntity): Date {
    return subscription.status === 'trialing' && subscription.trial_ends_at
      ? subscription.trial_ends_at
      : subscription.current_period_end;
  }

  private createOverview(
    lifecycleState: SubscriptionLifecycleState,
    accessMode: SubscriptionAccessMode,
    input: {
      warning_starts_at: Date;
      grace_period_ends_at: Date | null;
      restricted_at: Date | null;
      suspended_at: Date | null;
      suspension_reason: string | null;
      renewal_required: boolean;
    },
  ): SubscriptionLifecycleOverview {
    return {
      lifecycle_state: lifecycleState,
      access_mode: accessMode,
      warning_starts_at: input.warning_starts_at.toISOString(),
      grace_period_ends_at: input.grace_period_ends_at?.toISOString() ?? null,
      restricted_at: input.restricted_at?.toISOString() ?? null,
      suspended_at: input.suspended_at?.toISOString() ?? null,
      suspension_reason: input.suspension_reason,
      renewal_required: input.renewal_required,
    };
  }
}

const addDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
