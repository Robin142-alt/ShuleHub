import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

const TENANT_TABLES = [
  'school_sms_wallets',
  'sms_logs',
  'sms_wallet_transactions',
  'sms_purchase_requests',
  'school_integrations',
  'integration_logs',
  'school_onboarding_status',
  'parent_otp_challenges',
] as const;

@Injectable()
export class IntegrationsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS platform_sms_providers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_name text NOT NULL,
        provider_code text NOT NULL CHECK (provider_code IN ('textsms_kenya', 'africas_talking', 'twilio')),
        api_key_ciphertext text NOT NULL,
        username_ciphertext text,
        sender_id text NOT NULL,
        base_url text,
        is_active boolean NOT NULL DEFAULT FALSE,
        is_default boolean NOT NULL DEFAULT FALSE,
        last_test_status text,
        last_tested_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_platform_sms_sender_not_blank CHECK (btrim(sender_id) <> ''),
        CONSTRAINT uq_platform_sms_provider_code UNIQUE (provider_code)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_sms_default_provider
        ON platform_sms_providers ((is_default))
        WHERE is_default = TRUE;

      CREATE TABLE IF NOT EXISTS school_sms_wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        sms_balance integer NOT NULL DEFAULT 0,
        monthly_used integer NOT NULL DEFAULT 0,
        monthly_limit integer,
        sms_plan text NOT NULL DEFAULT 'starter',
        low_balance_threshold integer NOT NULL DEFAULT 100,
        allow_negative_balance boolean NOT NULL DEFAULT FALSE,
        billing_status text NOT NULL DEFAULT 'active',
        last_reset_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_school_sms_wallets_tenant UNIQUE (tenant_id),
        CONSTRAINT ck_school_sms_wallets_monthly_used_non_negative CHECK (monthly_used >= 0),
        CONSTRAINT ck_school_sms_wallets_balance_policy CHECK (allow_negative_balance OR sms_balance >= 0)
      );

      CREATE TABLE IF NOT EXISTS sms_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        provider_id uuid REFERENCES platform_sms_providers(id) ON DELETE SET NULL,
        recipient_ciphertext text NOT NULL,
        recipient_last4 text,
        recipient_hash text NOT NULL,
        message_ciphertext text,
        message_preview text,
        message_type text,
        status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'rejected')),
        credit_cost integer NOT NULL DEFAULT 1,
        provider_message_id text,
        failure_reason text,
        sent_by_user_id uuid,
        sent_at timestamptz,
        delivered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sms_wallet_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'adjustment', 'deduction', 'refund')),
        quantity integer NOT NULL,
        balance_after integer NOT NULL,
        reference text,
        reason text,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sms_purchase_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        quantity integer NOT NULL CHECK (quantity > 0),
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
        note text,
        requested_by_user_id uuid,
        reviewed_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS school_integrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        integration_type text NOT NULL CHECK (integration_type IN ('mpesa_daraja')),
        paybill_number text,
        till_number text,
        shortcode text,
        consumer_key_ciphertext text,
        consumer_secret_ciphertext text,
        passkey_ciphertext text,
        environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
        callback_url text,
        callback_secret_hash text,
        is_active boolean NOT NULL DEFAULT FALSE,
        last_test_status text,
        last_tested_at timestamptz,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_school_integrations_tenant_type_environment UNIQUE (tenant_id, integration_type, environment)
      );

      CREATE INDEX IF NOT EXISTS ix_school_integrations_shortcode
        ON school_integrations (shortcode)
        WHERE shortcode IS NOT NULL;

      CREATE TABLE IF NOT EXISTS integration_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text,
        integration_type text NOT NULL,
        operation text NOT NULL,
        status text NOT NULL,
        provider_reference text,
        error_message text,
        request_id text,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS school_onboarding_status (
        tenant_id text PRIMARY KEY,
        school_info_completed_at timestamptz,
        admin_account_completed_at timestamptz,
        daraja_setup_status text NOT NULL DEFAULT 'pending' CHECK (daraja_setup_status IN ('pending', 'skipped', 'complete')),
        sms_plan_status text NOT NULL DEFAULT 'pending' CHECK (sms_plan_status IN ('pending', 'complete')),
        overall_status text NOT NULL DEFAULT 'pending_setup' CHECK (overall_status IN ('pending_setup', 'partially_configured', 'fully_configured')),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS parent_otp_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid,
        phone_hash text,
        phone_last4 text,
        email text,
        otp_hash text NOT NULL,
        purpose text NOT NULL DEFAULT 'parent_login',
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS ix_sms_logs_tenant_created ON sms_logs (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_sms_logs_tenant_status_created ON sms_logs (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_sms_wallet_transactions_tenant_created ON sms_wallet_transactions (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_school_integrations_tenant_active ON school_integrations (tenant_id, integration_type, is_active);
      CREATE INDEX IF NOT EXISTS ix_integration_logs_tenant_created ON integration_logs (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_parent_otp_challenges_phone_hash ON parent_otp_challenges (tenant_id, phone_hash, created_at DESC);

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS phone_number_ciphertext text,
        ADD COLUMN IF NOT EXISTS phone_number_hash text,
        ADD COLUMN IF NOT EXISTS phone_number_last4 text;

      CREATE INDEX IF NOT EXISTS ix_users_phone_number_hash
        ON users (phone_number_hash)
        WHERE phone_number_hash IS NOT NULL;

      ALTER TABLE library_copies
        ADD COLUMN IF NOT EXISTS barcode text,
        ADD COLUMN IF NOT EXISTS qr_code text,
        ADD COLUMN IF NOT EXISTS shelf_location text;

      ALTER TABLE library_catalog_items
        ADD COLUMN IF NOT EXISTS category text;

      CREATE UNIQUE INDEX IF NOT EXISTS ux_library_copies_tenant_barcode
        ON library_copies (tenant_id, barcode)
        WHERE barcode IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_library_copies_tenant_qr_code
        ON library_copies (tenant_id, qr_code)
        WHERE qr_code IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_library_copies_tenant_accession
        ON library_copies (tenant_id, accession_number);

      ${TENANT_TABLES.map((table) => `
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS ${table}_rls_policy ON ${table};
        CREATE POLICY ${table}_rls_policy ON ${table}
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      `).join('\n')}

      CREATE SCHEMA IF NOT EXISTS app;
      CREATE OR REPLACE FUNCTION app.find_daraja_integration_by_id_for_callback(input_integration_id uuid)
      RETURNS TABLE (
        id uuid,
        tenant_id text,
        integration_type text,
        paybill_number text,
        till_number text,
        shortcode text,
        consumer_key_ciphertext text,
        consumer_secret_ciphertext text,
        passkey_ciphertext text,
        environment text,
        callback_url text,
        is_active boolean,
        last_test_status text,
        last_tested_at timestamptz,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_user_id text;
        request_path text;
      BEGIN
        request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

        IF request_user_id <> 'anonymous' THEN
          RAISE EXCEPTION 'Daraja callback integration lookup is only available before authentication'
            USING ERRCODE = '42501';
        END IF;

        IF request_path NOT LIKE '/payments/mpesa/callback/%'
           AND request_path NOT LIKE '/mpesa/callback/%' THEN
          RAISE EXCEPTION 'Daraja callback integration lookup is only available on callback routes'
            USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          si.id,
          si.tenant_id,
          si.integration_type,
          si.paybill_number,
          si.till_number,
          si.shortcode,
          si.consumer_key_ciphertext,
          si.consumer_secret_ciphertext,
          si.passkey_ciphertext,
          si.environment,
          si.callback_url,
          si.is_active,
          si.last_test_status,
          si.last_tested_at,
          si.created_at,
          si.updated_at
        FROM school_integrations si
        WHERE si.id = input_integration_id
          AND si.integration_type = 'mpesa_daraja'
        LIMIT 1;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.find_parent_auth_subject_for_otp(
        input_identifier text,
        input_phone_hash text
      )
      RETURNS TABLE (
        user_id uuid,
        tenant_id text,
        role_id uuid,
        role_code text,
        email text,
        display_name text,
        phone_number_hash text,
        phone_number_last4 text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_user_id text;
        request_path text;
      BEGIN
        request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

        IF request_user_id <> 'anonymous' THEN
          RAISE EXCEPTION 'Parent OTP lookup is only available before authentication'
            USING ERRCODE = '42501';
        END IF;

        IF request_path NOT IN ('/auth/parent/otp/request', '/auth/parent/otp/verify') THEN
          RAISE EXCEPTION 'Parent OTP lookup is only available on parent OTP routes'
            USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          u.id AS user_id,
          tm.tenant_id,
          tm.role_id,
          r.code AS role_code,
          u.email::text,
          u.display_name,
          u.phone_number_hash,
          u.phone_number_last4
        FROM users u
        INNER JOIN tenant_memberships tm
          ON tm.user_id = u.id
         AND tm.status = 'active'
        INNER JOIN roles r
          ON r.tenant_id = tm.tenant_id
         AND r.id = tm.role_id
         AND r.code = 'parent'
        WHERE u.status = 'active'
          AND (
            lower(u.email::text) = lower(input_identifier)
            OR (
              input_phone_hash IS NOT NULL
              AND u.phone_number_hash = input_phone_hash
            )
          )
        ORDER BY tm.created_at DESC
        LIMIT 1;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.find_parent_otp_challenge_for_verify(input_challenge_id uuid)
      RETURNS TABLE (
        id uuid,
        tenant_id text,
        user_id uuid,
        email text,
        phone_hash text,
        phone_last4 text,
        otp_hash text,
        expires_at timestamptz,
        consumed_at timestamptz,
        attempts integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_user_id text;
        request_path text;
      BEGIN
        request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

        IF request_user_id <> 'anonymous' THEN
          RAISE EXCEPTION 'Parent OTP verification is only available before authentication'
            USING ERRCODE = '42501';
        END IF;

        IF request_path <> '/auth/parent/otp/verify' THEN
          RAISE EXCEPTION 'Parent OTP verification is only available on parent OTP verify routes'
            USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          c.id,
          c.tenant_id,
          c.user_id,
          c.email,
          c.phone_hash,
          c.phone_last4,
          c.otp_hash,
          c.expires_at,
          c.consumed_at,
          c.attempts
        FROM parent_otp_challenges c
        WHERE c.id = input_challenge_id
        LIMIT 1;
      END;
      $$;
    `);

    this.logger.log('Integrations schema verified');
  }
}
