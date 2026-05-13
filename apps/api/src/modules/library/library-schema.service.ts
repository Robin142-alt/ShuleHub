import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class LibrarySchemaService implements OnModuleInit {
  private readonly logger = new Logger(LibrarySchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS library_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        description text,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_categories_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_library_categories_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS library_books (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        accession_number text NOT NULL,
        isbn text,
        title text NOT NULL,
        subtitle text,
        author text,
        publisher text,
        category text NOT NULL,
        subject text,
        edition text,
        shelf_location text,
        quantity_total integer NOT NULL DEFAULT 0,
        quantity_available integer NOT NULL DEFAULT 0,
        quantity_damaged integer NOT NULL DEFAULT 0,
        quantity_lost integer NOT NULL DEFAULT 0,
        unit_value numeric(12,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'available',
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_books_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_library_books_tenant_accession UNIQUE (tenant_id, accession_number),
        CONSTRAINT ck_library_book_quantities
          CHECK (
            quantity_total >= 0
            AND quantity_available >= 0
            AND quantity_damaged >= 0
            AND quantity_lost >= 0
          )
      );

      CREATE TABLE IF NOT EXISTS library_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        member_type text NOT NULL,
        admission_or_staff_no text NOT NULL,
        full_name text NOT NULL,
        class_or_department text NOT NULL,
        contact text,
        status text NOT NULL DEFAULT 'active',
        linked_user_id uuid,
        linked_student_id uuid,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_members_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_library_members_tenant_number UNIQUE (tenant_id, admission_or_staff_no)
      );

      CREATE TABLE IF NOT EXISTS library_borrowings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        receipt_number text NOT NULL,
        book_id uuid NOT NULL,
        member_id uuid NOT NULL,
        borrowed_at timestamptz NOT NULL DEFAULT NOW(),
        due_date date NOT NULL,
        returned_at timestamptz,
        status text NOT NULL DEFAULT 'borrowed',
        issued_by_user_id uuid,
        submission_id text,
        notes text,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_borrowings_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_library_borrowings_tenant_receipt UNIQUE (tenant_id, receipt_number),
        CONSTRAINT fk_library_borrowings_book
          FOREIGN KEY (tenant_id, book_id)
          REFERENCES library_books (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_library_borrowings_member
          FOREIGN KEY (tenant_id, member_id)
          REFERENCES library_members (tenant_id, id)
          ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS library_returns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        borrowing_id uuid NOT NULL,
        book_id uuid NOT NULL,
        member_id uuid NOT NULL,
        returned_at timestamptz NOT NULL DEFAULT NOW(),
        condition text NOT NULL DEFAULT 'good',
        overdue_days integer NOT NULL DEFAULT 0,
        fine_amount numeric(12,2) NOT NULL DEFAULT 0,
        received_by_user_id uuid,
        notes text,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_returns_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_library_returns_tenant_borrowing UNIQUE (tenant_id, borrowing_id),
        CONSTRAINT fk_library_returns_borrowing
          FOREIGN KEY (tenant_id, borrowing_id)
          REFERENCES library_borrowings (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_library_returns_book
          FOREIGN KEY (tenant_id, book_id)
          REFERENCES library_books (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_library_returns_member
          FOREIGN KEY (tenant_id, member_id)
          REFERENCES library_members (tenant_id, id)
          ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS library_fines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        fine_number text NOT NULL,
        member_id uuid NOT NULL,
        borrowing_id uuid,
        category text NOT NULL,
        amount numeric(12,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'pending',
        assessed_at timestamptz NOT NULL DEFAULT NOW(),
        paid_at timestamptz,
        waived_at timestamptz,
        assessed_by_user_id uuid,
        notes text,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_fines_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_library_fines_tenant_number UNIQUE (tenant_id, fine_number),
        CONSTRAINT fk_library_fines_member
          FOREIGN KEY (tenant_id, member_id)
          REFERENCES library_members (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_library_fines_borrowing
          FOREIGN KEY (tenant_id, borrowing_id)
          REFERENCES library_borrowings (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS library_activity_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT NOW(),
        actor_user_id uuid,
        action text NOT NULL,
        affected_item text NOT NULL,
        resource_type text,
        resource_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid,
        updated_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_library_activity_logs_tenant_id_id UNIQUE (tenant_id, id)
      );

      ALTER TABLE library_categories ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_categories ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
      ALTER TABLE library_books ADD COLUMN IF NOT EXISTS unit_value numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE library_books ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_books ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
      ALTER TABLE library_members ADD COLUMN IF NOT EXISTS linked_user_id uuid;
      ALTER TABLE library_members ADD COLUMN IF NOT EXISTS linked_student_id uuid;
      ALTER TABLE library_members ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_members ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
      ALTER TABLE library_borrowings ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_borrowings ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
      ALTER TABLE library_returns ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_returns ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
      ALTER TABLE library_fines ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_fines ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;
      ALTER TABLE library_activity_logs ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
      ALTER TABLE library_activity_logs ADD COLUMN IF NOT EXISTS updated_by_user_id uuid;

      CREATE INDEX IF NOT EXISTS ix_library_books_catalog_search
        ON library_books (tenant_id, category, status, title);
      CREATE INDEX IF NOT EXISTS ix_library_books_accession
        ON library_books (tenant_id, accession_number);
      CREATE INDEX IF NOT EXISTS ix_library_books_isbn
        ON library_books (tenant_id, isbn) WHERE isbn IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_library_borrowings_status_due
        ON library_borrowings (tenant_id, status, due_date);
      CREATE INDEX IF NOT EXISTS ix_library_borrowings_member
        ON library_borrowings (tenant_id, member_id, borrowed_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_library_borrowings_submission
        ON library_borrowings (tenant_id, submission_id)
        WHERE submission_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_library_fines_status
        ON library_fines (tenant_id, status, assessed_at DESC);
      CREATE INDEX IF NOT EXISTS ix_library_activity_logs_recent
        ON library_activity_logs (tenant_id, occurred_at DESC);

      ALTER TABLE library_categories ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_categories FORCE ROW LEVEL SECURITY;
      ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_books FORCE ROW LEVEL SECURITY;
      ALTER TABLE library_borrowings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_borrowings FORCE ROW LEVEL SECURITY;
      ALTER TABLE library_returns ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_returns FORCE ROW LEVEL SECURITY;
      ALTER TABLE library_fines ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_fines FORCE ROW LEVEL SECURITY;
      ALTER TABLE library_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_members FORCE ROW LEVEL SECURITY;
      ALTER TABLE library_activity_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE library_activity_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS library_categories_rls_policy ON library_categories;
      CREATE POLICY library_categories_rls_policy ON library_categories
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS library_books_rls_policy ON library_books;
      CREATE POLICY library_books_rls_policy ON library_books
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS library_borrowings_rls_policy ON library_borrowings;
      CREATE POLICY library_borrowings_rls_policy ON library_borrowings
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS library_returns_rls_policy ON library_returns;
      CREATE POLICY library_returns_rls_policy ON library_returns
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS library_fines_rls_policy ON library_fines;
      CREATE POLICY library_fines_rls_policy ON library_fines
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS library_members_rls_policy ON library_members;
      CREATE POLICY library_members_rls_policy ON library_members
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS library_activity_logs_rls_policy ON library_activity_logs;
      CREATE POLICY library_activity_logs_rls_policy ON library_activity_logs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_library_categories_set_updated_at ON library_categories;
      CREATE TRIGGER trg_library_categories_set_updated_at
      BEFORE UPDATE ON library_categories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_library_books_set_updated_at ON library_books;
      CREATE TRIGGER trg_library_books_set_updated_at
      BEFORE UPDATE ON library_books
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_library_borrowings_set_updated_at ON library_borrowings;
      CREATE TRIGGER trg_library_borrowings_set_updated_at
      BEFORE UPDATE ON library_borrowings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_library_returns_set_updated_at ON library_returns;
      CREATE TRIGGER trg_library_returns_set_updated_at
      BEFORE UPDATE ON library_returns
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_library_fines_set_updated_at ON library_fines;
      CREATE TRIGGER trg_library_fines_set_updated_at
      BEFORE UPDATE ON library_fines
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_library_members_set_updated_at ON library_members;
      CREATE TRIGGER trg_library_members_set_updated_at
      BEFORE UPDATE ON library_members
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_library_activity_logs_set_updated_at ON library_activity_logs;
      CREATE TRIGGER trg_library_activity_logs_set_updated_at
      BEFORE UPDATE ON library_activity_logs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Library schema verified');
  }
}
