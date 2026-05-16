export class StudentFeeBalanceResponseDto {
  tenant_id!: string;
  student_id!: string;
  student_name!: string | null;
  currency_code!: string;
  invoiced_amount_minor!: string;
  paid_amount_minor!: string;
  credit_amount_minor!: string;
  balance_amount_minor!: string;
  invoice_count!: number;
  last_activity_at!: string | null;
}
