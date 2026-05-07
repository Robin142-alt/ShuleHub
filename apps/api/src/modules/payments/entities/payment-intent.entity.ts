import { BaseEntity } from '../../../database/entities/base.entity';
import { PaymentIntentStatus } from '../payments.types';

export class PaymentIntentEntity extends BaseEntity {
  idempotency_key_id!: string;
  user_id!: string | null;
  student_id!: string | null;
  request_id!: string | null;
  external_reference!: string | null;
  account_reference!: string;
  transaction_desc!: string;
  phone_number!: string;
  amount_minor!: string;
  currency_code!: string;
  status!: PaymentIntentStatus;
  merchant_request_id!: string | null;
  checkout_request_id!: string | null;
  response_code!: string | null;
  response_description!: string | null;
  customer_message!: string | null;
  ledger_transaction_id!: string | null;
  failure_reason!: string | null;
  stk_requested_at!: Date | null;
  callback_received_at!: Date | null;
  completed_at!: Date | null;
  expires_at!: Date | null;
  metadata!: Record<string, unknown>;
}
