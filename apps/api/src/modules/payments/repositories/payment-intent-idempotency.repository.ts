import { ConflictException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import {
  PaymentIntentIdempotencyRecord,
  PaymentIntentIdempotencyRequest,
  PaymentIntentResponse,
} from '../payments.types';

interface IdempotencyRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  scope: string;
  idempotency_key: string;
  request_method: string;
  request_path: string;
  request_hash: string;
  status: PaymentIntentIdempotencyRecord['status'];
  response_status_code: number | null;
  response_body: PaymentIntentResponse | null;
  locked_at: Date | null;
  completed_at: Date | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PaymentIntentIdempotencyRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async lockRequest(
    input: PaymentIntentIdempotencyRequest,
  ): Promise<PaymentIntentIdempotencyRecord> {
    await this.databaseService.query(
      `
        INSERT INTO idempotency_keys (
          tenant_id,
          user_id,
          scope,
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          locked_at,
          expires_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, 'in_progress', NOW(), NOW() + ($8 * INTERVAL '1 second'))
        ON CONFLICT (tenant_id, scope, idempotency_key)
        DO NOTHING
      `,
      [
        input.tenant_id,
        input.user_id,
        input.scope,
        input.idempotency_key,
        input.request_method,
        input.request_path,
        input.request_hash,
        input.ttl_seconds,
      ],
    );

    const record = await this.getLockedRecord(input.tenant_id, input.scope, input.idempotency_key);

    if (!record) {
      throw new ConflictException('Unable to lock payment intent idempotency key');
    }

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      return this.resetExpiredRecord(record.id, input);
    }

    if (record.request_hash !== input.request_hash) {
      throw new ConflictException(
        'Idempotency key has already been used with a different payment intent payload',
      );
    }

    if (record.status === 'completed') {
      return record;
    }

    const result = await this.databaseService.query<IdempotencyRow>(
      `
        UPDATE idempotency_keys
        SET
          user_id = $3::uuid,
          request_method = $4,
          request_path = $5,
          request_hash = $6,
          status = 'in_progress',
          locked_at = NOW(),
          expires_at = NOW() + ($7 * INTERVAL '1 second'),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          user_id,
          scope,
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          response_status_code,
          response_body,
          locked_at,
          completed_at,
          expires_at,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        record.id,
        input.user_id,
        input.request_method,
        input.request_path,
        input.request_hash,
        input.ttl_seconds,
      ],
    );

    return this.mapRecord(result.rows[0]);
  }

  async markCompleted(
    tenantId: string,
    idempotencyKeyId: string,
    responseStatusCode: number,
    responseBody: PaymentIntentResponse,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE idempotency_keys
        SET
          status = 'completed',
          response_status_code = $3,
          response_body = $4::jsonb,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, idempotencyKeyId, responseStatusCode, JSON.stringify(responseBody)],
    );
  }

  private async getLockedRecord(
    tenantId: string,
    scope: string,
    idempotencyKey: string,
  ): Promise<PaymentIntentIdempotencyRecord | null> {
    const result = await this.databaseService.query<IdempotencyRow>(
      `
        SELECT
          id,
          tenant_id,
          user_id,
          scope,
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          response_status_code,
          response_body,
          locked_at,
          completed_at,
          expires_at,
          created_at,
          updated_at
        FROM idempotency_keys
        WHERE tenant_id = $1
          AND scope = $2
          AND idempotency_key = $3
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, scope, idempotencyKey],
    );

    return result.rows[0] ? this.mapRecord(result.rows[0]) : null;
  }

  private async resetExpiredRecord(
    recordId: string,
    input: PaymentIntentIdempotencyRequest,
  ): Promise<PaymentIntentIdempotencyRecord> {
    const result = await this.databaseService.query<IdempotencyRow>(
      `
        UPDATE idempotency_keys
        SET
          user_id = $3::uuid,
          request_method = $4,
          request_path = $5,
          request_hash = $6,
          status = 'in_progress',
          response_status_code = NULL,
          response_headers = '{}'::jsonb,
          response_body = NULL,
          locked_at = NOW(),
          completed_at = NULL,
          expires_at = NOW() + ($7 * INTERVAL '1 second'),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          user_id,
          scope,
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          response_status_code,
          response_body,
          locked_at,
          completed_at,
          expires_at,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        recordId,
        input.user_id,
        input.request_method,
        input.request_path,
        input.request_hash,
        input.ttl_seconds,
      ],
    );

    return this.mapRecord(result.rows[0]);
  }

  private mapRecord(row: IdempotencyRow): PaymentIntentIdempotencyRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      scope: row.scope,
      idempotency_key: row.idempotency_key,
      request_method: row.request_method,
      request_path: row.request_path,
      request_hash: row.request_hash,
      status: row.status,
      response_status_code: row.response_status_code,
      response_body: row.response_body,
      locked_at: row.locked_at?.toISOString() ?? null,
      completed_at: row.completed_at?.toISOString() ?? null,
      expires_at: row.expires_at.toISOString(),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
