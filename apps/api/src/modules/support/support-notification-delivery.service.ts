import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEmailService } from '../../auth/auth-email.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { SupportRepository } from './repositories/support.repository';

export interface SupportNotificationDeliveryRecord {
  id: string;
  tenant_id: string;
  ticket_id: string | null;
  recipient_user_id: string | null;
  recipient_type: 'school' | 'support';
  channel: 'in_app' | 'email' | 'sms';
  title: string;
  body: string;
  delivery_status: string;
  delivery_attempts?: number;
  last_delivery_error?: string | null;
  next_delivery_attempt_at?: string | null;
  delivered_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type SupportNotificationReadinessState = 'configured' | 'partial' | 'missing';

export type SupportNotificationProviderStatus = {
  status: SupportNotificationReadinessState;
  email: {
    status: 'configured' | 'missing';
    provider: string;
    transactional_email: 'configured' | 'missing';
    recipients_configured: boolean;
    recipient_count: number;
  };
  sms: {
    status: SupportNotificationReadinessState;
    webhook_url_configured: boolean;
    webhook_token_configured: boolean;
    recipients_configured: boolean;
    recipient_count: number;
  };
  retry: {
    worker_enabled: boolean;
    interval_ms: number;
    batch_size: number;
    lease_ms: number;
    max_attempts: number;
  };
};

@Injectable()
export class SupportNotificationDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportNotificationDeliveryService.name);
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private retryTickInProgress = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: AuthEmailService,
    private readonly supportRepository: SupportRepository,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  onModuleInit(): void {
    if (!this.isRetryWorkerEnabled()) {
      this.logger.log('Support notification retry worker is disabled for this runtime');
      return;
    }

    const intervalMs = this.getRetryIntervalMs();
    this.retryTimer = setInterval(() => {
      void this.runRetryTick();
    }, intervalMs);
    this.retryTimer.unref?.();
    this.logger.log(`Support notification retry worker running every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async deliverCreatedNotifications(
    notifications: SupportNotificationDeliveryRecord[],
  ): Promise<void> {
    for (const notification of notifications) {
      if (
        (notification.channel !== 'email' && notification.channel !== 'sms')
        || notification.delivery_status !== 'queued'
      ) {
        continue;
      }

      if (!this.isDueForDelivery(notification)) {
        continue;
      }

      if (notification.channel === 'email') {
        await this.deliverEmailNotification(notification);
      } else {
        await this.deliverSmsNotification(notification);
      }
    }
  }

  getProviderStatus(): SupportNotificationProviderStatus {
    const transactionalEmail = this.emailService.getTransactionalEmailStatus();
    const emailRecipients = this.getConfiguredSupportRecipients();
    const smsRecipients = this.getConfiguredSupportSmsRecipients();
    const smsWebhookUrlConfigured = this.getSmsWebhookUrl().length > 0;
    const smsWebhookTokenConfigured = this.getSmsWebhookToken().length > 0;
    const emailConfigured = transactionalEmail.status === 'configured' && emailRecipients.length > 0;
    const smsConfigured =
      smsWebhookUrlConfigured
      && smsWebhookTokenConfigured
      && smsRecipients.length > 0;
    const smsPartiallyConfigured =
      smsWebhookUrlConfigured
      || smsWebhookTokenConfigured
      || smsRecipients.length > 0;

    return {
      status: this.resolveProviderStatus(emailConfigured, smsConfigured, smsPartiallyConfigured),
      email: {
        status: emailConfigured ? 'configured' : 'missing',
        provider: transactionalEmail.provider,
        transactional_email: transactionalEmail.status,
        recipients_configured: emailRecipients.length > 0,
        recipient_count: emailRecipients.length,
      },
      sms: {
        status: smsConfigured ? 'configured' : smsPartiallyConfigured ? 'partial' : 'missing',
        webhook_url_configured: smsWebhookUrlConfigured,
        webhook_token_configured: smsWebhookTokenConfigured,
        recipients_configured: smsRecipients.length > 0,
        recipient_count: smsRecipients.length,
      },
      retry: {
        worker_enabled: this.isRetryWorkerEnabled(),
        interval_ms: this.getRetryIntervalMs(),
        batch_size: this.getRetryBatchSize(),
        lease_ms: this.getRetryLeaseMs(),
        max_attempts: this.getMaxAttempts(),
      },
    };
  }

  async processDueQueuedEmailNotifications(limit = this.getRetryBatchSize()): Promise<number> {
    const leaseMs = this.getRetryLeaseMs();
    const execute = async () => {
      const notifications = await this.supportRepository.claimDueQueuedNotifications(
        limit,
        leaseMs,
        ['email', 'sms'],
      );
      await this.deliverCreatedNotifications(notifications);
      return notifications.length;
    };

    if (!this.requestContext || this.requestContext.getStore()) {
      return execute();
    }

    return this.requestContext.run(
      {
        request_id: `support-notification-retry:${Date.now()}`,
        tenant_id: null,
        user_id: 'system',
        role: 'system',
        session_id: null,
        permissions: ['support:manage'],
        is_authenticated: false,
        client_ip: null,
        user_agent: 'system:support-notification-retry',
        method: 'BACKGROUND',
        path: '/internal/support/notification-retry',
        started_at: new Date().toISOString(),
      },
      execute,
    );
  }

  private async runRetryTick(): Promise<void> {
    if (this.retryTickInProgress) {
      return;
    }

    this.retryTickInProgress = true;

    try {
      const processed = await this.processDueQueuedEmailNotifications();

      if (processed > 0) {
        this.logger.log(`Processed ${processed} queued support provider notifications`);
      }
    } catch (error) {
      this.logger.error(
        `Support notification retry worker failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.retryTickInProgress = false;
    }
  }

  private async deliverEmailNotification(
    notification: SupportNotificationDeliveryRecord,
  ): Promise<void> {
    try {
      const recipients = await this.resolveRecipients(notification);

      if (recipients.length === 0) {
        await this.markTerminalFailure(notification, 'No email recipients resolved');
        return;
      }

      for (const recipient of recipients) {
        await this.emailService.sendSupportNotificationEmail({
          to: recipient,
          title: notification.title,
          body: notification.body,
        });
      }

      await this.supportRepository.markNotificationDelivery(notification.id, 'sent', {
        deliveryAttempts: this.nextAttemptCount(notification),
        deliveredAt: new Date().toISOString(),
        lastError: null,
        nextAttemptAt: null,
      });
    } catch (error) {
      await this.markRetryableFailure(notification, error);
      this.logger.error(
        `Support notification ${notification.id} email delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async deliverSmsNotification(
    notification: SupportNotificationDeliveryRecord,
  ): Promise<void> {
    try {
      const recipients = this.resolveSmsRecipients(notification);

      if (recipients.length === 0) {
        await this.markTerminalFailure(notification, 'No SMS recipients resolved');
        return;
      }

      const webhookUrl = this.getSmsWebhookUrl();

      if (!webhookUrl) {
        await this.markTerminalFailure(notification, 'Support SMS webhook URL is not configured');
        return;
      }

      for (const recipient of recipients) {
        await this.sendSmsWebhook(webhookUrl, recipient, notification);
      }

      await this.supportRepository.markNotificationDelivery(notification.id, 'sent', {
        deliveryAttempts: this.nextAttemptCount(notification),
        deliveredAt: new Date().toISOString(),
        lastError: null,
        nextAttemptAt: null,
      });
    } catch (error) {
      await this.markRetryableFailure(notification, error);
      this.logger.error(
        `Support notification ${notification.id} SMS delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async sendSmsWebhook(
    webhookUrl: string,
    recipient: string,
    notification: SupportNotificationDeliveryRecord,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getSmsWebhookToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: recipient,
        title: notification.title,
        message: notification.body,
        tenant_id: notification.tenant_id,
        ticket_id: notification.ticket_id,
        notification_id: notification.id,
        metadata: notification.metadata ?? {},
      }),
    });

    if (!response.ok) {
      throw new Error(`SMS provider returned ${response.status}`);
    }
  }

  private isDueForDelivery(notification: SupportNotificationDeliveryRecord): boolean {
    if (!notification.next_delivery_attempt_at) {
      return true;
    }

    const nextAttemptAt = Date.parse(notification.next_delivery_attempt_at);

    return Number.isNaN(nextAttemptAt) || nextAttemptAt <= Date.now();
  }

  private async markRetryableFailure(
    notification: SupportNotificationDeliveryRecord,
    error: unknown,
  ): Promise<void> {
    const deliveryAttempts = this.nextAttemptCount(notification);
    const lastError = error instanceof Error ? error.message : String(error);
    const maxAttempts = this.getMaxAttempts();
    const exhausted = deliveryAttempts >= maxAttempts;

    await this.supportRepository.markNotificationDelivery(
      notification.id,
      exhausted ? 'failed' : 'queued',
      {
        deliveryAttempts,
        lastError,
        nextAttemptAt: exhausted ? null : this.nextRetryAt(deliveryAttempts),
      },
    );

    if (exhausted) {
      await this.createDeliveryFailureAlert(notification, deliveryAttempts, lastError);
    }
  }

  private async markTerminalFailure(
    notification: SupportNotificationDeliveryRecord,
    lastError: string,
  ): Promise<void> {
    const deliveryAttempts = this.nextAttemptCount(notification);

    await this.supportRepository.markNotificationDelivery(notification.id, 'failed', {
      deliveryAttempts,
      lastError,
      nextAttemptAt: null,
    });
    await this.createDeliveryFailureAlert(notification, deliveryAttempts, lastError);
  }

  private async createDeliveryFailureAlert(
    notification: SupportNotificationDeliveryRecord,
    deliveryAttempts: number,
    lastError: string,
  ): Promise<void> {
    await this.supportRepository.createNotifications([
      {
        tenant_id: notification.tenant_id,
        ticket_id: notification.ticket_id,
        recipient_type: 'support',
        channel: 'in_app',
        title: 'Support notification delivery failed',
        body: `${this.capitalizeChannel(notification.channel)} delivery failed for "${notification.title}" after ${deliveryAttempts} attempts.`,
        metadata: {
          failed_notification_id: notification.id,
          failed_channel: notification.channel,
          failed_delivery_status: 'failed',
          delivery_attempts: deliveryAttempts,
          last_delivery_error: lastError,
          ...this.extractAlertMetadata(notification.metadata),
        },
      },
    ]);
  }

  private nextAttemptCount(notification: SupportNotificationDeliveryRecord): number {
    return Number(notification.delivery_attempts ?? 0) + 1;
  }

  private getMaxAttempts(): number {
    const configured = this.configService.get<number | string>('support.notificationMaxAttempts') ?? 3;
    const parsed = Number(configured);

    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
  }

  private isRetryWorkerEnabled(): boolean {
    return this.configService.get<boolean>('support.notificationRetryWorkerEnabled') ?? false;
  }

  private getRetryBatchSize(): number {
    return this.getPositiveInteger('support.notificationRetryBatchSize', 50, 1, 500);
  }

  private getRetryIntervalMs(): number {
    return this.getPositiveInteger('support.notificationRetryIntervalMs', 60000, 1000, 900000);
  }

  private getRetryLeaseMs(): number {
    return this.getPositiveInteger('support.notificationRetryLeaseMs', 300000, 30000, 900000);
  }

  private getSmsWebhookUrl(): string {
    const value = this.configService.get<string>('support.notificationSmsWebhookUrl') ?? '';
    return value.trim();
  }

  private getSmsWebhookToken(): string {
    const value = this.configService.get<string>('support.notificationSmsWebhookToken') ?? '';
    return value.trim();
  }

  private resolveProviderStatus(
    emailConfigured: boolean,
    smsConfigured: boolean,
    smsPartiallyConfigured: boolean,
  ): SupportNotificationReadinessState {
    if (emailConfigured && smsConfigured) {
      return 'configured';
    }

    if (emailConfigured || smsPartiallyConfigured) {
      return 'partial';
    }

    return 'missing';
  }

  private getPositiveInteger(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const parsed = Number(this.configService.get<number | string>(key) ?? fallback);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
  }

  private nextRetryAt(deliveryAttempts: number): string {
    const baseDelayMs = 60_000;
    const delayMs = Math.min(baseDelayMs * 2 ** Math.max(deliveryAttempts - 1, 0), 15 * 60_000);

    return new Date(Date.now() + delayMs).toISOString();
  }

  private async resolveRecipients(
    notification: SupportNotificationDeliveryRecord,
  ): Promise<string[]> {
    const metadataRecipients = this.extractMetadataRecipients(notification.metadata);

    if (metadataRecipients.length > 0) {
      return metadataRecipients;
    }

    if (notification.recipient_type === 'support') {
      return this.getConfiguredSupportRecipients();
    }

    if (notification.recipient_user_id) {
      const email = await this.supportRepository.findUserEmailForNotification(
        notification.recipient_user_id,
      );
      return email ? [email] : [];
    }

    return [];
  }

  private getConfiguredSupportRecipients(): string[] {
    const value = this.configService.get<string[] | string>('support.notificationEmails') ?? [];
    const recipients = Array.isArray(value) ? value : value.split(',');

    return recipients
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
  }

  private getConfiguredSupportSmsRecipients(): string[] {
    const value = this.configService.get<string[] | string>('support.notificationSmsRecipients') ?? [];
    const recipients = Array.isArray(value) ? value : value.split(',');

    return recipients
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private extractMetadataRecipients(metadata: Record<string, unknown>): string[] {
    const recipientEmail = metadata.recipient_email;
    const recipientEmails = metadata.recipient_emails;
    const values: unknown[] = [];

    if (typeof recipientEmail === 'string') {
      values.push(recipientEmail);
    }

    if (Array.isArray(recipientEmails)) {
      values.push(...recipientEmails);
    }

    return values
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
  }

  private resolveSmsRecipients(notification: SupportNotificationDeliveryRecord): string[] {
    const metadataRecipients = this.extractMetadataSmsRecipients(notification.metadata);

    if (metadataRecipients.length > 0) {
      return metadataRecipients;
    }

    if (notification.recipient_type === 'support') {
      return this.getConfiguredSupportSmsRecipients();
    }

    return [];
  }

  private extractMetadataSmsRecipients(metadata: Record<string, unknown>): string[] {
    const recipientPhone = metadata.recipient_phone;
    const recipientPhones = metadata.recipient_phones;
    const values: unknown[] = [];

    if (typeof recipientPhone === 'string') {
      values.push(recipientPhone);
    }

    if (Array.isArray(recipientPhones)) {
      values.push(...recipientPhones);
    }

    return values
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private extractAlertMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const ticketNumber = metadata.ticket_number;

    return typeof ticketNumber === 'string' && ticketNumber.trim()
      ? { ticket_number: ticketNumber }
      : {};
  }

  private capitalizeChannel(channel: string): string {
    return channel.length > 0 ? `${channel[0]?.toUpperCase()}${channel.slice(1)}` : 'Notification';
  }
}
