import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import type { DarajaIntegrationRecord } from './integrations.types';

@Injectable()
export class DarajaIntegrationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getDarajaIntegration(tenantId: string, environment?: string): Promise<DarajaIntegrationRecord | null> {
    const result = await this.databaseService.query<DarajaIntegrationRecord>(
      `
        SELECT id::text, tenant_id, integration_type, paybill_number, till_number, shortcode,
               consumer_key_ciphertext, consumer_secret_ciphertext, passkey_ciphertext,
               environment, callback_url, is_active, last_test_status, last_tested_at,
               created_at, updated_at
        FROM school_integrations
        WHERE tenant_id = $1
          AND integration_type = 'mpesa_daraja'
          AND ($2::text IS NULL OR environment = $2)
        ORDER BY is_active DESC, updated_at DESC
        LIMIT 1
      `,
      [tenantId, environment ?? null],
    );

    return result.rows[0] ? this.mapIntegration(result.rows[0]) : null;
  }

  async getDarajaIntegrationById(integrationId: string): Promise<DarajaIntegrationRecord | null> {
    const result = await this.databaseService.query<DarajaIntegrationRecord>(
      `
        SELECT id::text, tenant_id, integration_type, paybill_number, till_number, shortcode,
               consumer_key_ciphertext, consumer_secret_ciphertext, passkey_ciphertext,
               environment, callback_url, is_active, last_test_status, last_tested_at,
               created_at, updated_at
        FROM app.find_daraja_integration_by_id_for_callback($1::uuid)
      `,
      [integrationId],
    );

    return result.rows[0] ? this.mapIntegration(result.rows[0]) : null;
  }

  async upsertDarajaIntegration(input: {
    tenant_id: string;
    paybill_number?: string | null;
    till_number?: string | null;
    shortcode: string;
    consumer_key_ciphertext: string;
    consumer_secret_ciphertext: string;
    passkey_ciphertext: string;
    environment: string;
    callback_url?: string | null;
    is_active: boolean;
    actor_user_id?: string | null;
  }): Promise<DarajaIntegrationRecord> {
    const result = await this.databaseService.query<DarajaIntegrationRecord>(
      `
        INSERT INTO school_integrations (
          tenant_id,
          integration_type,
          paybill_number,
          till_number,
          shortcode,
          consumer_key_ciphertext,
          consumer_secret_ciphertext,
          passkey_ciphertext,
          environment,
          callback_url,
          is_active,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ($1, 'mpesa_daraja', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        ON CONFLICT (tenant_id, integration_type, environment)
        DO UPDATE SET
          paybill_number = EXCLUDED.paybill_number,
          till_number = EXCLUDED.till_number,
          shortcode = EXCLUDED.shortcode,
          consumer_key_ciphertext = EXCLUDED.consumer_key_ciphertext,
          consumer_secret_ciphertext = EXCLUDED.consumer_secret_ciphertext,
          passkey_ciphertext = EXCLUDED.passkey_ciphertext,
          callback_url = EXCLUDED.callback_url,
          is_active = EXCLUDED.is_active,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
        RETURNING id::text, tenant_id, integration_type, paybill_number, till_number, shortcode,
                  consumer_key_ciphertext, consumer_secret_ciphertext, passkey_ciphertext,
                  environment, callback_url, is_active, last_test_status, last_tested_at,
                  created_at, updated_at
      `,
      [
        input.tenant_id,
        input.paybill_number ?? null,
        input.till_number ?? null,
        input.shortcode,
        input.consumer_key_ciphertext,
        input.consumer_secret_ciphertext,
        input.passkey_ciphertext,
        input.environment,
        input.callback_url ?? null,
        input.is_active,
        input.actor_user_id ?? null,
      ],
    );

    return this.mapIntegration(result.rows[0]);
  }

  async setActive(input: {
    tenant_id: string;
    integration_id: string;
    is_active: boolean;
    actor_user_id?: string | null;
  }): Promise<DarajaIntegrationRecord> {
    const result = await this.databaseService.query<DarajaIntegrationRecord>(
      `
        UPDATE school_integrations
        SET is_active = $3,
            updated_by_user_id = $4,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND integration_type = 'mpesa_daraja'
        RETURNING id::text, tenant_id, integration_type, paybill_number, till_number, shortcode,
                  consumer_key_ciphertext, consumer_secret_ciphertext, passkey_ciphertext,
                  environment, callback_url, is_active, last_test_status, last_tested_at,
                  created_at, updated_at
      `,
      [input.tenant_id, input.integration_id, input.is_active, input.actor_user_id ?? null],
    );

    return this.mapIntegration(result.rows[0]);
  }

  async markConnectionTest(input: {
    tenant_id: string;
    integration_id: string;
    status: string;
  }): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE school_integrations
        SET last_test_status = $3,
            last_tested_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [input.tenant_id, input.integration_id, input.status],
    );
  }

  async appendIntegrationLog(input: {
    tenant_id: string;
    integration_type: string;
    operation: string;
    status: string;
    provider_reference?: string | null;
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
          provider_reference,
          error_message,
          request_id,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.tenant_id,
        input.integration_type,
        input.operation,
        input.status,
        input.provider_reference ?? null,
        input.error_message ?? null,
        input.request_id ?? null,
        input.created_by_user_id ?? null,
      ],
    );
  }

  private mapIntegration(row: DarajaIntegrationRecord): DarajaIntegrationRecord {
    return {
      ...row,
      last_tested_at: row.last_tested_at ? this.formatDate(row.last_tested_at) : null,
      created_at: this.formatDate(row.created_at),
      updated_at: this.formatDate(row.updated_at),
    };
  }

  private formatDate(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}
