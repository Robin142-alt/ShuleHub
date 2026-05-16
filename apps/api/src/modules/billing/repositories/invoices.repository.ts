import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { PiiEncryptionService } from '../../security/pii-encryption.service';
import { InvoiceEntity } from '../entities/invoice.entity';

interface InvoiceRow {
  id: string;
  tenant_id: string;
  subscription_id: string;
  invoice_number: string;
  status: InvoiceEntity['status'];
  currency_code: string;
  description: string;
  subtotal_amount_minor: string;
  tax_amount_minor: string;
  total_amount_minor: string;
  amount_paid_minor: string;
  billing_phone_number: string | null;
  payment_intent_id: string | null;
  issued_at: Date;
  due_at: Date;
  paid_at: Date | null;
  voided_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateInvoiceInput {
  tenant_id: string;
  subscription_id: string;
  invoice_number: string;
  status: InvoiceEntity['status'];
  currency_code: string;
  description: string;
  subtotal_amount_minor: string;
  tax_amount_minor: string;
  total_amount_minor: string;
  billing_phone_number: string | null;
  issued_at: string;
  due_at: string;
  metadata: Record<string, unknown>;
}

export interface StudentFeeInvoiceForAllocation {
  id: string;
  tenant_id: string;
  status: InvoiceEntity['status'];
  total_amount_minor: string;
  amount_paid_minor: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class InvoicesRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceEntity> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        INSERT INTO invoices (
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor,
          tax_amount_minor,
          total_amount_minor,
          amount_paid_minor,
          billing_phone_number,
          issued_at,
          due_at,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3,
          $4,
          $5,
          $6,
          $7::bigint,
          $8::bigint,
          $9::bigint,
          0,
          $10,
          $11::timestamptz,
          $12::timestamptz,
          $13::jsonb
        )
        RETURNING
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.subscription_id,
        input.invoice_number,
        input.status,
        input.currency_code,
        input.description,
        input.subtotal_amount_minor,
        input.tax_amount_minor,
        input.total_amount_minor,
        this.piiEncryptionService.encryptNullable(
          input.billing_phone_number,
          this.billingPhoneAad(input.tenant_id),
        ),
        input.issued_at,
        input.due_at,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async listInvoices(
    tenantId: string,
    status?: string,
  ): Promise<InvoiceEntity[]> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
        FROM invoices
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2::text)
        ORDER BY issued_at DESC, created_at DESC
      `,
      [tenantId, status ?? null],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(tenantId: string, invoiceId: string): Promise<InvoiceEntity | null> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
        FROM invoices
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, invoiceId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async lockById(tenantId: string, invoiceId: string): Promise<InvoiceEntity | null> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
        FROM invoices
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, invoiceId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByPaymentIntentId(
    tenantId: string,
    paymentIntentId: string,
  ): Promise<InvoiceEntity | null> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
        FROM invoices
        WHERE tenant_id = $1
          AND payment_intent_id = $2::uuid
        LIMIT 1
      `,
      [tenantId, paymentIntentId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async lockByPaymentIntentId(
    tenantId: string,
    paymentIntentId: string,
  ): Promise<InvoiceEntity | null> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
        FROM invoices
        WHERE tenant_id = $1
          AND payment_intent_id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, paymentIntentId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findLatestRenewalInvoice(
    tenantId: string,
    subscriptionId: string,
    renewalWindow: string,
  ): Promise<InvoiceEntity | null> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        SELECT
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
        FROM invoices
        WHERE tenant_id = $1
          AND subscription_id = $2::uuid
          AND metadata ->> 'billing_reason' = 'subscription_renewal'
          AND metadata ->> 'renewal_window' = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, subscriptionId, renewalWindow],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async markPaymentInitiated(
    tenantId: string,
    invoiceId: string,
    paymentIntentId: string,
    billingPhoneNumber: string | null,
  ): Promise<InvoiceEntity> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        UPDATE invoices
        SET
          payment_intent_id = $3::uuid,
          billing_phone_number = COALESCE($4, billing_phone_number),
          status = 'pending_payment',
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        tenantId,
        invoiceId,
        paymentIntentId,
        this.piiEncryptionService.encryptNullable(
          billingPhoneNumber,
          this.billingPhoneAad(tenantId),
        ),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async markPaid(
    tenantId: string,
    invoiceId: string,
    amountPaidMinor: string,
  ): Promise<InvoiceEntity> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        UPDATE invoices
        SET
          status = 'paid',
          amount_paid_minor = $3::bigint,
          paid_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
      `,
      [tenantId, invoiceId, amountPaidMinor],
    );

    return this.mapRow(result.rows[0]);
  }

  async findStudentFeePaymentAllocationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<{ id: string } | null> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        SELECT id
        FROM student_fee_payment_allocations
        WHERE tenant_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [tenantId, idempotencyKey],
    );

    return result.rows[0] ?? null;
  }

  async findStudentFeeInvoicesForAllocation(input: {
    tenantId: string;
    studentId: string;
    explicitInvoiceId?: string | null;
  }): Promise<StudentFeeInvoiceForAllocation[]> {
    const result = await this.databaseService.query<StudentFeeInvoiceForAllocation>(
      `
        SELECT
          id,
          tenant_id,
          status,
          total_amount_minor::text,
          amount_paid_minor::text,
          metadata
        FROM invoices
        WHERE tenant_id = $1
          AND metadata ->> 'student_id' = $2
          AND status IN ('open', 'pending_payment')
          AND amount_paid_minor < total_amount_minor
          AND ($3::uuid IS NULL OR id = $3::uuid)
        ORDER BY due_at ASC, issued_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
      `,
      [input.tenantId, input.studentId, input.explicitInvoiceId ?? null],
    );

    return result.rows.map((row) => ({
      ...row,
      metadata: row.metadata ?? {},
    }));
  }

  async lockManualFeeInvoiceForAllocation(
    tenantId: string,
    invoiceId: string,
  ): Promise<StudentFeeInvoiceForAllocation | null> {
    const result = await this.databaseService.query<StudentFeeInvoiceForAllocation>(
      `
        SELECT
          id,
          tenant_id,
          status,
          total_amount_minor::text,
          amount_paid_minor::text,
          metadata
        FROM invoices
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND status IN ('open', 'pending_payment')
          AND amount_paid_minor < total_amount_minor
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, invoiceId],
    );

    const row = result.rows[0];

    return row
      ? {
          ...row,
          metadata: row.metadata ?? {},
        }
      : null;
  }

  async findManualFeeInvoiceTargetByReference(
    tenantId: string,
    reference: string,
  ): Promise<StudentFeeInvoiceForAllocation | null> {
    const trimmedReference = reference.trim();
    const result = await this.databaseService.query<StudentFeeInvoiceForAllocation>(
      `
        SELECT
          id,
          tenant_id,
          status,
          total_amount_minor::text,
          amount_paid_minor::text,
          metadata
        FROM invoices
        WHERE tenant_id = $1
          AND (
            invoice_number = $2
            OR metadata ->> 'external_reference' = $2
            OR metadata ->> 'account_reference' = $2
            OR ($3::uuid IS NOT NULL AND id = $3::uuid)
          )
          AND status IN ('open', 'pending_payment')
          AND amount_paid_minor < total_amount_minor
        ORDER BY due_at ASC, issued_at ASC, created_at ASC
        LIMIT 1
      `,
      [
        tenantId,
        trimmedReference,
        this.isUuid(trimmedReference) ? trimmedReference : null,
      ],
    );

    const row = result.rows[0];

    return row
      ? {
          ...row,
          metadata: row.metadata ?? {},
        }
      : null;
  }

  async applyStudentFeeInvoicePayment(input: {
    tenantId: string;
    invoiceId: string;
    paymentIntentId: string;
    amountMinor: string;
    nextAmountPaidMinor: string;
    nextStatus: 'pending_payment' | 'paid';
  }): Promise<InvoiceEntity> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        UPDATE invoices
        SET
          amount_paid_minor = $4::bigint,
          payment_intent_id = $3::uuid,
          status = $5,
          paid_at = CASE WHEN $5 = 'paid' THEN NOW() ELSE paid_at END,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenantId,
        input.invoiceId,
        input.paymentIntentId,
        input.nextAmountPaidMinor,
        input.nextStatus,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async applyManualFeeInvoicePayment(input: {
    tenantId: string;
    invoiceId: string;
    amountMinor: string;
    nextAmountPaidMinor: string;
    nextStatus: 'pending_payment' | 'paid';
  }): Promise<InvoiceEntity> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        UPDATE invoices
        SET
          amount_paid_minor = $3::bigint,
          status = $4,
          paid_at = CASE WHEN $4 = 'paid' THEN NOW() ELSE paid_at END,
          metadata = metadata || jsonb_build_object(
            'last_manual_payment_amount_minor', $5::text
          ),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenantId,
        input.invoiceId,
        input.nextAmountPaidMinor,
        input.nextStatus,
        input.amountMinor,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async reverseManualFeeInvoicePayment(input: {
    tenantId: string;
    invoiceId: string;
    amountMinor: string;
    nextStatus: 'open' | 'pending_payment';
  }): Promise<InvoiceEntity> {
    const result = await this.databaseService.query<InvoiceRow>(
      `
        UPDATE invoices
        SET
          amount_paid_minor = GREATEST(amount_paid_minor - $3::bigint, 0),
          status = CASE
            WHEN GREATEST(amount_paid_minor - $3::bigint, 0) = 0 THEN $4
            ELSE 'pending_payment'
          END,
          paid_at = NULL,
          metadata = metadata || jsonb_build_object(
            'last_manual_reversal_amount_minor', $3::text
          ),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          subscription_id,
          invoice_number,
          status,
          currency_code,
          description,
          subtotal_amount_minor::text,
          tax_amount_minor::text,
          total_amount_minor::text,
          amount_paid_minor::text,
          billing_phone_number,
          payment_intent_id,
          issued_at,
          due_at,
          paid_at,
          voided_at,
          metadata,
          created_at,
          updated_at
      `,
      [input.tenantId, input.invoiceId, input.amountMinor, input.nextStatus],
    );

    return this.mapRow(result.rows[0]);
  }

  async createStudentFeePaymentAllocation(input: {
    tenantId: string;
    invoiceId: string;
    studentId: string;
    parentUserId?: string | null;
    paymentIntentId: string;
    ledgerTransactionId?: string | null;
    amountMinor: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO student_fee_payment_allocations (
          tenant_id,
          invoice_id,
          student_id,
          parent_user_id,
          payment_intent_id,
          ledger_transaction_id,
          amount_minor,
          idempotency_key,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::bigint, $8, $9::jsonb)
        ON CONFLICT (tenant_id, idempotency_key, invoice_id)
        DO NOTHING
        RETURNING id
      `,
      [
        input.tenantId,
        input.invoiceId,
        input.studentId,
        input.parentUserId ?? null,
        input.paymentIntentId,
        input.ledgerTransactionId ?? null,
        input.amountMinor,
        input.idempotencyKey,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0] ?? { id: '' };
  }

  async createStudentFeeCredit(input: {
    tenantId: string;
    studentId: string;
    parentUserId?: string | null;
    paymentIntentId: string;
    ledgerTransactionId?: string | null;
    amountMinor: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO student_fee_credits (
          tenant_id,
          student_id,
          parent_user_id,
          payment_intent_id,
          ledger_transaction_id,
          amount_minor,
          remaining_amount_minor,
          idempotency_key,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::bigint, $6::bigint, $7, $8::jsonb)
        ON CONFLICT (tenant_id, idempotency_key)
        DO NOTHING
        RETURNING id
      `,
      [
        input.tenantId,
        input.studentId,
        input.parentUserId ?? null,
        input.paymentIntentId,
        input.ledgerTransactionId ?? null,
        input.amountMinor,
        input.idempotencyKey,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0] ?? { id: '' };
  }

  private mapRow(row: InvoiceRow): InvoiceEntity {
    return Object.assign(new InvoiceEntity(), {
      ...row,
      billing_phone_number: this.piiEncryptionService.decryptNullable(
        row.billing_phone_number,
        this.billingPhoneAad(row.tenant_id),
      ),
      metadata: row.metadata ?? {},
    });
  }

  private billingPhoneAad(tenantId: string): string {
    return `invoices:${tenantId}:billing_phone_number`;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
