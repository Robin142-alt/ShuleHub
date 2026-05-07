export class BillingNotificationResponseDto {
  id!: string;
  tenant_id!: string;
  subscription_id!: string;
  notification_key!: string;
  channel!: 'admin' | 'sms' | 'email';
  audience!: string;
  lifecycle_state!: string;
  status!: 'queued' | 'sent' | 'failed' | 'dismissed';
  title!: string;
  body!: string;
  scheduled_for!: string;
  delivered_at!: string | null;
  metadata!: Record<string, unknown>;
  created_at!: string;
  updated_at!: string;
}
