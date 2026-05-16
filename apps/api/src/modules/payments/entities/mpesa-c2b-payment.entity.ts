export type MpesaC2bPaymentStatus = 'pending_review' | 'matched' | 'rejected';

export class MpesaC2bPaymentEntity {
  id!: string;
  tenant_id!: string;
  mpesa_config_id!: string | null;
  payment_channel_id!: string | null;
  trans_id!: string;
  transaction_type!: string;
  business_short_code!: string;
  bill_ref_number!: string | null;
  invoice_number!: string | null;
  amount_minor!: string;
  currency_code!: string;
  phone_number!: string | null;
  payer_name!: string | null;
  org_account_balance!: string | null;
  third_party_trans_id!: string | null;
  status!: MpesaC2bPaymentStatus;
  matched_invoice_id!: string | null;
  matched_student_id!: string | null;
  manual_fee_payment_id!: string | null;
  ledger_transaction_id!: string | null;
  received_at!: Date;
  matched_at!: Date | null;
  raw_payload!: Record<string, unknown>;
  metadata!: Record<string, unknown>;
  created_at!: Date;
  updated_at!: Date;
}
