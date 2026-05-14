import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

const HR_TABLES = [
  'staff_departments',
  'staff_job_titles',
  'staff_profiles',
  'staff_contracts',
  'staff_leave_balances',
  'staff_leave_requests',
  'staff_documents',
  'staff_document_expiry_reminders',
  'staff_audit_logs',
] as const;

@Injectable()
export class HrSchemaService implements OnModuleInit {
  private readonly logger = new Logger(HrSchemaService.name);

  constructor(private readonly databaseService: Pick<DatabaseService, 'runSchemaBootstrap'>) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE TABLE IF NOT EXISTS staff_departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_staff_departments_tenant_name UNIQUE (tenant_id, lower(name))
      );

      CREATE TABLE IF NOT EXISTS staff_job_titles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        department_id uuid,
        title text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid,
        staff_number text NOT NULL,
        display_name text NOT NULL,
        department_id uuid,
        job_title_id uuid,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'suspended', 'exited')),
        statutory_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
        emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_staff_profiles_tenant_number UNIQUE (tenant_id, staff_number)
      );

      CREATE TABLE IF NOT EXISTS staff_contracts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        staff_profile_id uuid NOT NULL,
        role_title text NOT NULL,
        starts_on date NOT NULL,
        ends_on date,
        employment_type text NOT NULL,
        workload text NOT NULL,
        approval_state text NOT NULL CHECK (approval_state IN ('draft', 'approved', 'ended')),
        approved_by_user_id uuid,
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff_leave_balances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        staff_profile_id uuid NOT NULL,
        leave_type text NOT NULL,
        available_days numeric(8,2) NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_staff_leave_balances_tenant_staff_type UNIQUE (tenant_id, staff_profile_id, leave_type)
      );

      CREATE TABLE IF NOT EXISTS staff_leave_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        staff_profile_id uuid NOT NULL,
        leave_type text NOT NULL,
        requested_days numeric(8,2) NOT NULL,
        status text NOT NULL CHECK (status IN ('requested', 'approved', 'rejected')),
        override_reason text,
        approved_by_user_id uuid,
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        staff_profile_id uuid NOT NULL,
        document_type text NOT NULL,
        stored_path text NOT NULL,
        verification_status text NOT NULL DEFAULT 'pending',
        expires_on date,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff_document_expiry_reminders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        staff_document_id uuid NOT NULL,
        reminder_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        staff_profile_id uuid,
        actor_user_id uuid,
        action text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      ${HR_TABLES.map((table) => `
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS ${table}_rls_policy ON ${table};
        CREATE POLICY ${table}_rls_policy ON ${table}
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
      `).join('\n')}
    `);

    this.logger.log('HR staff management schema verified');
  }
}
