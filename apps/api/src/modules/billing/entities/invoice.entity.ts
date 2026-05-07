import { BaseEntity } from '../../../database/entities/base.entity';
import { InvoiceStatus } from '../billing.types';

export class InvoiceEntity extends BaseEntity {
  subscription_id!: string;
  invoice_number!: string;
  status!: InvoiceStatus;
  currency_code!: string;
  description!: string;
  subtotal_amount_minor!: string;
  tax_amount_minor!: string;
  total_amount_minor!: string;
  amount_paid_minor!: string;
  billing_phone_number!: string | null;
  payment_intent_id!: string | null;
  issued_at!: Date;
  due_at!: Date;
  paid_at!: Date | null;
  voided_at!: Date | null;
  metadata!: Record<string, unknown>;
}
