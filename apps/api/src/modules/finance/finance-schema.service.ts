import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AuthSchemaService } from '../../auth/auth-schema.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class FinanceSchemaService implements OnModuleInit {
  private readonly logger = new Logger(FinanceSchemaService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authSchemaService: AuthSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.authSchemaService.onModuleInit();

    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE SCHEMA IF NOT EXISTS app;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid,
        scope text NOT NULL DEFAULT 'http',
        idempotency_key text NOT NULL,
        request_method text NOT NULL,
        request_path text NOT NULL,
        request_hash text NOT NULL,
        status text NOT NULL DEFAULT 'in_progress',
        response_status_code integer,
        response_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
        response_body jsonb,
        locked_at timestamptz,
        completed_at timestamptz,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_idempotency_keys_scope_not_blank CHECK (btrim(scope) <> ''),
        CONSTRAINT ck_idempotency_keys_key_not_blank CHECK (btrim(idempotency_key) <> ''),
        CONSTRAINT ck_idempotency_keys_method_format CHECK (request_method ~ '^[A-Z]+$'),
        CONSTRAINT ck_idempotency_keys_path_not_blank CHECK (btrim(request_path) <> ''),
        CONSTRAINT ck_idempotency_keys_request_hash_not_blank CHECK (btrim(request_hash) <> ''),
        CONSTRAINT ck_idempotency_keys_status CHECK (status IN ('in_progress', 'completed', 'failed', 'expired')),
        CONSTRAINT ck_idempotency_keys_response_status_code
          CHECK (response_status_code IS NULL OR response_status_code BETWEEN 100 AND 599),
        CONSTRAINT uq_idempotency_keys_tenant_scope_key UNIQUE (tenant_id, scope, idempotency_key),
        CONSTRAINT fk_idempotency_keys_user
          FOREIGN KEY (user_id)
          REFERENCES users (id)
          ON DELETE SET NULL
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_idempotency_keys_tenant_id_id'
        ) THEN
          ALTER TABLE idempotency_keys
          ADD CONSTRAINT uq_idempotency_keys_tenant_id_id UNIQUE (tenant_id, id);
        END IF;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.prevent_append_only_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'append-only table "%" cannot be %', TG_TABLE_NAME, lower(TG_OP)
          USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION app.validate_financial_transaction_balance()
      RETURNS trigger AS $$
      DECLARE
        target_tenant_id text;
        target_transaction_id uuid;
        entry_count integer;
        debit_total bigint;
        credit_total bigint;
        currency_count integer;
      BEGIN
        target_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

        IF TG_TABLE_NAME = 'transactions' THEN
          target_transaction_id := COALESCE(NEW.id, OLD.id);
        ELSE
          target_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
        END IF;

        SELECT
          COUNT(*)::integer,
          COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE 0 END), 0)::bigint,
          COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE 0 END), 0)::bigint,
          COUNT(DISTINCT currency_code)::integer
        INTO entry_count, debit_total, credit_total, currency_count
        FROM ledger_entries
        WHERE tenant_id = target_tenant_id
          AND transaction_id = target_transaction_id;

        IF entry_count < 2 THEN
          RAISE EXCEPTION 'financial transaction "%" must have at least two ledger entries', target_transaction_id
            USING ERRCODE = '23514';
        END IF;

        IF currency_count <> 1 THEN
          RAISE EXCEPTION 'financial transaction "%" must use exactly one currency', target_transaction_id
            USING ERRCODE = '23514';
        END IF;

        IF debit_total <> credit_total THEN
          RAISE EXCEPTION 'financial transaction "%" is unbalanced: debits (%) do not equal credits (%)',
            target_transaction_id, debit_total, credit_total
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        category text NOT NULL,
        normal_balance text NOT NULL,
        currency_code char(3) NOT NULL,
        allow_manual_entries boolean NOT NULL DEFAULT TRUE,
        is_active boolean NOT NULL DEFAULT TRUE,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_accounts_category CHECK (category IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
        CONSTRAINT ck_accounts_normal_balance CHECK (normal_balance IN ('debit', 'credit')),
        CONSTRAINT ck_accounts_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT uq_accounts_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_accounts_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        idempotency_key_id uuid NOT NULL,
        reference text NOT NULL,
        description text NOT NULL,
        currency_code char(3) NOT NULL,
        total_amount_minor bigint NOT NULL,
        entry_count integer NOT NULL,
        effective_at timestamptz NOT NULL DEFAULT NOW(),
        posted_at timestamptz NOT NULL DEFAULT NOW(),
        created_by_user_id uuid,
        request_id text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_transactions_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_transactions_total_amount_minor CHECK (total_amount_minor > 0),
        CONSTRAINT ck_transactions_entry_count CHECK (entry_count >= 2),
        CONSTRAINT uq_transactions_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_transactions_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key_id),
        CONSTRAINT uq_transactions_tenant_reference UNIQUE (tenant_id, reference),
        CONSTRAINT fk_transactions_idempotency_key
          FOREIGN KEY (tenant_id, idempotency_key_id)
          REFERENCES idempotency_keys (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_transactions_created_by_user
          FOREIGN KEY (created_by_user_id)
          REFERENCES users (id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        transaction_id uuid NOT NULL,
        account_id uuid NOT NULL,
        line_number integer NOT NULL,
        direction text NOT NULL,
        amount_minor bigint NOT NULL,
        currency_code char(3) NOT NULL,
        description text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_ledger_entries_direction CHECK (direction IN ('debit', 'credit')),
        CONSTRAINT ck_ledger_entries_amount_minor CHECK (amount_minor > 0),
        CONSTRAINT ck_ledger_entries_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT uq_ledger_entries_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_ledger_entries_transaction_line UNIQUE (tenant_id, transaction_id, line_number),
        CONSTRAINT fk_ledger_entries_transaction
          FOREIGN KEY (tenant_id, transaction_id)
          REFERENCES transactions (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_ledger_entries_account
          FOREIGN KEY (tenant_id, account_id)
          REFERENCES accounts (tenant_id, id)
          ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS ix_accounts_tenant_category_active
        ON accounts (tenant_id, category, is_active);
      CREATE INDEX IF NOT EXISTS ix_accounts_tenant_name
        ON accounts (tenant_id, name);
      CREATE INDEX IF NOT EXISTS ix_idempotency_keys_lookup
        ON idempotency_keys (tenant_id, scope, idempotency_key);
      CREATE INDEX IF NOT EXISTS ix_idempotency_keys_user_status
        ON idempotency_keys (tenant_id, user_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_idempotency_keys_expires_at
        ON idempotency_keys (tenant_id, expires_at);
      CREATE INDEX IF NOT EXISTS ix_transactions_tenant_posted_at
        ON transactions (tenant_id, posted_at DESC);
      CREATE INDEX IF NOT EXISTS ix_transactions_tenant_effective_at
        ON transactions (tenant_id, effective_at DESC);
      CREATE INDEX IF NOT EXISTS ix_transactions_created_by_user
        ON transactions (tenant_id, created_by_user_id, posted_at DESC);
      CREATE INDEX IF NOT EXISTS ix_ledger_entries_account_created_at
        ON ledger_entries (tenant_id, account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_ledger_entries_transaction
        ON ledger_entries (tenant_id, transaction_id, line_number);

      ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
      ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
      ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
      ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
      ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS idempotency_keys_rls_policy ON idempotency_keys;
      CREATE POLICY idempotency_keys_rls_policy ON idempotency_keys
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS accounts_rls_policy ON accounts;
      CREATE POLICY accounts_rls_policy ON accounts
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS transactions_rls_policy ON transactions;
      CREATE POLICY transactions_rls_policy ON transactions
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS ledger_entries_rls_policy ON ledger_entries;
      CREATE POLICY ledger_entries_rls_policy ON ledger_entries
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_idempotency_keys_set_updated_at ON idempotency_keys;
      CREATE TRIGGER trg_idempotency_keys_set_updated_at
      BEFORE UPDATE ON idempotency_keys
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_accounts_set_updated_at ON accounts;
      CREATE TRIGGER trg_accounts_set_updated_at
      BEFORE UPDATE ON accounts
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_transactions_prevent_update ON transactions;
      CREATE TRIGGER trg_transactions_prevent_update
      BEFORE UPDATE OR DELETE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_append_only_mutation();

      DROP TRIGGER IF EXISTS trg_ledger_entries_prevent_update ON ledger_entries;
      CREATE TRIGGER trg_ledger_entries_prevent_update
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_append_only_mutation();

      DROP TRIGGER IF EXISTS trg_transactions_validate_balance ON transactions;
      CREATE CONSTRAINT TRIGGER trg_transactions_validate_balance
      AFTER INSERT ON transactions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION app.validate_financial_transaction_balance();

      DROP TRIGGER IF EXISTS trg_ledger_entries_validate_balance ON ledger_entries;
      CREATE CONSTRAINT TRIGGER trg_ledger_entries_validate_balance
      AFTER INSERT ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION app.validate_financial_transaction_balance();
    `);

    this.logger.log('Financial schema and ledger invariants verified');
  }
}
