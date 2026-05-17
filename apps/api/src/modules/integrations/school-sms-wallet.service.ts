import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { PiiEncryptionService } from '../security/pii-encryption.service';
import {
  CreateSmsPurchaseRequestDto,
  SendSmsDto,
} from './dto/integrations.dto';
import { PlatformSmsService } from './platform-sms.service';
import { SchoolSmsWalletRepository } from './school-sms-wallet.repository';
import { SmsDispatchService } from './sms-dispatch.service';

@Injectable()
export class SchoolSmsWalletService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly schoolSmsWalletRepository: SchoolSmsWalletRepository,
    @Optional() private readonly piiEncryptionService?: PiiEncryptionService,
    @Optional() private readonly platformSmsService?: PlatformSmsService,
    @Optional() private readonly smsDispatchService?: SmsDispatchService,
  ) {}

  async getWallet(): Promise<Record<string, unknown>> {
    const wallet = await this.schoolSmsWalletRepository.getOrCreateWallet(this.requireTenantId());

    return {
      tenant_id: wallet.tenant_id,
      sms_balance: wallet.sms_balance,
      monthly_used: wallet.monthly_used,
      monthly_limit: wallet.monthly_limit,
      sms_plan: wallet.sms_plan,
      low_balance_threshold: wallet.low_balance_threshold,
      allow_negative_balance: wallet.allow_negative_balance,
      billing_status: wallet.billing_status,
      low_balance: wallet.sms_balance <= wallet.low_balance_threshold,
      updated_at: wallet.updated_at,
    };
  }

  async listLogs(limit?: number): Promise<Array<Record<string, unknown>>> {
    return this.schoolSmsWalletRepository.listLogs(this.requireTenantId(), limit);
  }

  async createPurchaseRequest(dto: CreateSmsPurchaseRequestDto): Promise<Record<string, unknown>> {
    return this.schoolSmsWalletRepository.createPurchaseRequest({
      tenant_id: this.requireTenantId(),
      quantity: dto.quantity,
      note: dto.note?.trim() || null,
      requested_by_user_id: this.getActorUserId(),
    });
  }

  async sendSms(dto: SendSmsDto): Promise<Record<string, unknown>> {
    const tenantId = this.requireTenantId();
    const recipient = dto.recipient.trim();
    const message = dto.message.trim();
    const creditCost = this.calculateCreditCost(message);
    const dispatchReadiness = await this.smsDispatchService?.getReadiness();

    if (dispatchReadiness && dispatchReadiness.status !== 'configured') {
      throw new BadRequestException(this.describeSmsReadinessFailure(dispatchReadiness.status));
    }

    const reserved = await this.schoolSmsWalletRepository.reserveSmsCredits({
      tenant_id: tenantId,
      recipient_ciphertext: this.encrypt(recipient, `sms:${tenantId}:recipient`),
      recipient_last4: this.last4(recipient),
      recipient_hash: this.schoolSmsWalletRepository.hashRecipient
        ? this.schoolSmsWalletRepository.hashRecipient(recipient)
        : this.fallbackHash(recipient),
      message_ciphertext: this.encrypt(message, `sms:${tenantId}:message`),
      message_preview: this.preview(message),
      message_type: dto.message_type?.trim() || 'general',
      credit_cost: creditCost,
      sent_by_user_id: this.getActorUserId(),
    });

    if (!reserved.accepted) {
      throw new BadRequestException(reserved.reason ?? 'SMS balance exhausted');
    }

    let dispatchStatus: 'sent' | 'queued' = 'queued';

    if (this.smsDispatchService) {
      try {
        const dispatchResult = await this.smsDispatchService.send({
          tenant_id: tenantId,
          to: recipient,
          message,
          source: dto.message_type?.trim() || 'school_sms',
        });

        await this.schoolSmsWalletRepository.markSmsLogSent?.({
          tenant_id: tenantId,
          log_id: reserved.log_id,
          provider_id: dispatchResult.provider_id,
          provider_message_id: dispatchResult.provider_message_id
            ?? `${dispatchResult.provider_code}:${reserved.log_id}`,
        });
        dispatchStatus = 'sent';
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : 'SMS dispatch failed';
        await this.schoolSmsWalletRepository.markSmsLogFailed?.({
          tenant_id: tenantId,
          log_id: reserved.log_id,
          failure_reason: failureReason,
        });
        await this.schoolSmsWalletRepository.refundSmsCredits?.({
          tenant_id: tenantId,
          log_id: reserved.log_id,
          credit_cost: reserved.credit_cost ?? creditCost,
          reason: 'sms_dispatch_failed',
          actor_user_id: this.getActorUserId(),
        });
        throw new BadRequestException('SMS provider could not send the message. Credits were not used.');
      }
    } else {
      const provider = await this.platformSmsService?.getDefaultProviderForDispatch?.();
      await this.schoolSmsWalletRepository.markSmsLogSent?.({
        tenant_id: tenantId,
        log_id: reserved.log_id,
        provider_id: provider?.provider.id ?? null,
        provider_message_id: provider ? `${provider.provider.provider_code}:${reserved.log_id}` : `local:${reserved.log_id}`,
      });
      dispatchStatus = provider ? 'sent' : 'queued';
    }

    return {
      status: dispatchStatus,
      log_id: reserved.log_id,
      balance_after: reserved.balance_after,
      credit_cost: reserved.credit_cost ?? creditCost,
      low_balance: reserved.balance_after <= 100,
    };
  }

  calculateCreditCost(message: string): number {
    const normalized = message.trim();

    if (!normalized) {
      return 1;
    }

    const singleSegmentLimit = 160;
    const multipartSegmentLimit = 153;

    if (normalized.length <= singleSegmentLimit) {
      return 1;
    }

    return Math.ceil(normalized.length / multipartSegmentLimit);
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for SMS operations');
    }

    return tenantId;
  }

  private getActorUserId(): string | null {
    const userId = this.requestContext.getStore()?.user_id;
    return userId && userId !== 'anonymous' ? userId : null;
  }

  private encrypt(value: string, aad: string): string {
    return this.piiEncryptionService?.encrypt(value, aad) ?? value;
  }

  private last4(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    return digits ? digits.slice(-4) : null;
  }

  private preview(message: string): string {
    return message.replace(/\s+/g, ' ').slice(0, 120);
  }

  private fallbackHash(value: string): string {
    return value.replace(/\D/g, '');
  }

  private describeSmsReadinessFailure(status: string): string {
    if (status === 'missing_provider') {
      return 'SMS provider is not configured by the platform owner';
    }

    if (status === 'missing_credentials') {
      return 'SMS provider credentials are incomplete';
    }

    if (status === 'degraded') {
      return 'SMS provider is degraded. Try again after support confirms delivery is healthy';
    }

    return 'SMS provider is not ready';
  }
}
