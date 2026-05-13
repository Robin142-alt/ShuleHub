export type TenantFinanceStatus = 'draft' | 'active' | 'inactive' | 'revoked';
export type TenantPaymentChannelStatus = 'active' | 'inactive' | 'testing';
export type TenantMpesaEnvironment = 'sandbox' | 'production';
export type TenantPaymentOwner = 'tenant' | 'platform';
export type TenantPaymentChannelType =
  | 'mpesa_paybill'
  | 'mpesa_till'
  | 'bank_account'
  | 'manual_bank_deposit';

export interface TenantMpesaConfigRecord {
  id: string;
  tenant_id: string;
  shortcode: string;
  paybill_number: string | null;
  till_number: string | null;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
  initiator_name: string | null;
  environment: TenantMpesaEnvironment;
  callback_url: string;
  status: TenantFinanceStatus;
  created_at: Date;
  updated_at: Date;
}

export interface TenantFinancialAccountsRecord {
  tenant_id: string;
  mpesa_clearing_account_code: string;
  fee_control_account_code: string;
  currency_code: string;
}

export interface TenantPaymentChannelRecord {
  id: string;
  tenant_id?: string;
  channel_type: TenantPaymentChannelType;
  name?: string;
  status: TenantPaymentChannelStatus;
}

export interface TenantBankAccountRecord {
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

export interface ResolvedTenantMpesaConfig {
  owner: TenantPaymentOwner;
  tenant_id: string;
  mpesa_config_id: string | null;
  payment_channel_id: string | null;
  shortcode: string;
  paybill_number: string | null;
  till_number: string | null;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
  initiator_name: string | null;
  environment: TenantMpesaEnvironment;
  base_url: string;
  callback_url: string;
  transaction_type: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  ledger_debit_account_code: string;
  ledger_credit_account_code: string;
}

export interface TenantFinanceSummary {
  tenant_id: string;
  mpesa_configs: Array<
    Omit<TenantMpesaConfigRecord, 'consumer_key' | 'consumer_secret' | 'passkey'> & {
      consumer_key_masked: string;
      consumer_secret_masked: string;
      passkey_masked: string;
    }
  >;
  bank_accounts: Array<
    Omit<TenantBankAccountRecord, 'account_number'> & {
      account_number_masked: string;
    }
  >;
  payment_channels: Array<{
    id: string;
    tenant_id: string;
    channel_type: TenantPaymentChannelType;
    name: string;
    mpesa_config_id: string | null;
    bank_account_id: string | null;
    status: TenantPaymentChannelStatus;
    metadata: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }>;
  financial_accounts: TenantFinancialAccountsRecord | null;
  dashboard: {
    todays_collections_minor: string;
    pending_reconciliations: number;
    failed_callbacks: number;
    unmatched_payments: number;
    mpesa_status: 'active' | 'inactive';
    reconciliation_status: 'balanced' | 'attention_required';
  };
}
