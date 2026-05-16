import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { PiiEncryptionService } from '../security/pii-encryption.service';
import { SaveDarajaIntegrationDto } from './dto/integrations.dto';
import { DarajaIntegrationRepository } from './daraja-integration.repository';
import type {
  DarajaIntegrationRecord,
  DarajaIntegrationResponse,
} from './integrations.types';

@Injectable()
export class DarajaIntegrationService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly darajaIntegrationRepository: DarajaIntegrationRepository,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async getDarajaSettings(environment?: string): Promise<DarajaIntegrationResponse | null> {
    const record = await this.darajaIntegrationRepository.getDarajaIntegration(
      this.requireTenantId(),
      environment,
    );

    return record ? this.toResponse(record) : null;
  }

  async saveDarajaSettings(dto: SaveDarajaIntegrationDto): Promise<DarajaIntegrationResponse> {
    const tenantId = this.requireTenantId();
    const shortcode = dto.shortcode.trim();
    const callbackUrl = `/payments/mpesa/callback/:integrationId`;
    const record = await this.darajaIntegrationRepository.upsertDarajaIntegration({
      tenant_id: tenantId,
      paybill_number: dto.paybill_number?.trim() || null,
      till_number: dto.till_number?.trim() || null,
      shortcode,
      consumer_key_ciphertext: this.piiEncryptionService.encrypt(
        dto.consumer_key.trim(),
        `daraja:${tenantId}:${dto.environment}:consumer-key`,
      ),
      consumer_secret_ciphertext: this.piiEncryptionService.encrypt(
        dto.consumer_secret.trim(),
        `daraja:${tenantId}:${dto.environment}:consumer-secret`,
      ),
      passkey_ciphertext: this.piiEncryptionService.encrypt(
        dto.passkey.trim(),
        `daraja:${tenantId}:${dto.environment}:passkey`,
      ),
      environment: dto.environment,
      callback_url: callbackUrl,
      is_active: dto.is_active ?? false,
      actor_user_id: this.getActorUserId(),
    });

    await this.darajaIntegrationRepository.appendIntegrationLog({
      tenant_id: tenantId,
      integration_type: 'mpesa_daraja',
      operation: 'daraja_credentials_updated',
      status: 'success',
      request_id: this.requestContext.getStore()?.request_id ?? null,
      created_by_user_id: this.getActorUserId(),
    });

    return this.toResponse({
      ...record,
      callback_url: record.callback_url?.replace(':integrationId', record.id) ?? null,
    });
  }

  async testConnection(environment?: string): Promise<{ status: 'ok'; integration_id: string }> {
    const tenantId = this.requireTenantId();
    const record = await this.darajaIntegrationRepository.getDarajaIntegration(tenantId, environment);

    if (!record) {
      throw new BadRequestException('Daraja integration is not configured');
    }

    const credentials = this.decryptCredentials(record);

    if (!credentials.consumer_key || !credentials.consumer_secret || !credentials.passkey || !record.shortcode) {
      await this.darajaIntegrationRepository.markConnectionTest({
        tenant_id: tenantId,
        integration_id: record.id,
        status: 'failed',
      });
      throw new BadRequestException('Daraja credentials are incomplete');
    }

    await this.darajaIntegrationRepository.markConnectionTest({
      tenant_id: tenantId,
      integration_id: record.id,
      status: 'ok',
    });
    await this.darajaIntegrationRepository.appendIntegrationLog({
      tenant_id: tenantId,
      integration_type: 'mpesa_daraja',
      operation: 'daraja_connection_tested',
      status: 'ok',
      request_id: this.requestContext.getStore()?.request_id ?? null,
      created_by_user_id: this.getActorUserId(),
    });

    return { status: 'ok', integration_id: record.id };
  }

  async setActive(integrationId: string, isActive: boolean): Promise<DarajaIntegrationResponse> {
    const tenantId = this.requireTenantId();
    const record = await this.darajaIntegrationRepository.setActive({
      tenant_id: tenantId,
      integration_id: integrationId,
      is_active: isActive,
      actor_user_id: this.getActorUserId(),
    });
    await this.darajaIntegrationRepository.appendIntegrationLog({
      tenant_id: tenantId,
      integration_type: 'mpesa_daraja',
      operation: isActive ? 'daraja_integration_activated' : 'daraja_integration_deactivated',
      status: 'success',
      request_id: this.requestContext.getStore()?.request_id ?? null,
      created_by_user_id: this.getActorUserId(),
    });

    return this.toResponse(record);
  }

  async getCredentialsForCallback(integrationId: string): Promise<{
    tenant_id: string;
    shortcode: string | null;
    paybill_number: string | null;
    till_number: string | null;
    environment: string;
  } | null> {
    const record = await this.darajaIntegrationRepository.getDarajaIntegrationById(integrationId);

    if (!record || !record.is_active) {
      return null;
    }

    return {
      tenant_id: record.tenant_id,
      shortcode: record.shortcode,
      paybill_number: record.paybill_number,
      till_number: record.till_number,
      environment: record.environment,
    };
  }

  private toResponse(record: DarajaIntegrationRecord): DarajaIntegrationResponse {
    const credentials = this.decryptCredentials(record);

    return {
      id: record.id,
      tenant_id: record.tenant_id,
      integration_type: 'mpesa_daraja',
      paybill_number: record.paybill_number,
      till_number: record.till_number,
      shortcode: record.shortcode,
      consumer_key_masked: this.maskSecret(credentials.consumer_key),
      consumer_secret_masked: this.maskSecret(credentials.consumer_secret),
      passkey_masked: this.maskSecret(credentials.passkey),
      environment: record.environment,
      callback_url: record.callback_url,
      is_active: record.is_active,
      last_test_status: record.last_test_status,
      last_tested_at: this.formatNullableDate(record.last_tested_at),
      created_at: this.formatDate(record.created_at),
      updated_at: this.formatDate(record.updated_at),
    };
  }

  private decryptCredentials(record: DarajaIntegrationRecord): {
    consumer_key: string | null;
    consumer_secret: string | null;
    passkey: string | null;
  } {
    const tenantId = record.tenant_id;
    const environment = record.environment;

    return {
      consumer_key: record.consumer_key_ciphertext
        ? this.tryDecrypt(record.consumer_key_ciphertext, `daraja:${tenantId}:${environment}:consumer-key`)
        : null,
      consumer_secret: record.consumer_secret_ciphertext
        ? this.tryDecrypt(record.consumer_secret_ciphertext, `daraja:${tenantId}:${environment}:consumer-secret`)
        : null,
      passkey: record.passkey_ciphertext
        ? this.tryDecrypt(record.passkey_ciphertext, `daraja:${tenantId}:${environment}:passkey`)
        : null,
    };
  }

  private tryDecrypt(value: string, aad: string): string {
    try {
      return this.piiEncryptionService.decrypt(value, aad);
    } catch {
      return value;
    }
  }

  private maskSecret(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const visible = value.length <= 4 ? value.slice(-2) : value.slice(-4);
    return `${'*'.repeat(Math.max(8, value.length - visible.length))}${visible}`;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for Daraja settings');
    }

    return tenantId;
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
