import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

const LIBRARY_TABLES = [
  'library_catalog_items',
  'library_copies',
  'library_borrowers',
  'library_borrower_limits',
  'library_circulation_ledger',
  'library_reservations',
  'library_renewals',
  'library_fine_rules',
  'library_fines',
  'library_audit_logs',
] as const;

@Injectable()
export class LibrarySchemaService implements OnModuleInit {
  private readonly logger = new Logger(LibrarySchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE TABLE IF NOT EXISTS library_catalog_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        isbn text,
        title text NOT NULL,
        author text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS library_copies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        catalog_item_id uuid NOT NULL,
        accession_number text NOT NULL,
        status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'issued', 'reserved', 'lost', 'damaged')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_copies_tenant_accession UNIQUE (tenant_id, accession_number)
      );

      CREATE TABLE IF NOT EXISTS library_borrowers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        borrower_type text NOT NULL CHECK (borrower_type IN ('student', 'staff')),
        subject_id uuid NOT NULL,
        restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS library_borrower_limits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        borrower_type text NOT NULL,
        max_active_loans integer NOT NULL,
        max_renewals integer NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS library_circulation_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        copy_id uuid,
        borrower_id uuid,
        action text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS library_reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        catalog_item_id uuid NOT NULL,
        borrower_id uuid NOT NULL,
        queue_position integer NOT NULL,
        status text NOT NULL DEFAULT 'waiting',
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS library_renewals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        loan_id uuid NOT NULL,
        renewed_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS library_fine_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        rule_type text NOT NULL,
        amount_minor integer NOT NULL
      );

      CREATE TABLE IF NOT EXISTS library_fines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        borrower_id uuid NOT NULL,
        copy_id uuid,
        reason text NOT NULL,
        amount_minor integer NOT NULL,
        billing_reference text,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS library_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        actor_user_id uuid,
        action text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION prevent_library_ledger_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'library circulation ledger is append-only';
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_library_circulation_ledger_prevent_mutation ON library_circulation_ledger;
      CREATE TRIGGER trg_library_circulation_ledger_prevent_mutation
      BEFORE UPDATE OR DELETE ON library_circulation_ledger
      FOR EACH ROW EXECUTE FUNCTION prevent_library_ledger_mutation();

      ${LIBRARY_TABLES.map((table) => `
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS ${table}_rls_policy ON ${table};
        CREATE POLICY ${table}_rls_policy ON ${table}
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      `).join('\n')}
    `);

    this.logger.log('Library schema verified');
  }
}
