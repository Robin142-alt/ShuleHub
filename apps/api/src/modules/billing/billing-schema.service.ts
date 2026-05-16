import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class BillingSchemaService implements OnModuleInit {
  private readonly logger = new Logger(BillingSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
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

      CREATE OR REPLACE FUNCTION app.prevent_append_only_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'append-only table "%" cannot be %', TG_TABLE_NAME, lower(TG_OP)
          USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        plan_code text NOT NULL,
        status text NOT NULL DEFAULT 'trialing',
        billing_phone_number text,
        currency_code char(3) NOT NULL DEFAULT 'KES',
        features jsonb NOT NULL DEFAULT '[]'::jsonb,
        limits jsonb NOT NULL DEFAULT '{}'::jsonb,
        seats_allocated integer NOT NULL DEFAULT 1,
        current_period_start timestamptz NOT NULL DEFAULT NOW(),
        current_period_end timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
        trial_ends_at timestamptz,
        grace_period_ends_at timestamptz,
        restricted_at timestamptz,
        suspended_at timestamptz,
        suspension_reason text,
        activated_at timestamptz,
        canceled_at timestamptz,
        last_invoice_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_subscriptions_status CHECK (
          status IN ('trialing', 'active', 'past_due', 'restricted', 'suspended', 'canceled', 'expired')
        ),
        CONSTRAINT ck_subscriptions_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_subscriptions_plan_code_not_blank CHECK (btrim(plan_code) <> ''),
        CONSTRAINT ck_subscriptions_seats_allocated CHECK (seats_allocated >= 1),
        CONSTRAINT uq_subscriptions_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        subscription_id uuid NOT NULL,
        invoice_number text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        currency_code char(3) NOT NULL DEFAULT 'KES',
        description text NOT NULL,
        subtotal_amount_minor bigint NOT NULL,
        tax_amount_minor bigint NOT NULL DEFAULT 0,
        total_amount_minor bigint NOT NULL,
        amount_paid_minor bigint NOT NULL DEFAULT 0,
        billing_phone_number text,
        payment_intent_id uuid,
        issued_at timestamptz NOT NULL DEFAULT NOW(),
        due_at timestamptz NOT NULL,
        paid_at timestamptz,
        voided_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_invoices_status CHECK (
          status IN ('draft', 'open', 'pending_payment', 'paid', 'void', 'uncollectible')
        ),
        CONSTRAINT ck_invoices_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_invoices_description_not_blank CHECK (btrim(description) <> ''),
        CONSTRAINT ck_invoices_subtotal_non_negative CHECK (subtotal_amount_minor >= 0),
        CONSTRAINT ck_invoices_tax_non_negative CHECK (tax_amount_minor >= 0),
        CONSTRAINT ck_invoices_total_positive CHECK (total_amount_minor > 0),
        CONSTRAINT ck_invoices_amount_paid_non_negative CHECK (amount_paid_minor >= 0),
        CONSTRAINT uq_invoices_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_invoices_tenant_invoice_number UNIQUE (tenant_id, invoice_number)
      );

      CREATE TABLE IF NOT EXISTS usage_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        subscription_id uuid NOT NULL,
        feature_key text NOT NULL,
        quantity bigint NOT NULL,
        unit text NOT NULL DEFAULT 'count',
        idempotency_key text NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT NOW(),
        period_start timestamptz NOT NULL,
        period_end timestamptz NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_usage_records_feature_key_not_blank CHECK (btrim(feature_key) <> ''),
        CONSTRAINT ck_usage_records_quantity_positive CHECK (quantity > 0),
        CONSTRAINT ck_usage_records_unit_not_blank CHECK (btrim(unit) <> ''),
        CONSTRAINT ck_usage_records_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
        CONSTRAINT uq_usage_records_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_usage_records_tenant_subscription_idempotency
          UNIQUE (tenant_id, subscription_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS billing_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        subscription_id uuid NOT NULL,
        notification_key text NOT NULL,
        channel text NOT NULL,
        audience text NOT NULL,
        lifecycle_state text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        title text NOT NULL,
        body text NOT NULL,
        scheduled_for timestamptz NOT NULL DEFAULT NOW(),
        delivered_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_billing_notifications_channel CHECK (channel IN ('admin', 'sms', 'email')),
        CONSTRAINT ck_billing_notifications_status CHECK (status IN ('queued', 'sent', 'failed', 'dismissed')),
        CONSTRAINT ck_billing_notifications_lifecycle_state CHECK (
          lifecycle_state IN ('ACTIVE', 'TRIAL', 'EXPIRING', 'GRACE_PERIOD', 'RESTRICTED', 'SUSPENDED')
        ),
        CONSTRAINT ck_billing_notifications_key_not_blank CHECK (btrim(notification_key) <> ''),
        CONSTRAINT ck_billing_notifications_title_not_blank CHECK (btrim(title) <> ''),
        CONSTRAINT ck_billing_notifications_body_not_blank CHECK (btrim(body) <> ''),
        CONSTRAINT uq_billing_notifications_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_billing_notifications_tenant_key UNIQUE (tenant_id, notification_key)
      );

      CREATE TABLE IF NOT EXISTS fee_structures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        name text NOT NULL,
        academic_year text NOT NULL,
        term text NOT NULL,
        grade_level text NOT NULL,
        class_name text,
        currency_code char(3) NOT NULL DEFAULT 'KES',
        status text NOT NULL DEFAULT 'active',
        due_days integer NOT NULL DEFAULT 14,
        line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_amount_minor bigint NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_fee_structures_tenant_id_non_global CHECK (tenant_id <> 'global'),
        CONSTRAINT ck_fee_structures_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_fee_structures_academic_year_not_blank CHECK (btrim(academic_year) <> ''),
        CONSTRAINT ck_fee_structures_term_not_blank CHECK (btrim(term) <> ''),
        CONSTRAINT ck_fee_structures_grade_level_not_blank CHECK (btrim(grade_level) <> ''),
        CONSTRAINT ck_fee_structures_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_fee_structures_status CHECK (status IN ('draft', 'active', 'archived')),
        CONSTRAINT ck_fee_structures_due_days CHECK (due_days >= 0 AND due_days <= 365),
        CONSTRAINT ck_fee_structures_line_items CHECK (
          jsonb_typeof(line_items) = 'array'
          AND jsonb_array_length(line_items) > 0
        ),
        CONSTRAINT ck_fee_structures_total CHECK (total_amount_minor > 0),
        CONSTRAINT uq_fee_structures_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE TABLE IF NOT EXISTS student_fee_payment_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        invoice_id uuid NOT NULL,
        student_id uuid NOT NULL,
        parent_user_id uuid,
        payment_intent_id uuid NOT NULL,
        ledger_transaction_id uuid,
        amount_minor bigint NOT NULL,
        idempotency_key text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_fee_payment_allocations_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_fee_payment_allocations_idempotent_invoice UNIQUE (tenant_id, idempotency_key, invoice_id),
        CONSTRAINT ck_student_fee_payment_allocations_amount CHECK (amount_minor > 0)
      );

      CREATE TABLE IF NOT EXISTS student_fee_credits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        parent_user_id uuid,
        payment_intent_id uuid NOT NULL,
        ledger_transaction_id uuid,
        amount_minor bigint NOT NULL,
        remaining_amount_minor bigint NOT NULL,
        idempotency_key text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_fee_credits_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_fee_credits_idempotency UNIQUE (tenant_id, idempotency_key),
        CONSTRAINT ck_student_fee_credits_amount CHECK (amount_minor > 0),
        CONSTRAINT ck_student_fee_credits_remaining CHECK (remaining_amount_minor >= 0 AND remaining_amount_minor <= amount_minor)
      );

      CREATE TABLE IF NOT EXISTS manual_fee_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        idempotency_key text NOT NULL,
        receipt_number text NOT NULL,
        payment_method text NOT NULL,
        status text NOT NULL DEFAULT 'received',
        student_id uuid,
        invoice_id uuid,
        amount_minor bigint NOT NULL,
        currency_code char(3) NOT NULL DEFAULT 'KES',
        payer_name text,
        received_at timestamptz NOT NULL DEFAULT NOW(),
        deposited_at timestamptz,
        cleared_at timestamptz,
        bounced_at timestamptz,
        reversed_at timestamptz,
        cheque_number text,
        drawer_bank text,
        deposit_reference text,
        external_reference text,
        asset_account_code text NOT NULL DEFAULT '1120-BANK-CLEARING',
        fee_control_account_code text NOT NULL DEFAULT '1100-AR-FEES',
        ledger_transaction_id uuid,
        reversal_ledger_transaction_id uuid,
        notes text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_manual_fee_payments_tenant_id_non_global CHECK (tenant_id <> 'global'),
        CONSTRAINT ck_manual_fee_payments_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
        CONSTRAINT ck_manual_fee_payments_receipt_number_not_blank CHECK (btrim(receipt_number) <> ''),
        CONSTRAINT ck_manual_fee_payments_method CHECK (payment_method IN ('cash', 'cheque', 'bank_deposit', 'eft', 'mpesa_c2b')),
        CONSTRAINT ck_manual_fee_payments_status CHECK (status IN ('received', 'deposited', 'cleared', 'bounced', 'reversed')),
        CONSTRAINT ck_manual_fee_payments_amount CHECK (amount_minor > 0),
        CONSTRAINT ck_manual_fee_payments_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_manual_fee_payments_target CHECK (student_id IS NOT NULL OR invoice_id IS NOT NULL),
        CONSTRAINT ck_manual_fee_payments_cheque_fields CHECK (
          payment_method <> 'cheque'
          OR (cheque_number IS NOT NULL AND btrim(cheque_number) <> '' AND drawer_bank IS NOT NULL AND btrim(drawer_bank) <> '')
        ),
        CONSTRAINT uq_manual_fee_payments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_manual_fee_payments_idempotency UNIQUE (tenant_id, idempotency_key),
        CONSTRAINT uq_manual_fee_payments_receipt_number UNIQUE (tenant_id, receipt_number)
      );

      CREATE TABLE IF NOT EXISTS manual_fee_payment_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        manual_payment_id uuid NOT NULL,
        invoice_id uuid,
        student_id uuid,
        allocation_type text NOT NULL,
        amount_minor bigint NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_manual_fee_payment_allocations_tenant_id_non_global CHECK (tenant_id <> 'global'),
        CONSTRAINT ck_manual_fee_payment_allocations_type CHECK (allocation_type IN ('invoice', 'credit')),
        CONSTRAINT ck_manual_fee_payment_allocations_amount CHECK (amount_minor > 0),
        CONSTRAINT ck_manual_fee_payment_allocations_invoice_target CHECK (
          allocation_type <> 'invoice' OR invoice_id IS NOT NULL
        ),
        CONSTRAINT uq_manual_fee_payment_allocations_tenant_id_id UNIQUE (tenant_id, id)
      );

      DO $$
      BEGIN
        ALTER TABLE subscriptions
          ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;
        ALTER TABLE subscriptions
          ADD COLUMN IF NOT EXISTS restricted_at timestamptz;
        ALTER TABLE subscriptions
          ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
        ALTER TABLE subscriptions
          ADD COLUMN IF NOT EXISTS suspension_reason text;

        ALTER TABLE subscriptions
          DROP CONSTRAINT IF EXISTS ck_subscriptions_status;
        ALTER TABLE subscriptions
          ADD CONSTRAINT ck_subscriptions_status CHECK (
            status IN ('trialing', 'active', 'past_due', 'restricted', 'suspended', 'canceled', 'expired')
          );

        ALTER TABLE manual_fee_payments
          DROP CONSTRAINT IF EXISTS ck_manual_fee_payments_method;
        ALTER TABLE manual_fee_payments
          ADD CONSTRAINT ck_manual_fee_payments_method CHECK (
            payment_method IN ('cash', 'cheque', 'bank_deposit', 'eft', 'mpesa_c2b')
          );

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_invoices_subscription'
        ) THEN
          ALTER TABLE invoices
          ADD CONSTRAINT fk_invoices_subscription
            FOREIGN KEY (tenant_id, subscription_id)
            REFERENCES subscriptions (tenant_id, id)
            ON DELETE RESTRICT;
        END IF;

        IF to_regclass('public.payment_intents') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_invoices_payment_intent'
          ) THEN
          ALTER TABLE invoices
          ADD CONSTRAINT fk_invoices_payment_intent
            FOREIGN KEY (tenant_id, payment_intent_id)
            REFERENCES payment_intents (tenant_id, id)
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_usage_records_subscription'
        ) THEN
          ALTER TABLE usage_records
          ADD CONSTRAINT fk_usage_records_subscription
            FOREIGN KEY (tenant_id, subscription_id)
            REFERENCES subscriptions (tenant_id, id)
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_billing_notifications_subscription'
        ) THEN
          ALTER TABLE billing_notifications
          ADD CONSTRAINT fk_billing_notifications_subscription
            FOREIGN KEY (tenant_id, subscription_id)
            REFERENCES subscriptions (tenant_id, id)
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_student_fee_payment_allocations_invoice'
        ) THEN
          ALTER TABLE student_fee_payment_allocations
          ADD CONSTRAINT fk_student_fee_payment_allocations_invoice
            FOREIGN KEY (tenant_id, invoice_id)
            REFERENCES invoices (tenant_id, id)
            ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_manual_fee_payments_invoice'
        ) THEN
          ALTER TABLE manual_fee_payments
          ADD CONSTRAINT fk_manual_fee_payments_invoice
            FOREIGN KEY (tenant_id, invoice_id)
            REFERENCES invoices (tenant_id, id)
            ON DELETE SET NULL;
        END IF;

        IF to_regclass('public.transactions') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_manual_fee_payments_ledger_transaction'
          ) THEN
          ALTER TABLE manual_fee_payments
          ADD CONSTRAINT fk_manual_fee_payments_ledger_transaction
            FOREIGN KEY (tenant_id, ledger_transaction_id)
            REFERENCES transactions (tenant_id, id)
            ON DELETE SET NULL;
        END IF;

        IF to_regclass('public.transactions') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_manual_fee_payments_reversal_ledger_transaction'
          ) THEN
          ALTER TABLE manual_fee_payments
          ADD CONSTRAINT fk_manual_fee_payments_reversal_ledger_transaction
            FOREIGN KEY (tenant_id, reversal_ledger_transaction_id)
            REFERENCES transactions (tenant_id, id)
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_manual_fee_payment_allocations_payment'
        ) THEN
          ALTER TABLE manual_fee_payment_allocations
          ADD CONSTRAINT fk_manual_fee_payment_allocations_payment
            FOREIGN KEY (tenant_id, manual_payment_id)
            REFERENCES manual_fee_payments (tenant_id, id)
            ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_manual_fee_payment_allocations_invoice'
        ) THEN
          ALTER TABLE manual_fee_payment_allocations
          ADD CONSTRAINT fk_manual_fee_payment_allocations_invoice
            FOREIGN KEY (tenant_id, invoice_id)
            REFERENCES invoices (tenant_id, id)
            ON DELETE RESTRICT;
        END IF;

        IF to_regclass('public.fee_structures') IS NOT NULL THEN
          ALTER TABLE fee_structures NO FORCE ROW LEVEL SECURITY;
          ALTER TABLE fee_structures DISABLE ROW LEVEL SECURITY;

          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS academic_year text;
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS term text;
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS grade_level text;
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS class_name text;
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS due_days integer DEFAULT 14;
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb;
          ALTER TABLE fee_structures
            ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

          UPDATE fee_structures
          SET academic_year = COALESCE(
            NULLIF(btrim(academic_year), ''),
            metadata ->> 'academic_year',
            EXTRACT(YEAR FROM NOW())::text
          )
          WHERE academic_year IS NULL OR btrim(academic_year) = '';

          UPDATE fee_structures
          SET term = COALESCE(
            NULLIF(btrim(term), ''),
            metadata ->> 'term',
            metadata ->> 'term_name',
            'Term 1'
          )
          WHERE term IS NULL OR btrim(term) = '';

          UPDATE fee_structures
          SET grade_level = COALESCE(
            NULLIF(btrim(grade_level), ''),
            metadata ->> 'grade_level',
            metadata ->> 'class_name',
            'Unassigned'
          )
          WHERE grade_level IS NULL OR btrim(grade_level) = '';

          UPDATE fee_structures
          SET status = COALESCE(NULLIF(btrim(status), ''), 'active')
          WHERE status IS NULL OR btrim(status) = '';

          UPDATE fee_structures
          SET due_days = COALESCE(due_days, 14)
          WHERE due_days IS NULL;

          UPDATE fee_structures
          SET line_items = jsonb_build_array(
            jsonb_build_object(
              'name',
              'Fees',
              'amount_minor',
              GREATEST(COALESCE(total_amount_minor, 0), 1)
            )
          )
          WHERE line_items IS NULL
             OR jsonb_typeof(line_items) <> 'array'
             OR jsonb_array_length(line_items) = 0;

          ALTER TABLE fee_structures
            ALTER COLUMN academic_year SET NOT NULL;
          ALTER TABLE fee_structures
            ALTER COLUMN term SET NOT NULL;
          ALTER TABLE fee_structures
            ALTER COLUMN grade_level SET NOT NULL;
          ALTER TABLE fee_structures
            ALTER COLUMN status SET DEFAULT 'active';
          ALTER TABLE fee_structures
            ALTER COLUMN status SET NOT NULL;
          ALTER TABLE fee_structures
            ALTER COLUMN due_days SET DEFAULT 14;
          ALTER TABLE fee_structures
            ALTER COLUMN due_days SET NOT NULL;
          ALTER TABLE fee_structures
            ALTER COLUMN line_items SET DEFAULT '[]'::jsonb;
          ALTER TABLE fee_structures
            ALTER COLUMN line_items SET NOT NULL;
        END IF;
      END;
      $$;

      CREATE INDEX IF NOT EXISTS ix_subscriptions_tenant_status_period_end
        ON subscriptions (tenant_id, status, current_period_end DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_single_mutable_state
        ON subscriptions (tenant_id)
        WHERE status IN ('trialing', 'active', 'past_due', 'restricted', 'suspended');
      CREATE INDEX IF NOT EXISTS ix_invoices_tenant_status_due_at
        ON invoices (tenant_id, status, due_at DESC);
      CREATE INDEX IF NOT EXISTS ix_invoices_payment_intent_id
        ON invoices (tenant_id, payment_intent_id);
      CREATE INDEX IF NOT EXISTS ix_usage_records_tenant_feature_recorded_at
        ON usage_records (tenant_id, feature_key, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS ix_usage_records_subscription_period
        ON usage_records (tenant_id, subscription_id, period_start, period_end);
      CREATE INDEX IF NOT EXISTS ix_billing_notifications_subscription_scheduled_for
        ON billing_notifications (tenant_id, subscription_id, scheduled_for DESC);
      CREATE INDEX IF NOT EXISTS ix_billing_notifications_status_channel
        ON billing_notifications (tenant_id, status, channel, scheduled_for DESC);
      CREATE INDEX IF NOT EXISTS ix_fee_structures_scope
        ON fee_structures (tenant_id, academic_year DESC, term, grade_level, class_name, status);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_fee_structures_active_scope
        ON fee_structures (tenant_id, academic_year, term, grade_level, (COALESCE(class_name, '')))
        WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS ix_invoices_student_fee_allocation
        ON invoices (tenant_id, (metadata ->> 'student_id'), status, due_at ASC);
      CREATE INDEX IF NOT EXISTS ix_student_fee_payment_allocations_student
        ON student_fee_payment_allocations (tenant_id, student_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_student_fee_credits_student_remaining
        ON student_fee_credits (tenant_id, student_id, remaining_amount_minor DESC);
      CREATE INDEX IF NOT EXISTS ix_manual_fee_payments_status_received
        ON manual_fee_payments (tenant_id, status, received_at DESC);
      CREATE INDEX IF NOT EXISTS ix_manual_fee_payments_student
        ON manual_fee_payments (tenant_id, student_id, received_at DESC)
        WHERE student_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_manual_fee_payments_invoice
        ON manual_fee_payments (tenant_id, invoice_id, received_at DESC)
        WHERE invoice_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_manual_fee_payment_allocations_payment
        ON manual_fee_payment_allocations (tenant_id, manual_payment_id, created_at ASC);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_manual_fee_payment_allocations_invoice_once
        ON manual_fee_payment_allocations (tenant_id, manual_payment_id, invoice_id, allocation_type)
        WHERE invoice_id IS NOT NULL;

      ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
      ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
      ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
      ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE usage_records FORCE ROW LEVEL SECURITY;
      ALTER TABLE billing_notifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE billing_notifications FORCE ROW LEVEL SECURITY;
      ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
      ALTER TABLE fee_structures FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_payment_allocations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_payment_allocations FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_credits ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_credits FORCE ROW LEVEL SECURITY;
      ALTER TABLE manual_fee_payments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE manual_fee_payments FORCE ROW LEVEL SECURITY;
      ALTER TABLE manual_fee_payment_allocations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE manual_fee_payment_allocations FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS subscriptions_rls_policy ON subscriptions;
      CREATE POLICY subscriptions_rls_policy ON subscriptions
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS invoices_rls_policy ON invoices;
      CREATE POLICY invoices_rls_policy ON invoices
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS usage_records_select_policy ON usage_records;
      CREATE POLICY usage_records_select_policy ON usage_records
      FOR SELECT
      USING (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS usage_records_insert_policy ON usage_records;
      CREATE POLICY usage_records_insert_policy ON usage_records
      FOR INSERT
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS billing_notifications_rls_policy ON billing_notifications;
      CREATE POLICY billing_notifications_rls_policy ON billing_notifications
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS fee_structures_rls_policy ON fee_structures;
      CREATE POLICY fee_structures_rls_policy ON fee_structures
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_fee_payment_allocations_rls_policy ON student_fee_payment_allocations;
      CREATE POLICY student_fee_payment_allocations_rls_policy ON student_fee_payment_allocations
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_fee_credits_rls_policy ON student_fee_credits;
      CREATE POLICY student_fee_credits_rls_policy ON student_fee_credits
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS manual_fee_payments_rls_policy ON manual_fee_payments;
      CREATE POLICY manual_fee_payments_rls_policy ON manual_fee_payments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS manual_fee_payment_allocations_rls_policy ON manual_fee_payment_allocations;
      CREATE POLICY manual_fee_payment_allocations_rls_policy ON manual_fee_payment_allocations
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_subscriptions_set_updated_at ON subscriptions;
      CREATE TRIGGER trg_subscriptions_set_updated_at
      BEFORE UPDATE ON subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_invoices_set_updated_at ON invoices;
      CREATE TRIGGER trg_invoices_set_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_usage_records_set_updated_at ON usage_records;
      DROP TRIGGER IF EXISTS trg_usage_records_prevent_update ON usage_records;
      CREATE TRIGGER trg_usage_records_prevent_update
      BEFORE UPDATE OR DELETE ON usage_records
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_append_only_mutation();

      DROP TRIGGER IF EXISTS trg_billing_notifications_set_updated_at ON billing_notifications;
      CREATE TRIGGER trg_billing_notifications_set_updated_at
      BEFORE UPDATE ON billing_notifications
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_fee_structures_set_updated_at ON fee_structures;
      CREATE TRIGGER trg_fee_structures_set_updated_at
      BEFORE UPDATE ON fee_structures
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_fee_allocations_prevent_update ON student_fee_payment_allocations;
      CREATE TRIGGER trg_student_fee_allocations_prevent_update
      BEFORE UPDATE OR DELETE ON student_fee_payment_allocations
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_append_only_mutation();

      DROP TRIGGER IF EXISTS trg_student_fee_credits_set_updated_at ON student_fee_credits;
      CREATE TRIGGER trg_student_fee_credits_set_updated_at
      BEFORE UPDATE ON student_fee_credits
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_manual_fee_payments_set_updated_at ON manual_fee_payments;
      CREATE TRIGGER trg_manual_fee_payments_set_updated_at
      BEFORE UPDATE ON manual_fee_payments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_manual_fee_allocations_prevent_update ON manual_fee_payment_allocations;
      CREATE TRIGGER trg_manual_fee_allocations_prevent_update
      BEFORE UPDATE OR DELETE ON manual_fee_payment_allocations
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_append_only_mutation();
    `);

    this.logger.log('Billing schema, lifecycle, invoices, usage metering, and notifications verified');
  }
}
