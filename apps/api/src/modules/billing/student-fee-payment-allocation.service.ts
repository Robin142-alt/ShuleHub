import { BadRequestException, Injectable } from '@nestjs/common';

import { InvoicesRepository, type StudentFeeInvoiceForAllocation } from './repositories/invoices.repository';

export interface CompletedStudentFeePaymentIntent {
  id: string;
  tenant_id: string;
  student_id?: string | null;
  user_id?: string | null;
  external_reference?: string | null;
  account_reference?: string | null;
  amount_minor?: string | null;
  ledger_transaction_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StudentFeePaymentAllocationResult {
  duplicate: boolean;
  allocated_amount_minor: string;
  credit_amount_minor: string;
  invoice_allocations: Array<{
    invoice_id: string;
    amount_minor: string;
  }>;
}

@Injectable()
export class StudentFeePaymentAllocationService {
  constructor(private readonly invoicesRepository: InvoicesRepository) {}

  async allocateConfirmedPayment(input: {
    tenantId: string;
    paymentIntent: CompletedStudentFeePaymentIntent;
    amountPaidMinor: string;
    ledgerTransactionId?: string | null;
  }): Promise<StudentFeePaymentAllocationResult> {
    const tenantId = input.tenantId.trim();
    const paymentIntent = input.paymentIntent;

    if (paymentIntent.tenant_id !== tenantId) {
      throw new BadRequestException('Payment intent tenant does not match allocation tenant');
    }

    const studentId = paymentIntent.student_id?.trim();

    if (!studentId) {
      throw new BadRequestException('Student fee payment allocation requires paymentIntent.student_id');
    }

    const amountPaidMinor = parseMinorUnits(input.amountPaidMinor, 'Payment amount');
    const ledgerTransactionId =
      input.ledgerTransactionId?.trim()
      || paymentIntent.ledger_transaction_id?.trim()
      || null;
    const idempotencyKey = buildAllocationIdempotencyKey(
      tenantId,
      paymentIntent.id,
      ledgerTransactionId,
    );
    const existing =
      await this.invoicesRepository.findStudentFeePaymentAllocationByIdempotencyKey(
        tenantId,
        idempotencyKey,
      );

    if (existing) {
      return {
        duplicate: true,
        allocated_amount_minor: '0',
        credit_amount_minor: '0',
        invoice_allocations: [],
      };
    }

    let remaining = amountPaidMinor;
    let allocated = 0n;
    const invoiceAllocations: StudentFeePaymentAllocationResult['invoice_allocations'] = [];
    const invoices = await this.invoicesRepository.findStudentFeeInvoicesForAllocation({
      tenantId,
      studentId,
      explicitInvoiceId: resolveExplicitInvoiceId(paymentIntent),
    });

    for (const invoice of invoices) {
      if (remaining <= 0n) {
        break;
      }

      assertInvoiceBelongsToStudent(invoice, tenantId, studentId);
      const total = parseMinorUnits(invoice.total_amount_minor, 'Invoice total');
      const paid = parseMinorUnits(invoice.amount_paid_minor, 'Invoice paid amount');
      const balance = total - paid;

      if (balance <= 0n) {
        continue;
      }

      const applied = remaining < balance ? remaining : balance;
      const nextAmountPaid = paid + applied;
      const nextStatus = nextAmountPaid >= total ? 'paid' : 'pending_payment';

      await this.invoicesRepository.applyStudentFeeInvoicePayment({
        tenantId,
        invoiceId: invoice.id,
        paymentIntentId: paymentIntent.id,
        amountMinor: applied.toString(),
        nextAmountPaidMinor: nextAmountPaid.toString(),
        nextStatus,
      });
      await this.invoicesRepository.createStudentFeePaymentAllocation({
        tenantId,
        invoiceId: invoice.id,
        studentId,
        parentUserId: paymentIntent.user_id ?? readStringMetadata(paymentIntent, 'parent_user_id'),
        paymentIntentId: paymentIntent.id,
        ledgerTransactionId,
        amountMinor: applied.toString(),
        idempotencyKey,
        metadata: {
          account_reference: paymentIntent.account_reference ?? null,
          external_reference: paymentIntent.external_reference ?? null,
        },
      });

      invoiceAllocations.push({
        invoice_id: invoice.id,
        amount_minor: applied.toString(),
      });
      allocated += applied;
      remaining -= applied;
    }

    if (remaining > 0n) {
      await this.invoicesRepository.createStudentFeeCredit({
        tenantId,
        studentId,
        parentUserId: paymentIntent.user_id ?? readStringMetadata(paymentIntent, 'parent_user_id'),
        paymentIntentId: paymentIntent.id,
        ledgerTransactionId,
        amountMinor: remaining.toString(),
        idempotencyKey,
        metadata: {
          account_reference: paymentIntent.account_reference ?? null,
          external_reference: paymentIntent.external_reference ?? null,
        },
      });
    }

    return {
      duplicate: false,
      allocated_amount_minor: allocated.toString(),
      credit_amount_minor: remaining.toString(),
      invoice_allocations: invoiceAllocations,
    };
  }
}

function assertInvoiceBelongsToStudent(
  invoice: StudentFeeInvoiceForAllocation,
  tenantId: string,
  studentId: string,
): void {
  const invoiceStudentId = readString(invoice.metadata?.student_id);

  if (invoice.tenant_id !== tenantId || invoiceStudentId !== studentId) {
    throw new BadRequestException('Student fee invoice does not belong to the payment tenant and student');
  }
}

function parseMinorUnits(value: string | number, label: string): bigint {
  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException(`${label} must be a non-negative integer minor-unit amount`);
  }

  return BigInt(normalized);
}

function resolveExplicitInvoiceId(paymentIntent: CompletedStudentFeePaymentIntent): string | null {
  return (
    readUuid(paymentIntent.external_reference)
    ?? readUuid(paymentIntent.account_reference)
    ?? readUuid(readStringMetadata(paymentIntent, 'invoice_id'))
    ?? null
  );
}

function buildAllocationIdempotencyKey(
  tenantId: string,
  paymentIntentId: string,
  ledgerTransactionId: string | null,
): string {
  return [
    'student-fee',
    tenantId,
    paymentIntentId,
    ledgerTransactionId ?? 'no-ledger',
  ].join(':');
}

function readStringMetadata(
  paymentIntent: CompletedStudentFeePaymentIntent,
  key: string,
): string | null {
  return readString(paymentIntent.metadata?.[key]);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown): string | null {
  const stringValue = readString(value);

  return stringValue && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stringValue)
    ? stringValue
    : null;
}
