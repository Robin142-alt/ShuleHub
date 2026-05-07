import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { UsageRecordEntity } from '../entities/usage-record.entity';
import { UsageSummary } from '../billing.types';

interface UsageRecordRow {
  id: string;
  tenant_id: string;
  subscription_id: string;
  feature_key: string;
  quantity: string;
  unit: string;
  idempotency_key: string;
  recorded_at: Date;
  period_start: Date;
  period_end: Date;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateUsageRecordInput {
  tenant_id: string;
  subscription_id: string;
  feature_key: string;
  quantity: string;
  unit: string;
  idempotency_key: string;
  recorded_at: string;
  period_start: string;
  period_end: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class UsageRecordsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByIdempotencyKey(
    tenantId: string,
    subscriptionId: string,
    idempotencyKey: string,
  ): Promise<UsageRecordEntity | null> {
    const result = await this.databaseService.query<UsageRecordRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          feature_key,
          quantity::text,
          unit,
          idempotency_key,
          recorded_at,
          period_start,
          period_end,
          metadata,
          created_at,
          updated_at
        FROM usage_records
        WHERE tenant_id = $1
          AND subscription_id = $2::uuid
          AND idempotency_key = $3
        LIMIT 1
      `,
      [tenantId, subscriptionId, idempotencyKey],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async createUsageRecord(input: CreateUsageRecordInput): Promise<UsageRecordEntity> {
    const insertResult = await this.databaseService.query<UsageRecordRow>(
      `
        INSERT INTO usage_records (
          tenant_id,
          subscription_id,
          feature_key,
          quantity,
          unit,
          idempotency_key,
          recorded_at,
          period_start,
          period_end,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3,
          $4::bigint,
          $5,
          $6,
          $7::timestamptz,
          $8::timestamptz,
          $9::timestamptz,
          $10::jsonb
        )
        ON CONFLICT (tenant_id, subscription_id, idempotency_key)
        DO NOTHING
        RETURNING
          id,
          tenant_id,
          subscription_id,
          feature_key,
          quantity::text,
          unit,
          idempotency_key,
          recorded_at,
          period_start,
          period_end,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.subscription_id,
        input.feature_key,
        input.quantity,
        input.unit,
        input.idempotency_key,
        input.recorded_at,
        input.period_start,
        input.period_end,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (insertResult.rows[0]) {
      return this.mapRow(insertResult.rows[0]);
    }

    const existingResult = await this.databaseService.query<UsageRecordRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          feature_key,
          quantity::text,
          unit,
          idempotency_key,
          recorded_at,
          period_start,
          period_end,
          metadata,
          created_at,
          updated_at
        FROM usage_records
        WHERE tenant_id = $1
          AND subscription_id = $2::uuid
          AND idempotency_key = $3
        LIMIT 1
      `,
      [input.tenant_id, input.subscription_id, input.idempotency_key],
    );

    return this.mapRow(existingResult.rows[0]);
  }

  async summarizeUsage(
    tenantId: string,
    subscriptionId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<UsageSummary[]> {
    const result = await this.databaseService.query<{
      feature_key: string;
      total_quantity: string;
    }>(
      `
        SELECT
          feature_key,
          COALESCE(SUM(quantity), 0)::text AS total_quantity
        FROM usage_records
        WHERE tenant_id = $1
          AND subscription_id = $2::uuid
          AND recorded_at >= $3::timestamptz
          AND recorded_at < $4::timestamptz
        GROUP BY feature_key
        ORDER BY feature_key ASC
      `,
      [tenantId, subscriptionId, periodStart, periodEnd],
    );

    return result.rows;
  }

  async getTotalQuantity(
    tenantId: string,
    subscriptionId: string,
    periodStart: string,
    periodEnd: string,
    featureKey?: string,
  ): Promise<string> {
    const result = await this.databaseService.query<{ total_quantity: string }>(
      `
        SELECT
          COALESCE(SUM(quantity), 0)::text AS total_quantity
        FROM usage_records
        WHERE tenant_id = $1
          AND subscription_id = $2::uuid
          AND recorded_at >= $3::timestamptz
          AND recorded_at < $4::timestamptz
          AND ($5::text IS NULL OR feature_key = $5::text)
      `,
      [tenantId, subscriptionId, periodStart, periodEnd, featureKey ?? null],
    );

    return result.rows[0]?.total_quantity ?? '0';
  }

  private mapRow(row: UsageRecordRow): UsageRecordEntity {
    return Object.assign(new UsageRecordEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
