import { BaseEntity } from '../../../database/entities/base.entity';
import { CallbackLogStatus } from '../payments.types';

export class CallbackLogEntity extends BaseEntity {
  merchant_request_id!: string | null;
  checkout_request_id!: string | null;
  delivery_id!: string;
  request_fingerprint!: string;
  event_timestamp!: Date | null;
  signature!: string | null;
  signature_verified!: boolean;
  headers!: Record<string, unknown>;
  raw_body!: string;
  raw_payload!: Record<string, unknown> | null;
  source_ip!: string | null;
  processing_status!: CallbackLogStatus;
  queue_job_id!: string | null;
  failure_reason!: string | null;
  queued_at!: Date | null;
  processed_at!: Date | null;
}
