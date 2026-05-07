import { BaseEntity } from '../../../database/entities/base.entity';
import { MpesaTransactionStatus } from '../payments.types';

export class MpesaTransactionEntity extends BaseEntity {
  payment_intent_id!: string;
  callback_log_id!: string;
  checkout_request_id!: string;
  merchant_request_id!: string;
  result_code!: number;
  result_desc!: string;
  status!: MpesaTransactionStatus;
  mpesa_receipt_number!: string | null;
  amount_minor!: string | null;
  phone_number!: string | null;
  raw_payload!: Record<string, unknown> | null;
  transaction_occurred_at!: Date | null;
  ledger_transaction_id!: string | null;
  processed_at!: Date | null;
  metadata!: Record<string, unknown>;
}
