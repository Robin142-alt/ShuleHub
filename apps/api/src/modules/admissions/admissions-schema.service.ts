import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

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

      CREATE INDEX IF NOT EXISTS ix_admission_applications_status ON admission_applications (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_admission_documents_status ON admission_documents (tenant_id, verification_status, created_at DESC);

      ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE admission_applications FORCE ROW LEVEL SECURITY;
      ALTER TABLE admission_documents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE admission_documents FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_allocations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_allocations FORCE ROW LEVEL SECURITY;
      ALTER TABLE student_transfer_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE student_transfer_records FORCE ROW LEVEL SECURITY;

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
    `);

    this.logger.log('Admissions schema verified');
  }
}
