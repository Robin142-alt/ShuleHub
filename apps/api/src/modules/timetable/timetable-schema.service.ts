import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TimetableSchemaService implements OnModuleInit {
  private readonly logger = new Logger(TimetableSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE TABLE IF NOT EXISTS timetable_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        academic_year text NOT NULL,
        term_name text NOT NULL,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        immutable boolean NOT NULL DEFAULT FALSE,
        notes text,
        published_by_user_id uuid,
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_timetable_versions_tenant_term UNIQUE (tenant_id, academic_year, term_name, status)
      );

      CREATE TABLE IF NOT EXISTS timetable_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        version_id uuid REFERENCES timetable_versions(id) ON DELETE SET NULL,
        academic_year text NOT NULL,
        term_name text NOT NULL,
        class_section_id text NOT NULL,
        subject_id text NOT NULL,
        teacher_id text NOT NULL,
        room_id text,
        day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        starts_at time NOT NULL,
        ends_at time NOT NULL,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_timetable_slot_time_order CHECK (starts_at < ends_at)
      );

      CREATE TABLE IF NOT EXISTS timetable_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        version_id uuid,
        slot_id uuid,
        actor_user_id uuid,
        action text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS ix_timetable_slots_conflict_lookup
        ON timetable_slots (tenant_id, academic_year, term_name, day_of_week, starts_at, ends_at);
      CREATE INDEX IF NOT EXISTS ix_timetable_versions_tenant_term
        ON timetable_versions (tenant_id, academic_year, term_name, status);

      ALTER TABLE timetable_versions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE timetable_versions FORCE ROW LEVEL SECURITY;
      ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
      ALTER TABLE timetable_slots FORCE ROW LEVEL SECURITY;
      ALTER TABLE timetable_audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE timetable_audit_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS timetable_versions_rls_policy ON timetable_versions;
      CREATE POLICY timetable_versions_rls_policy ON timetable_versions
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS timetable_slots_rls_policy ON timetable_slots;
      CREATE POLICY timetable_slots_rls_policy ON timetable_slots
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS timetable_audit_logs_rls_policy ON timetable_audit_logs;
      CREATE POLICY timetable_audit_logs_rls_policy ON timetable_audit_logs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `);

    this.logger.log('Timetable schema verified');
  }
}
