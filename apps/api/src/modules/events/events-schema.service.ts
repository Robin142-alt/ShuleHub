import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class EventsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(EventsSchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_audit_logs_action_not_blank CHECK (btrim(action) <> ''),
        CONSTRAINT ck_audit_logs_resource_type_not_blank CHECK (btrim(resource_type) <> ''),
        CONSTRAINT fk_audit_logs_actor_user
          FOREIGN KEY (actor_user_id)
          REFERENCES users (id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
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
        CONSTRAINT ck_outbox_events_event_key_not_blank CHECK (btrim(event_key) <> ''),
        CONSTRAINT ck_outbox_events_event_name_not_blank CHECK (btrim(event_name) <> ''),
        CONSTRAINT ck_outbox_events_aggregate_type_not_blank CHECK (btrim(aggregate_type) <> ''),
        CONSTRAINT ck_outbox_events_status CHECK (
          status IN ('pending', 'processing', 'published', 'failed', 'discarded')
        ),
        CONSTRAINT ck_outbox_events_attempt_count_non_negative CHECK (attempt_count >= 0),
        CONSTRAINT uq_outbox_events_tenant_event_key UNIQUE (tenant_id, event_key),
        CONSTRAINT uq_outbox_events_tenant_id_id UNIQUE (tenant_id, id)
      );

      CREATE TABLE IF NOT EXISTS event_consumer_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        outbox_event_id uuid NOT NULL,
        event_key text NOT NULL,
        consumer_name text NOT NULL,
        status text NOT NULL DEFAULT 'processing',
        attempt_count integer NOT NULL DEFAULT 0,
        last_error text,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_event_consumer_runs_event_key_not_blank CHECK (btrim(event_key) <> ''),
        CONSTRAINT ck_event_consumer_runs_consumer_name_not_blank CHECK (btrim(consumer_name) <> ''),
        CONSTRAINT ck_event_consumer_runs_status CHECK (status IN ('processing', 'completed', 'failed')),
        CONSTRAINT ck_event_consumer_runs_attempt_count_non_negative CHECK (attempt_count >= 0),
        CONSTRAINT uq_event_consumer_runs_tenant_outbox_consumer
          UNIQUE (tenant_id, outbox_event_id, consumer_name),
        CONSTRAINT uq_event_consumer_runs_tenant_consumer_event_key
          UNIQUE (tenant_id, consumer_name, event_key),
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

      CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_occurred_at
        ON audit_logs (tenant_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_actor_occurred_at
        ON audit_logs (tenant_id, actor_user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_resource_occurred_at
        ON audit_logs (tenant_id, resource_type, resource_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_audit_logs_request_id
        ON audit_logs (request_id)
        WHERE request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_outbox_events_dispatch
        ON outbox_events (status, available_at, created_at);
      CREATE INDEX IF NOT EXISTS ix_outbox_events_tenant_status_available_at
        ON outbox_events (tenant_id, status, available_at, created_at);
      CREATE INDEX IF NOT EXISTS ix_event_consumer_runs_outbox_consumer
        ON event_consumer_runs (tenant_id, outbox_event_id, consumer_name);

      ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
      ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
      ALTER TABLE event_consumer_runs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE event_consumer_runs FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS audit_logs_rls_policy ON audit_logs;
      CREATE POLICY audit_logs_rls_policy ON audit_logs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS outbox_events_rls_policy ON outbox_events;
      CREATE POLICY outbox_events_rls_policy ON outbox_events
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS event_consumer_runs_rls_policy ON event_consumer_runs;
      CREATE POLICY event_consumer_runs_rls_policy ON event_consumer_runs
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_audit_logs_set_updated_at ON audit_logs;
      CREATE TRIGGER trg_audit_logs_set_updated_at
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_outbox_events_set_updated_at ON outbox_events;
      CREATE TRIGGER trg_outbox_events_set_updated_at
      BEFORE UPDATE ON outbox_events
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_event_consumer_runs_set_updated_at ON event_consumer_runs;
      CREATE TRIGGER trg_event_consumer_runs_set_updated_at
      BEFORE UPDATE ON event_consumer_runs
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Event schema, outbox, and consumer idempotency tables verified');
  }
}
