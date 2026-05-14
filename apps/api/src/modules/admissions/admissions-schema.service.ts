import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { FILE_OBJECT_STORAGE_SCHEMA_SQL } from '../../common/uploads/file-object-schema';
import { DatabaseService } from '../../database/database.service';
import { StudentsSchemaService } from '../students/students-schema.service';

@Injectable()
export class AdmissionsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(AdmissionsSchemaService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly studentsSchemaService: StudentsSchemaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.studentsSchemaService.onModuleInit();

    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      ${FILE_OBJECT_STORAGE_SCHEMA_SQL}

      CREATE TABLE IF NOT EXISTS admission_applications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        application_number text NOT NULL,
        full_name text NOT NULL,
        date_of_birth date NOT NULL,
        gender text NOT NULL,
        birth_certificate_number text NOT NULL,
        nationality text NOT NULL,
        previous_school text,
        kcpe_results text,
        cbc_level text,
        class_applying text NOT NULL,
        parent_name text NOT NULL,
        parent_phone text NOT NULL,
        parent_email text,
        parent_occupation text,
        relationship text NOT NULL,
        allergies text,
        conditions text,
        emergency_contact text,
        status text NOT NULL DEFAULT 'pending',
        interview_date date,
        review_notes text,
        approved_at timestamptz,
        admitted_student_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_admission_applications_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_admission_applications_number UNIQUE (tenant_id, application_number)
      );

      CREATE TABLE IF NOT EXISTS admission_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        application_id uuid,
        student_id uuid,
        document_type text NOT NULL,
        original_file_name text NOT NULL,
        stored_path text NOT NULL,
        mime_type text NOT NULL,
        size_bytes bigint NOT NULL,
        verification_status text NOT NULL DEFAULT 'pending',
        uploaded_by_user_id uuid,
        verified_by_user_id uuid,
        verified_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_admission_documents_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_admission_documents_application
          FOREIGN KEY (tenant_id, application_id)
          REFERENCES admission_applications (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_admission_documents_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS student_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        class_name text NOT NULL,
        stream_name text NOT NULL,
        dormitory_name text,
        transport_route text,
        effective_from date NOT NULL,
        is_current boolean NOT NULL DEFAULT TRUE,
        notes text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_allocations_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_student_allocations_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS student_transfer_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid,
        application_id uuid,
        transfer_type text NOT NULL,
        school_name text NOT NULL,
        reason text NOT NULL,
        requested_on date NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        notes text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_transfers_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_student_transfer_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_transfer_application
          FOREIGN KEY (tenant_id, application_id)
          REFERENCES admission_applications (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS academic_class_sections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        class_name text NOT NULL,
        stream_name text NOT NULL,
        academic_year text NOT NULL,
        capacity integer,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_academic_class_sections_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_academic_class_sections_class_stream_year UNIQUE (tenant_id, class_name, stream_name, academic_year),
        CONSTRAINT ck_academic_class_sections_class_not_blank CHECK (btrim(class_name) <> ''),
        CONSTRAINT ck_academic_class_sections_stream_not_blank CHECK (btrim(stream_name) <> ''),
        CONSTRAINT ck_academic_class_sections_year_not_blank CHECK (btrim(academic_year) <> ''),
        CONSTRAINT ck_academic_class_sections_capacity CHECK (capacity IS NULL OR capacity > 0)
      );

      CREATE TABLE IF NOT EXISTS student_academic_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        application_id uuid NOT NULL,
        class_section_id uuid,
        class_name text NOT NULL,
        stream_name text NOT NULL,
        academic_year text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        enrolled_at timestamptz NOT NULL DEFAULT NOW(),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_academic_enrollments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_academic_enrollments_student_year UNIQUE (tenant_id, student_id, academic_year),
        CONSTRAINT ck_student_academic_enrollments_class_not_blank CHECK (btrim(class_name) <> ''),
        CONSTRAINT ck_student_academic_enrollments_stream_not_blank CHECK (btrim(stream_name) <> ''),
        CONSTRAINT ck_student_academic_enrollments_year_not_blank CHECK (btrim(academic_year) <> ''),
        CONSTRAINT ck_student_academic_enrollments_status CHECK (status IN ('active', 'completed', 'transferred', 'withdrawn')),
        CONSTRAINT fk_student_academic_enrollments_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_academic_enrollments_application
          FOREIGN KEY (tenant_id, application_id)
          REFERENCES admission_applications (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_academic_enrollments_section
          FOREIGN KEY (tenant_id, class_section_id)
          REFERENCES academic_class_sections (tenant_id, id)
          ON DELETE SET NULL (class_section_id)
      );

      CREATE TABLE IF NOT EXISTS student_academic_lifecycle_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        source_enrollment_id uuid NOT NULL,
        target_enrollment_id uuid,
        event_type text NOT NULL,
        from_class_name text NOT NULL,
        from_stream_name text NOT NULL,
        from_academic_year text NOT NULL,
        to_class_section_id uuid,
        to_class_name text,
        to_stream_name text,
        to_academic_year text,
        reason text NOT NULL,
        notes text,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_academic_lifecycle_events_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT ck_student_academic_lifecycle_events_type CHECK (event_type IN ('promotion', 'graduation', 'archive')),
        CONSTRAINT ck_student_academic_lifecycle_events_from_class CHECK (btrim(from_class_name) <> ''),
        CONSTRAINT ck_student_academic_lifecycle_events_from_stream CHECK (btrim(from_stream_name) <> ''),
        CONSTRAINT ck_student_academic_lifecycle_events_from_year CHECK (btrim(from_academic_year) <> ''),
        CONSTRAINT ck_student_academic_lifecycle_events_reason CHECK (btrim(reason) <> ''),
        CONSTRAINT fk_student_academic_lifecycle_events_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_academic_lifecycle_events_source_enrollment
          FOREIGN KEY (tenant_id, source_enrollment_id)
          REFERENCES student_academic_enrollments (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_academic_lifecycle_events_target_enrollment
          FOREIGN KEY (tenant_id, target_enrollment_id)
          REFERENCES student_academic_enrollments (tenant_id, id)
          ON DELETE SET NULL (target_enrollment_id),
        CONSTRAINT fk_student_academic_lifecycle_events_target_section
          FOREIGN KEY (tenant_id, to_class_section_id)
          REFERENCES academic_class_sections (tenant_id, id)
          ON DELETE SET NULL (to_class_section_id)
      );

      CREATE TABLE IF NOT EXISTS academic_subject_offerings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        class_section_id uuid NOT NULL,
        subject_code text NOT NULL,
        subject_name text NOT NULL,
        teacher_user_id uuid,
        is_compulsory boolean NOT NULL DEFAULT TRUE,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_academic_subject_offerings_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_academic_subject_offerings_section_subject UNIQUE (tenant_id, class_section_id, subject_code),
        CONSTRAINT ck_academic_subject_offerings_code_not_blank CHECK (btrim(subject_code) <> ''),
        CONSTRAINT ck_academic_subject_offerings_name_not_blank CHECK (btrim(subject_name) <> ''),
        CONSTRAINT fk_academic_subject_offerings_section
          FOREIGN KEY (tenant_id, class_section_id)
          REFERENCES academic_class_sections (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_academic_subject_offerings_teacher
          FOREIGN KEY (teacher_user_id)
          REFERENCES users (id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS student_subject_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        academic_enrollment_id uuid NOT NULL,
        subject_offering_id uuid NOT NULL,
        subject_code text NOT NULL,
        subject_name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        enrolled_at timestamptz NOT NULL DEFAULT NOW(),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_subject_enrollments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_subject_enrollments_student_offering UNIQUE (tenant_id, student_id, subject_offering_id),
        CONSTRAINT ck_student_subject_enrollments_code_not_blank CHECK (btrim(subject_code) <> ''),
        CONSTRAINT ck_student_subject_enrollments_name_not_blank CHECK (btrim(subject_name) <> ''),
        CONSTRAINT ck_student_subject_enrollments_status CHECK (status IN ('active', 'completed', 'dropped')),
        CONSTRAINT fk_student_subject_enrollments_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_subject_enrollments_academic
          FOREIGN KEY (tenant_id, academic_enrollment_id)
          REFERENCES student_academic_enrollments (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_subject_enrollments_offering
          FOREIGN KEY (tenant_id, subject_offering_id)
          REFERENCES academic_subject_offerings (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS academic_timetable_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        class_section_id uuid NOT NULL,
        subject_offering_id uuid,
        day_of_week text NOT NULL,
        starts_at text NOT NULL,
        ends_at text NOT NULL,
        subject_name text NOT NULL,
        room_name text,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_academic_timetable_slots_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT ck_academic_timetable_slots_day CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        CONSTRAINT ck_academic_timetable_slots_start CHECK (starts_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
        CONSTRAINT ck_academic_timetable_slots_end CHECK (ends_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
        CONSTRAINT ck_academic_timetable_slots_subject_not_blank CHECK (btrim(subject_name) <> ''),
        CONSTRAINT fk_academic_timetable_slots_section
          FOREIGN KEY (tenant_id, class_section_id)
          REFERENCES academic_class_sections (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_academic_timetable_slots_subject
          FOREIGN KEY (tenant_id, subject_offering_id)
          REFERENCES academic_subject_offerings (tenant_id, id)
          ON DELETE SET NULL (subject_offering_id)
      );

      CREATE TABLE IF NOT EXISTS student_timetable_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        academic_enrollment_id uuid NOT NULL,
        timetable_slot_id uuid NOT NULL,
        day_of_week text NOT NULL,
        starts_at text NOT NULL,
        ends_at text NOT NULL,
        subject_name text NOT NULL,
        room_name text,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_timetable_enrollments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_timetable_enrollments_student_slot UNIQUE (tenant_id, student_id, timetable_slot_id),
        CONSTRAINT ck_student_timetable_enrollments_day CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
        CONSTRAINT ck_student_timetable_enrollments_start CHECK (starts_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
        CONSTRAINT ck_student_timetable_enrollments_end CHECK (ends_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
        CONSTRAINT ck_student_timetable_enrollments_subject_not_blank CHECK (btrim(subject_name) <> ''),
        CONSTRAINT ck_student_timetable_enrollments_status CHECK (status IN ('active', 'completed', 'dropped')),
        CONSTRAINT fk_student_timetable_enrollments_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_timetable_enrollments_academic
          FOREIGN KEY (tenant_id, academic_enrollment_id)
          REFERENCES student_academic_enrollments (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_timetable_enrollments_slot
          FOREIGN KEY (tenant_id, timetable_slot_id)
          REFERENCES academic_timetable_slots (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS student_fee_structures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        class_name text NOT NULL,
        academic_year text NOT NULL,
        term_name text NOT NULL,
        description text NOT NULL,
        currency_code text NOT NULL DEFAULT 'KES',
        amount_minor bigint NOT NULL,
        due_days_after_registration integer NOT NULL DEFAULT 14,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_fee_structures_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_fee_structures_class_term UNIQUE (tenant_id, class_name, academic_year, term_name),
        CONSTRAINT ck_student_fee_structures_class_not_blank CHECK (btrim(class_name) <> ''),
        CONSTRAINT ck_student_fee_structures_year_not_blank CHECK (btrim(academic_year) <> ''),
        CONSTRAINT ck_student_fee_structures_term_not_blank CHECK (btrim(term_name) <> ''),
        CONSTRAINT ck_student_fee_structures_description_not_blank CHECK (btrim(description) <> ''),
        CONSTRAINT ck_student_fee_structures_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_student_fee_structures_amount_positive CHECK (amount_minor > 0),
        CONSTRAINT ck_student_fee_structures_due_days CHECK (due_days_after_registration BETWEEN 0 AND 180)
      );

      CREATE TABLE IF NOT EXISTS student_fee_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        application_id uuid NOT NULL,
        fee_structure_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'assigned',
        amount_minor bigint NOT NULL,
        currency_code text NOT NULL DEFAULT 'KES',
        assigned_at timestamptz NOT NULL DEFAULT NOW(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_fee_assignments_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_fee_assignments_student_structure UNIQUE (tenant_id, student_id, fee_structure_id),
        CONSTRAINT ck_student_fee_assignments_status CHECK (status IN ('assigned', 'waived', 'voided')),
        CONSTRAINT ck_student_fee_assignments_amount_positive CHECK (amount_minor > 0),
        CONSTRAINT ck_student_fee_assignments_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT fk_student_fee_assignments_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_fee_assignments_application
          FOREIGN KEY (tenant_id, application_id)
          REFERENCES admission_applications (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_fee_assignments_structure
          FOREIGN KEY (tenant_id, fee_structure_id)
          REFERENCES student_fee_structures (tenant_id, id)
          ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS student_fee_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        assignment_id uuid NOT NULL,
        student_id uuid NOT NULL,
        invoice_number text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        description text NOT NULL,
        currency_code text NOT NULL DEFAULT 'KES',
        amount_due_minor bigint NOT NULL,
        amount_paid_minor bigint NOT NULL DEFAULT 0,
        issued_date date NOT NULL DEFAULT CURRENT_DATE,
        due_date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_student_fee_invoices_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_student_fee_invoices_assignment UNIQUE (tenant_id, assignment_id),
        CONSTRAINT uq_student_fee_invoices_number UNIQUE (tenant_id, invoice_number),
        CONSTRAINT ck_student_fee_invoices_status CHECK (status IN ('open', 'pending_payment', 'paid', 'voided')),
        CONSTRAINT ck_student_fee_invoices_description_not_blank CHECK (btrim(description) <> ''),
        CONSTRAINT ck_student_fee_invoices_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_student_fee_invoices_amount_due_positive CHECK (amount_due_minor > 0),
        CONSTRAINT ck_student_fee_invoices_amount_paid_non_negative CHECK (amount_paid_minor >= 0),
        CONSTRAINT fk_student_fee_invoices_assignment
          FOREIGN KEY (tenant_id, assignment_id)
          REFERENCES student_fee_assignments (tenant_id, id)
          ON DELETE CASCADE,
        CONSTRAINT fk_student_fee_invoices_student
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS ix_admission_applications_status ON admission_applications (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_admission_applications_search_vector
        ON admission_applications
        USING GIN (
          to_tsvector(
            'simple',
            application_number || ' ' ||
            full_name || ' ' ||
            birth_certificate_number || ' ' ||
            class_applying || ' ' ||
            parent_name || ' ' ||
            parent_phone || ' ' ||
            COALESCE(parent_email, '')
          )
        );
      CREATE INDEX IF NOT EXISTS ix_admission_documents_status ON admission_documents (tenant_id, verification_status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_academic_class_sections_lookup ON academic_class_sections (tenant_id, lower(class_name), lower(stream_name), is_active);
      CREATE INDEX IF NOT EXISTS ix_student_academic_enrollments_section_status ON student_academic_enrollments (tenant_id, class_section_id, status);
      CREATE INDEX IF NOT EXISTS ix_student_academic_lifecycle_events_student_created ON student_academic_lifecycle_events (tenant_id, student_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_academic_subject_offerings_section_active ON academic_subject_offerings (tenant_id, class_section_id, is_active);
      CREATE INDEX IF NOT EXISTS ix_student_subject_enrollments_student_status ON student_subject_enrollments (tenant_id, student_id, status);
      CREATE INDEX IF NOT EXISTS ix_academic_timetable_slots_section_active ON academic_timetable_slots (tenant_id, class_section_id, is_active);
      CREATE INDEX IF NOT EXISTS ix_student_timetable_enrollments_student_status ON student_timetable_enrollments (tenant_id, student_id, status);
      CREATE INDEX IF NOT EXISTS ix_student_fee_structures_class_active ON student_fee_structures (tenant_id, lower(class_name), is_active);
      CREATE INDEX IF NOT EXISTS ix_student_fee_assignments_student_status ON student_fee_assignments (tenant_id, student_id, status);
      CREATE INDEX IF NOT EXISTS ix_student_fee_invoices_student_status ON student_fee_invoices (tenant_id, student_id, status, due_date DESC);

      ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE admission_applications FORCE ROW LEVEL SECURITY;
      ALTER TABLE admission_documents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE admission_documents FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_allocations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_allocations FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_transfer_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_transfer_records FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_class_sections ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_class_sections FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_academic_enrollments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_academic_enrollments FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_academic_lifecycle_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_academic_lifecycle_events FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_subject_offerings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_subject_offerings FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_subject_enrollments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_subject_enrollments FORCE ROW LEVEL SECURITY;
      ALTER TABLE academic_timetable_slots ENABLE ROW LEVEL SECURITY;
      ALTER TABLE academic_timetable_slots FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_timetable_enrollments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_timetable_enrollments FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_structures ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_structures FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_assignments FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_invoices ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_fee_invoices FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS admission_applications_rls_policy ON admission_applications;
      CREATE POLICY admission_applications_rls_policy ON admission_applications
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS admission_documents_rls_policy ON admission_documents;
      CREATE POLICY admission_documents_rls_policy ON admission_documents
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_allocations_rls_policy ON student_allocations;
      CREATE POLICY student_allocations_rls_policy ON student_allocations
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_transfer_records_rls_policy ON student_transfer_records;
      CREATE POLICY student_transfer_records_rls_policy ON student_transfer_records
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_class_sections_rls_policy ON academic_class_sections;
      CREATE POLICY academic_class_sections_rls_policy ON academic_class_sections
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_academic_enrollments_rls_policy ON student_academic_enrollments;
      CREATE POLICY student_academic_enrollments_rls_policy ON student_academic_enrollments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_academic_lifecycle_events_rls_policy ON student_academic_lifecycle_events;
      CREATE POLICY student_academic_lifecycle_events_rls_policy ON student_academic_lifecycle_events
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_subject_offerings_rls_policy ON academic_subject_offerings;
      CREATE POLICY academic_subject_offerings_rls_policy ON academic_subject_offerings
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_subject_enrollments_rls_policy ON student_subject_enrollments;
      CREATE POLICY student_subject_enrollments_rls_policy ON student_subject_enrollments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS academic_timetable_slots_rls_policy ON academic_timetable_slots;
      CREATE POLICY academic_timetable_slots_rls_policy ON academic_timetable_slots
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_timetable_enrollments_rls_policy ON student_timetable_enrollments;
      CREATE POLICY student_timetable_enrollments_rls_policy ON student_timetable_enrollments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_fee_structures_rls_policy ON student_fee_structures;
      CREATE POLICY student_fee_structures_rls_policy ON student_fee_structures
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_fee_assignments_rls_policy ON student_fee_assignments;
      CREATE POLICY student_fee_assignments_rls_policy ON student_fee_assignments
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS student_fee_invoices_rls_policy ON student_fee_invoices;
      CREATE POLICY student_fee_invoices_rls_policy ON student_fee_invoices
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_admission_applications_set_updated_at ON admission_applications;
      CREATE TRIGGER trg_admission_applications_set_updated_at
      BEFORE UPDATE ON admission_applications
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_admission_documents_set_updated_at ON admission_documents;
      CREATE TRIGGER trg_admission_documents_set_updated_at
      BEFORE UPDATE ON admission_documents
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_allocations_set_updated_at ON student_allocations;
      CREATE TRIGGER trg_student_allocations_set_updated_at
      BEFORE UPDATE ON student_allocations
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_transfer_records_set_updated_at ON student_transfer_records;
      CREATE TRIGGER trg_student_transfer_records_set_updated_at
      BEFORE UPDATE ON student_transfer_records
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_academic_class_sections_set_updated_at ON academic_class_sections;
      CREATE TRIGGER trg_academic_class_sections_set_updated_at
      BEFORE UPDATE ON academic_class_sections
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_academic_enrollments_set_updated_at ON student_academic_enrollments;
      CREATE TRIGGER trg_student_academic_enrollments_set_updated_at
      BEFORE UPDATE ON student_academic_enrollments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_academic_subject_offerings_set_updated_at ON academic_subject_offerings;
      CREATE TRIGGER trg_academic_subject_offerings_set_updated_at
      BEFORE UPDATE ON academic_subject_offerings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_subject_enrollments_set_updated_at ON student_subject_enrollments;
      CREATE TRIGGER trg_student_subject_enrollments_set_updated_at
      BEFORE UPDATE ON student_subject_enrollments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_academic_timetable_slots_set_updated_at ON academic_timetable_slots;
      CREATE TRIGGER trg_academic_timetable_slots_set_updated_at
      BEFORE UPDATE ON academic_timetable_slots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_timetable_enrollments_set_updated_at ON student_timetable_enrollments;
      CREATE TRIGGER trg_student_timetable_enrollments_set_updated_at
      BEFORE UPDATE ON student_timetable_enrollments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_fee_structures_set_updated_at ON student_fee_structures;
      CREATE TRIGGER trg_student_fee_structures_set_updated_at
      BEFORE UPDATE ON student_fee_structures
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_fee_assignments_set_updated_at ON student_fee_assignments;
      CREATE TRIGGER trg_student_fee_assignments_set_updated_at
      BEFORE UPDATE ON student_fee_assignments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_student_fee_invoices_set_updated_at ON student_fee_invoices;
      CREATE TRIGGER trg_student_fee_invoices_set_updated_at
      BEFORE UPDATE ON student_fee_invoices
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Admissions schema verified');
  }
}
