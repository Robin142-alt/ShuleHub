import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import format from 'pg-format';
import { PoolClient, QueryResultRow } from 'pg';

import { DatabaseSecurityService } from '../src/database/database-security.service';
import {
  closeRaceTestHarness,
  createRaceTestHarness,
  ensureRaceIntegrationEnv,
  RaceTestHarness,
} from './support/race-harness';

type BenchmarkQueryName =
  | 'students_active_page'
  | 'attendance_student_history'
  | 'payments_recent_page';

interface ScaleConfig {
  tenant_count: number;
  students_per_tenant: number;
  attendance_days_per_student: number;
  payments_per_tenant: number;
  sample_tenants: number;
  benchmark_iterations: number;
  report_path: string | null;
  fail_query_growth_ratio: number;
  fail_query_growth_delta_ms: number;
}

interface TenantProbe {
  tenant_id: string;
  tenant_ord: number;
  sample_student_id: string;
}

interface IsolationCheckResult {
  table: 'students' | 'attendance_records' | 'payment_intents';
  source_tenant_id: string;
  target_tenant_id: string;
  own_row_count: number;
  leaked_row_count: number;
  passed: boolean;
}

interface ExplainNodeSummary {
  node_type: string;
  relation_name: string | null;
  index_name: string | null;
}

interface ExplainCheckResult {
  benchmark: BenchmarkQueryName;
  tenant_id: string;
  expected_index_names: string[];
  used_expected_index: boolean;
  relation_has_seq_scan: boolean;
  execution_time_ms: number | null;
  shared_hit_blocks: number | null;
  shared_read_blocks: number | null;
  scan_nodes: ExplainNodeSummary[];
}

interface BenchmarkMeasurement {
  tenant_id: string;
  tenant_ord: number;
  latency_ms: number;
}

interface BenchmarkSummary {
  query: BenchmarkQueryName;
  sampled_tenants: number;
  iterations: number;
  first_bucket_avg_ms: number;
  last_bucket_avg_ms: number;
  min_avg_ms: number;
  median_avg_ms: number;
  p95_avg_ms: number;
  max_avg_ms: number;
  growth_ratio: number;
  growth_delta_ms: number;
  tenant_measurements: Array<{
    tenant_id: string;
    tenant_ord: number;
    avg_latency_ms: number;
  }>;
}

interface ScaleFailure {
  check: string;
  message: string;
  observed: number;
  threshold: number;
}

interface TenantScaleReport {
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: 'passed' | 'failed';
  config: ScaleConfig;
  seeded: {
    tenant_count: number;
    student_count: number;
    attendance_count: number;
    payment_count: number;
    transaction_count: number;
    ledger_entry_count: number;
  };
  runtime_role: string | null;
  isolation_checks: IsolationCheckResult[];
  explain_checks: ExplainCheckResult[];
  benchmarks: BenchmarkSummary[];
  failures: ScaleFailure[];
}

const BENCHMARK_SQL: Record<BenchmarkQueryName, string> = {
  students_active_page: `
    SELECT id, admission_number, created_at
    FROM students
    WHERE tenant_id = $1
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 25
  `,
  attendance_student_history: `
    SELECT id, attendance_date, status, updated_at
    FROM attendance_records
    WHERE tenant_id = $1
      AND student_id = $2::uuid
      AND attendance_date >= $3::date
      AND attendance_date <= $4::date
    ORDER BY attendance_date DESC
    LIMIT 30
  `,
  payments_recent_page: `
    SELECT
      id,
      checkout_request_id,
      amount_minor,
      created_at,
      ledger_transaction_id
    FROM payment_intents
    WHERE tenant_id = $1
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 25
  `,
};

const main = async (): Promise<void> => {
  ensureRaceIntegrationEnv();
  const config = parseConfig();
  const startedAt = new Date();
  const harness = await createRaceTestHarness();
  const client = await harness.databaseService.acquireClient();

  try {
    const runtimeRoleName = getRuntimeRoleName(harness);
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 0');

    const tenantIds = buildTenantIds(config.tenant_count);
    await seedScaleDataset(client, config, tenantIds);
    await analyzeSeededTables(client);

    const seeded = await loadSeededCounts(client);
    const tenantProbes = await loadTenantProbes(client, config.sample_tenants);
    const isolationChecks = await runIsolationChecks(client, tenantProbes, runtimeRoleName);
    const explainChecks = await runExplainChecks(client, tenantProbes, runtimeRoleName);
    const benchmarks = await runBenchmarks(client, tenantProbes, runtimeRoleName, config);
    const failures = evaluateFailures(config, isolationChecks, explainChecks, benchmarks);
    const endedAt = new Date();
    const report: TenantScaleReport = {
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: endedAt.getTime() - startedAt.getTime(),
      status: failures.length === 0 ? 'passed' : 'failed',
      config,
      seeded,
      runtime_role: runtimeRoleName,
      isolation_checks: isolationChecks,
      explain_checks: explainChecks,
      benchmarks,
      failures,
    };

    if (config.report_path) {
      await writeFile(config.report_path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (report.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await closeRaceTestHarness(harness);
  }
};

const parseConfig = (): ScaleConfig => ({
  tenant_count: parseInteger(process.env.SCALE_TENANTS, 1000, 1000, 10000),
  students_per_tenant: parseInteger(process.env.SCALE_STUDENTS_PER_TENANT, 12, 2, 200),
  attendance_days_per_student: parseInteger(
    process.env.SCALE_ATTENDANCE_DAYS_PER_STUDENT,
    8,
    1,
    120,
  ),
  payments_per_tenant: parseInteger(process.env.SCALE_PAYMENTS_PER_TENANT, 4, 1, 100),
  sample_tenants: parseInteger(process.env.SCALE_SAMPLE_TENANTS, 24, 3, 200),
  benchmark_iterations: parseInteger(
    process.env.SCALE_BENCHMARK_ITERATIONS,
    4,
    1,
    50,
  ),
  report_path: process.env.SCALE_REPORT_PATH?.trim() || null,
  fail_query_growth_ratio: parsePositiveNumber(
    process.env.SCALE_FAIL_QUERY_GROWTH_RATIO,
    2,
  ),
  fail_query_growth_delta_ms: parsePositiveNumber(
    process.env.SCALE_FAIL_QUERY_GROWTH_DELTA_MS,
    20,
  ),
});

const seedScaleDataset = async (
  client: PoolClient,
  config: ScaleConfig,
  tenantIds: string[],
): Promise<void> => {
  await client.query(`
    CREATE TEMP TABLE scale_tenants (
      tenant_id text PRIMARY KEY,
      tenant_ord integer NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(
    `
      INSERT INTO scale_tenants (tenant_id, tenant_ord)
      SELECT tenant_id, ordinality::integer
      FROM unnest($1::text[]) WITH ORDINALITY AS seeded(tenant_id, ordinality)
    `,
    [tenantIds],
  );

  await client.query(`
    CREATE TEMP TABLE scale_accounts (
      account_id uuid PRIMARY KEY,
      tenant_id text NOT NULL,
      account_code text NOT NULL,
      account_name text NOT NULL,
      category text NOT NULL,
      normal_balance text NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(
    `
      INSERT INTO scale_accounts (
        account_id,
        tenant_id,
        account_code,
        account_name,
        category,
        normal_balance
      )
      SELECT
        gen_random_uuid(),
        tenant_id,
        account_code,
        account_name,
        category,
        normal_balance
      FROM scale_tenants
      CROSS JOIN (
        VALUES
          ('1100-MPESA-CLEARING', 'MPESA Clearing', 'asset', 'debit'),
          ('2100-CUSTOMER-DEPOSITS', 'Customer Deposits', 'liability', 'credit')
      ) AS account_template(account_code, account_name, category, normal_balance)
    `,
  );
  await client.query(`
    INSERT INTO accounts (
      id,
      tenant_id,
      code,
      name,
      category,
      normal_balance,
      currency_code,
      allow_manual_entries,
      is_active,
      metadata
    )
    SELECT
      account_id,
      tenant_id,
      account_code,
      account_name,
      category,
      normal_balance,
      'KES',
      TRUE,
      TRUE,
      '{"seed":"tenant-scale"}'::jsonb
    FROM scale_accounts
  `);

  await client.query(`
    CREATE TEMP TABLE scale_students (
      student_id uuid PRIMARY KEY,
      tenant_id text NOT NULL,
      tenant_ord integer NOT NULL,
      student_ord integer NOT NULL,
      admission_number text NOT NULL,
      created_at timestamptz NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(
    `
      INSERT INTO scale_students (
        student_id,
        tenant_id,
        tenant_ord,
        student_ord,
        admission_number,
        created_at
      )
      SELECT
        gen_random_uuid(),
        tenant_id,
        tenant_ord,
        student_ord,
        'ADM-' || LPAD(tenant_ord::text, 4, '0') || '-' || LPAD(student_ord::text, 3, '0'),
        NOW() - make_interval(mins => ((tenant_ord - 1) * $1) + student_ord)
      FROM scale_tenants
      CROSS JOIN generate_series(1, $1) AS seeded(student_ord)
    `,
    [config.students_per_tenant],
  );
  await client.query(`
    INSERT INTO students (
      id,
      tenant_id,
      admission_number,
      first_name,
      last_name,
      middle_name,
      status,
      date_of_birth,
      gender,
      primary_guardian_name,
      primary_guardian_phone,
      metadata,
      created_by_user_id,
      created_at,
      updated_at
    )
    SELECT
      student_id,
      tenant_id,
      admission_number,
      'Student-' || student_ord::text,
      'Tenant-' || tenant_ord::text,
      NULL,
      CASE WHEN student_ord % 6 = 0 THEN 'inactive' ELSE 'active' END,
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object(
        'seed',
        'tenant-scale',
        'tenant_ord',
        tenant_ord,
        'student_ord',
        student_ord
      ),
      NULL,
      created_at,
      created_at
    FROM scale_students
  `);

  await client.query(`
    CREATE TEMP TABLE scale_attendance (
      attendance_id uuid PRIMARY KEY,
      tenant_id text NOT NULL,
      student_id uuid NOT NULL,
      attendance_date date NOT NULL,
      status text NOT NULL,
      last_modified_at timestamptz NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(
    `
      INSERT INTO scale_attendance (
        attendance_id,
        tenant_id,
        student_id,
        attendance_date,
        status,
        last_modified_at
      )
      SELECT
        gen_random_uuid(),
        tenant_id,
        student_id,
        (CURRENT_DATE - ((attendance_ord - 1) || ' days')::interval)::date,
        CASE attendance_ord % 4
          WHEN 0 THEN 'present'
          WHEN 1 THEN 'absent'
          WHEN 2 THEN 'late'
          ELSE 'excused'
        END,
        created_at + make_interval(hours => attendance_ord)
      FROM scale_students
      CROSS JOIN generate_series(1, $1) AS seeded(attendance_ord)
    `,
    [config.attendance_days_per_student],
  );
  await client.query(`
    INSERT INTO attendance_records (
      id,
      tenant_id,
      student_id,
      attendance_date,
      status,
      notes,
      metadata,
      source_device_id,
      last_modified_at,
      last_operation_id,
      sync_version,
      created_at,
      updated_at
    )
    SELECT
      attendance_id,
      tenant_id,
      student_id,
      attendance_date,
      status,
      'seeded-attendance',
      '{"seed":"tenant-scale"}'::jsonb,
      NULL,
      last_modified_at,
      NULL,
      NULL,
      last_modified_at,
      last_modified_at
    FROM scale_attendance
  `);

  await client.query(`
    CREATE TEMP TABLE scale_payments (
      tenant_id text NOT NULL,
      tenant_ord integer NOT NULL,
      payment_ord integer NOT NULL,
      phone_number text NOT NULL,
      amount_minor bigint NOT NULL,
      posted_at timestamptz NOT NULL,
      finance_idempotency_key_id uuid NOT NULL,
      payment_idempotency_key_id uuid NOT NULL,
      transaction_id uuid NOT NULL,
      payment_intent_id uuid NOT NULL,
      callback_log_id uuid NOT NULL,
      merchant_request_id text NOT NULL,
      checkout_request_id text NOT NULL,
      delivery_id text NOT NULL,
      mpesa_receipt_number text NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(
    `
      INSERT INTO scale_payments (
        tenant_id,
        tenant_ord,
        payment_ord,
        phone_number,
        amount_minor,
        posted_at,
        finance_idempotency_key_id,
        payment_idempotency_key_id,
        transaction_id,
        payment_intent_id,
        callback_log_id,
        merchant_request_id,
        checkout_request_id,
        delivery_id,
        mpesa_receipt_number
      )
      SELECT
        tenant_id,
        tenant_ord,
        payment_ord,
        '2547' || LPAD((((tenant_ord - 1) * 100) + payment_ord)::text, 8, '0'),
        (2500 + (payment_ord * 125))::bigint,
        NOW() - make_interval(hours => ((tenant_ord - 1) * $1) + payment_ord),
        gen_random_uuid(),
        gen_random_uuid(),
        gen_random_uuid(),
        gen_random_uuid(),
        gen_random_uuid(),
        'merchant-' || tenant_ord::text || '-' || payment_ord::text,
        'checkout-' || tenant_ord::text || '-' || payment_ord::text,
        'delivery-' || tenant_ord::text || '-' || payment_ord::text,
        'RCP-' || LPAD(tenant_ord::text, 4, '0') || '-' || LPAD(payment_ord::text, 3, '0')
      FROM scale_tenants
      CROSS JOIN generate_series(1, $1) AS seeded(payment_ord)
    `,
    [config.payments_per_tenant],
  );

  await client.query(`
    INSERT INTO idempotency_keys (
      id,
      tenant_id,
      user_id,
      scope,
      idempotency_key,
      request_method,
      request_path,
      request_hash,
      status,
      response_status_code,
      response_headers,
      response_body,
      locked_at,
      completed_at,
      expires_at,
      created_at,
      updated_at
    )
    SELECT
      finance_idempotency_key_id,
      tenant_id,
      NULL,
      'finance',
      'seed:finance:' || tenant_ord::text || ':' || payment_ord::text,
      'POST',
      '/seed/finance',
      md5('seed:finance:' || tenant_ord::text || ':' || payment_ord::text),
      'completed',
      201,
      '{}'::jsonb,
      NULL,
      posted_at,
      posted_at,
      posted_at + INTERVAL '30 days',
      posted_at,
      posted_at
    FROM scale_payments
  `);
  await client.query(`
    INSERT INTO idempotency_keys (
      id,
      tenant_id,
      user_id,
      scope,
      idempotency_key,
      request_method,
      request_path,
      request_hash,
      status,
      response_status_code,
      response_headers,
      response_body,
      locked_at,
      completed_at,
      expires_at,
      created_at,
      updated_at
    )
    SELECT
      payment_idempotency_key_id,
      tenant_id,
      NULL,
      'payments-mpesa',
      'seed:payment:' || tenant_ord::text || ':' || payment_ord::text,
      'POST',
      '/seed/payments/mpesa',
      md5('seed:payment:' || tenant_ord::text || ':' || payment_ord::text),
      'completed',
      201,
      '{}'::jsonb,
      NULL,
      posted_at,
      posted_at,
      posted_at + INTERVAL '30 days',
      posted_at,
      posted_at
    FROM scale_payments
  `);

  await client.query(`
    INSERT INTO transactions (
      id,
      tenant_id,
      idempotency_key_id,
      reference,
      description,
      currency_code,
      total_amount_minor,
      entry_count,
      effective_at,
      posted_at,
      created_by_user_id,
      request_id,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      transaction_id,
      tenant_id,
      finance_idempotency_key_id,
      'MPESA-SEED-' || tenant_ord::text || '-' || payment_ord::text,
      'Seeded MPESA transaction ' || payment_ord::text,
      'KES',
      amount_minor,
      2,
      posted_at,
      posted_at,
      NULL,
      'tenant-scale-seed',
      jsonb_build_object(
        'seed',
        'tenant-scale',
        'payment_ord',
        payment_ord
      ),
      posted_at,
      posted_at
    FROM scale_payments
  `);
  await client.query(`
    INSERT INTO ledger_entries (
      id,
      tenant_id,
      transaction_id,
      account_id,
      line_number,
      direction,
      amount_minor,
      currency_code,
      description,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      payment.tenant_id,
      payment.transaction_id,
      account.account_id,
      CASE account.account_code
        WHEN '1100-MPESA-CLEARING' THEN 1
        ELSE 2
      END,
      CASE account.account_code
        WHEN '1100-MPESA-CLEARING' THEN 'debit'
        ELSE 'credit'
      END,
      payment.amount_minor,
      'KES',
      CASE account.account_code
        WHEN '1100-MPESA-CLEARING' THEN 'Seed debit leg'
        ELSE 'Seed credit leg'
      END,
      '{"seed":"tenant-scale"}'::jsonb,
      payment.posted_at,
      payment.posted_at
    FROM scale_payments AS payment
    JOIN scale_accounts AS account
      ON account.tenant_id = payment.tenant_id
     AND account.account_code IN ('1100-MPESA-CLEARING', '2100-CUSTOMER-DEPOSITS')
  `);

  await client.query(`
    INSERT INTO payment_intents (
      id,
      tenant_id,
      idempotency_key_id,
      user_id,
      request_id,
      external_reference,
      account_reference,
      transaction_desc,
      phone_number,
      amount_minor,
      currency_code,
      status,
      merchant_request_id,
      checkout_request_id,
      response_code,
      response_description,
      customer_message,
      ledger_transaction_id,
      failure_reason,
      stk_requested_at,
      callback_received_at,
      completed_at,
      expires_at,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      payment_intent_id,
      tenant_id,
      payment_idempotency_key_id,
      NULL,
      'tenant-scale-seed',
      'EXT-' || tenant_ord::text || '-' || payment_ord::text,
      'ACC-' || tenant_ord::text || '-' || payment_ord::text,
      'Seeded MPESA payment ' || payment_ord::text,
      phone_number,
      amount_minor,
      'KES',
      'completed',
      merchant_request_id,
      checkout_request_id,
      '0',
      'Accepted',
      'Completed',
      transaction_id,
      NULL,
      posted_at,
      posted_at,
      posted_at,
      posted_at + INTERVAL '1 day',
      jsonb_build_object(
        'seed',
        'tenant-scale',
        'payment_ord',
        payment_ord
      ),
      posted_at,
      posted_at
    FROM scale_payments
  `);

  await client.query(`
    INSERT INTO callback_logs (
      id,
      tenant_id,
      merchant_request_id,
      checkout_request_id,
      delivery_id,
      request_fingerprint,
      event_timestamp,
      signature,
      signature_verified,
      headers,
      raw_body,
      raw_payload,
      source_ip,
      processing_status,
      queue_job_id,
      failure_reason,
      queued_at,
      processed_at,
      created_at,
      updated_at
    )
    SELECT
      callback_log_id,
      tenant_id,
      merchant_request_id,
      checkout_request_id,
      delivery_id,
      md5(delivery_id),
      posted_at,
      'seeded-signature',
      TRUE,
      '{}'::jsonb,
      '{}',
      '{}'::jsonb,
      NULL,
      'processed',
      NULL,
      NULL,
      posted_at,
      posted_at,
      posted_at,
      posted_at
    FROM scale_payments
  `);

  await client.query(`
    INSERT INTO mpesa_transactions (
      id,
      tenant_id,
      payment_intent_id,
      callback_log_id,
      checkout_request_id,
      merchant_request_id,
      result_code,
      result_desc,
      status,
      mpesa_receipt_number,
      amount_minor,
      phone_number,
      transaction_occurred_at,
      ledger_transaction_id,
      processed_at,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      tenant_id,
      payment_intent_id,
      callback_log_id,
      checkout_request_id,
      merchant_request_id,
      0,
      'The service request is processed successfully.',
      'succeeded',
      mpesa_receipt_number,
      amount_minor,
      phone_number,
      posted_at,
      transaction_id,
      posted_at,
      jsonb_build_object(
        'seed',
        'tenant-scale',
        'payment_ord',
        payment_ord
      ),
      posted_at,
      posted_at
    FROM scale_payments
  `);
};

const analyzeSeededTables = async (client: PoolClient): Promise<void> => {
  await client.query(`
    ANALYZE accounts;
    ANALYZE students;
    ANALYZE attendance_records;
    ANALYZE idempotency_keys;
    ANALYZE transactions;
    ANALYZE ledger_entries;
    ANALYZE payment_intents;
    ANALYZE callback_logs;
    ANALYZE mpesa_transactions;
  `);
};

const loadSeededCounts = async (
  client: PoolClient,
): Promise<TenantScaleReport['seeded']> => {
  const row = await queryRow<{
    tenant_count: string;
    student_count: string;
    attendance_count: string;
    payment_count: string;
    transaction_count: string;
    ledger_entry_count: string;
  }>(
    client,
    `
      SELECT
        (SELECT COUNT(*)::text FROM scale_tenants) AS tenant_count,
        (SELECT COUNT(*)::text FROM scale_students) AS student_count,
        (SELECT COUNT(*)::text FROM scale_attendance) AS attendance_count,
        (SELECT COUNT(*)::text FROM scale_payments) AS payment_count,
        (SELECT COUNT(*)::text FROM transactions WHERE request_id = 'tenant-scale-seed') AS transaction_count,
        (SELECT COUNT(*)::text FROM ledger_entries WHERE metadata ->> 'seed' = 'tenant-scale') AS ledger_entry_count
    `,
  );

  return {
    tenant_count: Number(row.tenant_count),
    student_count: Number(row.student_count),
    attendance_count: Number(row.attendance_count),
    payment_count: Number(row.payment_count),
    transaction_count: Number(row.transaction_count),
    ledger_entry_count: Number(row.ledger_entry_count),
  };
};

const loadTenantProbes = async (
  client: PoolClient,
  sampleTenants: number,
): Promise<TenantProbe[]> => {
  const tenants = await queryRows<TenantProbe>(
    client,
    `
      WITH evenly_spaced AS (
        SELECT
          tenant_id,
          tenant_ord,
          ROW_NUMBER() OVER (ORDER BY tenant_ord ASC) AS row_num,
          COUNT(*) OVER () AS total_rows
        FROM scale_tenants
      ),
      selected AS (
        SELECT DISTINCT
          tenant_id,
          tenant_ord
        FROM evenly_spaced
        WHERE row_num = 1
           OR row_num = total_rows
           OR ((row_num - 1) % GREATEST(1, FLOOR(total_rows::numeric / $1::numeric))::integer) = 0
        ORDER BY tenant_ord ASC
        LIMIT $1
      )
      SELECT
        selected.tenant_id,
        selected.tenant_ord,
        scale_students.student_id AS sample_student_id
      FROM selected
      JOIN scale_students
        ON scale_students.tenant_id = selected.tenant_id
       AND scale_students.student_ord = 1
      ORDER BY selected.tenant_ord ASC
    `,
    [sampleTenants],
  );

  return tenants;
};

const runIsolationChecks = async (
  client: PoolClient,
  tenantProbes: TenantProbe[],
  runtimeRoleName: string | null,
): Promise<IsolationCheckResult[]> => {
  if (tenantProbes.length < 2) {
    return [];
  }

  const pairings = [
    [tenantProbes[0], tenantProbes[tenantProbes.length - 1]],
    [tenantProbes[Math.floor(tenantProbes.length / 2)], tenantProbes[0]],
    [tenantProbes[tenantProbes.length - 1], tenantProbes[Math.floor(tenantProbes.length / 2)]],
  ];
  const results: IsolationCheckResult[] = [];

  for (const [sourceTenant, targetTenant] of pairings) {
    await applyTenantQueryContext(client, runtimeRoleName, sourceTenant.tenant_id);

    results.push(
      await buildIsolationCheck(
        client,
        'students',
        sourceTenant.tenant_id,
        targetTenant.tenant_id,
        `SELECT COUNT(*)::int AS value FROM students WHERE tenant_id = $1`,
      ),
    );
    results.push(
      await buildIsolationCheck(
        client,
        'attendance_records',
        sourceTenant.tenant_id,
        targetTenant.tenant_id,
        `SELECT COUNT(*)::int AS value FROM attendance_records WHERE tenant_id = $1`,
      ),
    );
    results.push(
      await buildIsolationCheck(
        client,
        'payment_intents',
        sourceTenant.tenant_id,
        targetTenant.tenant_id,
        `SELECT COUNT(*)::int AS value FROM payment_intents WHERE tenant_id = $1`,
      ),
    );
  }

  return results;
};

const buildIsolationCheck = async (
  client: PoolClient,
  table: IsolationCheckResult['table'],
  sourceTenantId: string,
  targetTenantId: string,
  sql: string,
): Promise<IsolationCheckResult> => {
  const ownRowCount = await queryScalar<number>(client, sql, [sourceTenantId]);
  const leakedRowCount = await queryScalar<number>(client, sql, [targetTenantId]);

  return {
    table,
    source_tenant_id: sourceTenantId,
    target_tenant_id: targetTenantId,
    own_row_count: ownRowCount,
    leaked_row_count: leakedRowCount,
    passed: ownRowCount > 0 && leakedRowCount === 0,
  };
};

const runExplainChecks = async (
  client: PoolClient,
  tenantProbes: TenantProbe[],
  runtimeRoleName: string | null,
): Promise<ExplainCheckResult[]> => {
  if (tenantProbes.length === 0) {
    return [];
  }

  const selectedProbes = [
    tenantProbes[0],
    tenantProbes[Math.floor(tenantProbes.length / 2)],
    tenantProbes[tenantProbes.length - 1],
  ].filter(
    (probe, index, probes) =>
      probes.findIndex((candidate) => candidate.tenant_id === probe.tenant_id) === index,
  );
  const results: ExplainCheckResult[] = [];

  for (const probe of selectedProbes) {
    await applyTenantQueryContext(client, runtimeRoleName, probe.tenant_id);
    results.push(
      await explainBenchmarkQuery(
        client,
        'students_active_page',
        probe,
        ['ix_students_status_created_at'],
      ),
    );
    results.push(
      await explainBenchmarkQuery(
        client,
        'attendance_student_history',
        probe,
        ['ix_attendance_records_student_date'],
      ),
    );
    results.push(
      await explainBenchmarkQuery(
        client,
        'payments_recent_page',
        probe,
        ['ix_payment_intents_status_created_at', 'ix_payment_intents_phone_number'],
      ),
    );
  }

  return results;
};

const explainBenchmarkQuery = async (
  client: PoolClient,
  benchmark: BenchmarkQueryName,
  probe: TenantProbe,
  expectedIndexNames: string[],
): Promise<ExplainCheckResult> => {
  const values = benchmarkValues(benchmark, probe);
  const result = await client.query<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${BENCHMARK_SQL[benchmark]}`,
    values,
  );
  const planWrapper = result.rows[0]?.['QUERY PLAN']?.[0];

  if (!planWrapper?.Plan) {
    throw new Error(`Expected an execution plan for benchmark "${benchmark}"`);
  }

  const flattenedPlanNodes = flattenPlan(planWrapper.Plan);
  const scanNodes = flattenedPlanNodes
    .filter((node) => node.relation_name !== null || node.index_name !== null)
    .map((node) => ({
      node_type: node.node_type,
      relation_name: node.relation_name,
      index_name: node.index_name,
    }));
  const usedExpectedIndex = flattenedPlanNodes.some(
    (node) => node.index_name && expectedIndexNames.includes(node.index_name),
  );
  const relationHasSeqScan = flattenedPlanNodes.some(
    (node) => node.node_type === 'Seq Scan' && isBenchmarkTargetRelation(benchmark, node.relation_name),
  );

  return {
    benchmark,
    tenant_id: probe.tenant_id,
    expected_index_names: expectedIndexNames,
    used_expected_index: usedExpectedIndex,
    relation_has_seq_scan: relationHasSeqScan,
    execution_time_ms:
      typeof planWrapper.Plan['Actual Total Time'] === 'number'
        ? Number(planWrapper.Plan['Actual Total Time'].toFixed(2))
        : null,
    shared_hit_blocks:
      typeof planWrapper.Plan['Shared Hit Blocks'] === 'number'
        ? planWrapper.Plan['Shared Hit Blocks']
        : null,
    shared_read_blocks:
      typeof planWrapper.Plan['Shared Read Blocks'] === 'number'
        ? planWrapper.Plan['Shared Read Blocks']
        : null,
    scan_nodes: scanNodes,
  };
};

const runBenchmarks = async (
  client: PoolClient,
  tenantProbes: TenantProbe[],
  runtimeRoleName: string | null,
  config: ScaleConfig,
): Promise<BenchmarkSummary[]> => {
  const measurementsByQuery = new Map<BenchmarkQueryName, BenchmarkMeasurement[]>([
    ['students_active_page', []],
    ['attendance_student_history', []],
    ['payments_recent_page', []],
  ]);

  for (let iteration = 0; iteration < config.benchmark_iterations; iteration += 1) {
    for (const probe of tenantProbes) {
      await applyTenantQueryContext(client, runtimeRoleName, probe.tenant_id);

      for (const benchmark of measurementsByQuery.keys()) {
        const startedAt = performance.now();
        await client.query(BENCHMARK_SQL[benchmark], benchmarkValues(benchmark, probe));
        const latencyMs = performance.now() - startedAt;

        measurementsByQuery.get(benchmark)?.push({
          tenant_id: probe.tenant_id,
          tenant_ord: probe.tenant_ord,
          latency_ms: latencyMs,
        });
      }
    }
  }

  return Array.from(measurementsByQuery.entries()).map(([query, measurements]) =>
    summarizeBenchmark(query, measurements, config.benchmark_iterations),
  );
};

const summarizeBenchmark = (
  query: BenchmarkQueryName,
  measurements: BenchmarkMeasurement[],
  iterations: number,
): BenchmarkSummary => {
  const grouped = new Map<string, { tenant_ord: number; latencies: number[] }>();

  for (const measurement of measurements) {
    const existing = grouped.get(measurement.tenant_id);

    if (existing) {
      existing.latencies.push(measurement.latency_ms);
      continue;
    }

    grouped.set(measurement.tenant_id, {
      tenant_ord: measurement.tenant_ord,
      latencies: [measurement.latency_ms],
    });
  }

  const tenantMeasurements = Array.from(grouped.entries())
    .map(([tenantId, group]) => ({
      tenant_id: tenantId,
      tenant_ord: group.tenant_ord,
      avg_latency_ms: average(group.latencies),
    }))
    .sort((left, right) => left.tenant_ord - right.tenant_ord);
  const avgLatencies = tenantMeasurements.map((measurement) => measurement.avg_latency_ms);
  const bucketSize = Math.max(1, Math.floor(tenantMeasurements.length / 3));
  const firstBucket = tenantMeasurements.slice(0, bucketSize);
  const lastBucket = tenantMeasurements.slice(-bucketSize);
  const firstBucketAvgMs = average(firstBucket.map((measurement) => measurement.avg_latency_ms));
  const lastBucketAvgMs = average(lastBucket.map((measurement) => measurement.avg_latency_ms));

  return {
    query,
    sampled_tenants: tenantMeasurements.length,
    iterations,
    first_bucket_avg_ms: round(firstBucketAvgMs),
    last_bucket_avg_ms: round(lastBucketAvgMs),
    min_avg_ms: round(percentile(avgLatencies, 0)),
    median_avg_ms: round(percentile(avgLatencies, 50)),
    p95_avg_ms: round(percentile(avgLatencies, 95)),
    max_avg_ms: round(percentile(avgLatencies, 100)),
    growth_ratio: round(firstBucketAvgMs <= 0 ? 1 : lastBucketAvgMs / firstBucketAvgMs),
    growth_delta_ms: round(lastBucketAvgMs - firstBucketAvgMs),
    tenant_measurements: tenantMeasurements.map((measurement) => ({
      tenant_id: measurement.tenant_id,
      tenant_ord: measurement.tenant_ord,
      avg_latency_ms: round(measurement.avg_latency_ms),
    })),
  };
};

const evaluateFailures = (
  config: ScaleConfig,
  isolationChecks: IsolationCheckResult[],
  explainChecks: ExplainCheckResult[],
  benchmarks: BenchmarkSummary[],
): ScaleFailure[] => {
  const failures: ScaleFailure[] = [];

  for (const isolationCheck of isolationChecks) {
    if (!isolationCheck.passed) {
      failures.push({
        check: `cross_tenant_leakage:${isolationCheck.table}`,
        message: `${isolationCheck.table} leaked rows from tenant "${isolationCheck.target_tenant_id}" into tenant "${isolationCheck.source_tenant_id}"`,
        observed: isolationCheck.leaked_row_count,
        threshold: 0,
      });
    }
  }

  for (const explainCheck of explainChecks) {
    if (!explainCheck.used_expected_index) {
      failures.push({
        check: `expected_index_missing:${explainCheck.benchmark}`,
        message: `Benchmark "${explainCheck.benchmark}" did not use any of the expected indexes`,
        observed: 0,
        threshold: 1,
      });
    }

    if (explainCheck.relation_has_seq_scan) {
      failures.push({
        check: `seq_scan_target:${explainCheck.benchmark}`,
        message: `Benchmark "${explainCheck.benchmark}" fell back to a sequential scan on its target relation`,
        observed: 1,
        threshold: 0,
      });
    }
  }

  for (const benchmark of benchmarks) {
    if (
      benchmark.growth_ratio > config.fail_query_growth_ratio &&
      benchmark.growth_delta_ms > config.fail_query_growth_delta_ms
    ) {
      failures.push({
        check: `tenant_growth:${benchmark.query}`,
        message: `Benchmark "${benchmark.query}" slowed down across tenants`,
        observed: benchmark.growth_ratio,
        threshold: config.fail_query_growth_ratio,
      });
    }
  }

  return failures;
};

const benchmarkValues = (
  benchmark: BenchmarkQueryName,
  probe: TenantProbe,
): unknown[] => {
  switch (benchmark) {
    case 'students_active_page':
      return [probe.tenant_id];
    case 'attendance_student_history':
      return [probe.tenant_id, probe.sample_student_id, '2020-01-01', '2030-12-31'];
    case 'payments_recent_page':
      return [probe.tenant_id];
  }
};

const applyTenantQueryContext = async (
  client: PoolClient,
  runtimeRoleName: string | null,
  tenantId: string,
): Promise<void> => {
  if (runtimeRoleName) {
    await client.query(format('SET LOCAL ROLE %I', runtimeRoleName));
  }

  await client.query(format('SET LOCAL app.tenant_id = %L', tenantId));
  await client.query(format('SET LOCAL app.user_id = %L', ''));
  await client.query(format('SET LOCAL app.request_id = %L', `tenant-scale:${tenantId}`));
  await client.query(format('SET LOCAL app.role = %L', 'owner'));
  await client.query(format('SET LOCAL app.session_id = %L', ''));
};

const getRuntimeRoleName = (harness: RaceTestHarness): string | null => {
  const databaseSecurityService = harness.testingModule.get(DatabaseSecurityService);
  return databaseSecurityService.getRuntimeRoleName();
};

const buildTenantIds = (tenantCount: number): string[] =>
  Array.from({ length: tenantCount }, (_, index) => {
    const ordinal = index + 1;
    return `scale-${ordinal.toString().padStart(4, '0')}-${randomUUID().slice(0, 8)}`;
  });

const isBenchmarkTargetRelation = (
  benchmark: BenchmarkQueryName,
  relationName: string | null,
): boolean => {
  switch (benchmark) {
    case 'students_active_page':
      return relationName === 'students';
    case 'attendance_student_history':
      return relationName === 'attendance_records';
    case 'payments_recent_page':
      return relationName === 'payment_intents';
  }
};

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Actual Total Time'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: PlanNode[];
}

const flattenPlan = (
  plan: PlanNode,
): Array<{
  node_type: string;
  relation_name: string | null;
  index_name: string | null;
}> => {
  const nodes = [
    {
      node_type: plan['Node Type'],
      relation_name: plan['Relation Name'] ?? null,
      index_name: plan['Index Name'] ?? null,
    },
  ];

  for (const child of plan.Plans ?? []) {
    nodes.push(...flattenPlan(child));
  }

  return nodes;
};

const queryRows = async <TRow extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<TRow[]> => {
  const result = await client.query<TRow>(text, values);
  return result.rows;
};

const queryRow = async <TRow extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<TRow> => {
  const rows = await queryRows<TRow>(client, text, values);

  if (!rows[0]) {
    throw new Error('Expected a row but query returned none');
  }

  return rows[0];
};

const queryScalar = async <TValue>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<TValue> => {
  const row = await queryRow<{ value: TValue }>(client, text, values);
  return row.value;
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const percentile = (values: number[], percentileValue: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = values.slice().sort((left, right) => left - right);

  if (percentileValue <= 0) {
    return sortedValues[0];
  }

  if (percentileValue >= 100) {
    return sortedValues[sortedValues.length - 1];
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
};

const round = (value: number): number => Number(value.toFixed(2));

const parseInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received "${value}"`);
  }

  return parsed;
};

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received "${value}"`);
  }

  return parsed;
};

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
