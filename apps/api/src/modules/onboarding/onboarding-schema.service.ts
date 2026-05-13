import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class OnboardingSchemaService implements OnModuleInit {
  private readonly logger = new Logger(OnboardingSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        school_name text NOT NULL,
        slug text NOT NULL,
        primary_domain text NOT NULL,
        contact_email text NOT NULL,
        phone text NOT NULL,
        address text NOT NULL,
        county text NOT NULL,
        plan_code text NOT NULL,
        student_limit integer NOT NULL,
        status text NOT NULL DEFAULT 'provisioning',
        onboarding_status text NOT NULL DEFAULT 'created',
        branding jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_tenants_status CHECK (status IN ('provisioning', 'active', 'past_due', 'suspended', 'archived')),
        CONSTRAINT ck_tenants_onboarding_status CHECK (onboarding_status IN ('created', 'admin_invited', 'admin_activated', 'setup_in_progress', 'complete')),
        CONSTRAINT ck_tenants_student_limit CHECK (student_limit > 0),
        CONSTRAINT ck_tenants_slug CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$')
      );

      CREATE TABLE IF NOT EXISTS user_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        email text NOT NULL,
        display_name text NOT NULL,
        role text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        accepted_user_id uuid,
        revoked_at timestamptz,
        created_by_user_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_user_invitations_status CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
      );

      CREATE TABLE IF NOT EXISTS invitation_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        invitation_id uuid NOT NULL REFERENCES user_invitations(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid NOT NULL,
        email text NOT NULL,
        token_hash text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        requested_ip inet,
        requested_user_agent text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_password_resets_status CHECK (status IN ('pending', 'used', 'expired', 'revoked'))
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        actor_user_id uuid,
        request_id text,
        action text NOT NULL,
        resource_type text NOT NULL,
        resource_id uuid,
        ip_address inet,
        user_agent text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL DEFAULT NOW(),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_tenant_id ON tenants (tenant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_slug ON tenants (slug);
      CREATE INDEX IF NOT EXISTS ix_tenants_status ON tenants (status, onboarding_status);
      CREATE INDEX IF NOT EXISTS ix_user_invitations_tenant_email ON user_invitations (tenant_id, lower(email), status);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_invitation_tokens_hash ON invitation_tokens (token_hash);
      CREATE INDEX IF NOT EXISTS ix_password_resets_lookup ON password_resets (token_hash, status, expires_at);
      CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_occurred_at ON audit_logs (tenant_id, occurred_at DESC);

      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
      ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE user_invitations FORCE ROW LEVEL SECURITY;
      ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;
      ALTER TABLE invitation_tokens FORCE ROW LEVEL SECURITY;
      ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;
      ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenants_rls_policy ON tenants;
      CREATE POLICY tenants_rls_policy ON tenants
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS user_invitations_rls_policy ON user_invitations;
      CREATE POLICY user_invitations_rls_policy ON user_invitations
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS invitation_tokens_rls_policy ON invitation_tokens;
      CREATE POLICY invitation_tokens_rls_policy ON invitation_tokens
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS password_resets_rls_policy ON password_resets;
      CREATE POLICY password_resets_rls_policy ON password_resets
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS audit_logs_rls_policy ON audit_logs;
      CREATE POLICY audit_logs_rls_policy ON audit_logs
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );
    `);

    this.logger.log('Tenant onboarding, invitation, password reset, and audit schema verified');
  }
}
