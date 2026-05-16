import {
  ManualFeePaymentMethod,
  ManualFeePaymentStatus,
} from '../entities/manual-fee-payment.entity';

export class ManualFeePaymentResponseDto {
  id!: string;
  tenant_id!: string;
  receipt_number!: string;
  payment_method!: ManualFeePaymentMethod;
  status!: ManualFeePaymentStatus;
  student_id!: string | null;
  invoice_id!: string | null;
  amount_minor!: string;
  currency_code!: string;
  payer_name!: string | null;
  received_at!: string;
  deposited_at!: string | null;
  cleared_at!: string | null;
  bounced_at!: string | null;
  reversed_at!: string | null;
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
  created_at!: string;
  updated_at!: string;
}
