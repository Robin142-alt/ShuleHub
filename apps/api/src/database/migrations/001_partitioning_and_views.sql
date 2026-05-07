-- ShuleHub — Table Partitioning Migration
-- Partitions high-volume tables by date for query performance at scale.
--
-- Tables partitioned:
--   audit_logs        → monthly by occurred_at (grows fastest, rarely queried old data)
--   callback_logs     → monthly by created_at (MPESA callback volume)
--
-- Strategy: Range partitioning by month. Auto-creates partitions for the next 12 months.
-- Run this AFTER the main schema.sql migration.
--
-- IMPORTANT: This migration is idempotent — safe to run multiple times.
-- It only creates partitions if they don't already exist.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Helper: Create monthly partitions for a given table
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.create_monthly_partitions(
  parent_table text,
  partition_column text,
  start_date date,
  months_ahead integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  partition_name text;
  partition_start date;
  partition_end date;
  i integer;
BEGIN
  FOR i IN 0..months_ahead LOOP
    partition_start := start_date + (i || ' months')::interval;
    partition_end := start_date + ((i + 1) || ' months')::interval;
    partition_name := parent_table || '_' || to_char(partition_start, 'YYYY_MM');

    -- Skip if partition already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE c.relname = partition_name
        AND n.nspname = 'public'
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        parent_table,
        partition_start,
        partition_end
      );
      RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Create partitioned versions of high-volume tables
-- Only runs if tables are NOT already partitioned
-- ─────────────────────────────────────────────────────────────────

-- Check if audit_logs is already partitioned
DO $$
DECLARE
  is_partitioned boolean;
BEGIN
  SELECT c.relkind = 'p' INTO is_partitioned
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relname = 'audit_logs'
    AND n.nspname = 'public';

  IF is_partitioned IS TRUE THEN
    RAISE NOTICE 'audit_logs is already partitioned — skipping';
  ELSE
    RAISE NOTICE 'audit_logs partitioning should be done during a maintenance window with data migration';
    RAISE NOTICE 'For now, creating partitions for future audit_logs_partitioned table';

    -- Create the partitioned table alongside the existing one
    CREATE TABLE IF NOT EXISTS audit_logs_partitioned (
      LIKE audit_logs INCLUDING ALL
    ) PARTITION BY RANGE (occurred_at);

    -- Create partitions for the next 12 months from the start of current month
    PERFORM app.create_monthly_partitions(
      'audit_logs_partitioned',
      'occurred_at',
      date_trunc('month', CURRENT_DATE)::date,
      12
    );

    -- Create a default partition for data outside defined ranges
    CREATE TABLE IF NOT EXISTS audit_logs_partitioned_default
      PARTITION OF audit_logs_partitioned DEFAULT;
  END IF;
END;
$$;

-- Do the same for callback_logs
DO $$
DECLARE
  is_partitioned boolean;
BEGIN
  SELECT c.relkind = 'p' INTO is_partitioned
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relname = 'callback_logs'
    AND n.nspname = 'public';

  IF is_partitioned IS TRUE THEN
    RAISE NOTICE 'callback_logs is already partitioned — skipping';
  ELSE
    CREATE TABLE IF NOT EXISTS callback_logs_partitioned (
      LIKE callback_logs INCLUDING ALL
    ) PARTITION BY RANGE (created_at);

    PERFORM app.create_monthly_partitions(
      'callback_logs_partitioned',
      'created_at',
      date_trunc('month', CURRENT_DATE)::date,
      12
    );

    CREATE TABLE IF NOT EXISTS callback_logs_partitioned_default
      PARTITION OF callback_logs_partitioned DEFAULT;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Materialized view: Dashboard aggregates
-- Refreshed periodically by a cron job or application timer
-- ─────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_payment_summary AS
SELECT
  pi.tenant_id,
  date_trunc('day', pi.created_at) AS payment_date,
  pi.status,
  COUNT(*) AS payment_count,
  COALESCE(SUM(pi.amount_minor), 0) AS total_amount_minor,
  pi.currency_code
FROM payment_intents pi
GROUP BY pi.tenant_id, date_trunc('day', pi.created_at), pi.status, pi.currency_code;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_tenant_payment_summary
  ON mv_tenant_payment_summary (tenant_id, payment_date, status, currency_code);

CREATE INDEX IF NOT EXISTS ix_mv_tenant_payment_summary_tenant
  ON mv_tenant_payment_summary (tenant_id, payment_date DESC);

-- Attendance summary materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_attendance_summary AS
SELECT
  ar.tenant_id,
  ar.attendance_date,
  ar.status,
  COUNT(*) AS record_count
FROM attendance_records ar
GROUP BY ar.tenant_id, ar.attendance_date, ar.status;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_tenant_attendance_summary
  ON mv_tenant_attendance_summary (tenant_id, attendance_date, status);

CREATE INDEX IF NOT EXISTS ix_mv_tenant_attendance_summary_tenant
  ON mv_tenant_attendance_summary (tenant_id, attendance_date DESC);

-- Student count by status per tenant
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_student_summary AS
SELECT
  s.tenant_id,
  s.status,
  COUNT(*) AS student_count
FROM students s
GROUP BY s.tenant_id, s.status;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_tenant_student_summary
  ON mv_tenant_student_summary (tenant_id, status);

COMMIT;
