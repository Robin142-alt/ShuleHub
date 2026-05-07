import { BaseEntity } from '../../../database/entities/base.entity';
import {
  BillingNotificationChannel,
  BillingNotificationStatus,
  SubscriptionLifecycleState,
} from '../billing.types';

export class BillingNotificationEntity extends BaseEntity {
  subscription_id!: string;
  notification_key!: string;
  channel!: BillingNotificationChannel;
  audience!: string;
  lifecycle_state!: SubscriptionLifecycleState;
  status!: BillingNotificationStatus;
  title!: string;
  body!: string;
  scheduled_for!: Date;
  delivered_at!: Date | null;
  metadata!: Record<string, unknown>;
}
