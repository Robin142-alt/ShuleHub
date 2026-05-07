import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class SyncSchemaService implements OnModuleInit {
  private readonly logger = new Logger(SyncSchemaService.name);

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

      CREATE OR REPLACE FUNCTION app.prevent_append_only_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'append-only table "%" cannot be %', TG_TABLE_NAME, lower(TG_OP)
          USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS sync_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        device_id text NOT NULL,
        platform text NOT NULL,
        app_version text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_seen_at timestamptz NOT NULL DEFAULT NOW(),
        last_push_at timestamptz,
        last_pull_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_sync_devices_device_id_not_blank CHECK (btrim(device_id) <> ''),
        CONSTRAINT ck_sync_devices_platform_not_blank CHECK (btrim(platform) <> ''),
        CONSTRAINT uq_sync_devices_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_sync_devices_tenant_device UNIQUE (tenant_id, device_id)
      );

      CREATE TABLE IF NOT EXISTS sync_cursors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        device_id text NOT NULL,
        entity text NOT NULL,
        last_version bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_sync_cursors_entity CHECK (entity IN ('attendance', 'finance')),
        CONSTRAINT ck_sync_cursors_last_version_non_negative CHECK (last_version >= 0),
        CONSTRAINT uq_sync_cursors_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_sync_cursors_tenant_device_entity UNIQUE (tenant_id, device_id, entity)
      );

      CREATE TABLE IF NOT EXISTS sync_operation_logs (
        op_id uuid PRIMARY KEY,
        tenant_id text NOT NULL,
        device_id text NOT NULL,
        entity text NOT NULL,
        payload jsonb NOT NULL,
        version bigint GENERATED ALWAYS AS IDENTITY,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_sync_operation_logs_entity CHECK (entity IN ('attendance', 'finance')),
        CONSTRAINT uq_sync_operation_logs_tenant_version UNIQUE (tenant_id, version)
      );

      CREATE TABLE IF NOT EXISTS attendance_records (
        id uuid PRIMARY KEY,
        tenant_id text NOT NULL,
        student_id uuid NOT NULL,
        attendance_date date NOT NULL,
        status text NOT NULL,
        notes text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_device_id text,
        last_modified_at timestamptz NOT NULL,
        last_operation_id uuid,
        sync_version bigint,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_attendance_records_status CHECK (
          status IN ('present', 'absent', 'late', 'excused')
        ),
        CONSTRAINT uq_attendance_records_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_attendance_records_tenant_student_date
          UNIQUE (tenant_id, student_id, attendance_date)
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_sync_devices_tenant_id_id'
        ) THEN
          ALTER TABLE sync_devices
          ADD CONSTRAINT uq_sync_devices_tenant_id_id UNIQUE (tenant_id, id);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_sync_cursors_tenant_id_id'
        ) THEN
          ALTER TABLE sync_cursors
          ADD CONSTRAINT uq_sync_cursors_tenant_id_id UNIQUE (tenant_id, id);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_sync_operation_logs_tenant_version'
        ) THEN
          ALTER TABLE sync_operation_logs
          ADD CONSTRAINT uq_sync_operation_logs_tenant_version UNIQUE (tenant_id, version);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_attendance_records_tenant_id_id'
        ) THEN
          ALTER TABLE attendance_records
          ADD CONSTRAINT uq_attendance_records_tenant_id_id UNIQUE (tenant_id, id);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'uq_attendance_records_tenant_student_date'
        ) THEN
          ALTER TABLE attendance_records
          ADD CONSTRAINT uq_attendance_records_tenant_student_date
            UNIQUE (tenant_id, student_id, attendance_date);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_sync_cursors_device'
        ) THEN
          ALTER TABLE sync_cursors
          ADD CONSTRAINT fk_sync_cursors_device
            FOREIGN KEY (tenant_id, device_id)
            REFERENCES sync_devices (tenant_id, device_id)
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_attendance_records_last_operation'
        ) THEN
          ALTER TABLE attendance_records
          ADD CONSTRAINT fk_attendance_records_last_operation
            FOREIGN KEY (last_operation_id)
            REFERENCES sync_operation_logs (op_id)
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_attendance_records_sync_version'
        ) THEN
          ALTER TABLE attendance_records
          ADD CONSTRAINT fk_attendance_records_sync_version
            FOREIGN KEY (tenant_id, sync_version)
            REFERENCES sync_operation_logs (tenant_id, version)
            ON DELETE SET NULL;
        END IF;
      END;
      $$;

      CREATE INDEX IF NOT EXISTS ix_sync_devices_last_seen_at
        ON sync_devices (tenant_id, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS ix_sync_devices_platform
        ON sync_devices (tenant_id, platform, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_sync_cursors_device_updated_at
        ON sync_cursors (tenant_id, device_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_sync_operation_logs_tenant_entity_version
        ON sync_operation_logs (tenant_id, entity, version);
      CREATE INDEX IF NOT EXISTS ix_sync_operation_logs_device_created_at
        ON sync_operation_logs (tenant_id, device_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_attendance_records_student_date
        ON attendance_records (tenant_id, student_id, attendance_date DESC);
      CREATE INDEX IF NOT EXISTS ix_attendance_records_last_modified_at
        ON attendance_records (tenant_id, last_modified_at DESC);
      CREATE INDEX IF NOT EXISTS ix_attendance_records_sync_version
        ON attendance_records (tenant_id, sync_version);

      ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sync_devices FORCE ROW LEVEL SECURITY;
      ALTER TABLE sync_cursors ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sync_cursors FORCE ROW LEVEL SECURITY;
      ALTER TABLE sync_operation_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sync_operation_logs FORCE ROW LEVEL SECURITY;
      ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS sync_devices_rls_policy ON sync_devices;
      CREATE POLICY sync_devices_rls_policy ON sync_devices
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS sync_cursors_rls_policy ON sync_cursors;
      CREATE POLICY sync_cursors_rls_policy ON sync_cursors
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS sync_operation_logs_select_policy ON sync_operation_logs;
      CREATE POLICY sync_operation_logs_select_policy ON sync_operation_logs
      FOR SELECT
      USING (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS sync_operation_logs_insert_policy ON sync_operation_logs;
      CREATE POLICY sync_operation_logs_insert_policy ON sync_operation_logs
      FOR INSERT
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS attendance_records_rls_policy ON attendance_records;
      CREATE POLICY attendance_records_rls_policy ON attendance_records
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_sync_devices_set_updated_at ON sync_devices;
      CREATE TRIGGER trg_sync_devices_set_updated_at
      BEFORE UPDATE ON sync_devices
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_sync_cursors_set_updated_at ON sync_cursors;
      CREATE TRIGGER trg_sync_cursors_set_updated_at
      BEFORE UPDATE ON sync_cursors
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_attendance_records_set_updated_at ON attendance_records;
      CREATE TRIGGER trg_attendance_records_set_updated_at
      BEFORE UPDATE ON attendance_records
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_sync_operation_logs_set_updated_at ON sync_operation_logs;
      DROP TRIGGER IF EXISTS trg_sync_operation_logs_prevent_update ON sync_operation_logs;
      CREATE TRIGGER trg_sync_operation_logs_prevent_update
      BEFORE UPDATE OR DELETE ON sync_operation_logs
      FOR EACH ROW
      EXECUTE FUNCTION app.prevent_append_only_mutation();
    `);

    this.logger.log('Offline sync schema, device registry, and conflict tables verified');
  }
}
