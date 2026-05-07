export type SupportedDomainEventName = 'student.created' | 'payment.completed';
export type OutboxEventStatus =
  | 'pending'
  | 'processing'
  | 'published'
  | 'failed'
  | 'discarded';
export type EventConsumerRunStatus = 'processing' | 'completed' | 'failed';

export interface StudentCreatedPayload {
  tenant_id: string;
  student_id: string;
  created_at: string;
  created_by_user_id: string | null;
  admission_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PaymentCompletedPayload {
  tenant_id: string;
  payment_intent_id: string;
  mpesa_transaction_id: string;
  checkout_request_id: string;
  merchant_request_id: string;
  ledger_transaction_id: string;
  amount_minor: string;
  currency_code: string;
  account_reference: string;
  external_reference: string | null;
  mpesa_receipt_number: string | null;
  phone_number: string | null;
  completed_at: string;
}

export interface DomainEventPayloadMap {
  'student.created': StudentCreatedPayload;
  'payment.completed': PaymentCompletedPayload;
}

export interface DomainEvent<
  TName extends SupportedDomainEventName = SupportedDomainEventName,
> {
  id: string;
  tenant_id: string;
  event_key: string;
  event_name: TName;
  aggregate_type: string;
  aggregate_id: string;
  payload: DomainEventPayloadMap[TName];
  headers: Record<string, unknown>;
  status: OutboxEventStatus;
  attempt_count: number;
  available_at: string;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimedOutboxEvent {
  id: string;
  tenant_id: string;
  request_id: string;
  trace_id: string;
  span_id: string | null;
  user_id: string;
  role: string | null;
  session_id: string | null;
}

export interface PublishDomainEventInput<
  TName extends SupportedDomainEventName = SupportedDomainEventName,
> {
  tenant_id: string;
  event_key: string;
  event_name: TName;
  aggregate_type: string;
  aggregate_id: string;
  payload: DomainEventPayloadMap[TName];
  headers?: Record<string, unknown>;
  available_at?: string;
}

export interface EventConsumerDescriptor<
  TName extends SupportedDomainEventName = SupportedDomainEventName,
> {
  readonly name: string;
  readonly event_name: TName;
  handle(event: DomainEvent<TName>): Promise<void>;
}

export interface EventConsumerRunRecord {
  id: string;
  tenant_id: string;
  outbox_event_id: string;
  event_key: string;
  consumer_name: string;
  status: EventConsumerRunStatus;
  attempt_count: number;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DispatchOutboxEventJobPayload {
  outbox_event_id: string;
  tenant_id: string;
  request_id: string;
  trace_id?: string;
  parent_span_id?: string | null;
  user_id?: string;
  role?: string | null;
  session_id?: string | null;
  enqueued_at?: string;
}
