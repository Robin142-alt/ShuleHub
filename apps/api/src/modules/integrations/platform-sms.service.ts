import { BadRequestException, Injectable } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { PiiEncryptionService } from '../security/pii-encryption.service';
import {
  CreatePlatformSmsProviderDto,
  UpdatePlatformSmsProviderDto,
} from './dto/integrations.dto';
import { PlatformSmsRepository } from './platform-sms.repository';
import type {
  PlatformSmsProviderRecord,
  PlatformSmsProviderResponse,
} from './integrations.types';

@Injectable()
export class PlatformSmsService {
  constructor(
    private readonly platformSmsRepository: PlatformSmsRepository,
    private readonly piiEncryptionService: PiiEncryptionService,
    private readonly requestContext: RequestContextService,
  ) {}

  async listProviders(): Promise<PlatformSmsProviderResponse[]> {
    const providers = await this.platformSmsRepository.listProviders();
    return providers.map((provider) => this.toProviderResponse(provider));
  }

  async createProvider(dto: CreatePlatformSmsProviderDto): Promise<PlatformSmsProviderResponse> {
    const actorUserId = this.getActorUserId();
    const provider = await this.platformSmsRepository.createProvider({
      provider_name: dto.provider_name.trim(),
      provider_code: dto.provider_code,
      api_key_ciphertext: this.piiEncryptionService.encrypt(
        dto.api_key.trim(),
        `platform-sms:${dto.provider_code}:api-key`,
      ),
      username_ciphertext: dto.username?.trim()
        ? this.piiEncryptionService.encrypt(
            dto.username.trim(),
            `platform-sms:${dto.provider_code}:username`,
          )
        : null,
      sender_id: dto.sender_id.trim(),
      base_url: dto.base_url?.trim() || null,
      is_active: dto.is_active ?? true,
      is_default: dto.is_default ?? false,
      actor_user_id: actorUserId,
    });

    await this.safePlatformLog('platform_sms_provider_created', 'success');
    return this.toProviderResponse(provider);
  }

  async updateProvider(
    providerId: string,
    dto: UpdatePlatformSmsProviderDto,
  ): Promise<PlatformSmsProviderResponse> {
    const provider = await this.platformSmsRepository.updateProvider({
      provider_id: providerId,
      provider_name: dto.provider_name?.trim(),
      api_key_ciphertext: dto.api_key?.trim()
        ? this.piiEncryptionService.encrypt(
            dto.api_key.trim(),
            `platform-sms:${providerId}:api-key`,
          )
        : undefined,
      username_ciphertext: dto.username === undefined
        ? undefined
        : dto.username.trim()
          ? this.piiEncryptionService.encrypt(
              dto.username.trim(),
              `platform-sms:${providerId}:username`,
            )
          : null,
      sender_id: dto.sender_id?.trim(),
      base_url: dto.base_url === undefined ? undefined : dto.base_url.trim() || null,
      is_active: dto.is_active,
      actor_user_id: this.getActorUserId(),
    });

    await this.safePlatformLog('platform_sms_provider_updated', 'success');
    return this.toProviderResponse(provider);
  }

  async setDefaultProvider(providerId: string): Promise<PlatformSmsProviderResponse> {
    const provider = await this.platformSmsRepository.setDefaultProvider(
      providerId,
      this.getActorUserId(),
    );
    await this.safePlatformLog('platform_sms_default_changed', 'success');
    return this.toProviderResponse(provider);
  }

  async testProvider(providerId: string): Promise<{ status: 'ok'; provider_id: string }> {
    const providers = await this.platformSmsRepository.listProviders();
    const provider = providers.find((item) => item.id === providerId);

    if (!provider) {
      throw new BadRequestException('SMS provider was not found');
    }

    const apiKey = this.piiEncryptionService.decrypt(
      provider.api_key_ciphertext,
      `platform-sms:${provider.provider_code}:api-key`,
    );

    if (!apiKey.trim() || !provider.sender_id.trim()) {
      await this.platformSmsRepository.markProviderTest(providerId, 'failed');
      await this.safePlatformLog('platform_sms_provider_tested', 'failed');
      throw new BadRequestException('SMS provider credentials are incomplete');
    }

    await this.platformSmsRepository.markProviderTest(providerId, 'ok');
    await this.safePlatformLog('platform_sms_provider_tested', 'ok');

    return { status: 'ok', provider_id: providerId };
  }

  async getDefaultProviderForDispatch(): Promise<{
    provider: PlatformSmsProviderRecord;
    api_key: string;
    username: string | null;
  } | null> {
    const provider = await this.platformSmsRepository.findDefaultProvider();

    if (!provider) {
      return null;
    }

    return {
      provider,
      api_key: this.piiEncryptionService.decrypt(
        provider.api_key_ciphertext,
        `platform-sms:${provider.provider_code}:api-key`,
      ),
      username: provider.username_ciphertext
        ? this.piiEncryptionService.decrypt(
            provider.username_ciphertext,
            `platform-sms:${provider.provider_code}:username`,
          )
        : null,
    };
  }

  private toProviderResponse(provider: PlatformSmsProviderRecord): PlatformSmsProviderResponse {
    const apiKey = this.tryDecrypt(
      provider.api_key_ciphertext,
      `platform-sms:${provider.provider_code}:api-key`,
    );
    const username = provider.username_ciphertext
      ? this.tryDecrypt(
          provider.username_ciphertext,
          `platform-sms:${provider.provider_code}:username`,
        )
      : null;

    return {
      id: provider.id,
      provider_name: provider.provider_name,
      provider_code: provider.provider_code,
      api_key_masked: this.maskSecret(apiKey),
      username_masked: username ? this.maskSecret(username) : null,
      sender_id: provider.sender_id,
      base_url: provider.base_url,
      is_active: provider.is_active,
      is_default: provider.is_default,
      last_test_status: provider.last_test_status,
      last_tested_at: this.formatNullableDate(provider.last_tested_at),
      created_at: this.formatDate(provider.created_at),
      updated_at: this.formatDate(provider.updated_at),
    };
  }

  private tryDecrypt(value: string, aad: string): string {
    try {
      return this.piiEncryptionService.decrypt(value, aad);
    } catch {
      return value;
    }
  }

  private maskSecret(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const visible = value.length <= 4 ? value.slice(-2) : value.slice(-4);
    return `${'*'.repeat(Math.max(8, value.length - visible.length))}${visible}`;
  }

  private async safePlatformLog(operation: string, status: string): Promise<void> {
    try {
      await this.platformSmsRepository.appendPlatformIntegrationLog({
        integration_type: 'platform_sms',
        operation,
        status,
        request_id: this.requestContext.getStore()?.request_id ?? null,
        created_by_user_id: this.getActorUserId(),
      });
    } catch {
      // Platform logging should never leak secrets or block provider configuration.
    }
  }

  private getActorUserId(): string | null {
    const userId = this.requestContext.getStore()?.user_id;
    return userId && userId !== 'anonymous' ? userId : null;
  }

  private formatNullableDate(value: string | Date | null): string | null {
    return value ? this.formatDate(value) : null;
  }

  private formatDate(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}
