import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class SeederSchemaService {
  private readonly logger = new Logger(SeederSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async ensureSchema(): Promise<void> {
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

      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        name text NOT NULL,
        subdomain text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_tenants_tenant_id_not_blank CHECK (btrim(tenant_id) <> ''),
        CONSTRAINT ck_tenants_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_tenants_subdomain_not_blank CHECK (btrim(subdomain) <> ''),
        CONSTRAINT ck_tenants_status CHECK (status IN ('active', 'inactive', 'demo')),
        CONSTRAINT uq_tenants_tenant_id UNIQUE (tenant_id),
        CONSTRAINT uq_tenants_subdomain UNIQUE (subdomain)
      );

      CREATE TABLE IF NOT EXISTS academic_years (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status text NOT NULL DEFAULT 'active',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_academic_years_code_not_blank CHECK (btrim(code) <> ''),
        CONSTRAINT ck_academic_years_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_academic_years_status CHECK (status IN ('active', 'closed', 'archived')),
        CONSTRAINT ck_academic_years_date_order CHECK (starts_on <= ends_on),
        CONSTRAINT uq_academic_years_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_academic_years_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS school_classes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        grade_order integer NOT NULL,
        level text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_school_classes_code_not_blank CHECK (btrim(code) <> ''),
        CONSTRAINT ck_school_classes_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_school_classes_grade_order CHECK (grade_order >= 1),
        CONSTRAINT ck_school_classes_level CHECK (
          level IN ('cbc-lower-primary', 'cbc-upper-primary', 'junior-school')
        ),
        CONSTRAINT uq_school_classes_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_school_classes_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        category text NOT NULL DEFAULT 'core',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_subjects_code_not_blank CHECK (btrim(code) <> ''),
        CONSTRAINT ck_subjects_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_subjects_category CHECK (category IN ('core', 'optional', 'co-curricular')),
        CONSTRAINT uq_subjects_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_subjects_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS guardians (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        full_name text NOT NULL,
        phone_number text NOT NULL,
        phone_lookup_key text NOT NULL,
        email text,
        email_lookup_key text,
        occupation text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_guardians_name_not_blank CHECK (btrim(full_name) <> ''),
        CONSTRAINT ck_guardians_phone_not_blank CHECK (btrim(phone_number) <> ''),
        CONSTRAINT uq_guardians_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_guardians_tenant_phone_lookup UNIQUE (tenant_id, phone_lookup_key)
      );

      CREATE TABLE IF NOT EXISTS staff_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid NOT NULL,
        employee_number text NOT NULL,
        full_name text NOT NULL,
        staff_type text NOT NULL,
        phone_number text,
        email text,
        tsc_number text,
        hire_date date,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_staff_members_employee_number_not_blank CHECK (btrim(employee_number) <> ''),
        CONSTRAINT ck_staff_members_full_name_not_blank CHECK (btrim(full_name) <> ''),
        CONSTRAINT ck_staff_members_staff_type CHECK (staff_type IN ('teacher', 'admin', 'finance')),
        CONSTRAINT uq_staff_members_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_staff_members_tenant_user UNIQUE (tenant_id, user_id),
        CONSTRAINT uq_staff_members_tenant_employee UNIQUE (tenant_id, employee_number),
        CONSTRAINT fk_staff_members_user
          FOREIGN KEY (user_id)
          REFERENCES users (id)
          ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS academic_terms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_year_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        status text NOT NULL DEFAULT 'planned',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_academic_terms_code_not_blank CHECK (btrim(code) <> ''),
        CONSTRAINT ck_academic_terms_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_academic_terms_status CHECK (status IN ('planned', 'active', 'closed')),
        CONSTRAINT ck_academic_terms_date_order CHECK (starts_on <= ends_on),
        CONSTRAINT uq_academic_terms_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_academic_terms_tenant_year_code UNIQUE (tenant_id, academic_year_id, code),
        CONSTRAINT fk_academic_terms_year
          FOREIGN KEY (tenant_id, academic_year_id)
          REFERENCES academic_years (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS streams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_class_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        homeroom_staff_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_streams_code_not_blank CHECK (btrim(code) <> ''),
        CONSTRAINT ck_streams_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT uq_streams_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_streams_tenant_class_code UNIQUE (tenant_id, school_class_id, code),
        CONSTRAINT fk_streams_school_class
          FOREIGN KEY (tenant_id, school_class_id)
          REFERENCES school_classes (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS student_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        school_class_id uuid NOT NULL,
        stream_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_student_enrollments_status CHECK (
          status IN ('active', 'completed', 'transferred')
        ),
        CONSTRAINT uq_student_enrollments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_enrollments_tenant_term_student UNIQUE (tenant_id, academic_term_id, student_id),
        CONSTRAINT fk_student_enrollments_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_enrollments_year
          FOREIGN KEY (tenant_id, academic_year_id)
          REFERENCES academic_years (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_enrollments_term
          FOREIGN KEY (tenant_id, academic_term_id)
          REFERENCES academic_terms (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_enrollments_class
          FOREIGN KEY (tenant_id, school_class_id)
          REFERENCES school_classes (tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_student_enrollments_stream
          FOREIGN KEY (tenant_id, stream_id)
          REFERENCES streams (tenant_id, id)
          ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS student_guardians (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        guardian_id uuid NOT NULL,
        relationship text NOT NULL,
        is_primary boolean NOT NULL DEFAULT FALSE,
        can_receive_sms boolean NOT NULL DEFAULT TRUE,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_student_guardians_relationship CHECK (
          relationship IN ('mother', 'father', 'guardian', 'sponsor')
        ),
        CONSTRAINT uq_student_guardians_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_guardians_tenant_student_guardian UNIQUE (tenant_id, student_id, guardian_id, relationship),
        CONSTRAINT fk_student_guardians_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_guardians_guardian
          FOREIGN KEY (tenant_id, guardian_id)
          REFERENCES guardians (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS class_subject_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_year_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        school_class_id uuid NOT NULL,
        stream_id uuid NOT NULL,
        subject_id uuid NOT NULL,
        staff_member_id uuid,
        lessons_per_week integer NOT NULL DEFAULT 5,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_class_subject_assignments_lessons_per_week CHECK (lessons_per_week >= 1),
        CONSTRAINT uq_class_subject_assignments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_class_subject_assignments_tenant_term_stream_subject UNIQUE (tenant_id, academic_term_id, stream_id, subject_id),
        CONSTRAINT fk_class_subject_assignments_year
          FOREIGN KEY (tenant_id, academic_year_id)
          REFERENCES academic_years (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_class_subject_assignments_term
          FOREIGN KEY (tenant_id, academic_term_id)
          REFERENCES academic_terms (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_class_subject_assignments_class
          FOREIGN KEY (tenant_id, school_class_id)
          REFERENCES school_classes (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_class_subject_assignments_stream
          FOREIGN KEY (tenant_id, stream_id)
          REFERENCES streams (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_class_subject_assignments_subject
          FOREIGN KEY (tenant_id, subject_id)
          REFERENCES subjects (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_class_subject_assignments_staff
          FOREIGN KEY (tenant_id, staff_member_id)
          REFERENCES staff_members (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS timetable_lessons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_term_id uuid NOT NULL,
        stream_id uuid NOT NULL,
        class_subject_assignment_id uuid NOT NULL,
        weekday integer NOT NULL,
        period_number integer NOT NULL,
        starts_at time NOT NULL,
        ends_at time NOT NULL,
        room_label text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_timetable_lessons_weekday CHECK (weekday BETWEEN 1 AND 7),
        CONSTRAINT ck_timetable_lessons_period_number CHECK (period_number >= 1),
        CONSTRAINT ck_timetable_lessons_time_order CHECK (starts_at < ends_at),
        CONSTRAINT uq_timetable_lessons_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_timetable_lessons_tenant_slot UNIQUE (tenant_id, academic_term_id, stream_id, weekday, period_number),
        CONSTRAINT fk_timetable_lessons_term
          FOREIGN KEY (tenant_id, academic_term_id)
          REFERENCES academic_terms (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_timetable_lessons_stream
          FOREIGN KEY (tenant_id, stream_id)
          REFERENCES streams (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_timetable_lessons_assignment
          FOREIGN KEY (tenant_id, class_subject_assignment_id)
          REFERENCES class_subject_assignments (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fee_structures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_year_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        school_class_id uuid NOT NULL,
        name text NOT NULL,
        currency_code char(3) NOT NULL DEFAULT 'KES',
        tuition_amount_minor bigint NOT NULL,
        transport_amount_minor bigint NOT NULL DEFAULT 0,
        lunch_amount_minor bigint NOT NULL DEFAULT 0,
        total_amount_minor bigint NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_fee_structures_name_not_blank CHECK (btrim(name) <> ''),
        CONSTRAINT ck_fee_structures_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_fee_structures_amounts_non_negative CHECK (
          tuition_amount_minor >= 0
          AND transport_amount_minor >= 0
          AND lunch_amount_minor >= 0
          AND total_amount_minor >= 0
        ),
        CONSTRAINT uq_fee_structures_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_fee_structures_tenant_term_class UNIQUE (tenant_id, academic_term_id, school_class_id),
        CONSTRAINT fk_fee_structures_year
          FOREIGN KEY (tenant_id, academic_year_id)
          REFERENCES academic_years (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_fee_structures_term
          FOREIGN KEY (tenant_id, academic_term_id)
          REFERENCES academic_terms (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_fee_structures_class
          FOREIGN KEY (tenant_id, school_class_id)
          REFERENCES school_classes (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS communication_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        external_reference text NOT NULL,
        student_id uuid,
        guardian_id uuid,
        sender_staff_id uuid,
        channel text NOT NULL,
        direction text NOT NULL DEFAULT 'outbound',
        subject text,
        body text NOT NULL,
        status text NOT NULL DEFAULT 'sent',
        sent_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_communication_logs_external_reference_not_blank CHECK (btrim(external_reference) <> ''),
        CONSTRAINT ck_communication_logs_channel CHECK (channel IN ('sms', 'email', 'push', 'voice')),
        CONSTRAINT ck_communication_logs_direction CHECK (direction IN ('outbound', 'inbound')),
        CONSTRAINT ck_communication_logs_status CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
        CONSTRAINT ck_communication_logs_body_not_blank CHECK (btrim(body) <> ''),
        CONSTRAINT uq_communication_logs_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_communication_logs_tenant_external_reference UNIQUE (tenant_id, external_reference),
        CONSTRAINT fk_communication_logs_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE SET NULL,
        CONSTRAINT fk_communication_logs_guardian
          FOREIGN KEY (tenant_id, guardian_id)
          REFERENCES guardians (tenant_id, id)
          ON DELETE SET NULL,
        CONSTRAINT fk_communication_logs_sender_staff
          FOREIGN KEY (tenant_id, sender_staff_id)
          REFERENCES staff_members (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        notification_key text NOT NULL,
        recipient_user_id uuid,
        recipient_guardian_id uuid,
        type text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        status text NOT NULL DEFAULT 'unread',
        read_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_notifications_key_not_blank CHECK (btrim(notification_key) <> ''),
        CONSTRAINT ck_notifications_type_not_blank CHECK (btrim(type) <> ''),
        CONSTRAINT ck_notifications_title_not_blank CHECK (btrim(title) <> ''),
        CONSTRAINT ck_notifications_body_not_blank CHECK (btrim(body) <> ''),
        CONSTRAINT ck_notifications_status CHECK (status IN ('unread', 'read', 'sent', 'dismissed')),
        CONSTRAINT uq_notifications_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_notifications_tenant_notification_key UNIQUE (tenant_id, notification_key),
        CONSTRAINT fk_notifications_user
          FOREIGN KEY (recipient_user_id)
          REFERENCES users (id)
          ON DELETE SET NULL,
        CONSTRAINT fk_notifications_guardian
          FOREIGN KEY (tenant_id, recipient_guardian_id)
          REFERENCES guardians (tenant_id, id)
          ON DELETE SET NULL
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_streams_homeroom_staff'
        ) THEN
          ALTER TABLE streams
          ADD CONSTRAINT fk_streams_homeroom_staff
            FOREIGN KEY (tenant_id, homeroom_staff_id)
            REFERENCES staff_members (tenant_id, id)
            ON DELETE SET NULL;
        END IF;
      END;
      $$;

      ALTER TABLE guardians
        ADD COLUMN IF NOT EXISTS phone_lookup_key text,
        ADD COLUMN IF NOT EXISTS email_lookup_key text;

      UPDATE guardians
      SET phone_lookup_key = COALESCE(phone_lookup_key, phone_number)
      WHERE phone_lookup_key IS NULL;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_guardians_tenant_phone_lookup'
        ) THEN
          ALTER TABLE guardians
          ADD CONSTRAINT uq_guardians_tenant_phone_lookup UNIQUE (tenant_id, phone_lookup_key);
        END IF;
      END;
      $$;

      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS student_id uuid,
        ADD COLUMN IF NOT EXISTS fee_structure_id uuid;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_student'
        ) THEN
          ALTER TABLE invoices
          ADD CONSTRAINT fk_invoices_student
            FOREIGN KEY (tenant_id, student_id)
            REFERENCES students (tenant_id, id)
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_fee_structure'
        ) THEN
          ALTER TABLE invoices
          ADD CONSTRAINT fk_invoices_fee_structure
            FOREIGN KEY (tenant_id, fee_structure_id)
            REFERENCES fee_structures (tenant_id, id)
            ON DELETE SET NULL;
        END IF;
      END;
      $$;

      CREATE INDEX IF NOT EXISTS ix_tenants_status ON tenants (tenant_id, status);
      CREATE INDEX IF NOT EXISTS ix_academic_years_status ON academic_years (tenant_id, status, starts_on DESC);
      CREATE INDEX IF NOT EXISTS ix_academic_terms_status ON academic_terms (tenant_id, academic_year_id, status, starts_on);
      CREATE INDEX IF NOT EXISTS ix_streams_class ON streams (tenant_id, school_class_id, code);
      CREATE INDEX IF NOT EXISTS ix_student_enrollments_stream ON student_enrollments (tenant_id, stream_id, academic_term_id);
      CREATE INDEX IF NOT EXISTS ix_student_enrollments_student ON student_enrollments (tenant_id, student_id, academic_year_id DESC);
      CREATE INDEX IF NOT EXISTS ix_guardians_phone ON guardians (tenant_id, phone_number);
      CREATE INDEX IF NOT EXISTS ix_guardians_phone_lookup ON guardians (tenant_id, phone_lookup_key);
      CREATE INDEX IF NOT EXISTS ix_guardians_email_lookup ON guardians (tenant_id, email_lookup_key);
      CREATE INDEX IF NOT EXISTS ix_staff_members_type ON staff_members (tenant_id, staff_type, employee_number);
      CREATE INDEX IF NOT EXISTS ix_subjects_category ON subjects (tenant_id, category, name);
      CREATE INDEX IF NOT EXISTS ix_class_subject_assignments_stream ON class_subject_assignments (tenant_id, stream_id, academic_term_id);
      CREATE INDEX IF NOT EXISTS ix_timetable_lessons_stream ON timetable_lessons (tenant_id, stream_id, academic_term_id, weekday, period_number);
      CREATE INDEX IF NOT EXISTS ix_fee_structures_class ON fee_structures (tenant_id, academic_term_id, school_class_id);
      CREATE INDEX IF NOT EXISTS ix_communication_logs_student ON communication_logs (tenant_id, student_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_communication_logs_guardian ON communication_logs (tenant_id, guardian_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_notifications_user_status ON notifications (tenant_id, recipient_user_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_notifications_guardian_status ON notifications (tenant_id, recipient_guardian_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_invoices_student ON invoices (tenant_id, student_id, due_at DESC);
      CREATE INDEX IF NOT EXISTS ix_invoices_fee_structure ON invoices (tenant_id, fee_structure_id);

      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_terms FORCE ROW LEVEL SECURITY;
      ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE school_classes FORCE ROW LEVEL SECURITY;
      ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
      ALTER TABLE streams FORCE ROW LEVEL SECURITY;
      ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
      ALTER TABLE guardians FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_guardians FORCE ROW LEVEL SECURITY;
      ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE staff_members FORCE ROW LEVEL SECURITY;
      ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
      ALTER TABLE class_subject_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE class_subject_assignments FORCE ROW LEVEL SECURITY;
      ALTER TABLE timetable_lessons ENABLE ROW LEVEL SECURITY;
      ALTER TABLE timetable_lessons FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_enrollments FORCE ROW LEVEL SECURITY;
      ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
      ALTER TABLE fee_structures FORCE ROW LEVEL SECURITY;
      ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE communication_logs FORCE ROW LEVEL SECURITY;
      ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenants_rls_policy ON tenants;
      CREATE POLICY tenants_rls_policy ON tenants
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_years_rls_policy ON academic_years;
      CREATE POLICY academic_years_rls_policy ON academic_years
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_terms_rls_policy ON academic_terms;
      CREATE POLICY academic_terms_rls_policy ON academic_terms
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS school_classes_rls_policy ON school_classes;
      CREATE POLICY school_classes_rls_policy ON school_classes
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS streams_rls_policy ON streams;
      CREATE POLICY streams_rls_policy ON streams
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS guardians_rls_policy ON guardians;
      CREATE POLICY guardians_rls_policy ON guardians
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_guardians_rls_policy ON student_guardians;
      CREATE POLICY student_guardians_rls_policy ON student_guardians
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS staff_members_rls_policy ON staff_members;
      CREATE POLICY staff_members_rls_policy ON staff_members
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS subjects_rls_policy ON subjects;
      CREATE POLICY subjects_rls_policy ON subjects
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS class_subject_assignments_rls_policy ON class_subject_assignments;
      CREATE POLICY class_subject_assignments_rls_policy ON class_subject_assignments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS timetable_lessons_rls_policy ON timetable_lessons;
      CREATE POLICY timetable_lessons_rls_policy ON timetable_lessons
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_enrollments_rls_policy ON student_enrollments;
      CREATE POLICY student_enrollments_rls_policy ON student_enrollments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS fee_structures_rls_policy ON fee_structures;
      CREATE POLICY fee_structures_rls_policy ON fee_structures
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS communication_logs_rls_policy ON communication_logs;
      CREATE POLICY communication_logs_rls_policy ON communication_logs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS notifications_rls_policy ON notifications;
      CREATE POLICY notifications_rls_policy ON notifications
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_tenants_set_updated_at ON tenants;
      CREATE TRIGGER trg_tenants_set_updated_at
      BEFORE UPDATE ON tenants
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_academic_years_set_updated_at ON academic_years;
      CREATE TRIGGER trg_academic_years_set_updated_at
      BEFORE UPDATE ON academic_years
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_academic_terms_set_updated_at ON academic_terms;
      CREATE TRIGGER trg_academic_terms_set_updated_at
      BEFORE UPDATE ON academic_terms
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_school_classes_set_updated_at ON school_classes;
      CREATE TRIGGER trg_school_classes_set_updated_at
      BEFORE UPDATE ON school_classes
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_streams_set_updated_at ON streams;
      CREATE TRIGGER trg_streams_set_updated_at
      BEFORE UPDATE ON streams
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_guardians_set_updated_at ON guardians;
      CREATE TRIGGER trg_guardians_set_updated_at
      BEFORE UPDATE ON guardians
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_guardians_set_updated_at ON student_guardians;
      CREATE TRIGGER trg_student_guardians_set_updated_at
      BEFORE UPDATE ON student_guardians
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_staff_members_set_updated_at ON staff_members;
      CREATE TRIGGER trg_staff_members_set_updated_at
      BEFORE UPDATE ON staff_members
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_subjects_set_updated_at ON subjects;
      CREATE TRIGGER trg_subjects_set_updated_at
      BEFORE UPDATE ON subjects
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_class_subject_assignments_set_updated_at ON class_subject_assignments;
      CREATE TRIGGER trg_class_subject_assignments_set_updated_at
      BEFORE UPDATE ON class_subject_assignments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_timetable_lessons_set_updated_at ON timetable_lessons;
      CREATE TRIGGER trg_timetable_lessons_set_updated_at
      BEFORE UPDATE ON timetable_lessons
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_enrollments_set_updated_at ON student_enrollments;
      CREATE TRIGGER trg_student_enrollments_set_updated_at
      BEFORE UPDATE ON student_enrollments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_fee_structures_set_updated_at ON fee_structures;
      CREATE TRIGGER trg_fee_structures_set_updated_at
      BEFORE UPDATE ON fee_structures
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_communication_logs_set_updated_at ON communication_logs;
      CREATE TRIGGER trg_communication_logs_set_updated_at
      BEFORE UPDATE ON communication_logs
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_notifications_set_updated_at ON notifications;
      CREATE TRIGGER trg_notifications_set_updated_at
      BEFORE UPDATE ON notifications
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Seeder schema dependencies verified');
  }
}
