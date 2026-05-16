export type ManualFeePaymentMethod =
  | 'cash'
  | 'cheque'
  | 'bank_deposit'
  | 'eft'
  | 'mpesa_c2b';

export type ManualFeePaymentStatus =
  | 'received'
  | 'deposited'
  | 'cleared'
  | 'bounced'
  | 'reversed';

export type ManualFeePaymentAllocationType = 'invoice' | 'credit';

export class ManualFeePaymentEntity {
  id!: string;
  tenant_id!: string;
  idempotency_key!: string;
  receipt_number!: string;
  payment_method!: ManualFeePaymentMethod;
  status!: ManualFeePaymentStatus;
  student_id!: string | null;
  invoice_id!: string | null;
  amount_minor!: string;
  currency_code!: string;
  payer_name!: string | null;
  received_at!: Date;
  deposited_at!: Date | null;
  cleared_at!: Date | null;
  bounced_at!: Date | null;
  reversed_at!: Date | null;
  cheque_number!: string | null;
  drawer_bank!: string | null;
  deposit_reference!: string | null;
  external_reference!: string | null;
  asset_account_code!: string;
  fee_control_account_code!: string;
  ledger_transaction_id!: string | null;
  reversal_ledger_transaction_id!: string | null;
  notes!: string | null;
  metadata!: Record<string, unknown>;
  created_by_user_id!: string | null;
  created_at!: Date;
  updated_at!: Date;
}

export interface ManualFeePaymentAllocationEntity {
  id: string;
  tenant_id: string;
  manual_payment_id: string;
  invoice_id: string | null;
  student_id: string | null;
  allocation_type: ManualFeePaymentAllocationType;
  amount_minor: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}
