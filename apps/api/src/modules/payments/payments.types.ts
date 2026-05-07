export type PaymentIntentStatus =
  | 'pending'
  | 'stk_requested'
  | 'callback_received'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type MpesaTransactionStatus = 'succeeded' | 'failed';
export type CallbackLogStatus =
  | 'received'
  | 'queued'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'rejected'
  | 'replayed';

export interface PaymentIntentResponse {
  payment_intent_id: string;
  tenant_id: string;
  student_id: string | null;
  status: PaymentIntentStatus;
  amount_minor: string;
  currency_code: string;
  phone_number: string;
  account_reference: string;
  external_reference: string | null;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  response_code: string | null;
  response_description: string | null;
  customer_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentIntentIdempotencyRequest {
  tenant_id: string;
  user_id: string | null;
  scope: string;
  idempotency_key: string;
  request_hash: string;
  request_method: string;
  request_path: string;
  ttl_seconds: number;
}

export interface PaymentIntentIdempotencyRecord {
  id: string;
  tenant_id: string;
  user_id: string | null;
  scope: string;
  idempotency_key: string;
  request_method: string;
  request_path: string;
  request_hash: string;
  status: 'in_progress' | 'completed' | 'failed' | 'expired';
  response_status_code: number | null;
  response_body: PaymentIntentResponse | null;
  locked_at: string | null;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface StkPushRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: string;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface MpesaCallbackMetadataItem {
  Name: string;
  Value?: string | number | null;
}

export interface MpesaCallbackPayload {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: MpesaCallbackMetadataItem[];
      };
    };
  };
}

export interface ParsedMpesaCallback {
  merchant_request_id: string;
  checkout_request_id: string;
  result_code: number;
  result_desc: string;
  status: MpesaTransactionStatus;
  amount_minor: string | null;
  mpesa_receipt_number: string | null;
  transaction_occurred_at: string | null;
  phone_number: string | null;
  metadata: Record<string, unknown>;
}

export interface CallbackVerificationResult {
  delivery_id: string;
  request_fingerprint: string;
  signature: string | null;
  event_timestamp: string | null;
}

export interface ProcessMpesaCallbackJobPayload {
  callback_log_id: string;
  tenant_id: string;
  request_id: string;
  trace_id?: string;
  parent_span_id?: string | null;
  user_id?: string;
  role?: string | null;
  session_id?: string | null;
  enqueued_at?: string;
}

export type MpesaReconciliationDiscrepancyType =
  | 'missing_callback'
  | 'missing_ledger_transaction'
  | 'amount_mismatch'
  | 'duplicate_mpesa_receipt'
  | 'unmatched_ledger_transaction';

export interface GenerateMpesaReconciliationReportInput {
  report_date: string;
  missing_callback_grace_minutes?: number;
}

export interface MpesaReconciliationSummary {
  successful_mpesa_transaction_count: number;
  successful_mpesa_amount_minor: string;
  linked_ledger_transaction_count: number;
  linked_ledger_amount_minor: string;
  matched_transaction_count: number;
  matched_amount_minor: string;
  missing_callback_count: number;
  missing_ledger_transaction_count: number;
  amount_mismatch_count: number;
  duplicate_receipt_group_count: number;
  unmatched_ledger_transaction_count: number;
  discrepancy_count: number;
}

export interface MpesaReconciliationDiscrepancy {
  type: MpesaReconciliationDiscrepancyType;
  severity: 'warning' | 'critical';
  detail: string;
  occurred_at: string;
  payment_intent_id: string | null;
  mpesa_transaction_id: string | null;
  ledger_transaction_id: string | null;
  checkout_request_id: string | null;
  mpesa_receipt_number: string | null;
  expected_amount_minor: string | null;
  actual_amount_minor: string | null;
  metadata: Record<string, unknown>;
}

export interface MpesaReconciliationReport {
  tenant_id: string;
  report_date: string;
  generated_at: string;
  window_started_at: string;
  window_ended_at: string;
  is_balanced: boolean;
  summary: MpesaReconciliationSummary;
  discrepancies: MpesaReconciliationDiscrepancy[];
}
