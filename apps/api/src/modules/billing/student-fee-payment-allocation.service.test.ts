import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { StudentFeePaymentAllocationService } from './student-fee-payment-allocation.service';

const paymentIntent = {
  id: 'payment-intent-1',
  tenant_id: 'tenant-a',
  student_id: 'student-1',
  user_id: 'parent-1',
  external_reference: 'invoice-1',
  account_reference: 'INV-001',
  amount_minor: '12000',
  ledger_transaction_id: 'ledger-1',
  metadata: { parent_user_id: 'parent-1' },
};

test('StudentFeePaymentAllocationService applies confirmed payments to the correct student invoice', async () => {
  const calls: string[] = [];
  const service = new StudentFeePaymentAllocationService({
    findStudentFeePaymentAllocationByIdempotencyKey: async () => null,
    findStudentFeeInvoicesForAllocation: async () => [
      {
        id: 'invoice-1',
        tenant_id: 'tenant-a',
        status: 'open',
        total_amount_minor: '15000',
        amount_paid_minor: '3000',
        metadata: { student_id: 'student-1' },
      },
    ],
    applyStudentFeeInvoicePayment: async (input: Record<string, unknown>) => {
      calls.push(`invoice:${input.amountMinor}:${input.nextStatus}`);
      return { id: input.invoiceId, amount_paid_minor: String(input.nextAmountPaidMinor) };
    },
    createStudentFeePaymentAllocation: async (input: Record<string, unknown>) => {
      calls.push(`allocation:${input.amountMinor}`);
      return { id: 'allocation-1', ...input };
    },
    createStudentFeeCredit: async () => {
      throw new Error('no credit should be created for exact remaining balance');
    },
  } as never);

  const result = await service.allocateConfirmedPayment({
    tenantId: 'tenant-a',
    paymentIntent,
    amountPaidMinor: '12000',
    ledgerTransactionId: 'ledger-1',
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.allocated_amount_minor, '12000');
  assert.equal(result.credit_amount_minor, '0');
  assert.deepEqual(calls, ['invoice:12000:paid', 'allocation:12000']);
});

test('StudentFeePaymentAllocationService keeps partial invoices pending and stores overpayment as credit', async () => {
  const calls: string[] = [];
  const service = new StudentFeePaymentAllocationService({
    findStudentFeePaymentAllocationByIdempotencyKey: async () => null,
    findStudentFeeInvoicesForAllocation: async () => [
      {
        id: 'invoice-1',
        tenant_id: 'tenant-a',
        status: 'open',
        total_amount_minor: '10000',
        amount_paid_minor: '2000',
        metadata: { student_id: 'student-1' },
      },
      {
        id: 'invoice-2',
        tenant_id: 'tenant-a',
        status: 'open',
        total_amount_minor: '5000',
        amount_paid_minor: '0',
        metadata: { student_id: 'student-1' },
      },
    ],
    applyStudentFeeInvoicePayment: async (input: Record<string, unknown>) => {
      calls.push(`invoice:${input.invoiceId}:${input.amountMinor}:${input.nextStatus}`);
      return { id: input.invoiceId };
    },
    createStudentFeePaymentAllocation: async (input: Record<string, unknown>) => {
      calls.push(`allocation:${input.invoiceId}:${input.amountMinor}`);
      return { id: `allocation-${input.invoiceId}`, ...input };
    },
    createStudentFeeCredit: async (input: Record<string, unknown>) => {
      calls.push(`credit:${input.amountMinor}`);
      return { id: 'credit-1', ...input };
    },
  } as never);

  const partial = await service.allocateConfirmedPayment({
    tenantId: 'tenant-a',
    paymentIntent: { ...paymentIntent, id: 'payment-partial', amount_minor: '4000' },
    amountPaidMinor: '4000',
    ledgerTransactionId: 'ledger-partial',
  });

  assert.equal(partial.allocated_amount_minor, '4000');
  assert.equal(partial.credit_amount_minor, '0');
  assert.deepEqual(calls.splice(0), ['invoice:invoice-1:4000:pending_payment', 'allocation:invoice-1:4000']);

  const overpaid = await service.allocateConfirmedPayment({
    tenantId: 'tenant-a',
    paymentIntent: { ...paymentIntent, id: 'payment-overpay', amount_minor: '20000' },
    amountPaidMinor: '20000',
    ledgerTransactionId: 'ledger-overpay',
  });

  assert.equal(overpaid.allocated_amount_minor, '13000');
  assert.equal(overpaid.credit_amount_minor, '7000');
  assert.deepEqual(calls, [
    'invoice:invoice-1:8000:paid',
    'allocation:invoice-1:8000',
    'invoice:invoice-2:5000:paid',
    'allocation:invoice-2:5000',
    'credit:7000',
  ]);
});

test('StudentFeePaymentAllocationService ignores duplicate callbacks by idempotency key', async () => {
  const service = new StudentFeePaymentAllocationService({
    findStudentFeePaymentAllocationByIdempotencyKey: async () => ({ id: 'allocation-existing' }),
    findStudentFeeInvoicesForAllocation: async () => {
      throw new Error('duplicate callback must not load invoices again');
    },
  } as never);

  const result = await service.allocateConfirmedPayment({
    tenantId: 'tenant-a',
    paymentIntent,
    amountPaidMinor: '12000',
    ledgerTransactionId: 'ledger-1',
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.allocated_amount_minor, '0');
});

test('StudentFeePaymentAllocationService rejects cross-tenant and studentless allocation attempts', async () => {
  const service = new StudentFeePaymentAllocationService({} as never);

  await assert.rejects(
    () =>
      service.allocateConfirmedPayment({
        tenantId: 'tenant-b',
        paymentIntent,
        amountPaidMinor: '12000',
      }),
    BadRequestException,
  );

  await assert.rejects(
    () =>
      service.allocateConfirmedPayment({
        tenantId: 'tenant-a',
        paymentIntent: { ...paymentIntent, student_id: null },
        amountPaidMinor: '12000',
      }),
    /student_id/,
  );
});
