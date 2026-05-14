import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ExamsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(ExamsSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS exam_series (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_term_id uuid NOT NULL,
        name text NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        locked_at timestamptz,
        published_at timestamptz,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_exam_series_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_exam_series_term_name UNIQUE (tenant_id, academic_term_id, name),
        CONSTRAINT ck_exam_series_dates CHECK (ends_on >= starts_on),
        CONSTRAINT ck_exam_series_status CHECK (status IN ('draft', 'submitted', 'reviewed', 'locked', 'published'))
      );

      CREATE TABLE IF NOT EXISTS exam_assessments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        exam_series_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        name text NOT NULL,
        max_score numeric(8,2) NOT NULL DEFAULT 100,
        weight numeric(8,4) NOT NULL DEFAULT 1,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_exam_assessments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_exam_assessments_scope UNIQUE (tenant_id, exam_series_id, subject_id, name),
        CONSTRAINT ck_exam_assessments_max_score CHECK (max_score > 0),
        CONSTRAINT ck_exam_assessments_weight CHECK (weight > 0)
      );

      CREATE TABLE IF NOT EXISTS exam_mark_entry_windows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        exam_series_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        class_section_id uuid NOT NULL,
        opens_at timestamptz NOT NULL,
        closes_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'open',
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_exam_mark_entry_windows_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_exam_mark_entry_windows_scope UNIQUE (tenant_id, exam_series_id, subject_id, class_section_id),
        CONSTRAINT ck_exam_mark_entry_windows_range CHECK (closes_at > opens_at),
        CONSTRAINT ck_exam_mark_entry_windows_status CHECK (status IN ('open', 'closed'))
      );

      CREATE TABLE IF NOT EXISTS exam_grade_boundaries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        exam_series_id uuid NOT NULL,
        label text NOT NULL,
        min_score numeric(8,2) NOT NULL,
        max_score numeric(8,2) NOT NULL,
        remarks text,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_exam_grade_boundaries_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_exam_grade_boundaries_label UNIQUE (tenant_id, exam_series_id, label),
        CONSTRAINT ck_exam_grade_boundaries_range CHECK (max_score >= min_score)
      );

      CREATE TABLE IF NOT EXISTS exam_marks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        exam_series_id uuid NOT NULL,
        assessment_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        class_section_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        student_id uuid NOT NULL,
        score numeric(8,2) NOT NULL,
        remarks text,
        status text NOT NULL DEFAULT 'draft',
        entered_by_user_id uuid NOT NULL,
        updated_by_user_id uuid,
        submitted_at timestamptz,
        reviewed_at timestamptz,
        locked_at timestamptz,
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_exam_marks_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_exam_marks_scope UNIQUE (tenant_id, assessment_id, student_id),
        CONSTRAINT ck_exam_marks_score CHECK (score >= 0),
        CONSTRAINT ck_exam_marks_status CHECK (status IN ('draft', 'submitted', 'reviewed', 'locked', 'published'))
      );

      CREATE TABLE IF NOT EXISTS student_report_cards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        exam_series_id uuid NOT NULL,
        student_id uuid NOT NULL,
        report_snapshot_id text NOT NULL,
        status text NOT NULL DEFAULT 'published',
        published_by_user_id uuid,
        published_at timestamptz NOT NULL DEFAULT NOW(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_report_cards_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_report_cards_series_student UNIQUE (tenant_id, exam_series_id, student_id),
        CONSTRAINT ck_student_report_cards_status CHECK (status IN ('draft', 'published', 'withdrawn'))
      );

      CREATE TABLE IF NOT EXISTS student_report_card_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        report_card_id uuid,
        exam_series_id uuid,
        student_id uuid,
        action text NOT NULL,
        actor_user_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS exam_mark_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        mark_id uuid,
        exam_series_id uuid,
        assessment_id uuid,
        student_id uuid,
        action text NOT NULL,
        actor_user_id uuid,
        previous_score numeric(8,2),
        new_score numeric(8,2),
        reason text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS ix_exam_marks_subject_scope
        ON exam_marks (tenant_id, exam_series_id, academic_term_id, class_section_id, subject_id);
      CREATE INDEX IF NOT EXISTS ix_exam_marks_student
        ON exam_marks (tenant_id, student_id, exam_series_id);
      CREATE INDEX IF NOT EXISTS ix_student_report_cards_student
        ON student_report_cards (tenant_id, student_id, published_at DESC);
      CREATE INDEX IF NOT EXISTS ix_exam_mark_audit_logs_mark
        ON exam_mark_audit_logs (tenant_id, mark_id, created_at DESC);

      ALTER TABLE exam_series ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exam_series FORCE ROW LEVEL SECURITY;
      ALTER TABLE exam_assessments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exam_assessments FORCE ROW LEVEL SECURITY;
      ALTER TABLE exam_mark_entry_windows ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exam_mark_entry_windows FORCE ROW LEVEL SECURITY;
      ALTER TABLE exam_grade_boundaries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exam_grade_boundaries FORCE ROW LEVEL SECURITY;
      ALTER TABLE exam_marks ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exam_marks FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_report_cards ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_report_cards FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_report_card_audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_report_card_audit_logs FORCE ROW LEVEL SECURITY;
      ALTER TABLE exam_mark_audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exam_mark_audit_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS exam_series_tenant_policy ON exam_series;
      CREATE POLICY exam_series_tenant_policy ON exam_series
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS exam_assessments_tenant_policy ON exam_assessments;
      CREATE POLICY exam_assessments_tenant_policy ON exam_assessments
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS exam_mark_windows_tenant_policy ON exam_mark_entry_windows;
      CREATE POLICY exam_mark_windows_tenant_policy ON exam_mark_entry_windows
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS exam_grade_boundaries_tenant_policy ON exam_grade_boundaries;
      CREATE POLICY exam_grade_boundaries_tenant_policy ON exam_grade_boundaries
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS exam_marks_tenant_policy ON exam_marks;
      CREATE POLICY exam_marks_tenant_policy ON exam_marks
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_report_cards_tenant_policy ON student_report_cards;
      CREATE POLICY student_report_cards_tenant_policy ON student_report_cards
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_report_card_audit_logs_tenant_policy ON student_report_card_audit_logs;
      CREATE POLICY student_report_card_audit_logs_tenant_policy ON student_report_card_audit_logs
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS exam_mark_audit_logs_tenant_policy ON exam_mark_audit_logs;
      CREATE POLICY exam_mark_audit_logs_tenant_policy ON exam_mark_audit_logs
      FOR ALL USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `);

    this.logger.log('Exams schema and RLS policies verified');
  }
}
