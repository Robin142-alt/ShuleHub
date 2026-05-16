import {
  ManualFeePaymentMethod,
  ManualFeePaymentStatus,
} from '../entities/manual-fee-payment.entity';

export type FinanceReconciliationBucket = 'cleared' | 'pending' | 'exception';

export class FinanceReconciliationPeriodDto {
  from!: string;
  to!: string;
  payment_method!: ManualFeePaymentMethod | null;
}

export class FinanceReconciliationTotalsDto {
  transaction_count!: number;
  total_amount_minor!: string;
  cleared_count!: number;
  cleared_amount_minor!: string;
  pending_count!: number;
  pending_amount_minor!: string;
  exception_count!: number;
  exception_amount_minor!: string;
}

export class FinanceReconciliationMethodSummaryDto {
  payment_method!: ManualFeePaymentMethod;
  transaction_count!: number;
  total_amount_minor!: string;
  cleared_amount_minor!: string;
  pending_amount_minor!: string;
  exception_amount_minor!: string;
}

export class FinanceReconciliationRowDto {
  payment_id!: string;
  receipt_number!: string;
  payment_method!: ManualFeePaymentMethod;
  status!: ManualFeePaymentStatus;
  reconciliation_bucket!: FinanceReconciliationBucket;
  amount_minor!: string;
  currency_code!: string;
  occurred_at!: string;
  reference!: string;
  payer_name!: string | null;
  student_id!: string | null;
  invoice_id!: string | null;
  ledger_transaction_id!: string | null;
  reversal_ledger_transaction_id!: string | null;
}

export class FinanceReconciliationResponseDto {
  period!: FinanceReconciliationPeriodDto;
  totals!: FinanceReconciliationTotalsDto;
  method_summaries!: FinanceReconciliationMethodSummaryDto[];
  rows!: FinanceReconciliationRowDto[];
}
