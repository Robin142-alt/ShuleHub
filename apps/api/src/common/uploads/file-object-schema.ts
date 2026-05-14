export const FILE_OBJECT_STORAGE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS file_objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    storage_path text NOT NULL,
    original_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    content bytea,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    storage_backend text NOT NULL DEFAULT 'database',
    object_storage_provider text,
    object_storage_bucket text,
    object_storage_key text,
    object_storage_etag text,
    retention_policy text NOT NULL DEFAULT 'operational',
    retention_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_file_objects_tenant_path UNIQUE (tenant_id, storage_path),
    CONSTRAINT ck_file_objects_size CHECK (size_bytes >= 0),
    CONSTRAINT ck_file_objects_sha256 CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_file_objects_storage_backend CHECK (storage_backend IN ('database', 'object_storage')),
    CONSTRAINT ck_file_objects_database_content CHECK (
      (storage_backend = 'database' AND content IS NOT NULL)
      OR storage_backend = 'object_storage'
    ),
    CONSTRAINT ck_file_objects_object_storage_metadata CHECK (
      storage_backend = 'database'
      OR (
        object_storage_provider IS NOT NULL
        AND object_storage_bucket IS NOT NULL
        AND object_storage_key IS NOT NULL
      )
    )
  );

  ALTER TABLE file_objects ALTER COLUMN content DROP NOT NULL;
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'database';
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS object_storage_provider text;
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS object_storage_bucket text;
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS object_storage_key text;
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS object_storage_etag text;
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS retention_policy text NOT NULL DEFAULT 'operational';
  ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ck_file_objects_storage_backend'
    ) THEN
      ALTER TABLE file_objects ADD CONSTRAINT ck_file_objects_storage_backend
        CHECK (storage_backend IN ('database', 'object_storage'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ck_file_objects_database_content'
    ) THEN
      ALTER TABLE file_objects ADD CONSTRAINT ck_file_objects_database_content
        CHECK (
          (storage_backend = 'database' AND content IS NOT NULL)
          OR storage_backend = 'object_storage'
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ck_file_objects_object_storage_metadata'
    ) THEN
      ALTER TABLE file_objects ADD CONSTRAINT ck_file_objects_object_storage_metadata
        CHECK (
          storage_backend = 'database'
          OR (
            object_storage_provider IS NOT NULL
            AND object_storage_bucket IS NOT NULL
            AND object_storage_key IS NOT NULL
          )
        );
    END IF;
  END $$;

  CREATE INDEX IF NOT EXISTS ix_file_objects_tenant_created
    ON file_objects (tenant_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_file_objects_sha256
    ON file_objects (sha256);
  CREATE INDEX IF NOT EXISTS ix_file_objects_retention_expiry
    ON file_objects (retention_expires_at)
    WHERE retention_expires_at IS NOT NULL;

  ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE file_objects FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS file_objects_rls_policy ON file_objects;
  CREATE POLICY file_objects_rls_policy ON file_objects
  FOR ALL
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
  );

  DROP TRIGGER IF EXISTS trg_file_objects_set_updated_at ON file_objects;
  CREATE TRIGGER trg_file_objects_set_updated_at
  BEFORE UPDATE ON file_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`;
