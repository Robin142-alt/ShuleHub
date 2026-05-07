export interface EnqueuePaymentJobData {
  tenant_id: string;
  checkout_request_id: string;
  callback_log_id?: string | null;
  request_id: string;
  trace_id?: string;
  parent_span_id?: string | null;
  user_id?: string;
  role?: string | null;
  session_id?: string | null;
}

export interface ProcessPaymentJobData extends EnqueuePaymentJobData {
  enqueued_at: string;
}

export interface ProcessPaymentJobResult {
  job_id: string;
  tenant_id: string;
  checkout_request_id: string;
  callback_log_id: string | null;
  payment_intent_id: string | null;
  mpesa_transaction_id: string | null;
  ledger_transaction_id: string | null;
  status: 'completed' | 'failed' | 'duplicate';
  processed_at: string;
  failure_reason?: string | null;
}

export interface EnqueuePaymentJobResult {
  job_id: string;
  queue_name: string;
  tenant_id: string;
  checkout_request_id: string;
  deduplicated: boolean;
  state: string;
}
