BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;

CREATE DOMAIN tenant_key AS text
  CHECK (
    VALUE = 'global'
    OR VALUE ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
  );

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$;

CREATE OR REPLACE FUNCTION app.current_role_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  current_user_setting text;
BEGIN
  current_user_setting := NULLIF(current_setting('app.user_id', true), '');

  IF current_user_setting IS NULL OR current_user_setting = 'anonymous' THEN
    RETURN NULL;
  END IF;

  RETURN current_user_setting::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

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
  request_path text;
BEGIN
  request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
  request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

  IF request_user_id <> 'anonymous' THEN
    RAISE EXCEPTION 'Auth user lookup is only available before authentication'
      USING ERRCODE = '42501';
  END IF;

  IF request_path <> '/auth/login' THEN
    RAISE EXCEPTION 'Auth user lookup is only available on login routes'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.tenant_id,
    u.email::text,
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

DROP FUNCTION IF EXISTS app.ensure_global_user_for_seed(text, text, text);
DROP FUNCTION IF EXISTS app.ensure_global_user_for_registration(text, text, text);

CREATE OR REPLACE FUNCTION app.find_active_memberships_by_user_for_auth(input_user_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id text,
  user_id uuid,
  role_id uuid,
  role_code text,
  role_name text,
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
  request_path text;
BEGIN
  request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
  request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

  IF request_user_id <> 'anonymous' THEN
    RAISE EXCEPTION 'Membership auto-resolution is only available before authentication'
      USING ERRCODE = '42501';
  END IF;

  IF request_path <> '/auth/login' THEN
    RAISE EXCEPTION 'Membership auto-resolution is only available on login routes'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tm.id,
    tm.tenant_id,
    tm.user_id,
    tm.role_id,
    r.code AS role_code,
    r.name AS role_name,
    tm.status,
    tm.created_at,
    tm.updated_at
  FROM tenant_memberships tm
  INNER JOIN roles r
    ON r.tenant_id = tm.tenant_id
   AND r.id = tm.role_id
  WHERE tm.user_id = input_user_id
    AND tm.status = 'active'
  ORDER BY tm.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION app.create_global_user_from_invitation(
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
  request_path text;
  normalized_email text;
  existing_user_id uuid;
BEGIN
  request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
  request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');
  normalized_email := lower(input_email);

  IF request_user_id <> 'anonymous' THEN
    RAISE EXCEPTION 'Invitation account setup is only available before authentication'
      USING ERRCODE = '42501';
  END IF;

  IF request_path <> '/auth/invitations/accept' THEN
    RAISE EXCEPTION 'Invitation account setup is only available through invitation acceptance'
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
    RAISE EXCEPTION 'Invitation account setup only supports global users'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    users.id,
    users.tenant_id,
    users.email::text,
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

CREATE OR REPLACE FUNCTION app.find_platform_owner_by_email_for_auth(input_email text)
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
  request_path text;
BEGIN
  request_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), 'anonymous');
  request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

  IF request_user_id <> 'anonymous' THEN
    RAISE EXCEPTION 'Platform owner lookup is only available before authentication'
      USING ERRCODE = '42501';
  END IF;

  IF request_path <> '/auth/login' THEN
    RAISE EXCEPTION 'Platform owner lookup is only available on login routes'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.tenant_id::text,
    u.email::text,
    u.password_hash,
    u.display_name,
    u.status,
    u.created_at,
    u.updated_at
  FROM users u
  WHERE lower(u.email) = lower(input_email)
    AND u.tenant_id = 'global'
    AND u.user_type = 'platform_owner'
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION app.find_platform_owner_by_id_for_auth(input_user_id uuid)
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
  request_path text;
BEGIN
  request_path := COALESCE(NULLIF(current_setting('app.path', true), ''), '');

  IF request_path NOT IN ('/auth/refresh', '/auth/me') THEN
    RAISE EXCEPTION 'Platform owner lookup is only available on authenticated auth routes'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.tenant_id::text,
    u.email::text,
    u.password_hash,
    u.display_name,
    u.status,
    u.created_at,
    u.updated_at
  FROM users u
  WHERE u.id = input_user_id
    AND u.tenant_id = 'global'
    AND u.user_type = 'platform_owner'
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table "%" cannot be %', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION app.validate_financial_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_tenant_id text;
  target_transaction_id uuid;
  entry_count integer;
  debit_total bigint;
  credit_total bigint;
  currency_count integer;
BEGIN
  target_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  IF TG_TABLE_NAME = 'transactions' THEN
    target_transaction_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE 0 END), 0)::bigint,
    COUNT(DISTINCT currency_code)::integer
  INTO entry_count, debit_total, credit_total, currency_count
  FROM ledger_entries
  WHERE tenant_id = target_tenant_id
    AND transaction_id = target_transaction_id;

  IF entry_count < 2 THEN
    RAISE EXCEPTION 'financial transaction "%" must have at least two ledger entries', target_transaction_id
      USING ERRCODE = '23514';
  END IF;

  IF currency_count <> 1 THEN
    RAISE EXCEPTION 'financial transaction "%" must use exactly one currency', target_transaction_id
      USING ERRCODE = '23514';
  END IF;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'financial transaction "%" is unbalanced: debits (%) do not equal credits (%)',
      target_transaction_id, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL DEFAULT 'global',
  email citext NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  user_type text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  email_verified_at timestamptz,
  recovery_email text,
  mfa_enabled boolean NOT NULL DEFAULT FALSE,
  mfa_verified_at timestamptz,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_users_tenant_id_global CHECK (tenant_id = 'global'),
  CONSTRAINT ck_users_user_type CHECK (user_type IN ('member', 'platform_owner')),
  CONSTRAINT ck_users_status CHECK (status IN ('active', 'disabled', 'locked')),
  CONSTRAINT ck_users_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT ck_users_password_hash_not_blank CHECK (btrim(password_hash) <> ''),
  CONSTRAINT uq_users_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_roles_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_roles_code_format CHECK (code ~ '^[a-z][a-z0-9_:-]{1,62}$'),
  CONSTRAINT ck_roles_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT uq_roles_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_roles_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_permissions_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_permissions_resource_not_blank CHECK (btrim(resource) <> ''),
  CONSTRAINT ck_permissions_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT uq_permissions_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_permissions_tenant_resource_action UNIQUE (tenant_id, resource, action)
);

CREATE TABLE role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_role_permissions_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT uq_role_permissions_tenant_role_permission UNIQUE (tenant_id, role_id, permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (tenant_id, permission_id)
    REFERENCES permissions (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invited_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_tenant_memberships_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_tenant_memberships_status CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
  CONSTRAINT uq_tenant_memberships_tenant_user UNIQUE (tenant_id, user_id),
  CONSTRAINT fk_tenant_memberships_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tenant_memberships_role
    FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_tenant_memberships_invited_by_user
    FOREIGN KEY (invited_by_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE auth_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key,
  user_id uuid,
  email citext NOT NULL,
  purpose text NOT NULL,
  token_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_auth_action_tokens_purpose CHECK (
    purpose IN (
      'invite_acceptance',
      'password_recovery',
      'email_verification',
      'mfa_verification',
      'device_verification',
      'account_activation'
    )
  ),
  CONSTRAINT fk_auth_action_tokens_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
);

CREATE TABLE auth_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key,
  user_id uuid,
  recipient_email citext NOT NULL,
  template text NOT NULL,
  subject text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_auth_email_outbox_template CHECK (
    template IN (
      'invite_acceptance',
      'password_recovery',
      'email_verification',
      'mfa_verification',
      'login_alert',
      'suspicious_login_alert',
      'school_invitation',
      'account_activation'
    )
  ),
  CONSTRAINT ck_auth_email_outbox_status CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  CONSTRAINT ck_auth_email_outbox_attempts CHECK (attempts >= 0),
  CONSTRAINT fk_auth_email_outbox_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  user_id uuid,
  consent_type text NOT NULL,
  status text NOT NULL,
  policy_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_consent_records_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_consent_records_consent_type_not_blank CHECK (btrim(consent_type) <> ''),
  CONSTRAINT ck_consent_records_policy_version_not_blank CHECK (btrim(policy_version) <> ''),
  CONSTRAINT ck_consent_records_status CHECK (status IN ('granted', 'revoked', 'withdrawn')),
  CONSTRAINT uq_consent_records_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_consent_records_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
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
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_audit_logs_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_audit_logs_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT ck_audit_logs_resource_type_not_blank CHECK (btrim(resource_type) <> ''),
  CONSTRAINT fk_audit_logs_actor_user
    FOREIGN KEY (actor_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  event_key text NOT NULL,
  event_name text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT NOW(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_outbox_events_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_outbox_events_event_key_not_blank CHECK (btrim(event_key) <> ''),
  CONSTRAINT ck_outbox_events_event_name_not_blank CHECK (btrim(event_name) <> ''),
  CONSTRAINT ck_outbox_events_aggregate_type_not_blank CHECK (btrim(aggregate_type) <> ''),
  CONSTRAINT ck_outbox_events_status CHECK (status IN ('pending', 'processing', 'published', 'failed', 'discarded')),
  CONSTRAINT ck_outbox_events_attempt_count_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT uq_outbox_events_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_outbox_events_tenant_event_key UNIQUE (tenant_id, event_key)
);

CREATE TABLE event_consumer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  outbox_event_id uuid NOT NULL,
  event_key text NOT NULL,
  consumer_name text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_event_consumer_runs_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_event_consumer_runs_event_key_not_blank CHECK (btrim(event_key) <> ''),
  CONSTRAINT ck_event_consumer_runs_consumer_name_not_blank CHECK (btrim(consumer_name) <> ''),
  CONSTRAINT ck_event_consumer_runs_status CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT ck_event_consumer_runs_attempt_count_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT uq_event_consumer_runs_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_event_consumer_runs_tenant_outbox_consumer UNIQUE (tenant_id, outbox_event_id, consumer_name),
  CONSTRAINT uq_event_consumer_runs_tenant_consumer_event_key UNIQUE (tenant_id, consumer_name, event_key),
  CONSTRAINT fk_event_consumer_runs_outbox_event
    FOREIGN KEY (tenant_id, outbox_event_id)
    REFERENCES outbox_events (tenant_id, id)
    ON DELETE CASCADE
);

DROP FUNCTION IF EXISTS app.claim_outbox_events(integer, integer);

CREATE FUNCTION app.claim_outbox_events(
  batch_size integer,
  stale_processing_after_ms integer
)
RETURNS TABLE (
  id uuid,
  tenant_id text,
  request_id text,
  trace_id text,
  span_id text,
  user_id text,
  role text,
  session_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF batch_size IS NULL OR batch_size < 1 THEN
    RAISE EXCEPTION 'batch_size must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF stale_processing_after_ms IS NULL OR stale_processing_after_ms < 0 THEN
    RAISE EXCEPTION 'stale_processing_after_ms must be zero or greater'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate_events AS (
    SELECT outbox_events.id
    FROM outbox_events
    WHERE (
      outbox_events.status = 'pending'
      AND outbox_events.available_at <= NOW()
    )
    OR (
      outbox_events.status = 'failed'
      AND outbox_events.available_at <= NOW()
    )
    OR (
      outbox_events.status = 'processing'
      AND outbox_events.updated_at <= NOW() - (stale_processing_after_ms * INTERVAL '1 millisecond')
    )
    ORDER BY outbox_events.available_at ASC, outbox_events.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  )
  UPDATE outbox_events AS target
  SET
    status = 'processing',
    attempt_count = target.attempt_count + 1,
    last_error = NULL,
    updated_at = NOW()
  FROM candidate_events
  WHERE target.id = candidate_events.id
RETURNING
  target.id,
  target.tenant_id,
  COALESCE(NULLIF(target.headers ->> 'request_id', ''), format('outbox:%s', target.id)),
  COALESCE(
    NULLIF(target.headers ->> 'trace_id', ''),
    NULLIF(target.headers ->> 'request_id', ''),
    format('outbox:%s', target.id)
  ),
  NULLIF(target.headers ->> 'span_id', ''),
  COALESCE(NULLIF(target.headers ->> 'user_id', ''), 'anonymous'),
  COALESCE(NULLIF(target.headers ->> 'role', ''), 'system'),
  NULLIF(target.headers ->> 'session_id', '');
END;
$$;

REVOKE ALL ON FUNCTION app.claim_outbox_events(integer, integer) FROM PUBLIC;

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  user_id uuid,
  scope text NOT NULL DEFAULT 'http',
  idempotency_key text NOT NULL,
  request_method text NOT NULL,
  request_path text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  response_status_code integer,
  response_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_body jsonb,
  locked_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_idempotency_keys_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_idempotency_keys_scope_not_blank CHECK (btrim(scope) <> ''),
  CONSTRAINT ck_idempotency_keys_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT ck_idempotency_keys_method_format CHECK (request_method ~ '^[A-Z]+$'),
  CONSTRAINT ck_idempotency_keys_path_not_blank CHECK (btrim(request_path) <> ''),
  CONSTRAINT ck_idempotency_keys_request_hash_not_blank CHECK (btrim(request_hash) <> ''),
  CONSTRAINT ck_idempotency_keys_status CHECK (status IN ('in_progress', 'completed', 'failed', 'expired')),
  CONSTRAINT ck_idempotency_keys_response_status_code
    CHECK (response_status_code IS NULL OR response_status_code BETWEEN 100 AND 599),
  CONSTRAINT uq_idempotency_keys_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_idempotency_keys_tenant_scope_key UNIQUE (tenant_id, scope, idempotency_key),
  CONSTRAINT fk_idempotency_keys_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  normal_balance text NOT NULL,
  currency_code char(3) NOT NULL,
  allow_manual_entries boolean NOT NULL DEFAULT TRUE,
  is_active boolean NOT NULL DEFAULT TRUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_accounts_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_accounts_category CHECK (category IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  CONSTRAINT ck_accounts_normal_balance CHECK (normal_balance IN ('debit', 'credit')),
  CONSTRAINT ck_accounts_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_accounts_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT ck_accounts_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT uq_accounts_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_accounts_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  idempotency_key_id uuid NOT NULL,
  reference text NOT NULL,
  description text NOT NULL,
  currency_code char(3) NOT NULL,
  total_amount_minor bigint NOT NULL,
  entry_count integer NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT NOW(),
  posted_at timestamptz NOT NULL DEFAULT NOW(),
  created_by_user_id uuid,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_transactions_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_transactions_reference_not_blank CHECK (btrim(reference) <> ''),
  CONSTRAINT ck_transactions_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT ck_transactions_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_transactions_total_amount_minor CHECK (total_amount_minor > 0),
  CONSTRAINT ck_transactions_entry_count CHECK (entry_count >= 2),
  CONSTRAINT uq_transactions_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_transactions_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key_id),
  CONSTRAINT uq_transactions_tenant_reference UNIQUE (tenant_id, reference),
  CONSTRAINT fk_transactions_idempotency_key
    FOREIGN KEY (tenant_id, idempotency_key_id)
    REFERENCES idempotency_keys (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_created_by_user
    FOREIGN KEY (created_by_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  transaction_id uuid NOT NULL,
  account_id uuid NOT NULL,
  line_number integer NOT NULL,
  direction text NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code char(3) NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ledger_entries_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_ledger_entries_direction CHECK (direction IN ('debit', 'credit')),
  CONSTRAINT ck_ledger_entries_amount_minor CHECK (amount_minor > 0),
  CONSTRAINT ck_ledger_entries_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT uq_ledger_entries_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_ledger_entries_transaction_line UNIQUE (tenant_id, transaction_id, line_number),
  CONSTRAINT fk_ledger_entries_transaction
    FOREIGN KEY (tenant_id, transaction_id)
    REFERENCES transactions (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_entries_account
    FOREIGN KEY (tenant_id, account_id)
    REFERENCES accounts (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  idempotency_key_id uuid NOT NULL,
  user_id uuid,
  student_id uuid,
  request_id text,
  external_reference text,
  account_reference text NOT NULL,
  transaction_desc text NOT NULL,
  phone_number text NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'pending',
  merchant_request_id text,
  checkout_request_id text,
  response_code text,
  response_description text,
  customer_message text,
  ledger_transaction_id uuid,
  failure_reason text,
  stk_requested_at timestamptz,
  callback_received_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_payment_intents_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_payment_intents_account_reference_not_blank CHECK (btrim(account_reference) <> ''),
  CONSTRAINT ck_payment_intents_transaction_desc_not_blank CHECK (btrim(transaction_desc) <> ''),
  CONSTRAINT ck_payment_intents_phone_number_not_blank CHECK (btrim(phone_number) <> ''),
  CONSTRAINT ck_payment_intents_amount_minor CHECK (amount_minor > 0),
  CONSTRAINT ck_payment_intents_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_payment_intents_status CHECK (
    status IN ('pending', 'stk_requested', 'callback_received', 'processing', 'completed', 'failed', 'cancelled', 'expired')
  ),
  CONSTRAINT uq_payment_intents_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_payment_intents_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key_id),
  CONSTRAINT uq_payment_intents_tenant_checkout_request_id UNIQUE (tenant_id, checkout_request_id),
  CONSTRAINT uq_payment_intents_tenant_merchant_request_id UNIQUE (tenant_id, merchant_request_id),
  CONSTRAINT fk_payment_intents_idempotency_key
    FOREIGN KEY (tenant_id, idempotency_key_id)
    REFERENCES idempotency_keys (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_payment_intents_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_payment_intents_ledger_transaction
    FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES transactions (tenant_id, id)
    ON DELETE SET NULL
);

CREATE TABLE callback_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  merchant_request_id text,
  checkout_request_id text,
  delivery_id text NOT NULL,
  request_fingerprint text NOT NULL,
  event_timestamp timestamptz,
  signature text,
  signature_verified boolean NOT NULL DEFAULT FALSE,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_body text NOT NULL,
  raw_payload jsonb,
  source_ip inet,
  processing_status text NOT NULL DEFAULT 'received',
  queue_job_id text,
  failure_reason text,
  queued_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_callback_logs_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_callback_logs_delivery_id_not_blank CHECK (btrim(delivery_id) <> ''),
  CONSTRAINT ck_callback_logs_request_fingerprint_not_blank CHECK (btrim(request_fingerprint) <> ''),
  CONSTRAINT ck_callback_logs_processing_status CHECK (
    processing_status IN ('received', 'queued', 'processing', 'processed', 'failed', 'rejected', 'replayed')
  ),
  CONSTRAINT uq_callback_logs_tenant_id_id UNIQUE (tenant_id, id)
);

CREATE TABLE mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  payment_intent_id uuid NOT NULL,
  callback_log_id uuid NOT NULL,
  checkout_request_id text NOT NULL,
  merchant_request_id text NOT NULL,
  result_code integer NOT NULL,
  result_desc text NOT NULL,
  status text NOT NULL,
  mpesa_receipt_number text,
  amount_minor bigint,
  phone_number text,
  raw_payload jsonb,
  transaction_occurred_at timestamptz,
  ledger_transaction_id uuid,
  processed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mpesa_transactions_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_mpesa_transactions_checkout_request_id_not_blank CHECK (btrim(checkout_request_id) <> ''),
  CONSTRAINT ck_mpesa_transactions_merchant_request_id_not_blank CHECK (btrim(merchant_request_id) <> ''),
  CONSTRAINT ck_mpesa_transactions_result_desc_not_blank CHECK (btrim(result_desc) <> ''),
  CONSTRAINT ck_mpesa_transactions_status CHECK (status IN ('succeeded', 'failed')),
  CONSTRAINT uq_mpesa_transactions_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_mpesa_transactions_tenant_checkout_request_id UNIQUE (tenant_id, checkout_request_id),
  CONSTRAINT fk_mpesa_transactions_payment_intent
    FOREIGN KEY (tenant_id, payment_intent_id)
    REFERENCES payment_intents (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_mpesa_transactions_callback_log
    FOREIGN KEY (tenant_id, callback_log_id)
    REFERENCES callback_logs (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_mpesa_transactions_ledger_transaction
    FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES transactions (tenant_id, id)
    ON DELETE SET NULL
);

CREATE TABLE mpesa_c2b_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  mpesa_config_id uuid,
  payment_channel_id uuid,
  trans_id text NOT NULL,
  transaction_type text NOT NULL,
  business_short_code text NOT NULL,
  bill_ref_number text,
  invoice_number text,
  amount_minor bigint NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'KES',
  phone_number text,
  payer_name text,
  org_account_balance text,
  third_party_trans_id text,
  status text NOT NULL DEFAULT 'pending_review',
  matched_invoice_id uuid,
  matched_student_id uuid,
  manual_fee_payment_id uuid,
  ledger_transaction_id uuid,
  received_at timestamptz NOT NULL,
  matched_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mpesa_c2b_payments_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_mpesa_c2b_payments_trans_id_not_blank CHECK (btrim(trans_id) <> ''),
  CONSTRAINT ck_mpesa_c2b_payments_business_short_code_not_blank CHECK (btrim(business_short_code) <> ''),
  CONSTRAINT ck_mpesa_c2b_payments_amount_minor CHECK (amount_minor > 0),
  CONSTRAINT ck_mpesa_c2b_payments_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_mpesa_c2b_payments_status CHECK (status IN ('pending_review', 'matched', 'rejected')),
  CONSTRAINT uq_mpesa_c2b_payments_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_mpesa_c2b_payments_tenant_trans_id UNIQUE (tenant_id, trans_id),
  CONSTRAINT fk_mpesa_c2b_payments_ledger_transaction
    FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES transactions (tenant_id, id)
    ON DELETE SET NULL
);

ALTER TABLE payment_intents
ADD COLUMN IF NOT EXISTS student_id uuid;

ALTER TABLE mpesa_transactions
ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  admission_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  middle_name text,
  status text NOT NULL DEFAULT 'active',
  date_of_birth date,
  gender text,
  primary_guardian_name text,
  primary_guardian_phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_students_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_students_admission_number_not_blank CHECK (btrim(admission_number) <> ''),
  CONSTRAINT ck_students_first_name_not_blank CHECK (btrim(first_name) <> ''),
  CONSTRAINT ck_students_last_name_not_blank CHECK (btrim(last_name) <> ''),
  CONSTRAINT ck_students_status CHECK (status IN ('active', 'inactive', 'graduated', 'transferred')),
  CONSTRAINT ck_students_gender CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'undisclosed')),
  CONSTRAINT uq_students_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_students_tenant_admission_number UNIQUE (tenant_id, admission_number),
  CONSTRAINT fk_students_created_by_user
    FOREIGN KEY (created_by_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  student_id uuid NOT NULL,
  user_id uuid,
  invitation_id uuid,
  display_name text NOT NULL,
  email citext NOT NULL,
  phone text,
  relationship text NOT NULL,
  is_primary boolean NOT NULL DEFAULT FALSE,
  status text NOT NULL DEFAULT 'invited',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_student_guardians_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_student_guardians_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT ck_student_guardians_email_not_blank CHECK (btrim(email::text) <> ''),
  CONSTRAINT ck_student_guardians_relationship_not_blank CHECK (btrim(relationship) <> ''),
  CONSTRAINT ck_student_guardians_status CHECK (status IN ('invited', 'active', 'revoked')),
  CONSTRAINT uq_student_guardians_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_student_guardians_student
    FOREIGN KEY (tenant_id, student_id)
    REFERENCES students (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_student_guardians_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_student_guardians_invitation
    FOREIGN KEY (invitation_id)
    REFERENCES auth_action_tokens (id)
    ON DELETE SET NULL
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  plan_code text NOT NULL,
  status text NOT NULL DEFAULT 'trialing',
  billing_phone_number text,
  currency_code char(3) NOT NULL DEFAULT 'KES',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  seats_allocated integer NOT NULL DEFAULT 1,
  current_period_start timestamptz NOT NULL DEFAULT NOW(),
  current_period_end timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  trial_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  restricted_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  activated_at timestamptz,
  canceled_at timestamptz,
  last_invoice_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_subscriptions_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_subscriptions_status CHECK (
    status IN ('trialing', 'active', 'past_due', 'restricted', 'suspended', 'canceled', 'expired')
  ),
  CONSTRAINT ck_subscriptions_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_subscriptions_plan_code_not_blank CHECK (btrim(plan_code) <> ''),
  CONSTRAINT ck_subscriptions_seats_allocated CHECK (seats_allocated >= 1),
  CONSTRAINT uq_subscriptions_tenant_id_id UNIQUE (tenant_id, id)
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  subscription_id uuid NOT NULL,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  currency_code char(3) NOT NULL DEFAULT 'KES',
  description text NOT NULL,
  subtotal_amount_minor bigint NOT NULL,
  tax_amount_minor bigint NOT NULL DEFAULT 0,
  total_amount_minor bigint NOT NULL,
  amount_paid_minor bigint NOT NULL DEFAULT 0,
  billing_phone_number text,
  payment_intent_id uuid,
  issued_at timestamptz NOT NULL DEFAULT NOW(),
  due_at timestamptz NOT NULL,
  paid_at timestamptz,
  voided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_invoices_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_invoices_status CHECK (
    status IN ('draft', 'open', 'pending_payment', 'paid', 'void', 'uncollectible')
  ),
  CONSTRAINT ck_invoices_currency_code CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_invoices_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT ck_invoices_subtotal_non_negative CHECK (subtotal_amount_minor >= 0),
  CONSTRAINT ck_invoices_tax_non_negative CHECK (tax_amount_minor >= 0),
  CONSTRAINT ck_invoices_total_positive CHECK (total_amount_minor > 0),
  CONSTRAINT ck_invoices_amount_paid_non_negative CHECK (amount_paid_minor >= 0),
  CONSTRAINT uq_invoices_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_invoices_tenant_invoice_number UNIQUE (tenant_id, invoice_number),
  CONSTRAINT fk_invoices_subscription
    FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES subscriptions (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_payment_intent
    FOREIGN KEY (tenant_id, payment_intent_id)
    REFERENCES payment_intents (tenant_id, id)
    ON DELETE SET NULL
);

CREATE TABLE usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  subscription_id uuid NOT NULL,
  feature_key text NOT NULL,
  quantity bigint NOT NULL,
  unit text NOT NULL DEFAULT 'count',
  idempotency_key text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT NOW(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_usage_records_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_usage_records_feature_key_not_blank CHECK (btrim(feature_key) <> ''),
  CONSTRAINT ck_usage_records_quantity_positive CHECK (quantity > 0),
  CONSTRAINT ck_usage_records_unit_not_blank CHECK (btrim(unit) <> ''),
  CONSTRAINT ck_usage_records_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT uq_usage_records_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_usage_records_tenant_subscription_idempotency
    UNIQUE (tenant_id, subscription_id, idempotency_key),
  CONSTRAINT fk_usage_records_subscription
    FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES subscriptions (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  subscription_id uuid NOT NULL,
  notification_key text NOT NULL,
  channel text NOT NULL,
  audience text NOT NULL,
  lifecycle_state text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  title text NOT NULL,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT NOW(),
  delivered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_billing_notifications_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_billing_notifications_channel CHECK (channel IN ('admin', 'sms', 'email')),
  CONSTRAINT ck_billing_notifications_status CHECK (status IN ('queued', 'sent', 'failed', 'dismissed')),
  CONSTRAINT ck_billing_notifications_lifecycle_state CHECK (
    lifecycle_state IN ('ACTIVE', 'TRIAL', 'EXPIRING', 'GRACE_PERIOD', 'RESTRICTED', 'SUSPENDED')
  ),
  CONSTRAINT ck_billing_notifications_key_not_blank CHECK (btrim(notification_key) <> ''),
  CONSTRAINT ck_billing_notifications_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT ck_billing_notifications_body_not_blank CHECK (btrim(body) <> ''),
  CONSTRAINT uq_billing_notifications_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_billing_notifications_tenant_key UNIQUE (tenant_id, notification_key),
  CONSTRAINT fk_billing_notifications_subscription
    FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES subscriptions (tenant_id, id)
    ON DELETE CASCADE
);

CREATE TABLE fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  name text NOT NULL,
  academic_year text NOT NULL,
  term text NOT NULL,
  grade_level text NOT NULL,
  class_name text,
  currency_code char(3) NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'active',
  due_days integer NOT NULL DEFAULT 14,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount_minor bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_fee_structures_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_fee_structures_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT ck_fee_structures_academic_year_not_blank CHECK (btrim(academic_year) <> ''),
  CONSTRAINT ck_fee_structures_term_not_blank CHECK (btrim(term) <> ''),
  CONSTRAINT ck_fee_structures_grade_level_not_blank CHECK (btrim(grade_level) <> ''),
  CONSTRAINT ck_fee_structures_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_fee_structures_status CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT ck_fee_structures_due_days CHECK (due_days >= 0 AND due_days <= 365),
  CONSTRAINT ck_fee_structures_line_items CHECK (
    jsonb_typeof(line_items) = 'array'
    AND jsonb_array_length(line_items) > 0
  ),
  CONSTRAINT ck_fee_structures_total CHECK (total_amount_minor > 0),
  CONSTRAINT uq_fee_structures_tenant_id_id UNIQUE (tenant_id, id)
);

CREATE TABLE manual_fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  idempotency_key text NOT NULL,
  receipt_number text NOT NULL,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  student_id uuid,
  invoice_id uuid,
  amount_minor bigint NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'KES',
  payer_name text,
  received_at timestamptz NOT NULL DEFAULT NOW(),
  deposited_at timestamptz,
  cleared_at timestamptz,
  bounced_at timestamptz,
  reversed_at timestamptz,
  cheque_number text,
  drawer_bank text,
  deposit_reference text,
  external_reference text,
  asset_account_code text NOT NULL DEFAULT '1120-BANK-CLEARING',
  fee_control_account_code text NOT NULL DEFAULT '1100-AR-FEES',
  ledger_transaction_id uuid,
  reversal_ledger_transaction_id uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_manual_fee_payments_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_manual_fee_payments_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT ck_manual_fee_payments_receipt_number_not_blank CHECK (btrim(receipt_number) <> ''),
  CONSTRAINT ck_manual_fee_payments_method CHECK (payment_method IN ('cash', 'cheque', 'bank_deposit', 'eft', 'mpesa_c2b')),
  CONSTRAINT ck_manual_fee_payments_status CHECK (status IN ('received', 'deposited', 'cleared', 'bounced', 'reversed')),
  CONSTRAINT ck_manual_fee_payments_amount CHECK (amount_minor > 0),
  CONSTRAINT ck_manual_fee_payments_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_manual_fee_payments_target CHECK (student_id IS NOT NULL OR invoice_id IS NOT NULL),
  CONSTRAINT ck_manual_fee_payments_cheque_fields CHECK (
    payment_method <> 'cheque'
    OR (cheque_number IS NOT NULL AND btrim(cheque_number) <> '' AND drawer_bank IS NOT NULL AND btrim(drawer_bank) <> '')
  ),
  CONSTRAINT uq_manual_fee_payments_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_manual_fee_payments_idempotency UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT uq_manual_fee_payments_receipt_number UNIQUE (tenant_id, receipt_number),
  CONSTRAINT fk_manual_fee_payments_invoice
    FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES invoices (tenant_id, id)
    ON DELETE SET NULL,
  CONSTRAINT fk_manual_fee_payments_ledger_transaction
    FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES transactions (tenant_id, id)
    ON DELETE SET NULL,
  CONSTRAINT fk_manual_fee_payments_reversal_ledger_transaction
    FOREIGN KEY (tenant_id, reversal_ledger_transaction_id)
    REFERENCES transactions (tenant_id, id)
    ON DELETE SET NULL
);

CREATE TABLE manual_fee_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  manual_payment_id uuid NOT NULL,
  invoice_id uuid,
  student_id uuid,
  allocation_type text NOT NULL,
  amount_minor bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_manual_fee_payment_allocations_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_manual_fee_payment_allocations_type CHECK (allocation_type IN ('invoice', 'credit')),
  CONSTRAINT ck_manual_fee_payment_allocations_amount CHECK (amount_minor > 0),
  CONSTRAINT ck_manual_fee_payment_allocations_invoice_target CHECK (
    allocation_type <> 'invoice' OR invoice_id IS NOT NULL
  ),
  CONSTRAINT uq_manual_fee_payment_allocations_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_manual_fee_payment_allocations_payment
    FOREIGN KEY (tenant_id, manual_payment_id)
    REFERENCES manual_fee_payments (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_manual_fee_payment_allocations_invoice
    FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES invoices (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE sync_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  device_id text NOT NULL,
  platform text NOT NULL,
  app_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT NOW(),
  last_push_at timestamptz,
  last_pull_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_sync_devices_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_sync_devices_device_id_not_blank CHECK (btrim(device_id) <> ''),
  CONSTRAINT ck_sync_devices_platform_not_blank CHECK (btrim(platform) <> ''),
  CONSTRAINT uq_sync_devices_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_sync_devices_tenant_device UNIQUE (tenant_id, device_id)
);

CREATE TABLE sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id tenant_key NOT NULL,
  device_id text NOT NULL,
  entity text NOT NULL,
  last_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_sync_cursors_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_sync_cursors_entity CHECK (entity IN ('finance')),
  CONSTRAINT ck_sync_cursors_last_version_non_negative CHECK (last_version >= 0),
  CONSTRAINT uq_sync_cursors_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_sync_cursors_tenant_device_entity UNIQUE (tenant_id, device_id, entity),
  CONSTRAINT fk_sync_cursors_device
    FOREIGN KEY (tenant_id, device_id)
    REFERENCES sync_devices (tenant_id, device_id)
    ON DELETE CASCADE
);

CREATE TABLE sync_operation_logs (
  op_id uuid PRIMARY KEY,
  tenant_id tenant_key NOT NULL,
  device_id text NOT NULL,
  entity text NOT NULL,
  payload jsonb NOT NULL,
  version bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_sync_operation_logs_tenant_id_non_global CHECK (tenant_id <> 'global'),
  CONSTRAINT ck_sync_operation_logs_entity CHECK (entity IN ('finance')),
  CONSTRAINT uq_sync_operation_logs_tenant_version UNIQUE (tenant_id, version)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_payment_intents_student'
  ) THEN
    ALTER TABLE payment_intents
    ADD CONSTRAINT fk_payment_intents_student
      FOREIGN KEY (tenant_id, student_id)
      REFERENCES students (tenant_id, id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX ix_users_status_created_at
  ON users (status, created_at DESC);

CREATE INDEX ix_users_last_login_at
  ON users (last_login_at DESC NULLS LAST);

CREATE UNIQUE INDEX ux_users_single_platform_owner
  ON users ((user_type))
  WHERE user_type = 'platform_owner' AND status = 'active';

CREATE INDEX ix_roles_tenant_name
  ON roles (tenant_id, name);

CREATE INDEX ix_permissions_tenant_resource
  ON permissions (tenant_id, resource, action);

CREATE INDEX ix_role_permissions_tenant_permission
  ON role_permissions (tenant_id, permission_id);

CREATE INDEX ix_tenant_memberships_user_status
  ON tenant_memberships (user_id, status, created_at DESC);

CREATE INDEX ix_tenant_memberships_tenant_role_status
  ON tenant_memberships (tenant_id, role_id, status);

CREATE UNIQUE INDEX ux_auth_action_tokens_hash
  ON auth_action_tokens (token_hash);

CREATE INDEX ix_auth_action_tokens_tenant_email
  ON auth_action_tokens (tenant_id, lower(email::text), purpose);

CREATE INDEX ix_auth_email_outbox_status
  ON auth_email_outbox (status, next_attempt_at);

CREATE INDEX ix_consent_records_tenant_user_captured_at
  ON consent_records (tenant_id, user_id, captured_at DESC);

CREATE INDEX ix_consent_records_tenant_type_captured_at
  ON consent_records (tenant_id, consent_type, captured_at DESC);

CREATE INDEX ix_audit_logs_tenant_occurred_at
  ON audit_logs (tenant_id, occurred_at DESC);

CREATE INDEX ix_audit_logs_tenant_actor_occurred_at
  ON audit_logs (tenant_id, actor_user_id, occurred_at DESC);

CREATE INDEX ix_audit_logs_tenant_resource_occurred_at
  ON audit_logs (tenant_id, resource_type, resource_id, occurred_at DESC);

CREATE INDEX ix_audit_logs_request_id
  ON audit_logs (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX ix_outbox_events_dispatch
  ON outbox_events (tenant_id, status, available_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX ix_outbox_events_aggregate
  ON outbox_events (tenant_id, aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX ix_outbox_events_published_at
  ON outbox_events (tenant_id, published_at DESC NULLS LAST);

CREATE INDEX ix_outbox_events_tenant_status_available_at
  ON outbox_events (tenant_id, status, available_at, created_at);

CREATE INDEX ix_event_consumer_runs_outbox_consumer
  ON event_consumer_runs (tenant_id, outbox_event_id, consumer_name);

CREATE INDEX ix_idempotency_keys_lookup
  ON idempotency_keys (tenant_id, scope, idempotency_key);

CREATE INDEX ix_idempotency_keys_user_status
  ON idempotency_keys (tenant_id, user_id, status, created_at DESC);

CREATE INDEX ix_idempotency_keys_expires_at
  ON idempotency_keys (tenant_id, expires_at);

CREATE INDEX ix_accounts_tenant_category_active
  ON accounts (tenant_id, category, is_active);

CREATE INDEX ix_accounts_tenant_name
  ON accounts (tenant_id, name);

CREATE INDEX ix_transactions_tenant_posted_at
  ON transactions (tenant_id, posted_at DESC);

CREATE INDEX ix_transactions_tenant_effective_at
  ON transactions (tenant_id, effective_at DESC);

CREATE INDEX ix_transactions_created_by_user
  ON transactions (tenant_id, created_by_user_id, posted_at DESC);

CREATE INDEX ix_ledger_entries_account_created_at
  ON ledger_entries (tenant_id, account_id, created_at DESC);

CREATE INDEX ix_ledger_entries_transaction
  ON ledger_entries (tenant_id, transaction_id, line_number);

CREATE INDEX ix_payment_intents_status_created_at
  ON payment_intents (tenant_id, status, created_at DESC);

CREATE INDEX ix_payment_intents_status_expires_at
  ON payment_intents (tenant_id, status, expires_at)
  WHERE status IN ('stk_requested', 'callback_received', 'processing');

CREATE INDEX ix_payment_intents_phone_number
  ON payment_intents (tenant_id, phone_number, created_at DESC);

CREATE INDEX ix_payment_intents_student_id
  ON payment_intents (tenant_id, student_id, created_at DESC)
  WHERE student_id IS NOT NULL;

CREATE INDEX ix_callback_logs_processing_status
  ON callback_logs (tenant_id, processing_status, created_at DESC);

CREATE INDEX ix_callback_logs_checkout_request_id
  ON callback_logs (tenant_id, checkout_request_id, created_at DESC);

CREATE INDEX ix_callback_logs_request_fingerprint
  ON callback_logs (tenant_id, request_fingerprint, created_at DESC);

CREATE INDEX ix_mpesa_transactions_status
  ON mpesa_transactions (tenant_id, status, created_at DESC);

CREATE INDEX ix_mpesa_transactions_receipt_number
  ON mpesa_transactions (tenant_id, mpesa_receipt_number);

CREATE INDEX ix_mpesa_c2b_payments_status_received
  ON mpesa_c2b_payments (tenant_id, status, received_at DESC);

CREATE INDEX ix_mpesa_c2b_payments_reference
  ON mpesa_c2b_payments (tenant_id, bill_ref_number, received_at DESC)
  WHERE bill_ref_number IS NOT NULL;

CREATE INDEX ix_mpesa_c2b_payments_student
  ON mpesa_c2b_payments (tenant_id, matched_student_id, received_at DESC)
  WHERE matched_student_id IS NOT NULL;

CREATE INDEX ix_students_status_created_at
  ON students (tenant_id, status, created_at DESC);

CREATE INDEX ix_students_name_lookup
  ON students (tenant_id, last_name, first_name, admission_number);

CREATE UNIQUE INDEX ux_student_guardians_student_email
  ON student_guardians (tenant_id, student_id, lower(email::text));

CREATE INDEX ix_student_guardians_user_status
  ON student_guardians (tenant_id, user_id, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX ix_student_guardians_invitation
  ON student_guardians (tenant_id, invitation_id)
  WHERE invitation_id IS NOT NULL;

CREATE INDEX ix_subscriptions_tenant_status_period_end
  ON subscriptions (tenant_id, status, current_period_end DESC);

CREATE UNIQUE INDEX ux_subscriptions_single_mutable_state
  ON subscriptions (tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'restricted', 'suspended');

CREATE INDEX ix_invoices_tenant_status_due_at
  ON invoices (tenant_id, status, due_at DESC);

CREATE INDEX ix_invoices_payment_intent_id
  ON invoices (tenant_id, payment_intent_id);

CREATE INDEX ix_usage_records_tenant_feature_recorded_at
  ON usage_records (tenant_id, feature_key, recorded_at DESC);

CREATE INDEX ix_usage_records_subscription_period
  ON usage_records (tenant_id, subscription_id, period_start, period_end);

CREATE INDEX ix_billing_notifications_subscription_scheduled_for
  ON billing_notifications (tenant_id, subscription_id, scheduled_for DESC);

CREATE INDEX ix_billing_notifications_status_channel
  ON billing_notifications (tenant_id, status, channel, scheduled_for DESC);

CREATE INDEX ix_fee_structures_scope
  ON fee_structures (tenant_id, academic_year DESC, term, grade_level, class_name, status);

CREATE UNIQUE INDEX ux_fee_structures_active_scope
  ON fee_structures (tenant_id, academic_year, term, grade_level, (COALESCE(class_name, '')))
  WHERE status = 'active';

CREATE INDEX ix_manual_fee_payments_status_received
  ON manual_fee_payments (tenant_id, status, received_at DESC);

CREATE INDEX ix_manual_fee_payments_student
  ON manual_fee_payments (tenant_id, student_id, received_at DESC)
  WHERE student_id IS NOT NULL;

CREATE INDEX ix_manual_fee_payments_invoice
  ON manual_fee_payments (tenant_id, invoice_id, received_at DESC)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX ix_manual_fee_payment_allocations_payment
  ON manual_fee_payment_allocations (tenant_id, manual_payment_id, created_at ASC);

CREATE UNIQUE INDEX ux_manual_fee_payment_allocations_invoice_once
  ON manual_fee_payment_allocations (tenant_id, manual_payment_id, invoice_id, allocation_type)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX ix_sync_devices_last_seen_at
  ON sync_devices (tenant_id, last_seen_at DESC);

CREATE INDEX ix_sync_devices_platform
  ON sync_devices (tenant_id, platform, updated_at DESC);

CREATE INDEX ix_sync_cursors_device_updated_at
  ON sync_cursors (tenant_id, device_id, updated_at DESC);

CREATE INDEX ix_sync_operation_logs_tenant_entity_version
  ON sync_operation_logs (tenant_id, entity, version);

CREATE INDEX ix_sync_operation_logs_device_created_at
  ON sync_operation_logs (tenant_id, device_id, created_at DESC);

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_roles_set_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_permissions_set_updated_at
BEFORE UPDATE ON permissions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_role_permissions_set_updated_at
BEFORE UPDATE ON role_permissions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_tenant_memberships_set_updated_at
BEFORE UPDATE ON tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_auth_action_tokens_set_updated_at
BEFORE UPDATE ON auth_action_tokens
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_auth_email_outbox_set_updated_at
BEFORE UPDATE ON auth_email_outbox
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_consent_records_set_updated_at
BEFORE UPDATE ON consent_records
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_audit_logs_set_updated_at
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_outbox_events_set_updated_at
BEFORE UPDATE ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_event_consumer_runs_set_updated_at
BEFORE UPDATE ON event_consumer_runs
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_idempotency_keys_set_updated_at
BEFORE UPDATE ON idempotency_keys
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_accounts_set_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_payment_intents_set_updated_at
BEFORE UPDATE ON payment_intents
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_callback_logs_set_updated_at
BEFORE UPDATE ON callback_logs
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_mpesa_transactions_set_updated_at
BEFORE UPDATE ON mpesa_transactions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_mpesa_c2b_payments_set_updated_at
BEFORE UPDATE ON mpesa_c2b_payments
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_students_set_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_student_guardians_set_updated_at
BEFORE UPDATE ON student_guardians
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_subscriptions_set_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_invoices_set_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_fee_structures_set_updated_at
BEFORE UPDATE ON fee_structures
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_manual_fee_payments_set_updated_at
BEFORE UPDATE ON manual_fee_payments
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_manual_fee_allocations_prevent_update
BEFORE UPDATE OR DELETE ON manual_fee_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION app.prevent_append_only_mutation();

CREATE TRIGGER trg_sync_devices_set_updated_at
BEFORE UPDATE ON sync_devices
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_sync_cursors_set_updated_at
BEFORE UPDATE ON sync_cursors
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_transactions_prevent_update
BEFORE UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION app.prevent_append_only_mutation();

CREATE TRIGGER trg_ledger_entries_prevent_update
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION app.prevent_append_only_mutation();

CREATE TRIGGER trg_sync_operation_logs_prevent_update
BEFORE UPDATE OR DELETE ON sync_operation_logs
FOR EACH ROW
EXECUTE FUNCTION app.prevent_append_only_mutation();

CREATE TRIGGER trg_usage_records_prevent_update
BEFORE UPDATE OR DELETE ON usage_records
FOR EACH ROW
EXECUTE FUNCTION app.prevent_append_only_mutation();

CREATE TRIGGER trg_billing_notifications_set_updated_at
BEFORE UPDATE ON billing_notifications
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE CONSTRAINT TRIGGER trg_transactions_validate_balance
AFTER INSERT ON transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app.validate_financial_transaction_balance();

CREATE CONSTRAINT TRIGGER trg_ledger_entries_validate_balance
AFTER INSERT ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app.validate_financial_transaction_balance();

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

ALTER TABLE auth_action_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_action_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE auth_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_email_outbox FORCE ROW LEVEL SECURITY;

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

ALTER TABLE event_consumer_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_consumer_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;

ALTER TABLE callback_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE mpesa_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mpesa_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE mpesa_c2b_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mpesa_c2b_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;

ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians FORCE ROW LEVEL SECURITY;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records FORCE ROW LEVEL SECURITY;

ALTER TABLE billing_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures FORCE ROW LEVEL SECURITY;

ALTER TABLE manual_fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_fee_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE manual_fee_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_fee_payment_allocations FORCE ROW LEVEL SECURITY;

ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_devices FORCE ROW LEVEL SECURITY;

ALTER TABLE sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_cursors FORCE ROW LEVEL SECURITY;

ALTER TABLE sync_operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operation_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY users_select_policy
  ON users
  FOR SELECT
  USING (
    (
      tenant_id = 'global'
      AND app.current_user_id() = id
    )
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY users_insert_policy
  ON users
  FOR INSERT
  WITH CHECK (
    tenant_id = 'global'
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY users_update_policy
  ON users
  FOR UPDATE
  USING (
    (
      tenant_id = 'global'
      AND app.current_user_id() = id
    )
    OR tenant_id = app.current_tenant_id()
  )
  WITH CHECK (
    (
      tenant_id = 'global'
      AND app.current_user_id() = id
    )
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY users_delete_policy
  ON users
  FOR DELETE
  USING (
    tenant_id = 'global'
    AND app.current_user_id() = id
  );

CREATE POLICY roles_select_policy
  ON roles
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY roles_insert_policy
  ON roles
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY roles_update_policy
  ON roles
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY roles_delete_policy
  ON roles
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY permissions_select_policy
  ON permissions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY permissions_insert_policy
  ON permissions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY permissions_update_policy
  ON permissions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY permissions_delete_policy
  ON permissions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY role_permissions_select_policy
  ON role_permissions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY role_permissions_insert_policy
  ON role_permissions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY role_permissions_update_policy
  ON role_permissions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY role_permissions_delete_policy
  ON role_permissions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_memberships_select_policy
  ON tenant_memberships
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_memberships_insert_policy
  ON tenant_memberships
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_memberships_update_policy
  ON tenant_memberships
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY tenant_memberships_delete_policy
  ON tenant_memberships
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY auth_action_tokens_policy
  ON auth_action_tokens
  FOR ALL
  USING (
    tenant_id = app.current_tenant_id()
    OR (
      tenant_id IS NULL
      AND app.current_role_code() = 'platform_owner'
    )
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR (
      tenant_id IS NULL
      AND app.current_role_code() = 'platform_owner'
    )
  );

CREATE POLICY auth_email_outbox_policy
  ON auth_email_outbox
  FOR ALL
  USING (
    tenant_id = app.current_tenant_id()
    OR (
      tenant_id IS NULL
      AND app.current_role_code() = 'platform_owner'
    )
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR (
      tenant_id IS NULL
      AND app.current_role_code() = 'platform_owner'
    )
  );

CREATE POLICY consent_records_select_policy
  ON consent_records
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY consent_records_insert_policy
  ON consent_records
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY consent_records_update_policy
  ON consent_records
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY consent_records_delete_policy
  ON consent_records
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY audit_logs_select_policy
  ON audit_logs
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY audit_logs_insert_policy
  ON audit_logs
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY outbox_events_select_policy
  ON outbox_events
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY outbox_events_insert_policy
  ON outbox_events
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY outbox_events_update_policy
  ON outbox_events
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY outbox_events_delete_policy
  ON outbox_events
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY event_consumer_runs_select_policy
  ON event_consumer_runs
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY event_consumer_runs_insert_policy
  ON event_consumer_runs
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_consumer_runs_update_policy
  ON event_consumer_runs
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_consumer_runs_delete_policy
  ON event_consumer_runs
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY idempotency_keys_select_policy
  ON idempotency_keys
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY idempotency_keys_insert_policy
  ON idempotency_keys
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY idempotency_keys_update_policy
  ON idempotency_keys
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY idempotency_keys_delete_policy
  ON idempotency_keys
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY accounts_select_policy
  ON accounts
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY accounts_insert_policy
  ON accounts
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY accounts_update_policy
  ON accounts
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY accounts_delete_policy
  ON accounts
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY transactions_select_policy
  ON transactions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY transactions_insert_policy
  ON transactions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY ledger_entries_select_policy
  ON ledger_entries
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY ledger_entries_insert_policy
  ON ledger_entries
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY payment_intents_select_policy
  ON payment_intents
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY payment_intents_insert_policy
  ON payment_intents
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY payment_intents_update_policy
  ON payment_intents
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY payment_intents_delete_policy
  ON payment_intents
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY callback_logs_select_policy
  ON callback_logs
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY callback_logs_insert_policy
  ON callback_logs
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY callback_logs_update_policy
  ON callback_logs
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY callback_logs_delete_policy
  ON callback_logs
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_transactions_select_policy
  ON mpesa_transactions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_transactions_insert_policy
  ON mpesa_transactions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_transactions_update_policy
  ON mpesa_transactions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_transactions_delete_policy
  ON mpesa_transactions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_c2b_payments_select_policy
  ON mpesa_c2b_payments
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_c2b_payments_insert_policy
  ON mpesa_c2b_payments
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_c2b_payments_update_policy
  ON mpesa_c2b_payments
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY mpesa_c2b_payments_delete_policy
  ON mpesa_c2b_payments
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY students_select_policy
  ON students
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY students_insert_policy
  ON students
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY students_update_policy
  ON students
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY students_delete_policy
  ON students
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY student_guardians_select_policy
  ON student_guardians
  FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    OR COALESCE(NULLIF(current_setting('app.path', true), ''), '') LIKE '%/auth/invitations/accept%'
  );

CREATE POLICY student_guardians_insert_policy
  ON student_guardians
  FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR COALESCE(NULLIF(current_setting('app.path', true), ''), '') LIKE '%/auth/invitations/accept%'
  );

CREATE POLICY student_guardians_update_policy
  ON student_guardians
  FOR UPDATE
  USING (
    tenant_id = app.current_tenant_id()
    OR COALESCE(NULLIF(current_setting('app.path', true), ''), '') LIKE '%/auth/invitations/accept%'
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR COALESCE(NULLIF(current_setting('app.path', true), ''), '') LIKE '%/auth/invitations/accept%'
  );

CREATE POLICY student_guardians_delete_policy
  ON student_guardians
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY subscriptions_select_policy
  ON subscriptions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY subscriptions_insert_policy
  ON subscriptions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY subscriptions_update_policy
  ON subscriptions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY subscriptions_delete_policy
  ON subscriptions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY invoices_select_policy
  ON invoices
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY invoices_insert_policy
  ON invoices
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY invoices_update_policy
  ON invoices
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY invoices_delete_policy
  ON invoices
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY usage_records_select_policy
  ON usage_records
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY usage_records_insert_policy
  ON usage_records
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_notifications_select_policy
  ON billing_notifications
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY billing_notifications_insert_policy
  ON billing_notifications
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_notifications_update_policy
  ON billing_notifications
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_notifications_delete_policy
  ON billing_notifications
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY fee_structures_select_policy
  ON fee_structures
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY fee_structures_insert_policy
  ON fee_structures
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY fee_structures_update_policy
  ON fee_structures
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY fee_structures_delete_policy
  ON fee_structures
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY manual_fee_payments_select_policy
  ON manual_fee_payments
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY manual_fee_payments_insert_policy
  ON manual_fee_payments
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY manual_fee_payments_update_policy
  ON manual_fee_payments
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY manual_fee_payments_delete_policy
  ON manual_fee_payments
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY manual_fee_payment_allocations_select_policy
  ON manual_fee_payment_allocations
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY manual_fee_payment_allocations_insert_policy
  ON manual_fee_payment_allocations
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY sync_devices_select_policy
  ON sync_devices
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY sync_devices_insert_policy
  ON sync_devices
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY sync_devices_update_policy
  ON sync_devices
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY sync_devices_delete_policy
  ON sync_devices
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY sync_cursors_select_policy
  ON sync_cursors
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY sync_cursors_insert_policy
  ON sync_cursors
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY sync_cursors_update_policy
  ON sync_cursors
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY sync_cursors_delete_policy
  ON sync_cursors
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY sync_operation_logs_select_policy
  ON sync_operation_logs
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY sync_operation_logs_insert_policy
  ON sync_operation_logs
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
