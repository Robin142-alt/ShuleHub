import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { PiiEncryptionService } from '../../security/pii-encryption.service';
import { MpesaTransactionEntity } from '../entities/mpesa-transaction.entity';
import { ParsedMpesaCallback } from '../payments.types';

interface MpesaTransactionRow {
  id: string;
  tenant_id: string;
  payment_intent_id: string;
  callback_log_id: string;
  checkout_request_id: string;
  merchant_request_id: string;
  result_code: number;
  result_desc: string;
  status: MpesaTransactionEntity['status'];
  transaction_id: string | null;
  mpesa_short_code: string | null;
  mpesa_receipt_number: string | null;
  amount_minor: string | null;
  phone_number: string | null;
  raw_payload: Record<string, unknown> | null;
  transaction_occurred_at: Date | null;
  ledger_transaction_id: string | null;
  processed_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class MpesaTransactionsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async upsertFromCallback(input: {
    tenant_id: string;
    payment_intent_id: string;
    callback_log_id: string;
    callback: ParsedMpesaCallback;
    raw_payload: Record<string, unknown> | null;
  }): Promise<MpesaTransactionEntity> {
    const result = await this.databaseService.query<MpesaTransactionRow>(
      `
        INSERT INTO mpesa_transactions (
          tenant_id,
          payment_intent_id,
          callback_log_id,
          checkout_request_id,
          merchant_request_id,
          result_code,
          result_desc,
          status,
          transaction_id,
          mpesa_short_code,
          mpesa_receipt_number,
          amount_minor,
          phone_number,
          raw_payload,
          transaction_occurred_at,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::bigint,
          $13,
          $14::jsonb,
          $15::timestamptz,
          $16::jsonb
        )
        ON CONFLICT (tenant_id, checkout_request_id)
        DO UPDATE SET
          payment_intent_id = EXCLUDED.payment_intent_id,
          callback_log_id = EXCLUDED.callback_log_id,
          merchant_request_id = EXCLUDED.merchant_request_id,
          result_code = EXCLUDED.result_code,
          result_desc = EXCLUDED.result_desc,
          status = EXCLUDED.status,
          transaction_id = COALESCE(EXCLUDED.transaction_id, mpesa_transactions.transaction_id),
          mpesa_short_code = COALESCE(EXCLUDED.mpesa_short_code, mpesa_transactions.mpesa_short_code),
          mpesa_receipt_number = COALESCE(EXCLUDED.mpesa_receipt_number, mpesa_transactions.mpesa_receipt_number),
          amount_minor = COALESCE(EXCLUDED.amount_minor, mpesa_transactions.amount_minor),
          phone_number = COALESCE(EXCLUDED.phone_number, mpesa_transactions.phone_number),
          raw_payload = COALESCE(EXCLUDED.raw_payload, mpesa_transactions.raw_payload),
          transaction_occurred_at = COALESCE(
            EXCLUDED.transaction_occurred_at,
            mpesa_transactions.transaction_occurred_at
          ),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          payment_intent_id,
          callback_log_id,
          checkout_request_id,
          merchant_request_id,
          result_code,
          result_desc,
          status,
          transaction_id,
          mpesa_short_code,
          mpesa_receipt_number,
          amount_minor::text,
          phone_number,
          raw_payload,
          transaction_occurred_at,
          ledger_transaction_id,
          processed_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.payment_intent_id,
        input.callback_log_id,
        input.callback.checkout_request_id,
        input.callback.merchant_request_id,
        input.callback.result_code,
        input.callback.result_desc,
        input.callback.status,
        input.callback.mpesa_receipt_number,
        null,
        input.callback.mpesa_receipt_number,
        input.callback.amount_minor,
        this.piiEncryptionService.encryptNullable(
          input.callback.phone_number,
          this.phoneNumberAad(input.tenant_id),
        ),
        input.raw_payload ? JSON.stringify(input.raw_payload) : null,
        input.callback.transaction_occurred_at,
        JSON.stringify(input.callback.metadata ?? {}),
      ],
    );

    return this.mapEntity(result.rows[0]);
  }

  async attachLedgerTransaction(
    tenantId: string,
    checkoutRequestId: string,
    ledgerTransactionId: string,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE mpesa_transactions
        SET
          ledger_transaction_id = $3::uuid,
          processed_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND checkout_request_id = $2
      `,
      [tenantId, checkoutRequestId, ledgerTransactionId],
    );
  }

  async findByCheckoutRequestId(
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<MpesaTransactionEntity | null> {
    const result = await this.databaseService.query<MpesaTransactionRow>(
      `
        SELECT
          id,
          tenant_id,
          payment_intent_id,
          callback_log_id,
          checkout_request_id,
          merchant_request_id,
          result_code,
          result_desc,
          status,
          transaction_id,
          mpesa_short_code,
          mpesa_receipt_number,
          amount_minor::text,
          phone_number,
          raw_payload,
          transaction_occurred_at,
          ledger_transaction_id,
          processed_at,
          metadata,
          created_at,
          updated_at
        FROM mpesa_transactions
        WHERE tenant_id = $1
          AND checkout_request_id = $2
        LIMIT 1
      `,
      [tenantId, checkoutRequestId],
    );

    return result.rows[0] ? this.mapEntity(result.rows[0]) : null;
  }

  private mapEntity(row: MpesaTransactionRow): MpesaTransactionEntity {
    return Object.assign(new MpesaTransactionEntity(), {
      ...row,
      phone_number: this.piiEncryptionService.decryptNullable(
        row.phone_number,
        this.phoneNumberAad(row.tenant_id),
      ),
      raw_payload: row.raw_payload ?? null,
      metadata: row.metadata ?? {},
    });
  }

  private phoneNumberAad(tenantId: string): string {
    return `mpesa_transactions:${tenantId}:phone_number`;
  }
}
