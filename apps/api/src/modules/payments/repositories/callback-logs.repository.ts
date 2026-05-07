import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { PiiEncryptionService } from '../../security/pii-encryption.service';
import { CallbackLogEntity } from '../entities/callback-log.entity';
import { CallbackLogStatus } from '../payments.types';

interface CallbackLogRow {
  id: string;
  tenant_id: string;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  delivery_id: string;
  request_fingerprint: string;
  event_timestamp: Date | null;
  signature: string | null;
  signature_verified: boolean;
  headers: Record<string, unknown> | null;
  raw_body: string;
  raw_payload: Record<string, unknown> | null;
  source_ip: string | null;
  processing_status: CallbackLogStatus;
  queue_job_id: string | null;
  failure_reason: string | null;
  queued_at: Date | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateCallbackLogInput {
  tenant_id: string;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  delivery_id: string;
  request_fingerprint: string;
  event_timestamp: string | null;
  signature: string | null;
  signature_verified: boolean;
  headers: Record<string, unknown>;
  raw_body: string;
  raw_payload: Record<string, unknown> | null;
  source_ip: string | null;
}

@Injectable()
export class CallbackLogsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async createLog(input: CreateCallbackLogInput): Promise<CallbackLogEntity> {
    const result = await this.databaseService.query<CallbackLogRow>(
      `
        INSERT INTO callback_logs (
          tenant_id,
          merchant_request_id,
          checkout_request_id,
          delivery_id,
          request_fingerprint,
          event_timestamp,
          signature,
          signature_verified,
          headers,
          raw_body,
          raw_payload,
          source_ip,
          processing_status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::timestamptz,
          $7,
          $8,
          $9::jsonb,
          $10,
          $11::jsonb,
          $12::inet,
          'received'
        )
        RETURNING
          id,
          tenant_id,
          merchant_request_id,
          checkout_request_id,
          delivery_id,
          request_fingerprint,
          event_timestamp,
          signature,
          signature_verified,
          headers,
          raw_body,
          raw_payload,
          source_ip,
          processing_status,
          queue_job_id,
          failure_reason,
          queued_at,
          processed_at,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.merchant_request_id,
        input.checkout_request_id,
        input.delivery_id,
        input.request_fingerprint,
        input.event_timestamp,
        input.signature,
        input.signature_verified,
        JSON.stringify(input.headers ?? {}),
        this.piiEncryptionService.encrypt(
          input.raw_body,
          this.rawBodyAad(input.tenant_id),
        ),
        input.raw_payload ? JSON.stringify(input.raw_payload) : null,
        input.source_ip,
      ],
    );

    return this.mapEntity(result.rows[0]);
  }

  async findById(tenantId: string, callbackLogId: string): Promise<CallbackLogEntity | null> {
    const result = await this.databaseService.query<CallbackLogRow>(
      `
        SELECT
          id,
          tenant_id,
          merchant_request_id,
          checkout_request_id,
          delivery_id,
          request_fingerprint,
          event_timestamp,
          signature,
          signature_verified,
          headers,
          raw_body,
          raw_payload,
          source_ip,
          processing_status,
          queue_job_id,
          failure_reason,
          queued_at,
          processed_at,
          created_at,
          updated_at
        FROM callback_logs
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, callbackLogId],
    );

    return result.rows[0] ? this.mapEntity(result.rows[0]) : null;
  }

  async findLatestByCheckoutRequestId(
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<CallbackLogEntity | null> {
    const result = await this.databaseService.query<CallbackLogRow>(
      `
        SELECT
          id,
          tenant_id,
          merchant_request_id,
          checkout_request_id,
          delivery_id,
          request_fingerprint,
          event_timestamp,
          signature,
          signature_verified,
          headers,
          raw_body,
          raw_payload,
          source_ip,
          processing_status,
          queue_job_id,
          failure_reason,
          queued_at,
          processed_at,
          created_at,
          updated_at
        FROM callback_logs
        WHERE tenant_id = $1
          AND checkout_request_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, checkoutRequestId],
    );

    return result.rows[0] ? this.mapEntity(result.rows[0]) : null;
  }

  async markQueued(tenantId: string, callbackLogId: string, queueJobId: string): Promise<void> {
    await this.markStatus(tenantId, callbackLogId, 'queued', {
      queue_job_id: queueJobId,
      queued_at: 'NOW()',
      failure_reason: null,
    });
  }

  async markProcessing(tenantId: string, callbackLogId: string): Promise<void> {
    await this.markStatus(tenantId, callbackLogId, 'processing', {
      failure_reason: null,
    });
  }

  async markProcessed(tenantId: string, callbackLogId: string): Promise<void> {
    await this.markStatus(tenantId, callbackLogId, 'processed', {
      processed_at: 'NOW()',
      failure_reason: null,
    });
  }

  async markProcessedByCheckoutRequestId(
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE callback_logs
        SET
          processing_status = 'processed',
          processed_at = COALESCE(processed_at, NOW()),
          failure_reason = NULL,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND checkout_request_id = $2
          AND processing_status NOT IN ('processed', 'rejected', 'replayed')
      `,
      [tenantId, checkoutRequestId],
    );
  }

  async markFailed(tenantId: string, callbackLogId: string, reason: string): Promise<void> {
    await this.markStatus(tenantId, callbackLogId, 'failed', {
      processed_at: 'NOW()',
      failure_reason: reason,
    });
  }

  async markFailedByCheckoutRequestId(
    tenantId: string,
    checkoutRequestId: string,
    reason: string,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE callback_logs
        SET
          processing_status = 'failed',
          processed_at = COALESCE(processed_at, NOW()),
          failure_reason = $3,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND checkout_request_id = $2
          AND processing_status NOT IN ('processed', 'rejected', 'replayed')
      `,
      [tenantId, checkoutRequestId, reason],
    );
  }

  async markRejected(tenantId: string, callbackLogId: string, reason: string): Promise<void> {
    await this.markStatus(tenantId, callbackLogId, 'rejected', {
      processed_at: 'NOW()',
      failure_reason: reason,
    });
  }

  async markReplayed(tenantId: string, callbackLogId: string): Promise<void> {
    await this.markStatus(tenantId, callbackLogId, 'replayed', {
      processed_at: 'NOW()',
      failure_reason: null,
    });
  }

  private async markStatus(
    tenantId: string,
    callbackLogId: string,
    status: CallbackLogStatus,
    extras: Record<string, string | null>,
  ): Promise<void> {
    const assignments = [`processing_status = $3`, `updated_at = NOW()`];
    const values: Array<string | null> = [tenantId, callbackLogId, status];
    let parameterIndex = 4;

    for (const [column, value] of Object.entries(extras)) {
      if (value === 'NOW()') {
        assignments.push(`${column} = NOW()`);
        continue;
      }

      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    }

    await this.databaseService.query(
      `
        UPDATE callback_logs
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      values,
    );
  }

  private mapEntity(row: CallbackLogRow): CallbackLogEntity {
    return Object.assign(new CallbackLogEntity(), {
      ...row,
      raw_body: this.piiEncryptionService.decrypt(
        row.raw_body,
        this.rawBodyAad(row.tenant_id),
      ),
      headers: row.headers ?? {},
      raw_payload: row.raw_payload ?? null,
    });
  }

  private rawBodyAad(tenantId: string): string {
    return `callback_logs:${tenantId}:raw_body`;
  }
}
