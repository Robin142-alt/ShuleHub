import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { AuditLogService } from '../../observability/audit-log.service';
import { PaymentIntentEntity } from '../entities/payment-intent.entity';

@Injectable()
export class PaymentAllocationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async allocateTenantFeePayment(input: {
    tenant_id: string;
    payment_intent: PaymentIntentEntity;
    amount_minor: string;
    ledger_transaction_id: string;
  }): Promise<{ allocated: boolean; invoice_id: string | null }> {
    if (input.payment_intent.payment_owner !== 'tenant') {
      return { allocated: false, invoice_id: null };
    }

    const invoiceId = this.isUuid(input.payment_intent.external_reference)
      ? input.payment_intent.external_reference
      : null;
    const result = await this.databaseService.query<{ id: string }>(
      `
        UPDATE invoices
        SET
          amount_paid_minor = LEAST(total_amount_minor, amount_paid_minor + $4::bigint),
          status = CASE
            WHEN LEAST(total_amount_minor, amount_paid_minor + $4::bigint) >= total_amount_minor THEN 'paid'
            ELSE 'pending_payment'
          END,
          payment_intent_id = COALESCE(payment_intent_id, $5::uuid),
          paid_at = CASE
            WHEN LEAST(total_amount_minor, amount_paid_minor + $4::bigint) >= total_amount_minor THEN COALESCE(paid_at, NOW())
            ELSE paid_at
          END,
          metadata = metadata || $6::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND status IN ('open', 'pending_payment')
          AND (
            ($2::uuid IS NOT NULL AND id = $2::uuid)
            OR invoice_number = $3
          )
        RETURNING id
      `,
      [
        input.tenant_id,
        invoiceId,
        input.payment_intent.account_reference,
        input.amount_minor,
        input.payment_intent.id,
        JSON.stringify({
          last_payment_allocation: {
            payment_intent_id: input.payment_intent.id,
            ledger_transaction_id: input.ledger_transaction_id,
          },
        }),
      ],
    );
    const allocatedInvoiceId = result.rows[0]?.id ?? null;

    if (allocatedInvoiceId) {
      await this.auditLogService.record({
        tenant_id: input.tenant_id,
        action: 'payment.allocated',
        resource_type: 'invoice',
        resource_id: allocatedInvoiceId,
        metadata: {
          payment_intent_id: input.payment_intent.id,
          student_id: input.payment_intent.student_id,
          amount_minor: input.amount_minor,
          ledger_transaction_id: input.ledger_transaction_id,
          account_reference: input.payment_intent.account_reference,
        },
      });
    }

    return { allocated: Boolean(allocatedInvoiceId), invoice_id: allocatedInvoiceId };
  }

  private isUuid(value: string | null): value is string {
    return Boolean(
      value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        ),
    );
  }
}
