import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthSchemaService implements OnModuleInit {
  private readonly logger = new Logger(AuthSchemaService.name);

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

      CREATE OR REPLACE FUNCTION app.find_user_by_email_for_auth(input_email text)
      RETURNS TABLE (
        id uuid,
        tenant_id text,
        email text,
        password_hash text,
        display_name text,
        status text,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_user_id text;
        request_tenant_id text;
        request_path text;
      BEGIN
        request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
        request_tenant_id := NULLIF(current_setting('app.tenant_id', true), '');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

        IF request_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context is required for auth user lookup'
            USING ERRCODE = '42501';
        END IF;

        IF request_user_id <> 'anonymous' THEN
          RAISE EXCEPTION 'Auth user lookup is only available before authentication'
            USING ERRCODE = '42501';
        END IF;

        IF request_path NOT IN ('/auth/login', '/auth/register') THEN
          RAISE EXCEPTION 'Auth user lookup is only available on login and registration routes'
            USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          u.id,
          u.tenant_id,
          u.email,
          u.password_hash,
          u.display_name,
          u.status,
          u.created_at,
          u.updated_at
        FROM users u
        WHERE lower(u.email) = lower(input_email)
        LIMIT 1;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.ensure_global_user_for_seed(
        input_email text,
        input_password_hash text,
        input_display_name text
      )
      RETURNS TABLE (
        id uuid,
        tenant_id text,
        email text,
        password_hash text,
        display_name text,
        status text,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_tenant_id text;
        request_role text;
        request_path text;
        existing_user_id uuid;
      BEGIN
        request_tenant_id := NULLIF(current_setting('app.tenant_id', true), '');
        request_role := COALESCE(NULLIF(current_setting('app.role', true), ''), '');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

        IF request_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context is required for seed user upsert'
            USING ERRCODE = '42501';
        END IF;

        IF request_role <> 'system' THEN
          RAISE EXCEPTION 'Seed user upsert is restricted to the system role'
            USING ERRCODE = '42501';
        END IF;

        IF request_path <> '/internal/seed' THEN
          RAISE EXCEPTION 'Seed user upsert is only available on the internal seed path'
            USING ERRCODE = '42501';
        END IF;

        SELECT u.id
        INTO existing_user_id
        FROM users u
        WHERE lower(u.email) = lower(input_email)
        LIMIT 1
        FOR UPDATE;

        IF existing_user_id IS NULL THEN
          RETURN QUERY
          INSERT INTO users (tenant_id, email, password_hash, display_name, status)
          VALUES ('global', lower(input_email), input_password_hash, input_display_name, 'active')
          RETURNING
            users.id,
            users.tenant_id,
            users.email,
            users.password_hash,
            users.display_name,
            users.status,
            users.created_at,
            users.updated_at;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM users u
          WHERE u.id = existing_user_id
            AND u.tenant_id <> 'global'
        ) THEN
          RAISE EXCEPTION 'Seed user upsert only supports global users'
            USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        UPDATE users
        SET
          display_name = input_display_name,
          status = 'active',
          updated_at = NOW()
        WHERE users.id = existing_user_id
        RETURNING
          users.id,
          users.tenant_id,
          users.email,
          users.password_hash,
          users.display_name,
          users.status,
          users.created_at,
          users.updated_at;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.ensure_global_user_for_registration(
        input_email text,
        input_password_hash text,
        input_display_name text
      )
      RETURNS TABLE (
        id uuid,
        tenant_id text,
        email text,
        password_hash text,
        display_name text,
        status text,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_user_id text;
        request_tenant_id text;
        request_path text;
        normalized_email text;
        existing_user_id uuid;
      BEGIN
        request_tenant_id := NULLIF(current_setting('app.tenant_id', true), '');
        request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');
        normalized_email := lower(input_email);

        IF request_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context is required for auth registration'
            USING ERRCODE = '42501';
        END IF;

        IF request_user_id <> 'anonymous' THEN
          RAISE EXCEPTION 'Auth registration helper is only available before authentication'
            USING ERRCODE = '42501';
        END IF;

        IF request_path <> '/auth/register' THEN
          RAISE EXCEPTION 'Auth registration helper is only available on the registration route'
            USING ERRCODE = '42501';
        END IF;

        SELECT u.id
        INTO existing_user_id
        FROM users u
        WHERE lower(u.email) = normalized_email
        LIMIT 1
        FOR UPDATE;

        IF existing_user_id IS NULL THEN
          RETURN QUERY
          INSERT INTO users (tenant_id, email, password_hash, display_name, status)
          VALUES ('global', normalized_email, input_password_hash, input_display_name, 'active')
          RETURNING
            users.id,
            users.tenant_id,
            users.email,
            users.password_hash,
            users.display_name,
            users.status,
            users.created_at,
            users.updated_at;
          RETURN;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM users u
          WHERE u.id = existing_user_id
            AND u.tenant_id <> 'global'
        ) THEN
          RAISE EXCEPTION 'Auth registration helper only supports global users'
            USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          users.id,
          users.tenant_id,
          users.email,
          users.password_hash,
          users.display_name,
          users.status,
          users.created_at,
          users.updated_at
        FROM users
        WHERE users.id = existing_user_id
        LIMIT 1;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.ensure_global_user_for_invitation(
        input_email text,
        input_password_hash text,
        input_display_name text
      )
      RETURNS TABLE (
        id uuid,
        tenant_id text,
        email text,
        password_hash text,
        display_name text,
        status text,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_tenant_id text;
        request_role text;
        request_path text;
        normalized_email text;
        existing_user_id uuid;
      BEGIN
        request_tenant_id := NULLIF(current_setting('app.tenant_id', true), '');
        request_role := COALESCE(NULLIF(current_setting('app.role', true), ''), '');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');
        normalized_email := lower(input_email);

        IF request_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context is required for invitation acceptance'
            USING ERRCODE = '42501';
        END IF;

        IF request_path <> '/auth/invitations/accept'
          AND request_role NOT IN ('platform_owner', 'superadmin', 'system') THEN
          RAISE EXCEPTION 'Invitation user activation is restricted'
            USING ERRCODE = '42501';
        END IF;

        SELECT u.id
        INTO existing_user_id
        FROM users u
        WHERE lower(u.email) = normalized_email
        LIMIT 1
        FOR UPDATE;

        IF existing_user_id IS NULL THEN
          RETURN QUERY
          INSERT INTO users (tenant_id, email, password_hash, display_name, status)
          VALUES ('global', normalized_email, input_password_hash, input_display_name, 'active')
          RETURNING
            users.id,
            users.tenant_id,
            users.email,
            users.password_hash,
            users.display_name,
            users.status,
            users.created_at,
            users.updated_at;
          RETURN;
        END IF;

        RETURN QUERY
        UPDATE users
        SET
          password_hash = input_password_hash,
          display_name = input_display_name,
          status = 'active',
          updated_at = NOW()
        WHERE users.id = existing_user_id
          AND users.tenant_id = 'global'
        RETURNING
          users.id,
          users.tenant_id,
          users.email,
          users.password_hash,
          users.display_name,
          users.status,
          users.created_at,
          users.updated_at;
      END;
      $$;

      CREATE OR REPLACE FUNCTION app.update_global_user_password_for_reset(
        input_user_id uuid,
        input_password_hash text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, app, pg_temp
      AS $$
      DECLARE
        request_tenant_id text;
        request_role text;
        request_path text;
      BEGIN
        request_tenant_id := NULLIF(current_setting('app.tenant_id', true), '');
        request_role := COALESCE(NULLIF(current_setting('app.role', true), ''), '');
        request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

        IF request_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context is required for password reset'
            USING ERRCODE = '42501';
        END IF;

        IF request_path <> '/auth/password/reset'
          AND request_role NOT IN ('platform_owner', 'superadmin', 'system') THEN
          RAISE EXCEPTION 'Password reset helper is restricted'
            USING ERRCODE = '42501';
        END IF;

        UPDATE users
        SET password_hash = input_password_hash, updated_at = NOW()
        WHERE id = input_user_id
          AND tenant_id = 'global';

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Password reset target user was not found'
            USING ERRCODE = 'P0002';
        END IF;
      END;
      $$;

      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL DEFAULT 'global',
        email text NOT NULL,
        password_hash text NOT NULL,
        display_name text NOT NULL,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        description text,
        is_system boolean NOT NULL DEFAULT FALSE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        resource text NOT NULL,
        action text NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));
      CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users (tenant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_tenant_code ON roles (tenant_id, code);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_permissions_tenant_resource_action ON permissions (tenant_id, resource, action);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_role_permissions_tenant_role_permission ON role_permissions (tenant_id, role_id, permission_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_memberships_tenant_user ON tenant_memberships (tenant_id, user_id);
      CREATE INDEX IF NOT EXISTS ix_tenant_memberships_user_id ON tenant_memberships (user_id);

      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE users FORCE ROW LEVEL SECURITY;
      ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE roles FORCE ROW LEVEL SECURITY;
      ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
      ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
      ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS users_rls_policy ON users;
      DROP POLICY IF EXISTS users_select_policy ON users;
      DROP POLICY IF EXISTS users_insert_policy ON users;
      DROP POLICY IF EXISTS users_update_policy ON users;
      DROP POLICY IF EXISTS users_delete_policy ON users;
      CREATE POLICY users_select_policy ON users
      FOR SELECT
      USING (
        (
          tenant_id = 'global'
          AND id::text = NULLIF(current_setting('app.user_id', true), '')
        )
        OR tenant_id = current_setting('app.tenant_id', true)
      );
      CREATE POLICY users_insert_policy ON users
      FOR INSERT
      WITH CHECK (
        tenant_id = 'global'
        OR tenant_id = current_setting('app.tenant_id', true)
      );
      CREATE POLICY users_update_policy ON users
      FOR UPDATE
      USING (
        (
          tenant_id = 'global'
          AND id::text = NULLIF(current_setting('app.user_id', true), '')
        )
        OR tenant_id = current_setting('app.tenant_id', true)
      )
      WITH CHECK (
        (
          tenant_id = 'global'
          AND id::text = NULLIF(current_setting('app.user_id', true), '')
        )
        OR tenant_id = current_setting('app.tenant_id', true)
      );
      CREATE POLICY users_delete_policy ON users
      FOR DELETE
      USING (
        tenant_id = 'global'
        AND id::text = NULLIF(current_setting('app.user_id', true), '')
      );

      DROP POLICY IF EXISTS roles_rls_policy ON roles;
      CREATE POLICY roles_rls_policy ON roles
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS permissions_rls_policy ON permissions;
      CREATE POLICY permissions_rls_policy ON permissions
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS role_permissions_rls_policy ON role_permissions;
      CREATE POLICY role_permissions_rls_policy ON role_permissions
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP POLICY IF EXISTS tenant_memberships_rls_policy ON tenant_memberships;
      CREATE POLICY tenant_memberships_rls_policy ON tenant_memberships
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
      );

      DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
      CREATE TRIGGER trg_users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_roles_set_updated_at ON roles;
      CREATE TRIGGER trg_roles_set_updated_at
      BEFORE UPDATE ON roles
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_permissions_set_updated_at ON permissions;
      CREATE TRIGGER trg_permissions_set_updated_at
      BEFORE UPDATE ON permissions
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_role_permissions_set_updated_at ON role_permissions;
      CREATE TRIGGER trg_role_permissions_set_updated_at
      BEFORE UPDATE ON role_permissions
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_tenant_memberships_set_updated_at ON tenant_memberships;
      CREATE TRIGGER trg_tenant_memberships_set_updated_at
      BEFORE UPDATE ON tenant_memberships
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Authentication schema and RLS policies verified');
  }
}
