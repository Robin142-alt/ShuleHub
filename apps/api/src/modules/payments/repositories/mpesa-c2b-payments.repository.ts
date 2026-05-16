import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import {
  MpesaC2bPaymentEntity,
  MpesaC2bPaymentStatus,
} from '../entities/mpesa-c2b-payment.entity';

interface MpesaC2bPaymentRow {
  id: string;
  tenant_id: string;
  mpesa_config_id: string | null;
  payment_channel_id: string | null;
  trans_id: string;
  transaction_type: string;
  business_short_code: string;
  bill_ref_number: string | null;
  invoice_number: string | null;
  amount_minor: string;
  currency_code: string;
  phone_number: string | null;
  payer_name: string | null;
  org_account_balance: string | null;
  third_party_trans_id: string | null;
  status: MpesaC2bPaymentStatus;
  matched_invoice_id: string | null;
  matched_student_id: string | null;
  manual_fee_payment_id: string | null;
  ledger_transaction_id: string | null;
  received_at: Date;
  matched_at: Date | null;
  raw_payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMpesaC2bPaymentInput {
  tenant_id: string;
  mpesa_config_id: string | null;
  payment_channel_id: string | null;
  trans_id: string;
  transaction_type: string;
  business_short_code: string;
  bill_ref_number: string | null;
  invoice_number: string | null;
  amount_minor: string;
  currency_code: string;
  phone_number: string | null;
  payer_name: string | null;
  org_account_balance: string | null;
  third_party_trans_id: string | null;
  received_at: string;
  raw_payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MpesaC2bPaymentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByTenantAndTransId(
    tenantId: string,
    transId: string,
  ): Promise<MpesaC2bPaymentEntity | null> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        SELECT
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
        FROM mpesa_c2b_payments
        WHERE tenant_id = $1
          AND trans_id = $2
        LIMIT 1
      `,
      [tenantId, transId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async list(input: {
    tenant_id: string;
    status?: MpesaC2bPaymentStatus | null;
  }): Promise<MpesaC2bPaymentEntity[]> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        SELECT
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
        FROM mpesa_c2b_payments
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2::text)
        ORDER BY received_at DESC, created_at DESC
      `,
      [input.tenant_id, input.status ?? null],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async lockById(
    tenantId: string,
    paymentId: string,
  ): Promise<MpesaC2bPaymentEntity | null> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        SELECT
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
        FROM mpesa_c2b_payments
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, paymentId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async createReceived(input: CreateMpesaC2bPaymentInput): Promise<{
    payment: MpesaC2bPaymentEntity;
    inserted: boolean;
  }> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        INSERT INTO mpesa_c2b_payments (
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          received_at,
          raw_payload,
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
          $9::bigint,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15::timestamptz,
          $16::jsonb,
          $17::jsonb
        )
        ON CONFLICT (tenant_id, trans_id) DO NOTHING
        RETURNING
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.mpesa_config_id,
        input.payment_channel_id,
        input.trans_id,
        input.transaction_type,
        input.business_short_code,
        input.bill_ref_number,
        input.invoice_number,
        input.amount_minor,
        input.currency_code,
        input.phone_number,
        input.payer_name,
        input.org_account_balance,
        input.third_party_trans_id,
        input.received_at,
        JSON.stringify(input.raw_payload),
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (result.rows[0]) {
      return {
        payment: this.mapRow(result.rows[0]),
        inserted: true,
      };
    }

    const existing = await this.findByTenantAndTransId(input.tenant_id, input.trans_id);

    if (!existing) {
      throw new Error(`M-PESA C2B payment "${input.trans_id}" could not be persisted`);
    }

    return {
      payment: existing,
      inserted: false,
    };
  }

  async markMatched(input: {
    tenant_id: string;
    payment_id: string;
    matched_invoice_id: string | null;
    matched_student_id: string | null;
    manual_fee_payment_id: string;
    ledger_transaction_id: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<MpesaC2bPaymentEntity> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        UPDATE mpesa_c2b_payments
        SET
          status = 'matched',
          matched_invoice_id = $3::uuid,
          matched_student_id = $4::uuid,
          manual_fee_payment_id = $5::uuid,
          ledger_transaction_id = $6::uuid,
          matched_at = NOW(),
          metadata = metadata || $7::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.payment_id,
        input.matched_invoice_id,
        input.matched_student_id,
        input.manual_fee_payment_id,
        input.ledger_transaction_id,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async markPendingReview(input: {
    tenant_id: string;
    payment_id: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<MpesaC2bPaymentEntity> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        UPDATE mpesa_c2b_payments
        SET
          status = 'pending_review',
          metadata = metadata || jsonb_build_object('review_reason', $3::text) || $4::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
      `,
      [input.tenant_id, input.payment_id, input.reason, JSON.stringify(input.metadata ?? {})],
    );

    return this.mapRow(result.rows[0]);
  }

  async markRejected(input: {
    tenant_id: string;
    payment_id: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<MpesaC2bPaymentEntity> {
    const result = await this.databaseService.query<MpesaC2bPaymentRow>(
      `
        UPDATE mpesa_c2b_payments
        SET
          status = 'rejected',
          metadata = metadata || jsonb_build_object('rejection_reason', $3::text) || $4::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          mpesa_config_id,
          payment_channel_id,
          trans_id,
          transaction_type,
          business_short_code,
          bill_ref_number,
          invoice_number,
          amount_minor::text,
          currency_code,
          phone_number,
          payer_name,
          org_account_balance,
          third_party_trans_id,
          status,
          matched_invoice_id,
          matched_student_id,
          manual_fee_payment_id,
          ledger_transaction_id,
          received_at,
          matched_at,
          raw_payload,
          metadata,
          created_at,
          updated_at
      `,
      [input.tenant_id, input.payment_id, input.reason, JSON.stringify(input.metadata ?? {})],
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: MpesaC2bPaymentRow): MpesaC2bPaymentEntity {
    return Object.assign(new MpesaC2bPaymentEntity(), {
      ...row,
      raw_payload: row.raw_payload ?? {},
      metadata: row.metadata ?? {},
    });
  }
}
