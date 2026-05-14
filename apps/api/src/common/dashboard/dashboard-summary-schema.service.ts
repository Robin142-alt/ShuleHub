import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class DashboardSummarySchemaService implements OnModuleInit {
  private readonly logger = new Logger(DashboardSummarySchemaService.name);

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

      CREATE TABLE IF NOT EXISTS dashboard_summary_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        module text NOT NULL,
        summary_id text NOT NULL,
        role text NOT NULL,
        metrics jsonb NOT NULL,
        source_snapshot_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        generated_at timestamptz NOT NULL DEFAULT NOW(),
        stale_after timestamptz,
        checksum_sha256 text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_dashboard_summary_scope UNIQUE (tenant_id, module, summary_id, role),
        CONSTRAINT ck_dashboard_summary_metrics_object CHECK (jsonb_typeof(metrics) = 'object'),
        CONSTRAINT ck_dashboard_summary_source_snapshots_array CHECK (jsonb_typeof(source_snapshot_ids) = 'array'),
        CONSTRAINT ck_dashboard_summary_checksum CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
        CONSTRAINT ck_dashboard_summary_module_not_attendance CHECK (position('attendance' in lower(module)) = 0),
        CONSTRAINT ck_dashboard_summary_id_not_attendance CHECK (position('attendance' in lower(summary_id)) = 0)
      );

      CREATE INDEX IF NOT EXISTS ix_dashboard_summary_tenant_module_role
        ON dashboard_summary_snapshots (tenant_id, module, role, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_dashboard_summary_tenant_stale_after
        ON dashboard_summary_snapshots (tenant_id, stale_after)
        WHERE stale_after IS NOT NULL;

      ALTER TABLE dashboard_summary_snapshots ENABLE ROW LEVEL SECURITY;
      ALTER TABLE dashboard_summary_snapshots FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS dashboard_summary_snapshots_rls_policy ON dashboard_summary_snapshots;
      CREATE POLICY dashboard_summary_snapshots_rls_policy ON dashboard_summary_snapshots
      FOR ALL
      USING (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)
        OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'support_agent', 'support_lead', 'developer', 'system')
      );

      DROP TRIGGER IF EXISTS trg_dashboard_summary_snapshots_set_updated_at ON dashboard_summary_snapshots;
      CREATE TRIGGER trg_dashboard_summary_snapshots_set_updated_at
      BEFORE UPDATE ON dashboard_summary_snapshots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Dashboard summary schema verified');
  }
}
