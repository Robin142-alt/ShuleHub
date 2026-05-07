import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AuthSchemaService } from '../../auth/auth-schema.service';
import { DatabaseService } from '../../database/database.service';
import { FinanceSchemaService } from '../finance/finance-schema.service';

@Injectable()
export class PaymentsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsSchemaService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authSchemaService: AuthSchemaService,
    private readonly financeSchemaService: FinanceSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.authSchemaService.onModuleInit();
    await this.financeSchemaService.onModuleInit();

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

      ALTER TABLE payment_intents
      ADD COLUMN IF NOT EXISTS student_id uuid;

      ALTER TABLE mpesa_transactions
      ADD COLUMN IF NOT EXISTS raw_payload jsonb;

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

      ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
      ALTER TABLE callback_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE callback_logs FORCE ROW LEVEL SECURITY;
      ALTER TABLE mpesa_transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE mpesa_transactions FORCE ROW LEVEL SECURITY;

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
    `);

    this.logger.log('MPESA payment schema and RLS policies verified');
  }
}
