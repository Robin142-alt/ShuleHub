import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { PiiEncryptionService } from '../../security/pii-encryption.service';
import { SubscriptionEntity } from '../entities/subscription.entity';

const subscriptionSelectColumns = `
  id,
  tenant_id,
  plan_code,
  status,
  billing_phone_number,
  currency_code,
  features,
  limits,
  seats_allocated,
  current_period_start,
  current_period_end,
  trial_ends_at,
  grace_period_ends_at,
  restricted_at,
  suspended_at,
  suspension_reason,
  activated_at,
  canceled_at,
  last_invoice_at,
  metadata,
  created_at,
  updated_at
`;

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_code: string;
  status: SubscriptionEntity['status'];
  billing_phone_number: string | null;
  currency_code: string;
  features: unknown;
  limits: Record<string, number | string | boolean | null> | null;
  seats_allocated: number;
  current_period_start: Date;
  current_period_end: Date;
  trial_ends_at: Date | null;
  grace_period_ends_at: Date | null;
  restricted_at: Date | null;
  suspended_at: Date | null;
  suspension_reason: string | null;
  activated_at: Date | null;
  canceled_at: Date | null;
  last_invoice_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateSubscriptionInput {
  tenant_id: string;
  plan_code: string;
  status: SubscriptionEntity['status'];
  billing_phone_number: string | null;
  currency_code: string;
  features: string[];
  limits: Record<string, number | string | boolean | null>;
  seats_allocated: number;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  grace_period_ends_at?: string | null;
  restricted_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  activated_at: string | null;
  metadata: Record<string, unknown>;
}

interface ApplyLifecycleWindowInput {
  status: SubscriptionEntity['status'];
  grace_period_ends_at?: string | null;
  restricted_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
}

interface RestoreRenewedSubscriptionInput {
  current_period_start: string;
  current_period_end: string;
  activated_at: string;
}

@Injectable()
export class SubscriptionsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async acquireTenantMutationLock(tenantId: string): Promise<void> {
    await this.databaseService.query(
      `
        SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
      `,
      [tenantId],
    );
  }

  async expireCurrentSubscriptions(tenantId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE subscriptions
        SET
          status = CASE
            WHEN status = 'trialing' THEN 'expired'
            WHEN status IN ('active', 'past_due', 'restricted', 'suspended') THEN 'canceled'
            ELSE status
          END,
          canceled_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND status IN ('trialing', 'active', 'past_due', 'restricted', 'suspended')
      `,
      [tenantId],
    );
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionEntity> {
    const result = await this.databaseService.query<SubscriptionRow>(
      `
        INSERT INTO subscriptions (
          tenant_id,
          plan_code,
          status,
          billing_phone_number,
          currency_code,
          features,
          limits,
          seats_allocated,
          current_period_start,
          current_period_end,
          trial_ends_at,
          grace_period_ends_at,
          restricted_at,
          suspended_at,
          suspension_reason,
          activated_at,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7::jsonb,
          $8,
          $9::timestamptz,
          $10::timestamptz,
          $11::timestamptz,
          $12::timestamptz,
          $13::timestamptz,
          $14::timestamptz,
          $15,
          $16::timestamptz,
          $17::jsonb
        )
        RETURNING
          ${subscriptionSelectColumns}
      `,
      [
        input.tenant_id,
        input.plan_code,
        input.status,
        this.piiEncryptionService.encryptNullable(
          input.billing_phone_number,
          this.billingPhoneAad(input.tenant_id),
        ),
        input.currency_code,
        JSON.stringify(input.features),
        JSON.stringify(input.limits),
        input.seats_allocated,
        input.current_period_start,
        input.current_period_end,
        input.trial_ends_at,
        input.grace_period_ends_at ?? null,
        input.restricted_at ?? null,
        input.suspended_at ?? null,
        input.suspension_reason ?? null,
        input.activated_at,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async findCurrentByTenant(tenantId: string): Promise<SubscriptionEntity | null> {
    const result = await this.databaseService.query<SubscriptionRow>(
      `
        SELECT
          ${subscriptionSelectColumns}
        FROM subscriptions
        WHERE tenant_id = $1
        ORDER BY
          CASE status
            WHEN 'active' THEN 1
            WHEN 'trialing' THEN 2
            WHEN 'past_due' THEN 3
            WHEN 'restricted' THEN 4
            WHEN 'suspended' THEN 5
            ELSE 6
          END ASC,
          created_at DESC
        LIMIT 1
      `,
      [tenantId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async lockCurrentByTenant(tenantId: string): Promise<SubscriptionEntity | null> {
    const result = await this.databaseService.query<SubscriptionRow>(
      `
        SELECT
          ${subscriptionSelectColumns}
        FROM subscriptions
        WHERE tenant_id = $1
        ORDER BY
          CASE status
            WHEN 'active' THEN 1
            WHEN 'trialing' THEN 2
            WHEN 'past_due' THEN 3
            WHEN 'restricted' THEN 4
            WHEN 'suspended' THEN 5
            ELSE 6
          END ASC,
          created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findById(tenantId: string, subscriptionId: string): Promise<SubscriptionEntity | null> {
    const result = await this.databaseService.query<SubscriptionRow>(
      `
        SELECT
          ${subscriptionSelectColumns}
        FROM subscriptions
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, subscriptionId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async markPastDue(tenantId: string, subscriptionId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE subscriptions
        SET
          status = 'past_due',
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, subscriptionId],
    );
  }

  async markInvoiceIssued(
    tenantId: string,
    subscriptionId: string,
    nextPeriodEnd?: string | null,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE subscriptions
        SET
          last_invoice_at = NOW(),
          current_period_end = COALESCE($3::timestamptz, current_period_end),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, subscriptionId, nextPeriodEnd ?? null],
    );
  }

  async applyLifecycleWindow(
    tenantId: string,
    subscriptionId: string,
    input: ApplyLifecycleWindowInput,
  ): Promise<SubscriptionEntity> {
    const result = await this.databaseService.query<SubscriptionRow>(
      `
        UPDATE subscriptions
        SET
          status = $3,
          grace_period_ends_at = COALESCE($4::timestamptz, grace_period_ends_at),
          restricted_at = COALESCE($5::timestamptz, restricted_at),
          suspended_at = COALESCE($6::timestamptz, suspended_at),
          suspension_reason = COALESCE($7, suspension_reason),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          ${subscriptionSelectColumns}
      `,
      [
        tenantId,
        subscriptionId,
        input.status,
        input.grace_period_ends_at ?? null,
        input.restricted_at ?? null,
        input.suspended_at ?? null,
        input.suspension_reason ?? null,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async restoreRenewedSubscription(
    tenantId: string,
    subscriptionId: string,
    input: RestoreRenewedSubscriptionInput,
  ): Promise<SubscriptionEntity> {
    const result = await this.databaseService.query<SubscriptionRow>(
      `
        UPDATE subscriptions
        SET
          status = 'active',
          current_period_start = $3::timestamptz,
          current_period_end = $4::timestamptz,
          trial_ends_at = NULL,
          grace_period_ends_at = NULL,
          restricted_at = NULL,
          suspended_at = NULL,
          suspension_reason = NULL,
          activated_at = $5::timestamptz,
          canceled_at = NULL,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          ${subscriptionSelectColumns}
      `,
      [
        tenantId,
        subscriptionId,
        input.current_period_start,
        input.current_period_end,
        input.activated_at,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async markInvoicePaid(tenantId: string, subscriptionId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE subscriptions
        SET
          status = 'active',
          activated_at = COALESCE(activated_at, NOW()),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, subscriptionId],
    );
  }

  private mapRow(row: SubscriptionRow): SubscriptionEntity {
    const parsedFeatures = Array.isArray(row.features)
      ? row.features
      : typeof row.features === 'string'
        ? JSON.parse(row.features)
        : [];

    return Object.assign(new SubscriptionEntity(), {
      ...row,
      billing_phone_number: this.piiEncryptionService.decryptNullable(
        row.billing_phone_number,
        this.billingPhoneAad(row.tenant_id),
      ),
      features: parsedFeatures as string[],
      limits: row.limits ?? {},
      metadata: row.metadata ?? {},
    });
  }

  private billingPhoneAad(tenantId: string): string {
    return `subscriptions:${tenantId}:billing_phone_number`;
  }
}
