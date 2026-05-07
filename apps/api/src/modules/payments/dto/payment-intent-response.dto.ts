import { PaymentIntentStatus } from '../payments.types';

export class PaymentIntentResponseDto {
  payment_intent_id!: string;
  tenant_id!: string;
  student_id!: string | null;
  status!: PaymentIntentStatus;
  amount_minor!: string;
  currency_code!: string;
  phone_number!: string;
  account_reference!: string;
  external_reference!: string | null;
  merchant_request_id!: string | null;
  checkout_request_id!: string | null;
  response_code!: string | null;
  response_description!: string | null;
  customer_message!: string | null;
  created_at!: string;
  updated_at!: string;
}
