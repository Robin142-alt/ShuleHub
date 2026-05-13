import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AuthSchemaService } from '../../auth/auth-schema.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TenantFinanceSchemaService implements OnModuleInit {
  private readonly logger = new Logger(TenantFinanceSchemaService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authSchemaService: AuthSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.authSchemaService.onModuleInit();

    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS tenant_financial_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        mpesa_clearing_account_code text NOT NULL DEFAULT '1110-MPESA-CLEARING',
        fee_control_account_code text NOT NULL DEFAULT '1100-AR-FEES',
        currency_code char(3) NOT NULL DEFAULT 'KES',
        status text NOT NULL DEFAULT 'active',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_tenant_financial_accounts_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_tenant_financial_accounts_status CHECK (status IN ('draft', 'active', 'inactive', 'revoked')),
        CONSTRAINT uq_tenant_financial_accounts_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_financial_accounts_active_tenant
        ON tenant_financial_accounts (tenant_id)
        WHERE status = 'active';

      CREATE TABLE IF NOT EXISTS tenant_mpesa_configs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        shortcode text NOT NULL,
        paybill_number text,
        till_number text,
        consumer_key text NOT NULL,
        consumer_secret text NOT NULL,
        passkey text NOT NULL,
        initiator_name text,
        environment text NOT NULL DEFAULT 'sandbox',
        callback_url text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        credential_version integer NOT NULL DEFAULT 1,
        rotated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_tenant_mpesa_configs_shortcode_not_blank CHECK (btrim(shortcode) <> ''),
        CONSTRAINT ck_tenant_mpesa_configs_receiving_channel CHECK (
          paybill_number IS NOT NULL OR till_number IS NOT NULL
        ),
        CONSTRAINT ck_tenant_mpesa_configs_environment CHECK (environment IN ('sandbox', 'production')),
        CONSTRAINT ck_tenant_mpesa_configs_status CHECK (status IN ('draft', 'active', 'inactive', 'revoked')),
        CONSTRAINT ck_tenant_mpesa_configs_callback_url CHECK (callback_url ~ '^https://'),
        CONSTRAINT ck_tenant_mpesa_configs_credential_version CHECK (credential_version > 0),
        CONSTRAINT uq_tenant_mpesa_configs_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE INDEX IF NOT EXISTS ix_tenant_mpesa_configs_tenant_status
        ON tenant_mpesa_configs (tenant_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_tenant_mpesa_configs_shortcode
        ON tenant_mpesa_configs (shortcode);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_mpesa_configs_tenant_shortcode
        ON tenant_mpesa_configs (tenant_id, shortcode);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_mpesa_configs_active_shortcode
        ON tenant_mpesa_configs (shortcode)
        WHERE status = 'active';

      CREATE TABLE IF NOT EXISTS tenant_bank_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        bank_name text NOT NULL,
        branch_name text,
        account_name text NOT NULL,
        account_number text NOT NULL,
        account_number_hash text NOT NULL,
        currency char(3) NOT NULL DEFAULT 'KES',
        status text NOT NULL DEFAULT 'active',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_tenant_bank_accounts_bank_name_not_blank CHECK (btrim(bank_name) <> ''),
        CONSTRAINT ck_tenant_bank_accounts_account_name_not_blank CHECK (btrim(account_name) <> ''),
        CONSTRAINT ck_tenant_bank_accounts_currency CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_tenant_bank_accounts_status CHECK (status IN ('draft', 'active', 'inactive', 'revoked')),
        CONSTRAINT uq_tenant_bank_accounts_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_tenant_bank_accounts_tenant_account_hash UNIQUE (tenant_id, account_number_hash)
      );

      CREATE INDEX IF NOT EXISTS ix_tenant_bank_accounts_tenant_status
        ON tenant_bank_accounts (tenant_id, status, bank_name);

      CREATE TABLE IF NOT EXISTS tenant_payment_channels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        channel_type text NOT NULL,
        name text NOT NULL,
        mpesa_config_id uuid,
        bank_account_id uuid,
        status text NOT NULL DEFAULT 'inactive',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_tenant_payment_channels_type CHECK (
          channel_type IN ('mpesa_paybill', 'mpesa_till', 'bank_account', 'manual_bank_deposit')
        ),
        CONSTRAINT ck_tenant_payment_channels_status CHECK (status IN ('active', 'inactive', 'testing')),
        CONSTRAINT ck_tenant_payment_channels_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_tenant_payment_channels_target CHECK (
          (channel_type IN ('mpesa_paybill', 'mpesa_till') AND mpesa_config_id IS NOT NULL)
          OR (channel_type IN ('bank_account', 'manual_bank_deposit') AND bank_account_id IS NOT NULL)
        ),
        CONSTRAINT uq_tenant_payment_channels_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_tenant_payment_channels_mpesa_config
          FOREIGN KEY (tenant_id, mpesa_config_id)
          REFERENCES tenant_mpesa_configs (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_tenant_payment_channels_bank_account
          FOREIGN KEY (tenant_id, bank_account_id)
          REFERENCES tenant_bank_accounts (tenant_id, id)
          ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS ix_tenant_payment_channels_tenant_status
        ON tenant_payment_channels (tenant_id, status, channel_type);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_payment_channels_active_mpesa_config
        ON tenant_payment_channels (tenant_id, mpesa_config_id)
        WHERE status = 'active' AND mpesa_config_id IS NOT NULL;

      ALTER TABLE tenant_financial_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_financial_accounts FORCE ROW LEVEL SECURITY;
      ALTER TABLE tenant_mpesa_configs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_mpesa_configs FORCE ROW LEVEL SECURITY;
      ALTER TABLE tenant_bank_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_bank_accounts FORCE ROW LEVEL SECURITY;
      ALTER TABLE tenant_payment_channels ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_payment_channels FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_financial_accounts_rls_policy ON tenant_financial_accounts;
      CREATE POLICY tenant_financial_accounts_rls_policy ON tenant_financial_accounts
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS tenant_mpesa_configs_rls_policy ON tenant_mpesa_configs;
      CREATE POLICY tenant_mpesa_configs_rls_policy ON tenant_mpesa_configs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS tenant_bank_accounts_rls_policy ON tenant_bank_accounts;
      CREATE POLICY tenant_bank_accounts_rls_policy ON tenant_bank_accounts
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS tenant_payment_channels_rls_policy ON tenant_payment_channels;
      CREATE POLICY tenant_payment_channels_rls_policy ON tenant_payment_channels
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_tenant_financial_accounts_set_updated_at ON tenant_financial_accounts;
      CREATE TRIGGER trg_tenant_financial_accounts_set_updated_at
      BEFORE UPDATE ON tenant_financial_accounts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_tenant_mpesa_configs_set_updated_at ON tenant_mpesa_configs;
      CREATE TRIGGER trg_tenant_mpesa_configs_set_updated_at
      BEFORE UPDATE ON tenant_mpesa_configs
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_tenant_bank_accounts_set_updated_at ON tenant_bank_accounts;
      CREATE TRIGGER trg_tenant_bank_accounts_set_updated_at
      BEFORE UPDATE ON tenant_bank_accounts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_tenant_payment_channels_set_updated_at ON tenant_payment_channels;
      CREATE TRIGGER trg_tenant_payment_channels_set_updated_at
      BEFORE UPDATE ON tenant_payment_channels
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Tenant-owned finance configuration schema and RLS policies verified');
  }
}
