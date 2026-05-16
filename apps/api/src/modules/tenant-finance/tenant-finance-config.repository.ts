import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../../database/database.service';
import { PiiEncryptionService } from '../security/pii-encryption.service';
import {
  TenantBankAccountRecord,
  TenantFinanceStatus,
  TenantFinanceSummary,
  TenantFinancialAccountsRecord,
  TenantMpesaConfigRecord,
  TenantPaymentChannelRecord,
  TenantPaymentChannelStatus,
  TenantPaymentChannelType,
} from './tenant-finance.types';

interface TenantMpesaConfigRow {
  id: string;
  tenant_id: string;
  shortcode: string;
  paybill_number: string | null;
  till_number: string | null;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
  initiator_name: string | null;
  environment: 'sandbox' | 'production';
  callback_url: string;
  status: TenantFinanceStatus;
  created_at: Date;
  updated_at: Date;
}

interface TenantBankAccountRow {
  id: string;
  tenant_id: string;
  bank_name: string;
  branch_name: string | null;
  account_name: string;
  account_number: string;
  currency: string;
  status: TenantFinanceStatus;
  created_at: Date;
  updated_at: Date;
}

interface TenantPaymentChannelRow {
  id: string;
  tenant_id: string;
  channel_type: TenantPaymentChannelType;
  name: string;
  mpesa_config_id: string | null;
  bank_account_id: string | null;
  status: TenantPaymentChannelStatus;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TenantFinanceConfigRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async findActiveMpesaConfigForTenant(
    tenantId: string,
  ): Promise<TenantMpesaConfigRecord | null> {
    const result = await this.databaseService.query<TenantMpesaConfigRow>(
      `
        SELECT
          id,
          tenant_id,
          shortcode,
          paybill_number,
          till_number,
          consumer_key,
          consumer_secret,
          passkey,
          initiator_name,
          environment,
          callback_url,
          status,
          created_at,
          updated_at
        FROM tenant_mpesa_configs
        WHERE tenant_id = $1
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [tenantId],
    );

    return result.rows[0] ? this.mapMpesaConfig(result.rows[0]) : null;
  }

  async findMpesaConfigForTenantByShortcode(
    tenantId: string,
    shortcode: string,
  ): Promise<TenantMpesaConfigRecord | null> {
    const result = await this.databaseService.query<TenantMpesaConfigRow>(
      `
        SELECT
          id,
          tenant_id,
          shortcode,
          paybill_number,
          till_number,
          consumer_key,
          consumer_secret,
          passkey,
          initiator_name,
          environment,
          callback_url,
          status,
          created_at,
          updated_at
        FROM tenant_mpesa_configs
        WHERE tenant_id = $1
          AND status = 'active'
          AND (
            shortcode = $2
            OR paybill_number = $2
            OR till_number = $2
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [tenantId, shortcode],
    );

    return result.rows[0] ? this.mapMpesaConfig(result.rows[0]) : null;
  }

  async findActiveMpesaConfigByShortcode(
    shortcode: string,
  ): Promise<TenantMpesaConfigRecord | null> {
    const result = await this.databaseService.query<TenantMpesaConfigRow>(
      `
        SELECT
          id,
          tenant_id,
          shortcode,
          paybill_number,
          till_number,
          consumer_key,
          consumer_secret,
          passkey,
          initiator_name,
          environment,
          callback_url,
          status,
          created_at,
          updated_at
        FROM tenant_mpesa_configs
        WHERE status = 'active'
          AND (
            shortcode = $1
            OR paybill_number = $1
            OR till_number = $1
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [shortcode],
    );

    return result.rows[0] ? this.mapMpesaConfig(result.rows[0]) : null;
  }

  async findFinancialAccountsForTenant(
    tenantId: string,
  ): Promise<TenantFinancialAccountsRecord | null> {
    const result = await this.databaseService.query<TenantFinancialAccountsRecord>(
      `
        SELECT
          tenant_id,
          mpesa_clearing_account_code,
          fee_control_account_code,
          currency_code
        FROM tenant_financial_accounts
        WHERE tenant_id = $1
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [tenantId],
    );

    return result.rows[0] ?? null;
  }

  async findActivePaymentChannelForMpesaConfig(
    tenantId: string,
    mpesaConfigId: string,
  ): Promise<TenantPaymentChannelRecord | null> {
    const result = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      channel_type: TenantPaymentChannelType;
      status: TenantPaymentChannelStatus;
    }>(
      `
        SELECT
          id,
          tenant_id,
          channel_type,
          status
        FROM tenant_payment_channels
        WHERE tenant_id = $1
          AND mpesa_config_id = $2::uuid
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [tenantId, mpesaConfigId],
    );

    return result.rows[0] ?? null;
  }

  async findTenantIdByPaymentRequest(
    checkoutRequestId: string,
    merchantRequestId: string,
  ): Promise<string | null> {
    const result = await this.databaseService.query<{ tenant_id: string }>(
      `
        SELECT tenant_id
        FROM payment_intents
        WHERE checkout_request_id = $1
           OR merchant_request_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [checkoutRequestId, merchantRequestId],
    );

    return result.rows[0]?.tenant_id ?? null;
  }

  async upsertFinancialAccounts(input: {
    tenant_id: string;
    mpesa_clearing_account_code: string;
    fee_control_account_code: string;
    currency_code: string;
  }): Promise<TenantFinancialAccountsRecord> {
    const result = await this.databaseService.query<TenantFinancialAccountsRecord>(
      `
        INSERT INTO tenant_financial_accounts (
          tenant_id,
          mpesa_clearing_account_code,
          fee_control_account_code,
          currency_code,
          status
        )
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (tenant_id) WHERE status = 'active'
        DO UPDATE SET
          mpesa_clearing_account_code = EXCLUDED.mpesa_clearing_account_code,
          fee_control_account_code = EXCLUDED.fee_control_account_code,
          currency_code = EXCLUDED.currency_code,
          updated_at = NOW()
        RETURNING
          tenant_id,
          mpesa_clearing_account_code,
          fee_control_account_code,
          currency_code
      `,
      [
        input.tenant_id,
        input.mpesa_clearing_account_code,
        input.fee_control_account_code,
        input.currency_code,
      ],
    );

    return result.rows[0];
  }

  async upsertMpesaConfig(input: {
    tenant_id: string;
    shortcode: string;
    paybill_number: string | null;
    till_number: string | null;
    consumer_key: string;
    consumer_secret: string;
    passkey: string;
    initiator_name: string | null;
    environment: 'sandbox' | 'production';
    callback_url: string;
    status: TenantFinanceStatus;
  }): Promise<TenantMpesaConfigRecord> {
    const result = await this.databaseService.query<TenantMpesaConfigRow>(
      `
        INSERT INTO tenant_mpesa_configs (
          tenant_id,
          shortcode,
          paybill_number,
          till_number,
          consumer_key,
          consumer_secret,
          passkey,
          initiator_name,
          environment,
          callback_url,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, shortcode)
        DO UPDATE SET
          paybill_number = EXCLUDED.paybill_number,
          till_number = EXCLUDED.till_number,
          consumer_key = EXCLUDED.consumer_key,
          consumer_secret = EXCLUDED.consumer_secret,
          passkey = EXCLUDED.passkey,
          initiator_name = EXCLUDED.initiator_name,
          environment = EXCLUDED.environment,
          callback_url = EXCLUDED.callback_url,
          status = EXCLUDED.status,
          credential_version = tenant_mpesa_configs.credential_version + 1,
          rotated_at = CASE
            WHEN tenant_mpesa_configs.consumer_key <> EXCLUDED.consumer_key
              OR tenant_mpesa_configs.consumer_secret <> EXCLUDED.consumer_secret
              OR tenant_mpesa_configs.passkey <> EXCLUDED.passkey
            THEN NOW()
            ELSE tenant_mpesa_configs.rotated_at
          END,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          shortcode,
          paybill_number,
          till_number,
          consumer_key,
          consumer_secret,
          passkey,
          initiator_name,
          environment,
          callback_url,
          status,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.shortcode,
        input.paybill_number,
        input.till_number,
        this.piiEncryptionService.encrypt(
          input.consumer_key,
          this.mpesaSecretAad(input.tenant_id, input.shortcode, 'consumer_key'),
        ),
        this.piiEncryptionService.encrypt(
          input.consumer_secret,
          this.mpesaSecretAad(input.tenant_id, input.shortcode, 'consumer_secret'),
        ),
        this.piiEncryptionService.encrypt(
          input.passkey,
          this.mpesaSecretAad(input.tenant_id, input.shortcode, 'passkey'),
        ),
        input.initiator_name,
        input.environment,
        input.callback_url,
        input.status,
      ],
    );

    return this.mapMpesaConfig(result.rows[0]);
  }

  async ensureMpesaPaymentChannel(input: {
    tenant_id: string;
    mpesa_config_id: string;
    channel_type: Extract<TenantPaymentChannelType, 'mpesa_paybill' | 'mpesa_till'>;
    name: string;
    status: TenantPaymentChannelStatus;
  }): Promise<TenantPaymentChannelRecord> {
    const result = await this.databaseService.query<TenantPaymentChannelRow>(
      `
        INSERT INTO tenant_payment_channels (
          tenant_id,
          channel_type,
          name,
          mpesa_config_id,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4::uuid, $5, '{}'::jsonb)
        ON CONFLICT (tenant_id, mpesa_config_id) WHERE mpesa_config_id IS NOT NULL AND status = 'active'
        DO UPDATE SET
          channel_type = EXCLUDED.channel_type,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          channel_type,
          name,
          mpesa_config_id,
          bank_account_id,
          status,
          metadata,
          created_at,
          updated_at
      `,
      [input.tenant_id, input.channel_type, input.name, input.mpesa_config_id, input.status],
    );

    return this.mapPaymentChannel(result.rows[0]);
  }

  async createBankAccount(input: {
    tenant_id: string;
    bank_name: string;
    branch_name: string | null;
    account_name: string;
    account_number: string;
    currency: string;
    status: TenantFinanceStatus;
  }): Promise<TenantBankAccountRecord> {
    const result = await this.databaseService.query<TenantBankAccountRow>(
      `
        INSERT INTO tenant_bank_accounts (
          tenant_id,
          bank_name,
          branch_name,
          account_name,
          account_number,
          account_number_hash,
          currency,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, account_number_hash)
        DO UPDATE SET
          bank_name = EXCLUDED.bank_name,
          branch_name = EXCLUDED.branch_name,
          account_name = EXCLUDED.account_name,
          account_number = EXCLUDED.account_number,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          bank_name,
          branch_name,
          account_name,
          account_number,
          currency,
          status,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.bank_name,
        input.branch_name,
        input.account_name,
        this.piiEncryptionService.encrypt(
          input.account_number,
          this.bankAccountAad(input.tenant_id),
        ),
        this.hashAccountNumber(input.tenant_id, input.account_number),
        input.currency,
        input.status,
      ],
    );

    return this.mapBankAccount(result.rows[0]);
  }

  async updatePaymentChannelStatus(input: {
    tenant_id: string;
    channel_id: string;
    status: TenantPaymentChannelStatus;
  }): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE tenant_payment_channels
        SET
          status = $3,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [input.tenant_id, input.channel_id, input.status],
    );
  }

  async getSummary(tenantId: string): Promise<TenantFinanceSummary> {
    const [mpesaConfigs, bankAccounts, paymentChannels, financialAccounts, dashboard] =
      await Promise.all([
        this.listMpesaConfigs(tenantId),
        this.listBankAccounts(tenantId),
        this.listPaymentChannels(tenantId),
        this.findFinancialAccountsForTenant(tenantId),
        this.loadDashboard(tenantId),
      ]);
    const hasActiveMpesa = mpesaConfigs.some((config) => config.status === 'active');

    return {
      tenant_id: tenantId,
      mpesa_configs: mpesaConfigs.map((config) => ({
        id: config.id,
        tenant_id: config.tenant_id,
        shortcode: config.shortcode,
        paybill_number: config.paybill_number,
        till_number: config.till_number,
        initiator_name: config.initiator_name,
        environment: config.environment,
        callback_url: config.callback_url,
        status: config.status,
        created_at: config.created_at,
        updated_at: config.updated_at,
        consumer_key_masked: this.maskSecret(config.consumer_key),
        consumer_secret_masked: this.maskSecret(config.consumer_secret),
        passkey_masked: this.maskSecret(config.passkey),
      })),
      bank_accounts: bankAccounts.map((account) => ({
        id: account.id,
        tenant_id: account.tenant_id,
        bank_name: account.bank_name,
        branch_name: account.branch_name,
        account_name: account.account_name,
        currency: account.currency,
        status: account.status,
        created_at: account.created_at,
        updated_at: account.updated_at,
        account_number_masked: this.maskAccountNumber(account.account_number),
      })),
      payment_channels: paymentChannels,
      financial_accounts: financialAccounts,
      dashboard: {
        ...dashboard,
        mpesa_status: hasActiveMpesa ? 'active' : 'inactive',
        reconciliation_status:
          dashboard.pending_reconciliations === 0 &&
          dashboard.failed_callbacks === 0 &&
          dashboard.unmatched_payments === 0
            ? 'balanced'
            : 'attention_required',
      },
    };
  }

  private async listMpesaConfigs(tenantId: string): Promise<TenantMpesaConfigRecord[]> {
    const result = await this.databaseService.query<TenantMpesaConfigRow>(
      `
        SELECT
          id,
          tenant_id,
          shortcode,
          paybill_number,
          till_number,
          consumer_key,
          consumer_secret,
          passkey,
          initiator_name,
          environment,
          callback_url,
          status,
          created_at,
          updated_at
        FROM tenant_mpesa_configs
        WHERE tenant_id = $1
        ORDER BY status = 'active' DESC, updated_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.mapMpesaConfig(row));
  }

  private async listBankAccounts(tenantId: string): Promise<TenantBankAccountRecord[]> {
    const result = await this.databaseService.query<TenantBankAccountRow>(
      `
        SELECT
          id,
          tenant_id,
          bank_name,
          branch_name,
          account_name,
          account_number,
          currency,
          status,
          created_at,
          updated_at
        FROM tenant_bank_accounts
        WHERE tenant_id = $1
        ORDER BY status = 'active' DESC, bank_name ASC, account_name ASC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.mapBankAccount(row));
  }

  private async listPaymentChannels(tenantId: string): Promise<TenantFinanceSummary['payment_channels']> {
    const result = await this.databaseService.query<TenantPaymentChannelRow>(
      `
        SELECT
          id,
          tenant_id,
          channel_type,
          name,
          mpesa_config_id,
          bank_account_id,
          status,
          metadata,
          created_at,
          updated_at
        FROM tenant_payment_channels
        WHERE tenant_id = $1
        ORDER BY status = 'active' DESC, channel_type ASC, name ASC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.mapPaymentChannel(row));
  }

  private async loadDashboard(tenantId: string): Promise<TenantFinanceSummary['dashboard']> {
    const result = await this.databaseService.query<{
      todays_collections_minor: string;
      pending_reconciliations: string;
      failed_callbacks: string;
      unmatched_payments: string;
    }>(
      `
        SELECT
          COALESCE((
            SELECT SUM(amount_minor)::text
            FROM mpesa_transactions
            WHERE tenant_id = $1
              AND status = 'succeeded'
              AND COALESCE(transaction_occurred_at, processed_at, created_at) >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'
          ), '0') AS todays_collections_minor,
          COALESCE((
            SELECT COUNT(*)::text
            FROM payment_intents
            WHERE tenant_id = $1
              AND status IN ('stk_requested', 'callback_received', 'processing')
          ), '0') AS pending_reconciliations,
          COALESCE((
            SELECT COUNT(*)::text
            FROM callback_logs
            WHERE tenant_id = $1
              AND processing_status IN ('failed', 'rejected')
          ), '0') AS failed_callbacks,
          COALESCE((
            SELECT COUNT(*)::text
            FROM mpesa_transactions
            WHERE tenant_id = $1
              AND status = 'succeeded'
              AND ledger_transaction_id IS NULL
          ), '0') AS unmatched_payments
      `,
      [tenantId],
    );
    const row = result.rows[0];

    return {
      todays_collections_minor: row?.todays_collections_minor ?? '0',
      pending_reconciliations: Number(row?.pending_reconciliations ?? 0),
      failed_callbacks: Number(row?.failed_callbacks ?? 0),
      unmatched_payments: Number(row?.unmatched_payments ?? 0),
      mpesa_status: 'inactive',
      reconciliation_status: 'balanced',
    };
  }

  private mapMpesaConfig(row: TenantMpesaConfigRow): TenantMpesaConfigRecord {
    return {
      ...row,
      consumer_key: this.piiEncryptionService.decrypt(
        row.consumer_key,
        this.mpesaSecretAad(row.tenant_id, row.shortcode, 'consumer_key'),
      ),
      consumer_secret: this.piiEncryptionService.decrypt(
        row.consumer_secret,
        this.mpesaSecretAad(row.tenant_id, row.shortcode, 'consumer_secret'),
      ),
      passkey: this.piiEncryptionService.decrypt(
        row.passkey,
        this.mpesaSecretAad(row.tenant_id, row.shortcode, 'passkey'),
      ),
    };
  }

  private mapBankAccount(row: TenantBankAccountRow): TenantBankAccountRecord {
    return {
      ...row,
      account_number: this.piiEncryptionService.decrypt(
        row.account_number,
        this.bankAccountAad(row.tenant_id),
      ),
    };
  }

  private mapPaymentChannel(row: TenantPaymentChannelRow): TenantFinanceSummary['payment_channels'][number] {
    return {
      ...row,
      metadata: row.metadata ?? {},
    };
  }

  private mpesaSecretAad(
    tenantId: string,
    shortcode: string,
    field: 'consumer_key' | 'consumer_secret' | 'passkey',
  ): string {
    return `tenant_mpesa_configs:${tenantId}:${shortcode}:${field}`;
  }

  private bankAccountAad(tenantId: string): string {
    return `tenant_bank_accounts:${tenantId}:account_number`;
  }

  private hashAccountNumber(tenantId: string, accountNumber: string): string {
    return createHash('sha256')
      .update(`${tenantId}:${accountNumber.replace(/\s+/g, '')}`)
      .digest('hex');
  }

  private maskSecret(value: string): string {
    if (value.length <= 6) {
      return '*'.repeat(value.length);
    }

    return `${value.slice(0, 3)}${'*'.repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
  }

  private maskAccountNumber(value: string): string {
    const normalized = value.replace(/\s+/g, '');

    if (normalized.length <= 4) {
      return '*'.repeat(normalized.length);
    }

    return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
  }
}
