export type FinanceActivityKind = 'invoice' | 'receipt';

export class FinanceActivityResponseDto {
  id!: string;
  tenant_id!: string;
  kind!: FinanceActivityKind;
  student_id!: string | null;
  student_name!: string | null;
  invoice_id!: string | null;
  amount_minor!: string;
  currency_code!: string;
  method!: string;
  status!: string;
  reference!: string;
  occurred_at!: string;
  ledger_transaction_id!: string | null;
  metadata!: Record<string, unknown>;
}
