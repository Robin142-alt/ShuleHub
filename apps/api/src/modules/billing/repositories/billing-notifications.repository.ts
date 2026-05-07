import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { BillingNotificationEntity } from '../entities/billing-notification.entity';
import {
  BillingNotificationChannel,
  BillingNotificationStatus,
  SubscriptionLifecycleState,
} from '../billing.types';

interface BillingNotificationRow {
  id: string;
  tenant_id: string;
  subscription_id: string;
  notification_key: string;
  channel: BillingNotificationChannel;
  audience: string;
  lifecycle_state: SubscriptionLifecycleState;
  status: BillingNotificationStatus;
  title: string;
  body: string;
  scheduled_for: Date;
  delivered_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateBillingNotificationInput {
  tenant_id: string;
  subscription_id: string;
  notification_key: string;
  channel: BillingNotificationChannel;
  audience: string;
  lifecycle_state: SubscriptionLifecycleState;
  status: BillingNotificationStatus;
  title: string;
  body: string;
  scheduled_for: string;
  delivered_at?: string | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class BillingNotificationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createIfAbsent(
    input: CreateBillingNotificationInput,
  ): Promise<BillingNotificationEntity> {
    const result = await this.databaseService.query<BillingNotificationRow>(
      `
        INSERT INTO billing_notifications (
          tenant_id,
          subscription_id,
          notification_key,
          channel,
          audience,
          lifecycle_state,
          status,
          title,
          body,
          scheduled_for,
          delivered_at,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::timestamptz,
          $11::timestamptz,
          $12::jsonb
        )
        ON CONFLICT (tenant_id, notification_key)
        DO UPDATE SET
          updated_at = billing_notifications.updated_at
        RETURNING
          id,
          tenant_id,
          subscription_id,
          notification_key,
          channel,
          audience,
          lifecycle_state,
          status,
          title,
          body,
          scheduled_for,
          delivered_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.subscription_id,
        input.notification_key,
        input.channel,
        input.audience,
        input.lifecycle_state,
        input.status,
        input.title,
        input.body,
        input.scheduled_for,
        input.delivered_at ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async listBySubscription(
    tenantId: string,
    subscriptionId: string,
    limit = 20,
  ): Promise<BillingNotificationEntity[]> {
    const result = await this.databaseService.query<BillingNotificationRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          notification_key,
          channel,
          audience,
          lifecycle_state,
          status,
          title,
          body,
          scheduled_for,
          delivered_at,
          metadata,
          created_at,
          updated_at
        FROM billing_notifications
        WHERE tenant_id = $1
          AND subscription_id = $2::uuid
        ORDER BY scheduled_for DESC, created_at DESC
        LIMIT $3::integer
      `,
      [tenantId, subscriptionId, limit],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: BillingNotificationRow): BillingNotificationEntity {
    return Object.assign(new BillingNotificationEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
