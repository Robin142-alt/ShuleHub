import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ComplianceSchemaService implements OnModuleInit {
  private readonly logger = new Logger(ComplianceSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS consent_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        consent_type text NOT NULL,
        status text NOT NULL,
        policy_version text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        captured_at timestamptz NOT NULL DEFAULT NOW(),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_consent_records_consent_type_not_blank CHECK (btrim(consent_type) <> ''),
        CONSTRAINT ck_consent_records_policy_version_not_blank CHECK (btrim(policy_version) <> ''),
        CONSTRAINT ck_consent_records_status CHECK (status IN ('granted', 'revoked', 'withdrawn')),
        CONSTRAINT uq_consent_records_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE INDEX IF NOT EXISTS ix_consent_records_tenant_user_captured_at
        ON consent_records (tenant_id, user_id, captured_at DESC);
      CREATE INDEX IF NOT EXISTS ix_consent_records_tenant_type_captured_at
        ON consent_records (tenant_id, consent_type, captured_at DESC);

      ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
      ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS consent_records_rls_policy ON consent_records;
      CREATE POLICY consent_records_rls_policy ON consent_records
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_consent_records_set_updated_at ON consent_records;
      CREATE TRIGGER trg_consent_records_set_updated_at
      BEFORE UPDATE ON consent_records
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Compliance schema and consent tracking verified');
  }
}
