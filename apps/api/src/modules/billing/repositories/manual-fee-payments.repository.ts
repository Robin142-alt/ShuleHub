import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import {
  ManualFeePaymentAllocationEntity,
  ManualFeePaymentAllocationType,
  ManualFeePaymentEntity,
  ManualFeePaymentMethod,
  ManualFeePaymentStatus,
} from '../entities/manual-fee-payment.entity';

interface ManualFeePaymentRow {
  id: string;
  tenant_id: string;
  idempotency_key: string;
  receipt_number: string;
  payment_method: ManualFeePaymentMethod;
  status: ManualFeePaymentStatus;
  student_id: string | null;
  invoice_id: string | null;
  amount_minor: string;
  currency_code: string;
  payer_name: string | null;
  received_at: Date;
  deposited_at: Date | null;
  cleared_at: Date | null;
  bounced_at: Date | null;
  reversed_at: Date | null;
  cheque_number: string | null;
  drawer_bank: string | null;
  deposit_reference: string | null;
  external_reference: string | null;
  asset_account_code: string;
  fee_control_account_code: string;
  ledger_transaction_id: string | null;
  reversal_ledger_transaction_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ManualFeePaymentAllocationRow {
  id: string;
  tenant_id: string;
  manual_payment_id: string;
  invoice_id: string | null;
  student_id: string | null;
  allocation_type: ManualFeePaymentAllocationType;
  amount_minor: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface CreateManualFeePaymentInput {
  tenant_id: string;
  idempotency_key: string;
  receipt_number: string;
  payment_method: ManualFeePaymentMethod;
  status: ManualFeePaymentStatus;
  student_id: string | null;
  invoice_id: string | null;
  amount_minor: string;
  currency_code: string;
  payer_name: string | null;
  received_at: string;
  cheque_number: string | null;
  drawer_bank: string | null;
  deposit_reference: string | null;
  external_reference: string | null;
  asset_account_code: string;
  fee_control_account_code: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
}

@Injectable()
export class ManualFeePaymentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(input: CreateManualFeePaymentInput): Promise<ManualFeePaymentEntity> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        INSERT INTO manual_fee_payments (
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor,
          currency_code,
          payer_name,
          received_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          notes,
          metadata,
          created_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::uuid,
          $7::uuid,
          $8::bigint,
          $9,
          $10,
          $11::timestamptz,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19::jsonb,
          $20::uuid
        )
        ON CONFLICT (tenant_id, idempotency_key)
        DO UPDATE SET updated_at = manual_fee_payments.updated_at
        RETURNING
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.idempotency_key,
        input.receipt_number,
        input.payment_method,
        input.status,
        input.student_id,
        input.invoice_id,
        input.amount_minor,
        input.currency_code,
        input.payer_name,
        input.received_at,
        input.cheque_number,
        input.drawer_bank,
        input.deposit_reference,
        input.external_reference,
        input.asset_account_code,
        input.fee_control_account_code,
        input.notes,
        JSON.stringify(input.metadata ?? {}),
        input.created_by_user_id,
      ],
    );

    return this.mapPayment(result.rows[0]);
  }

  async list(input: {
    tenant_id: string;
    status?: ManualFeePaymentStatus | null;
  }): Promise<ManualFeePaymentEntity[]> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        SELECT
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        FROM manual_fee_payments
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2::text)
        ORDER BY received_at DESC, created_at DESC
      `,
      [input.tenant_id, input.status ?? null],
    );

    return result.rows.map((row) => this.mapPayment(row));
  }

  async findById(
    tenantId: string,
    paymentId: string,
  ): Promise<ManualFeePaymentEntity | null> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        SELECT
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        FROM manual_fee_payments
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, paymentId],
    );

    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async lockById(
    tenantId: string,
    paymentId: string,
  ): Promise<ManualFeePaymentEntity | null> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        SELECT
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        FROM manual_fee_payments
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, paymentId],
    );

    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async markDeposited(input: {
    tenant_id: string;
    payment_id: string;
    deposited_at: string;
    deposit_reference: string | null;
    notes: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ManualFeePaymentEntity> {
    return this.updateStatus({
      tenant_id: input.tenant_id,
      payment_id: input.payment_id,
      status: 'deposited',
      timestamp_column: 'deposited_at',
      timestamp_value: input.deposited_at,
      deposit_reference: input.deposit_reference,
      notes: input.notes,
      metadata: input.metadata,
    });
  }

  async markCleared(
    tenantId: string,
    paymentId: string,
    input: {
      ledger_transaction_id: string;
      cleared_at: string;
      deposit_reference?: string | null;
      notes?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ManualFeePaymentEntity> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        UPDATE manual_fee_payments
        SET
          status = 'cleared',
          cleared_at = $3::timestamptz,
          ledger_transaction_id = $4::uuid,
          deposit_reference = COALESCE($5, deposit_reference),
          notes = COALESCE($6, notes),
          metadata = metadata || $7::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        tenantId,
        paymentId,
        input.cleared_at,
        input.ledger_transaction_id,
        input.deposit_reference ?? null,
        input.notes ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapPayment(result.rows[0]);
  }

  async markBounced(input: {
    tenant_id: string;
    payment_id: string;
    bounced_at: string;
    notes: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ManualFeePaymentEntity> {
    return this.updateStatus({
      tenant_id: input.tenant_id,
      payment_id: input.payment_id,
      status: 'bounced',
      timestamp_column: 'bounced_at',
      timestamp_value: input.bounced_at,
      deposit_reference: null,
      notes: input.notes,
      metadata: input.metadata,
    });
  }

  async markReversed(
    tenantId: string,
    paymentId: string,
    input: {
      reversal_ledger_transaction_id: string;
      reversed_at: string;
      notes?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ManualFeePaymentEntity> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        UPDATE manual_fee_payments
        SET
          status = 'reversed',
          reversed_at = $3::timestamptz,
          reversal_ledger_transaction_id = $4::uuid,
          notes = COALESCE($5, notes),
          metadata = metadata || $6::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        tenantId,
        paymentId,
        input.reversed_at,
        input.reversal_ledger_transaction_id,
        input.notes ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapPayment(result.rows[0]);
  }

  async createAllocation(input: {
    tenant_id: string;
    manual_payment_id: string;
    invoice_id: string | null;
    student_id: string | null;
    allocation_type: ManualFeePaymentAllocationType;
    amount_minor: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO manual_fee_payment_allocations (
          tenant_id,
          manual_payment_id,
          invoice_id,
          student_id,
          allocation_type,
          amount_minor,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6::bigint, $7::jsonb)
        ON CONFLICT (tenant_id, manual_payment_id, invoice_id, allocation_type)
        DO NOTHING
        RETURNING id
      `,
      [
        input.tenant_id,
        input.manual_payment_id,
        input.invoice_id,
        input.student_id,
        input.allocation_type,
        input.amount_minor,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0] ?? { id: '' };
  }

  async listAllocations(
    tenantId: string,
    paymentId: string,
  ): Promise<ManualFeePaymentAllocationEntity[]> {
    const result = await this.databaseService.query<ManualFeePaymentAllocationRow>(
      `
        SELECT
          id,
          tenant_id,
          manual_payment_id,
          invoice_id,
          student_id,
          allocation_type,
          amount_minor::text,
          metadata,
          created_at
        FROM manual_fee_payment_allocations
        WHERE tenant_id = $1
          AND manual_payment_id = $2::uuid
        ORDER BY created_at ASC, id ASC
      `,
      [tenantId, paymentId],
    );

    return result.rows.map((row) => ({
      ...row,
      metadata: row.metadata ?? {},
    }));
  }

  private async updateStatus(input: {
    tenant_id: string;
    payment_id: string;
    status: ManualFeePaymentStatus;
    timestamp_column: 'deposited_at' | 'bounced_at';
    timestamp_value: string;
    deposit_reference: string | null;
    notes: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ManualFeePaymentEntity> {
    const result = await this.databaseService.query<ManualFeePaymentRow>(
      `
        UPDATE manual_fee_payments
        SET
          status = $3,
          ${input.timestamp_column} = $4::timestamptz,
          deposit_reference = COALESCE($5, deposit_reference),
          notes = COALESCE($6, notes),
          metadata = metadata || $7::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          idempotency_key,
          receipt_number,
          payment_method,
          status,
          student_id,
          invoice_id,
          amount_minor::text,
          currency_code,
          payer_name,
          received_at,
          deposited_at,
          cleared_at,
          bounced_at,
          reversed_at,
          cheque_number,
          drawer_bank,
          deposit_reference,
          external_reference,
          asset_account_code,
          fee_control_account_code,
          ledger_transaction_id,
          reversal_ledger_transaction_id,
          notes,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.payment_id,
        input.status,
        input.timestamp_value,
        input.deposit_reference,
        input.notes,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapPayment(result.rows[0]);
  }

  private mapPayment(row: ManualFeePaymentRow): ManualFeePaymentEntity {
    return Object.assign(new ManualFeePaymentEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
