import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AcademicsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(AcademicsSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS academic_years (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        name text NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_academic_years_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_academic_years_tenant_name UNIQUE (tenant_id, name),
        CONSTRAINT ck_academic_years_range CHECK (ends_on >= starts_on),
        CONSTRAINT ck_academic_years_status CHECK (status IN ('draft', 'active', 'closed'))
      );

      CREATE TABLE IF NOT EXISTS academic_terms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_year_id uuid NOT NULL,
        name text NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_academic_terms_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_academic_terms_year_name UNIQUE (tenant_id, academic_year_id, name),
        CONSTRAINT fk_academic_terms_year
          FOREIGN KEY (tenant_id, academic_year_id)
          REFERENCES academic_years (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT ck_academic_terms_range CHECK (ends_on >= starts_on),
        CONSTRAINT ck_academic_terms_status CHECK (status IN ('draft', 'active', 'closed'))
      );

      CREATE TABLE IF NOT EXISTS class_sections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_year_id uuid NOT NULL,
        name text NOT NULL,
        grade_level text NOT NULL,
        stream text,
        status text NOT NULL DEFAULT 'active',
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_class_sections_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_class_sections_scope UNIQUE (tenant_id, academic_year_id, name),
        CONSTRAINT fk_class_sections_year
          FOREIGN KEY (tenant_id, academic_year_id)
          REFERENCES academic_years (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_subjects_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_subjects_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS class_subject_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_term_id uuid NOT NULL,
        class_section_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_class_subject_assignments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_class_subject_assignments_scope UNIQUE (tenant_id, academic_term_id, class_section_id, subject_id)
      );

      CREATE TABLE IF NOT EXISTS teacher_subject_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_term_id uuid NOT NULL,
        class_section_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        teacher_user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_teacher_subject_assignments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_teacher_subject_assignments_scope UNIQUE (
          tenant_id,
          academic_term_id,
          class_section_id,
          subject_id,
          teacher_user_id
        ),
        CONSTRAINT ck_teacher_subject_assignments_status CHECK (status IN ('active', 'inactive'))
      );

      CREATE TABLE IF NOT EXISTS academic_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid,
        action text NOT NULL,
        actor_user_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS ix_academic_terms_year
        ON academic_terms (tenant_id, academic_year_id, starts_on);
      CREATE INDEX IF NOT EXISTS ix_class_sections_year
        ON class_sections (tenant_id, academic_year_id, grade_level, name);
      CREATE INDEX IF NOT EXISTS ix_teacher_subject_assignments_teacher
        ON teacher_subject_assignments (tenant_id, teacher_user_id, academic_term_id);

      ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_terms FORCE ROW LEVEL SECURITY;
      ALTER TABLE class_sections ENABLE ROW LEVEL SECURITY;
      ALTER TABLE class_sections FORCE ROW LEVEL SECURITY;
      ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
      ALTER TABLE class_subject_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE class_subject_assignments FORCE ROW LEVEL SECURITY;
      ALTER TABLE teacher_subject_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE teacher_subject_assignments FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_audit_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS academic_tenant_policy ON academic_years;
      CREATE POLICY academic_tenant_policy ON academic_years
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_terms_tenant_policy ON academic_terms;
      CREATE POLICY academic_terms_tenant_policy ON academic_terms
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS class_sections_tenant_policy ON class_sections;
      CREATE POLICY class_sections_tenant_policy ON class_sections
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS subjects_tenant_policy ON subjects;
      CREATE POLICY subjects_tenant_policy ON subjects
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS class_subject_assignments_tenant_policy ON class_subject_assignments;
      CREATE POLICY class_subject_assignments_tenant_policy ON class_subject_assignments
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS teacher_subject_assignments_tenant_policy ON teacher_subject_assignments;
      CREATE POLICY teacher_subject_assignments_tenant_policy ON teacher_subject_assignments
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_audit_logs_tenant_policy ON academic_audit_logs;
      CREATE POLICY academic_audit_logs_tenant_policy ON academic_audit_logs
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `);

    this.logger.log('Academics schema and RLS policies verified');
  }
}
