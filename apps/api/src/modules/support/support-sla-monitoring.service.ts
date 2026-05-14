import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestContextService } from '../../common/request-context/request-context.service';
import {
  SupportRepository,
  SupportSlaBreachCandidateRecord,
} from './repositories/support.repository';
import { SupportNotificationDeliveryService } from './support-notification-delivery.service';

@Injectable()
export class SupportSlaMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportSlaMonitoringService.name);
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private monitorTickInProgress = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly supportRepository: SupportRepository,
    @Optional() private readonly requestContext?: RequestContextService,
    @Optional() private readonly notificationDelivery?: SupportNotificationDeliveryService,
  ) {}

  onModuleInit(): void {
    if (!this.isMonitorEnabled()) {
      this.logger.log('Support SLA breach monitor is disabled for this runtime');
      return;
    }

    const intervalMs = this.getMonitorIntervalMs();
    this.monitorTimer = setInterval(() => {
      void this.runMonitorTick();
    }, intervalMs);
    this.monitorTimer.unref?.();
    this.logger.log(`Support SLA breach monitor running every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  async processDueSlaBreaches(limit = this.getBatchSize()): Promise<number> {
    const execute = async () => {
      const candidates = await this.supportRepository.listSlaBreachCandidates({ limit });

      for (const candidate of candidates) {
        await this.recordSlaBreach(candidate);
      }

      return candidates.length;
    };

    if (!this.requestContext || this.requestContext.getStore()) {
      return execute();
    }

    return this.requestContext.run(
      {
        request_id: `support-sla-breach-monitor:${Date.now()}`,
        tenant_id: null,
        user_id: 'system',
        role: 'system',
        session_id: null,
        permissions: ['support:manage'],
        is_authenticated: false,
        client_ip: null,
        user_agent: 'system:support-sla-breach-monitor',
        method: 'BACKGROUND',
        path: '/internal/support/sla-breach-monitor',
        started_at: new Date().toISOString(),
      },
      execute,
    );
  }

  private async runMonitorTick(): Promise<void> {
    if (this.monitorTickInProgress) {
      return;
    }

    this.monitorTickInProgress = true;

    try {
      const processed = await this.processDueSlaBreaches();

      if (processed > 0) {
        this.logger.warn(`Recorded ${processed} support SLA breach events`);
      }
    } catch (error) {
      this.logger.error(
        `Support SLA breach monitor failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.monitorTickInProgress = false;
    }
  }

  private async recordSlaBreach(candidate: SupportSlaBreachCandidateRecord): Promise<void> {
    const label = candidate.sla_breach_type === 'first_response'
      ? 'first response'
      : 'resolution';

    await this.supportRepository.createStatusLog({
      tenant_id: candidate.tenant_id,
      ticket_id: candidate.id,
      actor_user_id: null,
      from_status: candidate.status,
      to_status: candidate.status,
      action: 'ticket.sla_breached',
      metadata: {
        breach_type: candidate.sla_breach_type,
        due_at: candidate.sla_due_at,
        ticket_number: candidate.ticket_number,
        priority: candidate.priority,
      },
    });

    const notifications = await this.supportRepository.createNotifications([
      {
        tenant_id: candidate.tenant_id,
        ticket_id: candidate.id,
        recipient_type: 'support',
        channel: 'in_app',
        title: `Support SLA breached: ${candidate.ticket_number}`,
        body: `${candidate.school_name ?? candidate.tenant_id} missed the ${label} SLA for "${candidate.subject}".`,
        metadata: {
          ticket_number: candidate.ticket_number,
          breach_type: candidate.sla_breach_type,
          due_at: candidate.sla_due_at,
          priority: candidate.priority,
        },
      },
      {
        tenant_id: candidate.tenant_id,
        ticket_id: candidate.id,
        recipient_type: 'support',
        channel: 'email',
        title: `Support SLA breached: ${candidate.ticket_number}`,
        body: `${candidate.school_name ?? candidate.tenant_id} missed the ${label} SLA for "${candidate.subject}".`,
        metadata: {
          ticket_number: candidate.ticket_number,
          breach_type: candidate.sla_breach_type,
          due_at: candidate.sla_due_at,
          priority: candidate.priority,
        },
      },
    ]);

    if (this.notificationDelivery) {
      await this.notificationDelivery.deliverCreatedNotifications(notifications);
    }
  }

  private isMonitorEnabled(): boolean {
    return this.configService.get<boolean>('support.slaBreachMonitorEnabled') ?? false;
  }

  private getMonitorIntervalMs(): number {
    return this.getPositiveInteger('support.slaBreachMonitorIntervalMs', 60000, 1000, 900000);
  }

  private getBatchSize(): number {
    return this.getPositiveInteger('support.slaBreachBatchSize', 50, 1, 500);
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
}
