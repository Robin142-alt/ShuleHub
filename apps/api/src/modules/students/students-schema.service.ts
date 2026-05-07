import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AuthSchemaService } from '../../auth/auth-schema.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class StudentsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(StudentsSchemaService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authSchemaService: AuthSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.authSchemaService.onModuleInit();

    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS students (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        admission_number text NOT NULL,
        first_name text NOT NULL,
        last_name text NOT NULL,
        middle_name text,
        status text NOT NULL DEFAULT 'active',
        date_of_birth date,
        gender text,
        primary_guardian_name text,
        primary_guardian_phone text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_students_admission_number_not_blank CHECK (btrim(admission_number) <> ''),
        CONSTRAINT ck_students_first_name_not_blank CHECK (btrim(first_name) <> ''),
        CONSTRAINT ck_students_last_name_not_blank CHECK (btrim(last_name) <> ''),
        CONSTRAINT ck_students_status CHECK (status IN ('active', 'inactive', 'graduated', 'transferred')),
        CONSTRAINT ck_students_gender CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'undisclosed')),
        CONSTRAINT uq_students_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_students_tenant_admission_number UNIQUE (tenant_id, admission_number),
        CONSTRAINT fk_students_created_by_user
          FOREIGN KEY (created_by_user_id)
          REFERENCES users (id)
          ON DELETE SET NULL
      );

      DO $$
      BEGIN
        IF to_regclass('public.attendance_records') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_attendance_records_student'
          ) THEN
          ALTER TABLE attendance_records
          ADD CONSTRAINT fk_attendance_records_student
            FOREIGN KEY (tenant_id, student_id)
            REFERENCES students (tenant_id, id)
            ON DELETE CASCADE;
        END IF;
      END;
      $$;

      CREATE INDEX IF NOT EXISTS ix_students_status_created_at
        ON students (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_students_name_lookup
        ON students (tenant_id, last_name, first_name, admission_number);

      ALTER TABLE students ENABLE ROW LEVEL SECURITY;
      ALTER TABLE students FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS students_rls_policy ON students;
      CREATE POLICY students_rls_policy ON students
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_students_set_updated_at ON students;
      CREATE TRIGGER trg_students_set_updated_at
      BEFORE UPDATE ON students
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Student schema and attendance relationships verified');
  }
}
