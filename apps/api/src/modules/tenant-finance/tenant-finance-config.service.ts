import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../observability/audit-log.service';
import { TenantFinanceConfigRepository } from './tenant-finance-config.repository';
import {
  ResolvedTenantMpesaConfig,
  TenantFinanceStatus,
  TenantFinanceSummary,
  TenantPaymentChannelStatus,
} from './tenant-finance.types';

@Injectable()
export class TenantFinanceConfigService {
  constructor(
    private readonly repository: TenantFinanceConfigRepository,
    private readonly configService: ConfigService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  async resolveMpesaConfigForTenant(tenantId: string): Promise<ResolvedTenantMpesaConfig> {
    const mpesaConfig = await this.repository.findActiveMpesaConfigForTenant(tenantId);

    if (!mpesaConfig) {
      throw new NotFoundException(
        `Tenant "${tenantId}" does not have an active school-owned MPESA configuration`,
      );
    }

    const financialAccounts =
      (await this.repository.findFinancialAccountsForTenant(tenantId)) ?? {
        tenant_id: tenantId,
        mpesa_clearing_account_code:
          this.configService.get<string>('mpesa.ledgerDebitAccountCode') ??
          '1110-MPESA-CLEARING',
        fee_control_account_code:
          this.configService.get<string>('mpesa.ledgerCreditAccountCode') ??
          '1100-AR-FEES',
        currency_code: 'KES',
      };
    const paymentChannel = await this.repository.findActivePaymentChannelForMpesaConfig(
      tenantId,
      mpesaConfig.id,
    );
    const isTillChannel = Boolean(mpesaConfig.till_number);

    return {
      owner: 'tenant',
      tenant_id: tenantId,
      mpesa_config_id: mpesaConfig.id,
      payment_channel_id: paymentChannel?.id ?? null,
      shortcode: mpesaConfig.shortcode,
      paybill_number: mpesaConfig.paybill_number,
      till_number: mpesaConfig.till_number,
      consumer_key: mpesaConfig.consumer_key,
      consumer_secret: mpesaConfig.consumer_secret,
      passkey: mpesaConfig.passkey,
      initiator_name: mpesaConfig.initiator_name,
      environment: mpesaConfig.environment,
      base_url: this.resolveBaseUrl(mpesaConfig.environment),
      callback_url: mpesaConfig.callback_url,
      transaction_type: isTillChannel ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
      ledger_debit_account_code: financialAccounts.mpesa_clearing_account_code,
      ledger_credit_account_code: financialAccounts.fee_control_account_code,
    };
  }

  resolvePlatformMpesaConfig(tenantId: string): ResolvedTenantMpesaConfig {
    const shortCode = this.requireConfig('mpesa.shortCode');

    return {
      owner: 'platform',
      tenant_id: tenantId,
      mpesa_config_id: null,
      payment_channel_id: null,
      shortcode: shortCode,
      paybill_number: shortCode,
      till_number: null,
      consumer_key: this.requireConfig('mpesa.consumerKey'),
      consumer_secret: this.requireConfig('mpesa.consumerSecret'),
      passkey: this.requireConfig('mpesa.passkey'),
      initiator_name: null,
      environment: this.inferEnvironmentFromBaseUrl(this.requireConfig('mpesa.baseUrl')),
      base_url: this.requireConfig('mpesa.baseUrl'),
      callback_url: this.requireConfig('mpesa.callbackUrl'),
      transaction_type:
        (this.configService.get<string>('mpesa.transactionType') as
          | 'CustomerPayBillOnline'
          | 'CustomerBuyGoodsOnline'
          | undefined) ?? 'CustomerPayBillOnline',
      ledger_debit_account_code:
        this.configService.get<string>('mpesa.ledgerDebitAccountCode') ??
        '1110-MPESA-CLEARING',
      ledger_credit_account_code:
        this.configService.get<string>('mpesa.ledgerCreditAccountCode') ??
        '1100-AR-FEES',
    };
  }

  async resolveTenantForMpesaCallback(input: {
    payload: unknown;
    checkout_request_id?: string | null;
    merchant_request_id?: string | null;
    fallback_tenant_id?: string | null;
  }): Promise<{ tenant_id: string; shortcode: string | null }> {
    const shortcode = this.extractShortcode(input.payload);
    const fallbackTenantId = input.fallback_tenant_id?.trim() || null;

    if (shortcode && fallbackTenantId) {
      const config = await this.repository.findMpesaConfigForTenantByShortcode(
        fallbackTenantId,
        shortcode,
      );

      if (config) {
        return { tenant_id: fallbackTenantId, shortcode };
      }
    }

    if (input.checkout_request_id && input.merchant_request_id) {
      const tenantId = await this.repository.findTenantIdByPaymentRequest(
        input.checkout_request_id,
        input.merchant_request_id,
      );

      if (tenantId) {
        return { tenant_id: tenantId, shortcode };
      }
    }

    if (fallbackTenantId) {
      return { tenant_id: fallbackTenantId, shortcode };
    }

    throw new BadRequestException('Unable to resolve tenant for MPESA callback');
  }

  async assertCallbackBelongsToTenant(input: {
    tenant_id: string;
    payload: unknown;
    checkout_request_id: string;
    merchant_request_id: string;
  }): Promise<void> {
    const shortcode = this.extractShortcode(input.payload);

    if (shortcode) {
      const matchingConfig = await this.repository.findMpesaConfigForTenantByShortcode(
        input.tenant_id,
        shortcode,
      );

      if (!matchingConfig) {
        throw new BadRequestException(
          `MPESA callback shortcode "${shortcode}" is not active for tenant "${input.tenant_id}"`,
        );
      }
    }

    const tenantId = await this.repository.findTenantIdByPaymentRequest(
      input.checkout_request_id,
      input.merchant_request_id,
    );

    if (tenantId && tenantId !== input.tenant_id) {
      throw new BadRequestException(
        `MPESA callback "${input.checkout_request_id}" belongs to tenant "${tenantId}", not "${input.tenant_id}"`,
      );
    }
  }

  extractShortcode(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const objectPayload = payload as Record<string, unknown>;
    const candidateKeys = [
      'BusinessShortCode',
      'ShortCode',
      'shortcode',
      'PayBillNumber',
      'paybill_number',
      'TillNumber',
      'till_number',
    ];

    for (const key of candidateKeys) {
      const value = objectPayload[key];

      if (typeof value === 'string' || typeof value === 'number') {
        return String(value).trim();
      }
    }

    const nestedCandidates = [
      objectPayload.Body,
      objectPayload.Result,
      objectPayload.CallbackMetadata,
    ];

    for (const nested of nestedCandidates) {
      const shortcode = this.extractShortcode(nested);

      if (shortcode) {
        return shortcode;
      }
    }

    return null;
  }

  async getSummary(tenantId: string): Promise<TenantFinanceSummary> {
    return this.repository.getSummary(tenantId);
  }

  async upsertMpesaConfig(
    tenantId: string,
    input: {
      shortcode: string;
      paybill_number?: string | null;
      till_number?: string | null;
      consumer_key: string;
      consumer_secret: string;
      passkey: string;
      initiator_name?: string | null;
      environment: 'sandbox' | 'production';
      callback_url: string;
      status?: TenantFinanceStatus;
      mpesa_clearing_account_code?: string;
      fee_control_account_code?: string;
    },
  ): Promise<ResolvedTenantMpesaConfig> {
    const mpesaConfig = await this.repository.upsertMpesaConfig({
      tenant_id: tenantId,
      shortcode: input.shortcode,
      paybill_number: input.paybill_number ?? null,
      till_number: input.till_number ?? null,
      consumer_key: input.consumer_key,
      consumer_secret: input.consumer_secret,
      passkey: input.passkey,
      initiator_name: input.initiator_name ?? null,
      environment: input.environment,
      callback_url: input.callback_url,
      status: input.status ?? 'active',
    });

    if (input.mpesa_clearing_account_code || input.fee_control_account_code) {
      await this.repository.upsertFinancialAccounts({
        tenant_id: tenantId,
        mpesa_clearing_account_code:
          input.mpesa_clearing_account_code ?? '1110-MPESA-CLEARING',
        fee_control_account_code: input.fee_control_account_code ?? '1100-AR-FEES',
        currency_code: 'KES',
      });
    }

    const channel = await this.repository.ensureMpesaPaymentChannel({
      tenant_id: tenantId,
      mpesa_config_id: mpesaConfig.id,
      channel_type: mpesaConfig.till_number ? 'mpesa_till' : 'mpesa_paybill',
      name: mpesaConfig.till_number
        ? `M-PESA Till ${mpesaConfig.till_number}`
        : `M-PESA Paybill ${mpesaConfig.paybill_number ?? mpesaConfig.shortcode}`,
      status: input.status === 'active' || input.status == null ? 'active' : 'inactive',
    });

    await this.auditLogService?.record({
      tenant_id: tenantId,
      action: 'tenant_finance.mpesa_config.upserted',
      resource_type: 'tenant_mpesa_config',
      resource_id: mpesaConfig.id,
      metadata: {
        shortcode: mpesaConfig.shortcode,
        paybill_number: mpesaConfig.paybill_number,
        till_number: mpesaConfig.till_number,
        environment: mpesaConfig.environment,
        channel_id: channel.id,
      },
    });

    return this.resolveMpesaConfigForTenant(tenantId);
  }

  async createBankAccount(
    tenantId: string,
    input: {
      bank_name: string;
      branch_name?: string | null;
      account_name: string;
      account_number: string;
      currency: string;
      status?: TenantFinanceStatus;
    },
  ): Promise<void> {
    const bankAccount = await this.repository.createBankAccount({
      tenant_id: tenantId,
      bank_name: input.bank_name,
      branch_name: input.branch_name ?? null,
      account_name: input.account_name,
      account_number: input.account_number,
      currency: input.currency,
      status: input.status ?? 'active',
    });

    await this.auditLogService?.record({
      tenant_id: tenantId,
      action: 'tenant_finance.bank_account.upserted',
      resource_type: 'tenant_bank_account',
      resource_id: bankAccount.id,
      metadata: {
        bank_name: bankAccount.bank_name,
        branch_name: bankAccount.branch_name,
        account_name: bankAccount.account_name,
        currency: bankAccount.currency,
        status: bankAccount.status,
      },
    });
  }

  async updatePaymentChannelStatus(
    tenantId: string,
    channelId: string,
    status: TenantPaymentChannelStatus,
  ): Promise<void> {
    await this.repository.updatePaymentChannelStatus({
      tenant_id: tenantId,
      channel_id: channelId,
      status,
    });
    await this.auditLogService?.record({
      tenant_id: tenantId,
      action: 'tenant_finance.payment_channel.status_updated',
      resource_type: 'tenant_payment_channel',
      resource_id: channelId,
      metadata: { status },
    });
  }

  private resolveBaseUrl(environment: 'sandbox' | 'production'): string {
    if (environment === 'production') {
      return (
        this.configService.get<string>('mpesa.productionBaseUrl') ??
        'https://api.safaricom.co.ke'
      );
    }

    return (
      this.configService.get<string>('mpesa.sandboxBaseUrl') ??
      this.configService.get<string>('mpesa.baseUrl') ??
      'https://sandbox.safaricom.co.ke'
    );
  }

  private inferEnvironmentFromBaseUrl(value: string): 'sandbox' | 'production' {
    return value.includes('sandbox') ? 'sandbox' : 'production';
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key) ?? '';

    if (value.trim().length === 0) {
      throw new BadGatewayException(`Missing MPESA configuration value "${key}"`);
    }

    return value;
  }
}
