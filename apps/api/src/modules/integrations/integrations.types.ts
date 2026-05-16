export type SmsProviderCode = 'textsms_kenya' | 'africas_talking' | 'twilio';
export type SmsLogStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'rejected';
export type DarajaEnvironment = 'sandbox' | 'production';

export interface PlatformSmsProviderRecord {
  id: string;
  provider_name: string;
  provider_code: SmsProviderCode;
  api_key_ciphertext: string;
  username_ciphertext: string | null;
  sender_id: string;
  base_url: string | null;
  is_active: boolean;
  is_default: boolean;
  last_test_status: string | null;
  last_tested_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface PlatformSmsProviderResponse {
  id: string;
  provider_name: string;
  provider_code: SmsProviderCode;
  api_key_masked: string;
  username_masked: string | null;
  sender_id: string;
  base_url: string | null;
  is_active: boolean;
  is_default: boolean;
  last_test_status: string | null;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsWalletRecord {
  id: string;
  tenant_id: string;
  sms_balance: number;
  monthly_used: number;
  monthly_limit: number | null;
  sms_plan: string;
  low_balance_threshold: number;
  allow_negative_balance: boolean;
  billing_status: string;
  last_reset_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ReservedSmsCredits {
  accepted: boolean;
  reason?: string;
  log_id: string;
  balance_after: number;
  credit_cost?: number;
}

export interface DarajaIntegrationRecord {
  id: string;
  tenant_id: string;
  integration_type: 'mpesa_daraja';
  paybill_number: string | null;
  till_number: string | null;
  shortcode: string | null;
  consumer_key_ciphertext: string | null;
  consumer_secret_ciphertext: string | null;
  passkey_ciphertext: string | null;
  environment: DarajaEnvironment;
  callback_url: string | null;
  is_active: boolean;
  last_test_status: string | null;
  last_tested_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface DarajaIntegrationResponse {
  id: string;
  tenant_id: string;
  integration_type: 'mpesa_daraja';
  paybill_number: string | null;
  till_number: string | null;
  shortcode: string | null;
  consumer_key_masked: string | null;
  consumer_secret_masked: string | null;
  passkey_masked: string | null;
  environment: DarajaEnvironment;
  callback_url: string | null;
  is_active: boolean;
  last_test_status: string | null;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentAuthSubject {
  user_id: string;
  tenant_id: string;
  role_id: string;
  role_code: string;
  email: string;
  display_name: string;
  phone_number_hash: string | null;
  phone_number_last4: string | null;
}

export interface ParentOtpChallengeRecord {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string | null;
  phone_hash: string | null;
  phone_last4: string | null;
  otp_hash: string;
  expires_at: string | Date;
  consumed_at: string | Date | null;
  attempts: number;
}
