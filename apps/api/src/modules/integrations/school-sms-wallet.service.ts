import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { PiiEncryptionService } from '../security/pii-encryption.service';
import {
  CreateSmsPurchaseRequestDto,
  SendSmsDto,
} from './dto/integrations.dto';
import { PlatformSmsService } from './platform-sms.service';
import { SchoolSmsWalletRepository } from './school-sms-wallet.repository';

@Injectable()
export class SchoolSmsWalletService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly schoolSmsWalletRepository: SchoolSmsWalletRepository,
    @Optional() private readonly piiEncryptionService?: PiiEncryptionService,
    @Optional() private readonly platformSmsService?: PlatformSmsService,
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

    const provider = await this.platformSmsService?.getDefaultProviderForDispatch?.();
    await this.schoolSmsWalletRepository.markSmsLogSent?.({
      tenant_id: tenantId,
      log_id: reserved.log_id,
      provider_id: provider?.provider.id ?? null,
      provider_message_id: provider ? `${provider.provider.provider_code}:${reserved.log_id}` : `local:${reserved.log_id}`,
    });

    return {
      status: provider ? 'sent' : 'queued',
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
}
