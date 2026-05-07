export class InvoiceResponseDto {
  id!: string;
  tenant_id!: string;
  subscription_id!: string;
  invoice_number!: string;
  status!: string;
  currency_code!: string;
  description!: string;
  subtotal_amount_minor!: string;
  tax_amount_minor!: string;
  total_amount_minor!: string;
  amount_paid_minor!: string;
  billing_phone_number!: string | null;
  payment_intent_id!: string | null;
  issued_at!: string;
  due_at!: string;
  paid_at!: string | null;
  voided_at!: string | null;
  metadata!: Record<string, unknown>;
  created_at!: string;
  updated_at!: string;
}
