import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { PiiEncryptionService } from '../../security/pii-encryption.service';
import { PaymentIntentEntity } from '../entities/payment-intent.entity';

interface PaymentIntentRow {
  id: string;
  tenant_id: string;
  idempotency_key_id: string;
  user_id: string | null;
  student_id: string | null;
  request_id: string | null;
  external_reference: string | null;
  account_reference: string;
  transaction_desc: string;
  phone_number: string;
  amount_minor: string;
  currency_code: string;
  status: PaymentIntentEntity['status'];
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  response_code: string | null;
  response_description: string | null;
  customer_message: string | null;
  ledger_transaction_id: string | null;
  failure_reason: string | null;
  stk_requested_at: Date | null;
  callback_received_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface CreatePaymentIntentInput {
  tenant_id: string;
  idempotency_key_id: string;
  user_id: string | null;
  student_id?: string | null;
  request_id: string | null;
  external_reference: string | null;
  account_reference: string;
  transaction_desc: string;
  phone_number: string;
  amount_minor: string;
  currency_code: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class PaymentIntentsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async createPending(input: CreatePaymentIntentInput): Promise<PaymentIntentEntity> {
    const result = await this.databaseService.query<PaymentIntentRow>(
      `
        INSERT INTO payment_intents (
          tenant_id,
          idempotency_key_id,
          user_id,
          student_id,
          request_id,
          external_reference,
          account_reference,
          transaction_desc,
          phone_number,
          amount_minor,
          currency_code,
          status,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::bigint,
          $11,
          'pending',
          $12::jsonb
        )
        RETURNING
          id,
          tenant_id,
          idempotency_key_id,
          user_id,
          student_id,
          request_id,
          external_reference,
          account_reference,
          transaction_desc,
          phone_number,
          amount_minor::text,
          currency_code,
          status,
          merchant_request_id,
          checkout_request_id,
          response_code,
          response_description,
          customer_message,
          ledger_transaction_id,
          failure_reason,
          stk_requested_at,
          callback_received_at,
          completed_at,
          expires_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.idempotency_key_id,
        input.user_id,
        input.student_id,
        input.request_id,
        input.external_reference,
        input.account_reference,
        input.transaction_desc,
        this.piiEncryptionService.encrypt(
          input.phone_number,
          this.phoneNumberAad(input.tenant_id),
        ),
        input.amount_minor,
        input.currency_code,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapEntity(result.rows[0]);
  }

  async markStkRequested(
    tenantId: string,
    paymentIntentId: string,
    response: {
      merchant_request_id: string;
      checkout_request_id: string;
      response_code: string;
      response_description: string;
      customer_message: string;
    },
    expiresAfterSeconds: number,
  ): Promise<PaymentIntentEntity> {
    const result = await this.databaseService.query<PaymentIntentRow>(
      `
        UPDATE payment_intents
        SET
          merchant_request_id = $3,
          checkout_request_id = $4,
          response_code = $5,
          response_description = $6,
          customer_message = $7,
          status = 'stk_requested',
          stk_requested_at = NOW(),
          expires_at = NOW() + ($8 * INTERVAL '1 second'),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          idempotency_key_id,
          user_id,
          student_id,
          request_id,
          external_reference,
          account_reference,
          transaction_desc,
          phone_number,
          amount_minor::text,
          currency_code,
          status,
          merchant_request_id,
          checkout_request_id,
          response_code,
          response_description,
          customer_message,
          ledger_transaction_id,
          failure_reason,
          stk_requested_at,
          callback_received_at,
          completed_at,
          expires_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        tenantId,
        paymentIntentId,
        response.merchant_request_id,
        response.checkout_request_id,
        response.response_code,
        response.response_description,
        response.customer_message,
        expiresAfterSeconds,
      ],
    );

    return this.mapEntity(result.rows[0]);
  }

  async lockByCheckoutOrMerchantRequestId(
    tenantId: string,
    checkoutRequestId: string,
    merchantRequestId: string,
  ): Promise<PaymentIntentEntity | null> {
    const result = await this.databaseService.query<PaymentIntentRow>(
      `
        SELECT
          id,
          tenant_id,
          idempotency_key_id,
          user_id,
          student_id,
          request_id,
          external_reference,
          account_reference,
          transaction_desc,
          phone_number,
          amount_minor::text,
          currency_code,
          status,
          merchant_request_id,
          checkout_request_id,
          response_code,
          response_description,
          customer_message,
          ledger_transaction_id,
          failure_reason,
          stk_requested_at,
          callback_received_at,
          completed_at,
          expires_at,
          metadata,
          created_at,
          updated_at
        FROM payment_intents
        WHERE tenant_id = $1
          AND (
            checkout_request_id = $2
            OR merchant_request_id = $3
          )
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, checkoutRequestId, merchantRequestId],
    );

    return result.rows[0] ? this.mapEntity(result.rows[0]) : null;
  }

  async markCallbackReceived(tenantId: string, paymentIntentId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE payment_intents
        SET
          status = CASE
            WHEN status IN ('completed', 'failed') THEN status
            ELSE 'callback_received'
          END,
          callback_received_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, paymentIntentId],
    );
  }

  async markProcessing(tenantId: string, paymentIntentId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE payment_intents
        SET
          status = CASE
            WHEN status IN ('completed', 'failed') THEN status
            ELSE 'processing'
          END,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, paymentIntentId],
    );
  }

  async markCompleted(
    tenantId: string,
    paymentIntentId: string,
    ledgerTransactionId: string,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE payment_intents
        SET
          status = 'completed',
          ledger_transaction_id = $3::uuid,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, paymentIntentId, ledgerTransactionId],
    );
  }

  async markFailed(tenantId: string, paymentIntentId: string, reason: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE payment_intents
        SET
          status = 'failed',
          failure_reason = $3,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, paymentIntentId, reason],
    );
  }

  async expireStalePendingIntents(
    tenantId: string,
    input: {
      batch_size: number;
      failure_reason: string;
    },
  ): Promise<PaymentIntentEntity[]> {
    const result = await this.databaseService.query<PaymentIntentRow>(
      `
        WITH stale_payment_intents AS (
          SELECT pi.id
          FROM payment_intents pi
          WHERE pi.tenant_id = $1
            AND pi.status IN ('stk_requested', 'callback_received', 'processing')
            AND pi.expires_at IS NOT NULL
            AND pi.expires_at <= NOW()
            AND NOT EXISTS (
              SELECT 1
              FROM mpesa_transactions mt
              WHERE mt.tenant_id = pi.tenant_id
                AND mt.payment_intent_id = pi.id
            )
          ORDER BY pi.expires_at ASC, pi.created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE payment_intents pi
        SET
          status = 'expired',
          failure_reason = COALESCE(pi.failure_reason, $3),
          completed_at = NOW(),
          updated_at = NOW()
        FROM stale_payment_intents spi
        WHERE pi.tenant_id = $1
          AND pi.id = spi.id
        RETURNING
          pi.id,
          pi.tenant_id,
          pi.idempotency_key_id,
          pi.user_id,
          pi.student_id,
          pi.request_id,
          pi.external_reference,
          pi.account_reference,
          pi.transaction_desc,
          pi.phone_number,
          pi.amount_minor::text,
          pi.currency_code,
          pi.status,
          pi.merchant_request_id,
          pi.checkout_request_id,
          pi.response_code,
          pi.response_description,
          pi.customer_message,
          pi.ledger_transaction_id,
          pi.failure_reason,
          pi.stk_requested_at,
          pi.callback_received_at,
          pi.completed_at,
          pi.expires_at,
          pi.metadata,
          pi.created_at,
          pi.updated_at
      `,
      [tenantId, input.batch_size, input.failure_reason],
    );

    return result.rows.map((row) => this.mapEntity(row));
  }

  async findByCheckoutRequestId(
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<PaymentIntentEntity | null> {
    const result = await this.databaseService.query<PaymentIntentRow>(
      `
        SELECT
          id,
          tenant_id,
          idempotency_key_id,
          user_id,
          student_id,
          request_id,
          external_reference,
          account_reference,
          transaction_desc,
          phone_number,
          amount_minor::text,
          currency_code,
          status,
          merchant_request_id,
          checkout_request_id,
          response_code,
          response_description,
          customer_message,
          ledger_transaction_id,
          failure_reason,
          stk_requested_at,
          callback_received_at,
          completed_at,
          expires_at,
          metadata,
          created_at,
          updated_at
        FROM payment_intents
        WHERE tenant_id = $1
          AND checkout_request_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, checkoutRequestId],
    );

    return result.rows[0] ? this.mapEntity(result.rows[0]) : null;
  }

  private mapEntity(row: PaymentIntentRow): PaymentIntentEntity {
    return Object.assign(new PaymentIntentEntity(), {
      ...row,
      phone_number: this.piiEncryptionService.decrypt(
        row.phone_number,
        this.phoneNumberAad(row.tenant_id),
      ),
      metadata: row.metadata ?? {},
    });
  }

  private phoneNumberAad(tenantId: string): string {
    return `payment_intents:${tenantId}:phone_number`;
  }
}
