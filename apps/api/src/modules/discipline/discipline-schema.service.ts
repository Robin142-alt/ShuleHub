import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

const DISCIPLINE_TABLES = [
  'offense_categories',
  'discipline_incidents',
  'discipline_actions',
  'discipline_comments',
  'discipline_attachments',
  'discipline_audit_logs',
  'discipline_notifications',
  'behavior_points',
  'commendations',
  'parent_acknowledgements',
  'counselling_referrals',
  'counselling_sessions',
  'counselling_notes',
  'behavior_improvement_plans',
  'behavior_improvement_plan_steps',
  'discipline_document_templates',
  'discipline_generated_documents',
] as const;

@Injectable()
export class DisciplineSchemaService implements OnModuleInit {
  private readonly logger = new Logger(DisciplineSchemaService.name);

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

      CREATE OR REPLACE FUNCTION app.prevent_discipline_audit_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'discipline audit table "%" cannot be %', TG_TABLE_NAME, lower(TG_OP)
          USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;

      CREATE SEQUENCE IF NOT EXISTS discipline_incident_number_seq;

      CREATE TABLE IF NOT EXISTS offense_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        description text,
        default_severity text NOT NULL DEFAULT 'medium',
        default_points integer NOT NULL DEFAULT 0,
        default_action_type text,
        notify_parent_by_default boolean NOT NULL DEFAULT false,
        escalation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_positive boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_offense_categories_tenant_code UNIQUE (tenant_id, code),
        CONSTRAINT ck_offense_categories_severity CHECK (default_severity IN ('low', 'medium', 'high', 'critical')),
        CONSTRAINT ck_offense_categories_action CHECK (
          default_action_type IS NULL
          OR default_action_type IN (
            'verbal_warning',
            'written_warning',
            'detention',
            'manual_work',
            'counselling',
            'suspension',
            'expulsion',
            'parent_meeting',
            'behavior_contract'
          )
        ),
        CONSTRAINT ck_offense_categories_name CHECK (btrim(name) <> ''),
        CONSTRAINT ck_offense_categories_code CHECK (btrim(code) <> '')
      );

      CREATE TABLE IF NOT EXISTS discipline_incidents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        class_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        offense_category_id uuid NOT NULL,
        reporting_staff_id uuid NOT NULL,
        assigned_staff_id uuid,
        incident_number text NOT NULL,
        title text NOT NULL,
        severity text NOT NULL,
        status text NOT NULL DEFAULT 'reported',
        occurred_at timestamptz NOT NULL,
        reported_at timestamptz NOT NULL DEFAULT now(),
        location text,
        witnesses jsonb NOT NULL DEFAULT '[]'::jsonb,
        description text NOT NULL,
        action_taken text,
        recommendations text,
        linked_counselling_referral_id uuid,
        behavior_points_delta integer NOT NULL DEFAULT 0,
        parent_notification_status text NOT NULL DEFAULT 'not_required',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_discipline_incidents_tenant_number UNIQUE (tenant_id, incident_number),
        CONSTRAINT ck_discipline_incidents_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        CONSTRAINT ck_discipline_incidents_status CHECK (
          status IN (
            'reported',
            'under_review',
            'pending_action',
            'awaiting_parent_response',
            'counselling_assigned',
            'escalated',
            'suspended',
            'resolved',
            'closed'
          )
        ),
        CONSTRAINT ck_discipline_incidents_parent_notification CHECK (
          parent_notification_status IN ('not_required', 'queued', 'sent', 'failed', 'acknowledged')
        ),
        CONSTRAINT ck_discipline_incidents_title CHECK (btrim(title) <> ''),
        CONSTRAINT ck_discipline_incidents_description CHECK (btrim(description) <> '')
      );

      CREATE TABLE IF NOT EXISTS discipline_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        incident_id uuid NOT NULL,
        student_id uuid NOT NULL,
        action_type text NOT NULL,
        status text NOT NULL DEFAULT 'assigned',
        title text NOT NULL,
        description text,
        assigned_staff_id uuid,
        due_at timestamptz,
        completed_at timestamptz,
        approved_by_user_id uuid,
        approved_at timestamptz,
        completion_notes text,
        remarks text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_discipline_actions_type CHECK (
          action_type IN (
            'verbal_warning',
            'written_warning',
            'detention',
            'manual_work',
            'counselling',
            'suspension',
            'expulsion',
            'parent_meeting',
            'behavior_contract'
          )
        ),
        CONSTRAINT ck_discipline_actions_status CHECK (status IN ('assigned', 'pending_approval', 'approved', 'completed', 'cancelled')),
        CONSTRAINT ck_discipline_actions_title CHECK (btrim(title) <> '')
      );

      CREATE TABLE IF NOT EXISTS discipline_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        incident_id uuid NOT NULL,
        author_user_id uuid,
        visibility text NOT NULL DEFAULT 'public',
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_discipline_comments_visibility CHECK (visibility IN ('public', 'internal')),
        CONSTRAINT ck_discipline_comments_body CHECK (btrim(body) <> '')
      );

      CREATE TABLE IF NOT EXISTS discipline_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        incident_id uuid NOT NULL,
        action_id uuid,
        uploaded_by_user_id uuid,
        file_object_id uuid,
        file_name text NOT NULL,
        mime_type text NOT NULL,
        file_size bigint NOT NULL,
        storage_path text NOT NULL,
        visibility text NOT NULL DEFAULT 'internal',
        scan_status text NOT NULL DEFAULT 'not_scanned',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_discipline_attachments_visibility CHECK (visibility IN ('internal', 'parent_visible')),
        CONSTRAINT ck_discipline_attachments_size CHECK (file_size >= 0)
      );

      CREATE TABLE IF NOT EXISTS discipline_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        actor_user_id uuid,
        actor_role text,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid,
        ip_address text,
        user_agent text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_discipline_audit_logs_action CHECK (btrim(action) <> ''),
        CONSTRAINT ck_discipline_audit_logs_entity CHECK (btrim(entity_type) <> '')
      );

      CREATE TABLE IF NOT EXISTS discipline_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        incident_id uuid,
        student_id uuid,
        recipient_user_id uuid,
        notification_type text NOT NULL,
        channel text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        title text NOT NULL,
        body text NOT NULL,
        scheduled_for timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        last_error text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_discipline_notifications_channel CHECK (channel IN ('in_app', 'email', 'sms')),
        CONSTRAINT ck_discipline_notifications_status CHECK (status IN ('queued', 'sent', 'failed', 'cancelled'))
      );

      CREATE TABLE IF NOT EXISTS behavior_points (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        class_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        source_type text NOT NULL,
        source_id uuid NOT NULL,
        points_delta integer NOT NULL,
        reason text NOT NULL,
        awarded_by_user_id uuid,
        awarded_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_behavior_points_source CHECK (source_type IN ('incident', 'commendation', 'correction')),
        CONSTRAINT ck_behavior_points_reason CHECK (btrim(reason) <> '')
      );

      CREATE TABLE IF NOT EXISTS commendations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        class_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        points_delta integer NOT NULL,
        awarded_by_user_id uuid,
        awarded_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_commendations_points_positive CHECK (points_delta > 0),
        CONSTRAINT ck_commendations_title CHECK (btrim(title) <> '')
      );

      CREATE TABLE IF NOT EXISTS parent_acknowledgements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        incident_id uuid NOT NULL,
        student_id uuid NOT NULL,
        parent_user_id uuid NOT NULL,
        acknowledgement_note text,
        ip_address text,
        user_agent text,
        acknowledged_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_parent_acknowledgements_once UNIQUE (tenant_id, incident_id, parent_user_id)
      );

      CREATE TABLE IF NOT EXISTS counselling_referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        class_id uuid NOT NULL,
        academic_term_id uuid NOT NULL,
        academic_year_id uuid NOT NULL,
        incident_id uuid,
        referred_by_user_id uuid NOT NULL,
        counsellor_user_id uuid,
        status text NOT NULL DEFAULT 'open',
        reason text NOT NULL,
        risk_level text NOT NULL DEFAULT 'medium',
        response_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_counselling_referrals_status CHECK (status IN ('open', 'accepted', 'declined', 'closed')),
        CONSTRAINT ck_counselling_referrals_risk CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        CONSTRAINT ck_counselling_referrals_reason CHECK (btrim(reason) <> '')
      );

      CREATE TABLE IF NOT EXISTS counselling_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        referral_id uuid,
        counsellor_user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'scheduled',
        scheduled_for timestamptz NOT NULL,
        completed_at timestamptz,
        location text,
        agenda text,
        outcome_summary text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_counselling_sessions_status CHECK (status IN ('scheduled', 'completed', 'missed', 'cancelled'))
      );

      CREATE TABLE IF NOT EXISTS counselling_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        counselling_session_id uuid NOT NULL,
        counsellor_user_id uuid NOT NULL,
        visibility text NOT NULL DEFAULT 'internal_only',
        encrypted_note text NOT NULL,
        note_nonce text NOT NULL,
        note_auth_tag text NOT NULL,
        safe_summary text,
        risk_indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_counselling_notes_visibility CHECK (
          visibility IN ('internal_only', 'discipline_office', 'parent_visible')
        )
      );

      CREATE TABLE IF NOT EXISTS behavior_improvement_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        student_id uuid NOT NULL,
        referral_id uuid,
        session_id uuid,
        counsellor_user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'active',
        title text NOT NULL,
        goal text NOT NULL,
        parent_involvement_plan text,
        review_date date NOT NULL,
        progress_score integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_behavior_improvement_plans_status CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
        CONSTRAINT ck_behavior_improvement_plans_progress CHECK (progress_score BETWEEN 0 AND 100)
      );

      CREATE TABLE IF NOT EXISTS behavior_improvement_plan_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        plan_id uuid NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        due_at timestamptz,
        progress_percent integer NOT NULL DEFAULT 0,
        observation text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_behavior_improvement_plan_steps_status CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
        CONSTRAINT ck_behavior_improvement_plan_steps_progress CHECK (progress_percent BETWEEN 0 AND 100)
      );

      CREATE TABLE IF NOT EXISTS discipline_document_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        document_type text NOT NULL,
        title text NOT NULL,
        body_template text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_discipline_document_templates_type UNIQUE (tenant_id, school_id, document_type)
      );

      CREATE TABLE IF NOT EXISTS discipline_generated_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_id uuid NOT NULL,
        incident_id uuid,
        action_id uuid,
        student_id uuid NOT NULL,
        document_type text NOT NULL,
        document_number text NOT NULL,
        file_object_id uuid,
        verification_token_hash text NOT NULL,
        generated_by_user_id uuid,
        generated_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_discipline_generated_documents_number UNIQUE (tenant_id, document_number)
      );

      ALTER TABLE discipline_incidents
        ADD COLUMN IF NOT EXISTS linked_counselling_referral_id uuid;

      CREATE INDEX IF NOT EXISTS ix_discipline_incidents_tenant_status
        ON discipline_incidents (tenant_id, status, occurred_at DESC)
        WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS ix_discipline_incidents_student_term
        ON discipline_incidents (tenant_id, student_id, academic_year_id, academic_term_id, occurred_at DESC)
        WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS ix_discipline_incidents_class_severity
        ON discipline_incidents (tenant_id, class_id, severity, occurred_at DESC)
        WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS ix_discipline_incidents_search
        ON discipline_incidents
        USING GIN (
          to_tsvector('simple'::regconfig, incident_number || ' ' || title || ' ' || description)
        );
      CREATE INDEX IF NOT EXISTS ix_discipline_actions_incident_due
        ON discipline_actions (tenant_id, incident_id, due_at ASC, status);
      CREATE INDEX IF NOT EXISTS ix_counselling_sessions_counsellor_schedule
        ON counselling_sessions (tenant_id, counsellor_user_id, scheduled_for ASC, status);
      CREATE INDEX IF NOT EXISTS ix_behavior_points_student_term
        ON behavior_points (tenant_id, student_id, academic_year_id, academic_term_id, awarded_at DESC);
      CREATE INDEX IF NOT EXISTS ix_parent_acknowledgements_incident
        ON parent_acknowledgements (tenant_id, incident_id, parent_user_id);
      CREATE INDEX IF NOT EXISTS ix_counselling_referrals_status
        ON counselling_referrals (tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_commendations_student_term
        ON commendations (tenant_id, student_id, academic_year_id, academic_term_id, awarded_at DESC);

      ${DISCIPLINE_TABLES.map((tableName) => `
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS ${tableName}_tenant_policy ON ${tableName};
      CREATE POLICY ${tableName}_tenant_policy ON ${tableName}
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );
      `).join('\n')}

      ${[
        'offense_categories',
        'discipline_incidents',
        'discipline_actions',
        'discipline_comments',
        'discipline_notifications',
        'commendations',
        'counselling_referrals',
        'counselling_sessions',
        'counselling_notes',
        'behavior_improvement_plans',
        'behavior_improvement_plan_steps',
        'discipline_document_templates',
      ].map((tableName) => `
      DROP TRIGGER IF EXISTS trg_${tableName}_set_updated_at ON ${tableName};
      CREATE TRIGGER trg_${tableName}_set_updated_at
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
      `).join('\n')}

      DROP TRIGGER IF EXISTS trg_discipline_audit_logs_prevent_mutation ON discipline_audit_logs;
      CREATE TRIGGER trg_discipline_audit_logs_prevent_mutation
      BEFORE UPDATE OR DELETE ON discipline_audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_discipline_audit_mutation();

      DROP TRIGGER IF EXISTS trg_behavior_points_prevent_mutation ON behavior_points;
      CREATE TRIGGER trg_behavior_points_prevent_mutation
      BEFORE UPDATE OR DELETE ON behavior_points
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_discipline_audit_mutation();
    `);

    this.logger.log('Discipline and counselling schema verified');
  }
}
