import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ReportSnapshotSchemaService implements OnModuleInit {
  private readonly logger = new Logger(ReportSnapshotSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION prevent_report_snapshot_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'report snapshots are immutable and cannot be %', lower(TG_OP)
          USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS report_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        snapshot_id text NOT NULL,
        module text NOT NULL,
        report_id text NOT NULL,
        title text NOT NULL,
        format text NOT NULL,
        artifact jsonb NOT NULL,
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        generated_by_user_id text,
        manifest jsonb NOT NULL,
        manifest_checksum_sha256 text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_report_snapshots_tenant_snapshot UNIQUE (tenant_id, snapshot_id),
        CONSTRAINT ck_report_snapshots_format CHECK (format IN ('csv', 'xlsx', 'pdf')),
        CONSTRAINT ck_report_snapshots_checksum CHECK (manifest_checksum_sha256 ~ '^[a-f0-9]{64}$'),
        CONSTRAINT ck_report_snapshots_module_not_attendance CHECK (position('attendance' in lower(module)) = 0),
        CONSTRAINT ck_report_snapshots_report_not_attendance CHECK (position('attendance' in lower(report_id)) = 0)
      );

      CREATE TABLE IF NOT EXISTS report_snapshot_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        snapshot_id text NOT NULL,
        action text NOT NULL,
        actor_user_id text,
        request_id text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_report_snapshot_audit_snapshot
          FOREIGN KEY (tenant_id, snapshot_id)
          REFERENCES report_snapshots (tenant_id, snapshot_id),
        CONSTRAINT ck_report_snapshot_audit_action CHECK (length(trim(action)) > 0)
      );

      CREATE INDEX IF NOT EXISTS ix_report_snapshots_tenant_module_created
        ON report_snapshots (tenant_id, module, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_report_snapshots_tenant_report_created
        ON report_snapshots (tenant_id, report_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_report_snapshots_manifest_checksum
        ON report_snapshots (manifest_checksum_sha256);
      CREATE INDEX IF NOT EXISTS ix_report_snapshot_audit_tenant_snapshot_created
        ON report_snapshot_audit_logs (tenant_id, snapshot_id, created_at DESC);

      ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;
      ALTER TABLE report_snapshots FORCE ROW LEVEL SECURITY;
      ALTER TABLE report_snapshot_audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE report_snapshot_audit_logs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS report_snapshots_rls_policy ON report_snapshots;
      CREATE POLICY report_snapshots_rls_policy ON report_snapshots
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
      );

      DROP POLICY IF EXISTS report_snapshot_audit_logs_rls_policy ON report_snapshot_audit_logs;
      CREATE POLICY report_snapshot_audit_logs_rls_policy ON report_snapshot_audit_logs
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
      );

      DROP TRIGGER IF EXISTS trg_report_snapshots_set_updated_at ON report_snapshots;
      CREATE TRIGGER trg_report_snapshots_set_updated_at
      BEFORE UPDATE ON report_snapshots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_report_snapshots_prevent_mutation ON report_snapshots;
      CREATE TRIGGER trg_report_snapshots_prevent_mutation
      BEFORE UPDATE OR DELETE ON report_snapshots
      FOR EACH ROW EXECUTE FUNCTION prevent_report_snapshot_mutation();

      DROP TRIGGER IF EXISTS trg_report_snapshot_audit_logs_prevent_mutation ON report_snapshot_audit_logs;
      CREATE TRIGGER trg_report_snapshot_audit_logs_prevent_mutation
      BEFORE UPDATE OR DELETE ON report_snapshot_audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_report_snapshot_mutation();
    `);

    this.logger.log('Report snapshot schema verified');
  }
}
