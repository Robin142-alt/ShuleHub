import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AuthSchemaService } from '../../auth/auth-schema.service';
import { DatabaseService } from '../../database/database.service';
import { FinanceSchemaService } from '../finance/finance-schema.service';
import { TenantFinanceSchemaService } from '../tenant-finance/tenant-finance-schema.service';

@Injectable()
export class PaymentsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsSchemaService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authSchemaService: AuthSchemaService,
    private readonly financeSchemaService: FinanceSchemaService,
    private readonly tenantFinanceSchemaService: TenantFinanceSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.authSchemaService.onModuleInit();
    await this.financeSchemaService.onModuleInit();
    await this.tenantFinanceSchemaService.onModuleInit();

    await this.databaseService.runSchemaBootstrap(`
      CREATE TABLE IF NOT EXISTS payment_intents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        idempotency_key_id uuid NOT NULL,
        user_id uuid,
        student_id uuid,
        request_id text,
        external_reference text,
        account_reference text NOT NULL,
        transaction_desc text NOT NULL,
        phone_number text NOT NULL,
        amount_minor bigint NOT NULL,
        currency_code char(3) NOT NULL DEFAULT 'KES',
        payment_owner text NOT NULL DEFAULT 'tenant',
        mpesa_config_id uuid,
        payment_channel_id uuid,
        mpesa_short_code text,
        payment_channel_type text,
        ledger_debit_account_code text,
        ledger_credit_account_code text,
        status text NOT NULL DEFAULT 'pending',
        merchant_request_id text,
        checkout_request_id text,
        response_code text,
        response_description text,
        customer_message text,
        ledger_transaction_id uuid,
        failure_reason text,
        stk_requested_at timestamptz,
        callback_received_at timestamptz,
        completed_at timestamptz,
        expires_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_payment_intents_amount_minor CHECK (amount_minor > 0),
        CONSTRAINT ck_payment_intents_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_payment_intents_owner CHECK (payment_owner IN ('tenant', 'platform')),
        CONSTRAINT ck_payment_intents_status CHECK (
          status IN ('pending', 'stk_requested', 'callback_received', 'processing', 'completed', 'failed', 'cancelled', 'expired')
        ),
        CONSTRAINT uq_payment_intents_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_payment_intents_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key_id),
        CONSTRAINT uq_payment_intents_tenant_checkout_request_id UNIQUE (tenant_id, checkout_request_id),
        CONSTRAINT uq_payment_intents_tenant_merchant_request_id UNIQUE (tenant_id, merchant_request_id),
        CONSTRAINT fk_payment_intents_idempotency_key
          FOREIGN KEY (tenant_id, idempotency_key_id)
          REFERENCES idempotency_keys (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_payment_intents_user
          FOREIGN KEY (user_id)
          REFERENCES users (id)
          ON DELETE SET NULL,
        CONSTRAINT fk_payment_intents_ledger_transaction
          FOREIGN KEY (tenant_id, ledger_transaction_id)
          REFERENCES transactions (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS callback_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        merchant_request_id text,
        checkout_request_id text,
        mpesa_short_code text,
        delivery_id text NOT NULL,
        request_fingerprint text NOT NULL,
        event_timestamp timestamptz,
        signature text,
        signature_verified boolean NOT NULL DEFAULT FALSE,
        headers jsonb NOT NULL DEFAULT '{}'::jsonb,
        raw_body text NOT NULL,
        raw_payload jsonb,
        source_ip inet,
        processing_status text NOT NULL DEFAULT 'received',
        queue_job_id text,
        failure_reason text,
        queued_at timestamptz,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_callback_logs_delivery_id_not_blank CHECK (btrim(delivery_id) <> ''),
        CONSTRAINT ck_callback_logs_request_fingerprint_not_blank CHECK (btrim(request_fingerprint) <> ''),
        CONSTRAINT ck_callback_logs_processing_status CHECK (
          processing_status IN ('received', 'queued', 'processing', 'processed', 'failed', 'rejected', 'replayed')
        ),
        CONSTRAINT uq_callback_logs_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        payment_intent_id uuid NOT NULL,
        callback_log_id uuid NOT NULL,
        checkout_request_id text NOT NULL,
        merchant_request_id text NOT NULL,
        result_code integer NOT NULL,
        result_desc text NOT NULL,
        status text NOT NULL,
        transaction_id text,
        mpesa_short_code text,
        mpesa_receipt_number text,
        amount_minor bigint,
        phone_number text,
        raw_payload jsonb,
        transaction_occurred_at timestamptz,
        ledger_transaction_id uuid,
        processed_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_mpesa_transactions_status CHECK (status IN ('succeeded', 'failed')),
        CONSTRAINT uq_mpesa_transactions_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_mpesa_transactions_tenant_checkout_request_id UNIQUE (tenant_id, checkout_request_id),
        CONSTRAINT fk_mpesa_transactions_payment_intent
          FOREIGN KEY (tenant_id, payment_intent_id)
          REFERENCES payment_intents (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_mpesa_transactions_callback_log
          FOREIGN KEY (tenant_id, callback_log_id)
          REFERENCES callback_logs (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_mpesa_transactions_ledger_transaction
          FOREIGN KEY (tenant_id, ledger_transaction_id)
          REFERENCES transactions (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS mpesa_c2b_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        mpesa_config_id uuid,
        payment_channel_id uuid,
        trans_id text NOT NULL,
        transaction_type text NOT NULL,
        business_short_code text NOT NULL,
        bill_ref_number text,
        invoice_number text,
        amount_minor bigint NOT NULL,
        currency_code char(3) NOT NULL DEFAULT 'KES',
        phone_number text,
        payer_name text,
        org_account_balance text,
        third_party_trans_id text,
        status text NOT NULL DEFAULT 'pending_review',
        matched_invoice_id uuid,
        matched_student_id uuid,
        manual_fee_payment_id uuid,
        ledger_transaction_id uuid,
        received_at timestamptz NOT NULL,
        matched_at timestamptz,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_mpesa_c2b_payments_trans_id_not_blank CHECK (btrim(trans_id) <> ''),
        CONSTRAINT ck_mpesa_c2b_payments_business_short_code_not_blank CHECK (btrim(business_short_code) <> ''),
        CONSTRAINT ck_mpesa_c2b_payments_amount_minor CHECK (amount_minor > 0),
        CONSTRAINT ck_mpesa_c2b_payments_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_mpesa_c2b_payments_status CHECK (status IN ('pending_review', 'matched', 'rejected')),
        CONSTRAINT uq_mpesa_c2b_payments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_mpesa_c2b_payments_tenant_trans_id UNIQUE (tenant_id, trans_id),
        CONSTRAINT fk_mpesa_c2b_payments_mpesa_config
          FOREIGN KEY (tenant_id, mpesa_config_id)
          REFERENCES tenant_mpesa_configs (tenant_id, id)
          ON DELETE SET NULL,
        CONSTRAINT fk_mpesa_c2b_payments_payment_channel
          FOREIGN KEY (tenant_id, payment_channel_id)
          REFERENCES tenant_payment_channels (tenant_id, id)
          ON DELETE SET NULL,
        CONSTRAINT fk_mpesa_c2b_payments_ledger_transaction
          FOREIGN KEY (tenant_id, ledger_transaction_id)
          REFERENCES transactions (tenant_id, id)
          ON DELETE SET NULL
      );

      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS student_id uuid;

      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS payment_owner text NOT NULL DEFAULT 'tenant';
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS mpesa_config_id uuid;
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS payment_channel_id uuid;
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS mpesa_short_code text;
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS payment_channel_type text;
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS ledger_debit_account_code text;
      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS ledger_credit_account_code text;

      ALTER TABLE callback_logs
      ADD COLUMN IF NOT EXISTS mpesa_short_code text;

      ALTER TABLE mpesa_transactions
      ADD COLUMN IF NOT EXISTS raw_payload jsonb;
      ALTER TABLE mpesa_transactions
      ADD COLUMN IF NOT EXISTS transaction_id text;
      ALTER TABLE mpesa_transactions
      ADD COLUMN IF NOT EXISTS mpesa_short_code text;

      ALTER TABLE mpesa_c2b_payments
      ADD COLUMN IF NOT EXISTS invoice_number text;
      ALTER TABLE mpesa_c2b_payments
      ADD COLUMN IF NOT EXISTS matched_student_id uuid;
      ALTER TABLE mpesa_c2b_payments
      ADD COLUMN IF NOT EXISTS manual_fee_payment_id uuid;

      DO $$
      BEGIN
        IF to_regclass('public.students') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_payment_intents_student'
          ) THEN
          ALTER TABLE payment_intents
          ADD CONSTRAINT fk_payment_intents_student
            FOREIGN KEY (tenant_id, student_id)
            REFERENCES students (tenant_id, id)
            ON DELETE SET NULL;
        END IF;
      END;
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'ck_payment_intents_owner'
        ) THEN
          ALTER TABLE payment_intents
          ADD CONSTRAINT ck_payment_intents_owner
            CHECK (payment_owner IN ('tenant', 'platform'));
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_payment_intents_mpesa_config'
        ) THEN
          ALTER TABLE payment_intents
          ADD CONSTRAINT fk_payment_intents_mpesa_config
            FOREIGN KEY (tenant_id, mpesa_config_id)
            REFERENCES tenant_mpesa_configs (tenant_id, id)
            ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_payment_intents_payment_channel'
        ) THEN
          ALTER TABLE payment_intents
          ADD CONSTRAINT fk_payment_intents_payment_channel
            FOREIGN KEY (tenant_id, payment_channel_id)
            REFERENCES tenant_payment_channels (tenant_id, id)
            ON DELETE RESTRICT;
        END IF;
      END;
      $$;

      CREATE INDEX IF NOT EXISTS ix_payment_intents_status_created_at
        ON payment_intents (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_payment_intents_status_expires_at
        ON payment_intents (tenant_id, status, expires_at)
        WHERE status IN ('stk_requested', 'callback_received', 'processing');
      CREATE INDEX IF NOT EXISTS ix_payment_intents_phone_number
        ON payment_intents (tenant_id, phone_number, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_payment_intents_student_id
        ON payment_intents (tenant_id, student_id, created_at DESC)
        WHERE student_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_payment_intents_mpesa_short_code
        ON payment_intents (tenant_id, mpesa_short_code, created_at DESC)
        WHERE mpesa_short_code IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_intents_checkout_request_id
        ON payment_intents (checkout_request_id)
        WHERE checkout_request_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_intents_merchant_request_id
        ON payment_intents (merchant_request_id)
        WHERE merchant_request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_callback_logs_processing_status
        ON callback_logs (tenant_id, processing_status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_callback_logs_checkout_request_id
        ON callback_logs (tenant_id, checkout_request_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_callback_logs_request_fingerprint
        ON callback_logs (tenant_id, request_fingerprint, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_mpesa_transactions_status
        ON mpesa_transactions (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_mpesa_transactions_receipt_number
        ON mpesa_transactions (tenant_id, mpesa_receipt_number);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_mpesa_transactions_transaction_id
        ON mpesa_transactions (transaction_id)
        WHERE transaction_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_mpesa_c2b_payments_status_received
        ON mpesa_c2b_payments (tenant_id, status, received_at DESC);
      CREATE INDEX IF NOT EXISTS ix_mpesa_c2b_payments_reference
        ON mpesa_c2b_payments (tenant_id, bill_ref_number, received_at DESC)
        WHERE bill_ref_number IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_mpesa_c2b_payments_student
        ON mpesa_c2b_payments (tenant_id, matched_student_id, received_at DESC)
        WHERE matched_student_id IS NOT NULL;

      ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
      ALTER TABLE callback_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE callback_logs FORCE ROW LEVEL SECURITY;
      ALTER TABLE mpesa_transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE mpesa_transactions FORCE ROW LEVEL SECURITY;
      ALTER TABLE mpesa_c2b_payments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE mpesa_c2b_payments FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS payment_intents_rls_policy ON payment_intents;
      CREATE POLICY payment_intents_rls_policy ON payment_intents
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS callback_logs_rls_policy ON callback_logs;
      CREATE POLICY callback_logs_rls_policy ON callback_logs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS mpesa_transactions_rls_policy ON mpesa_transactions;
      CREATE POLICY mpesa_transactions_rls_policy ON mpesa_transactions
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS mpesa_c2b_payments_rls_policy ON mpesa_c2b_payments;
      CREATE POLICY mpesa_c2b_payments_rls_policy ON mpesa_c2b_payments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_payment_intents_set_updated_at ON payment_intents;
      CREATE TRIGGER trg_payment_intents_set_updated_at
      BEFORE UPDATE ON payment_intents
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_callback_logs_set_updated_at ON callback_logs;
      CREATE TRIGGER trg_callback_logs_set_updated_at
      BEFORE UPDATE ON callback_logs
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_mpesa_transactions_set_updated_at ON mpesa_transactions;
      CREATE TRIGGER trg_mpesa_transactions_set_updated_at
      BEFORE UPDATE ON mpesa_transactions
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_mpesa_c2b_payments_set_updated_at ON mpesa_c2b_payments;
      CREATE TRIGGER trg_mpesa_c2b_payments_set_updated_at
      BEFORE UPDATE ON mpesa_c2b_payments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('MPESA payment schema and RLS policies verified');
  }
}
