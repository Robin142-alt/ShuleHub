import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import type { PlatformSmsProviderRecord } from './integrations.types';

interface PlatformSmsProviderRow {
  id: string;
  provider_name: string;
  provider_code: 'textsms_kenya' | 'africas_talking' | 'twilio';
  api_key_ciphertext: string;
  username_ciphertext: string | null;
  sender_id: string;
  base_url: string | null;
  is_active: boolean;
  is_default: boolean;
  last_test_status: string | null;
  last_tested_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class PlatformSmsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listProviders(): Promise<PlatformSmsProviderRecord[]> {
    const result = await this.databaseService.query<PlatformSmsProviderRow>(
      `
        SELECT id::text, provider_name, provider_code, api_key_ciphertext, username_ciphertext,
               sender_id, base_url, is_active, is_default, last_test_status,
               last_tested_at, created_at, updated_at
        FROM platform_sms_providers
        ORDER BY is_default DESC, provider_name ASC
      `,
    );

    return result.rows.map((row) => this.mapProvider(row));
  }

  async createProvider(input: {
    provider_name: string;
    provider_code: string;
    api_key_ciphertext: string;
    username_ciphertext?: string | null;
    sender_id: string;
    base_url?: string | null;
    is_active: boolean;
    is_default: boolean;
    actor_user_id?: string | null;
  }): Promise<PlatformSmsProviderRecord> {
    if (input.is_default) {
      await this.clearDefaultProvider();
    }

    const result = await this.databaseService.query<PlatformSmsProviderRow>(
      `
        INSERT INTO platform_sms_providers (
          provider_name,
          provider_code,
          api_key_ciphertext,
          username_ciphertext,
          sender_id,
          base_url,
          is_active,
          is_default,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        ON CONFLICT (provider_code)
        DO UPDATE SET
          provider_name = EXCLUDED.provider_name,
          api_key_ciphertext = EXCLUDED.api_key_ciphertext,
          username_ciphertext = EXCLUDED.username_ciphertext,
          sender_id = EXCLUDED.sender_id,
          base_url = EXCLUDED.base_url,
          is_active = EXCLUDED.is_active,
          is_default = EXCLUDED.is_default,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
        RETURNING id::text, provider_name, provider_code, api_key_ciphertext, username_ciphertext,
                  sender_id, base_url, is_active, is_default, last_test_status,
                  last_tested_at, created_at, updated_at
      `,
      [
        input.provider_name,
        input.provider_code,
        input.api_key_ciphertext,
        input.username_ciphertext ?? null,
        input.sender_id,
        input.base_url ?? null,
        input.is_active,
        input.is_default,
        input.actor_user_id ?? null,
      ],
    );

    return this.mapProvider(result.rows[0]);
  }

  async updateProvider(input: {
    provider_id: string;
    provider_name?: string;
    api_key_ciphertext?: string;
    username_ciphertext?: string | null;
    sender_id?: string;
    base_url?: string | null;
    is_active?: boolean;
    actor_user_id?: string | null;
  }): Promise<PlatformSmsProviderRecord> {
    const result = await this.databaseService.query<PlatformSmsProviderRow>(
      `
        UPDATE platform_sms_providers
        SET provider_name = COALESCE($2, provider_name),
            api_key_ciphertext = COALESCE($3, api_key_ciphertext),
            username_ciphertext = CASE WHEN $4::boolean THEN $5 ELSE username_ciphertext END,
            sender_id = COALESCE($6, sender_id),
            base_url = CASE WHEN $7::boolean THEN $8 ELSE base_url END,
            is_active = COALESCE($9, is_active),
            updated_by_user_id = $10,
            updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING id::text, provider_name, provider_code, api_key_ciphertext, username_ciphertext,
                  sender_id, base_url, is_active, is_default, last_test_status,
                  last_tested_at, created_at, updated_at
      `,
      [
        input.provider_id,
        input.provider_name ?? null,
        input.api_key_ciphertext ?? null,
        input.username_ciphertext !== undefined,
        input.username_ciphertext ?? null,
        input.sender_id ?? null,
        input.base_url !== undefined,
        input.base_url ?? null,
        input.is_active ?? null,
        input.actor_user_id ?? null,
      ],
    );

    return this.mapProvider(result.rows[0]);
  }

  async setDefaultProvider(providerId: string, actorUserId?: string | null): Promise<PlatformSmsProviderRecord> {
    await this.clearDefaultProvider();
    const result = await this.databaseService.query<PlatformSmsProviderRow>(
      `
        UPDATE platform_sms_providers
        SET is_default = TRUE,
            is_active = TRUE,
            updated_by_user_id = $2,
            updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING id::text, provider_name, provider_code, api_key_ciphertext, username_ciphertext,
                  sender_id, base_url, is_active, is_default, last_test_status,
                  last_tested_at, created_at, updated_at
      `,
      [providerId, actorUserId ?? null],
    );

    return this.mapProvider(result.rows[0]);
  }

  async findDefaultProvider(): Promise<PlatformSmsProviderRecord | null> {
    const result = await this.databaseService.query<PlatformSmsProviderRow>(
      `
        SELECT id::text, provider_name, provider_code, api_key_ciphertext, username_ciphertext,
               sender_id, base_url, is_active, is_default, last_test_status,
               last_tested_at, created_at, updated_at
        FROM platform_sms_providers
        WHERE is_default = TRUE
          AND is_active = TRUE
        LIMIT 1
      `,
    );

    return result.rows[0] ? this.mapProvider(result.rows[0]) : null;
  }

  async markProviderTest(providerId: string, status: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE platform_sms_providers
        SET last_test_status = $2,
            last_tested_at = NOW(),
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [providerId, status],
    );
  }

  async appendPlatformIntegrationLog(input: {
    integration_type: string;
    operation: string;
    status: string;
    error_message?: string | null;
    request_id?: string | null;
    created_by_user_id?: string | null;
  }): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO integration_logs (
          tenant_id,
          integration_type,
          operation,
          status,
          error_message,
          request_id,
          created_by_user_id
        )
        VALUES (current_setting('app.tenant_id', true), $1, $2, $3, $4, $5, $6)
      `,
      [
        input.integration_type,
        input.operation,
        input.status,
        input.error_message ?? null,
        input.request_id ?? null,
        input.created_by_user_id ?? null,
      ],
    );
  }

  private async clearDefaultProvider(): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE platform_sms_providers
        SET is_default = FALSE,
            updated_at = NOW()
        WHERE is_default = TRUE
      `,
    );
  }

  private mapProvider(row: PlatformSmsProviderRow): PlatformSmsProviderRecord {
    return {
      ...row,
      created_at: this.formatDate(row.created_at),
      updated_at: this.formatDate(row.updated_at),
      last_tested_at: row.last_tested_at ? this.formatDate(row.last_tested_at) : null,
    };
  }

  private formatDate(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}
