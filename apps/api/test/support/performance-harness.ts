import { randomUUID } from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';
import format from 'pg-format';
import { PoolClient, QueryResultRow } from 'pg';

import { AUTH_ANONYMOUS_USER_ID } from '../../src/auth/auth.constants';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { RequestContextState } from '../../src/common/request-context/request-context.types';
import { DatabaseSecurityService } from '../../src/database/database-security.service';
import { DatabaseService } from '../../src/database/database.service';
import {
  BillingAccessCacheMetricsSnapshot,
  BillingAccessService,
} from '../../src/modules/billing/billing-access.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { OutboxDispatcherService } from '../../src/modules/events/outbox-dispatcher.service';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
import { SloMetricsService } from '../../src/modules/observability/slo-metrics.service';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import {
  CostPerformanceRedisServiceStub,
  CostPerformanceTestModule,
} from './cost-performance-test.module';
import { CapturingQueueService } from './capturing-queue.service';

export interface PerformanceTestHarness {
  testingModule: TestingModule;
  requestContext: RequestContextService;
  databaseService: DatabaseService;
  databaseSecurityService: DatabaseSecurityService;
  billingAccessService: BillingAccessService;
  billingService: BillingService;
  subscriptionsRepository: SubscriptionsRepository;
  studentsRepository: StudentsRepository;
  paymentIntentsRepository: PaymentIntentsRepository;
  eventPublisherService: EventPublisherService;
  outboxDispatcherService: OutboxDispatcherService;
  capturingQueueService: CapturingQueueService;
  redisServiceStub: CostPerformanceRedisServiceStub;
  sloMetricsService: SloMetricsService;
}

export interface ExplainNodeSummary {
  node_type: string;
  relation_name: string | null;
  index_name: string | null;
}

export interface ExplainCheckResult {
  benchmark: string;
  tenant_id: string;
  expected_index_names: string[];
  used_expected_index: boolean;
  relation_has_seq_scan: boolean;
  execution_time_ms: number | null;
  scan_nodes: ExplainNodeSummary[];
}

export interface QueueDispatchThroughputResult {
  enqueued_count: number;
  total_enqueued_count: number;
  dispatch_duration_ms: number;
  throughput_jobs_per_second: number;
  database_query_count: number;
}

export const ensurePerformanceIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.DATABASE_STATEMENT_TIMEOUT_MS =
    process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '20000';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.BILLING_ACCESS_CACHE_TTL_SECONDS =
    process.env.BILLING_ACCESS_CACHE_TTL_SECONDS ?? '120';
  process.env.EVENTS_DISPATCHER_BATCH_SIZE =
    process.env.EVENTS_DISPATCHER_BATCH_SIZE ?? '1000';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for cost/performance integration tests');
  }
};

export const createPerformanceTestHarness = async (): Promise<PerformanceTestHarness> => {
  ensurePerformanceIntegrationEnv();

  const testingModule = await Test.createTestingModule({
    imports: [CostPerformanceTestModule],
  }).compile();

  await initializeIntegrationModule(testingModule);

  return {
    testingModule,
    requestContext: testingModule.get(RequestContextService),
    databaseService: testingModule.get(DatabaseService),
    databaseSecurityService: testingModule.get(DatabaseSecurityService),
    billingAccessService: testingModule.get(BillingAccessService),
    billingService: testingModule.get(BillingService),
    subscriptionsRepository: testingModule.get(SubscriptionsRepository),
    studentsRepository: testingModule.get(StudentsRepository),
    paymentIntentsRepository: testingModule.get(PaymentIntentsRepository),
    eventPublisherService: testingModule.get(EventPublisherService),
    outboxDispatcherService: testingModule.get(OutboxDispatcherService),
    capturingQueueService: testingModule.get(CapturingQueueService),
    redisServiceStub: testingModule.get(CostPerformanceRedisServiceStub),
    sloMetricsService: testingModule.get(SloMetricsService),
  };
};

export const closePerformanceTestHarness = async (
  harness: PerformanceTestHarness,
): Promise<void> => {
  if (!harness?.testingModule) {
    return;
  }

  await harness.testingModule.close();
};

export const runInTenantContext = async <T>(
  harness: PerformanceTestHarness,
  tenantId: string,
  callback: () => Promise<T>,
  overrides: Partial<RequestContextState> = {},
): Promise<T> =>
  harness.requestContext.run(
    {
      request_id: overrides.request_id ?? `performance:${randomUUID()}`,
      tenant_id: tenantId,
      user_id: overrides.user_id ?? AUTH_ANONYMOUS_USER_ID,
      role: overrides.role ?? 'owner',
      session_id: overrides.session_id ?? null,
      permissions: overrides.permissions ?? ['*:*'],
      is_authenticated: overrides.is_authenticated ?? true,
      client_ip: overrides.client_ip ?? '127.0.0.1',
      user_agent: overrides.user_agent ?? 'cost-performance-tests',
      method: overrides.method ?? 'TEST',
      path: overrides.path ?? '/integration/cost-performance',
      started_at: overrides.started_at ?? new Date().toISOString(),
      billing: overrides.billing,
      db_client: overrides.db_client,
    },
    callback,
  );

export const registerTenantId = (prefix: string): string =>
  `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

export const seedSubscription = async (
  harness: PerformanceTestHarness,
  tenantId: string,
  planCode: 'trial' | 'starter' | 'growth' | 'enterprise' = 'starter',
): Promise<void> => {
  await runInTenantContext(harness, tenantId, async () => {
    await harness.billingService.createSubscription({
      plan_code: planCode,
      billing_phone_number: '254700000200',
      seats_allocated: 10,
      metadata: {
        seeded_by: 'performance-harness',
      },
    });
  });
};

export const seedSubscriptionsBulk = async (
  harness: PerformanceTestHarness,
  tenantIds: string[],
): Promise<void> => {
  if (tenantIds.length === 0) {
    return;
  }

  const client = await harness.databaseService.acquireClient();

  try {
    await client.query(
      `
        INSERT INTO subscriptions (
          tenant_id,
          plan_code,
          status,
          billing_phone_number,
          currency_code,
          features,
          limits,
          seats_allocated,
          current_period_start,
          current_period_end,
          trial_ends_at,
          activated_at,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          tenant_id,
          'starter',
          'active',
          NULL,
          'KES',
          '["students","attendance","billing.mpesa"]'::jsonb,
          '{"students.max_active":1000,"usage.events.monthly":50000,"attendance.upserts.monthly":250000}'::jsonb,
          10,
          NOW(),
          NOW() + INTERVAL '30 days',
          NULL,
          NOW(),
          jsonb_build_object('seed', 'cost-performance-bulk'),
          NOW(),
          NOW()
        FROM unnest($1::text[]) WITH ORDINALITY AS seeded(tenant_id, ordinality)
      `,
      [tenantIds],
    );
  } finally {
    client.release();
  }
};

export const seedStudentRows = async (
  harness: PerformanceTestHarness,
  tenantId: string,
  count: number,
): Promise<void> => {
  await runInTenantContext(harness, tenantId, () =>
    harness.databaseService.query(
      `
        INSERT INTO students (
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
          $1,
          format('ADM-%s-%s', right(md5($1), 6), gs::text),
          'Perf',
          'Student',
          NULL,
          CASE WHEN gs % 7 = 0 THEN 'inactive' ELSE 'active' END,
          NULL,
          NULL,
          NULL,
          NULL,
          jsonb_build_object('seed', 'cost-performance', 'ordinal', gs),
          NULL,
          NOW() - make_interval(mins => gs),
          NOW() - make_interval(mins => gs)
        FROM generate_series(1, $2::integer) AS gs
      `,
      [tenantId, count],
    ),
  );
};

export const seedPaymentIntentRows = async (
  harness: PerformanceTestHarness,
  tenantId: string,
  count: number,
): Promise<void> => {
  await runInTenantContext(harness, tenantId, () =>
    harness.databaseService.query(
      `
        WITH generated AS (
          SELECT
            gen_random_uuid() AS idempotency_key_id,
            gen_random_uuid() AS payment_intent_id,
            gs,
            NOW() - make_interval(hours => gs) AS created_at
          FROM generate_series(1, $2::integer) AS gs
        ),
        inserted_idempotency_keys AS (
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
            generated.idempotency_key_id,
            $1,
            NULL,
            'payments-mpesa',
            format('perf:payment:%s:%s', right(md5($1), 6), generated.gs::text),
            'POST',
            '/payments/mpesa',
            md5(format('perf:payment:%s:%s', right(md5($1), 6), generated.gs::text)),
            'completed',
            201,
            '{}'::jsonb,
            NULL,
            generated.created_at,
            generated.created_at,
            generated.created_at + INTERVAL '7 days',
            generated.created_at,
            generated.created_at
          FROM generated
        )
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
          generated.payment_intent_id,
          $1,
          generated.idempotency_key_id,
          NULL,
          format('perf:payment-intent:%s:%s', right(md5($1), 6), generated.gs::text),
          format('EXT-%s-%s', right(md5($1), 6), generated.gs::text),
          format('ACC-%s-%s', right(md5($1), 6), generated.gs::text),
          format('Performance payment %s', generated.gs::text),
          '2547' || lpad(generated.gs::text, 8, '0'),
          2500 + generated.gs,
          'KES',
          'completed',
          format('merchant-%s-%s', right(md5($1), 6), generated.gs::text),
          format('checkout-%s-%s', right(md5($1), 6), generated.gs::text),
          '0',
          'Accepted',
          'Completed',
          NULL,
          NULL,
          generated.created_at,
          generated.created_at,
          generated.created_at,
          generated.created_at + INTERVAL '1 day',
          jsonb_build_object('seed', 'cost-performance', 'ordinal', generated.gs),
          generated.created_at,
          generated.created_at
        FROM generated
      `,
      [tenantId, count],
    ),
  );
};

export const seedOutboxEvents = async (
  harness: PerformanceTestHarness,
  tenantId: string,
  count: number,
): Promise<void> => {
  await runInTenantContext(harness, tenantId, () =>
    harness.databaseService.query(
      `
        INSERT INTO outbox_events (
          tenant_id,
          event_key,
          event_name,
          aggregate_type,
          aggregate_id,
          payload,
          headers,
          status,
          attempt_count,
          available_at,
          published_at,
          last_error,
          created_at,
          updated_at
        )
        SELECT
          $1,
          format('student.created:%s:%s', right(md5($1), 6), gs::text),
          'student.created',
          'student',
          gen_random_uuid(),
          jsonb_build_object(
            'tenant_id',
            $1,
            'student_id',
            gen_random_uuid()::text,
            'created_at',
            NOW()::text
          ),
          jsonb_build_object(
            'request_id',
            format('outbox:%s:%s', right(md5($1), 6), gs::text),
            'trace_id',
            format('trace:%s:%s', right(md5($1), 6), gs::text),
            'span_id',
            format('span:%s:%s', right(md5($1), 6), gs::text),
            'user_id',
            'anonymous',
            'role',
            'system',
            'session_id',
            NULL
          ),
          'pending',
          0,
          TIMESTAMPTZ '2000-01-01T00:00:00Z' + make_interval(secs => gs),
          NULL,
          NULL,
          TIMESTAMPTZ '2000-01-01T00:00:00Z' + make_interval(secs => gs),
          TIMESTAMPTZ '2000-01-01T00:00:00Z' + make_interval(secs => gs)
        FROM generate_series(1, $2::integer) AS gs
      `,
      [tenantId, count],
    ),
  );
};

export const getBillingAccessCacheMetrics = (
  harness: PerformanceTestHarness,
): BillingAccessCacheMetricsSnapshot => harness.billingAccessService.getCacheMetricsSnapshot();

export const resetPerformanceState = async (harness: PerformanceTestHarness): Promise<void> => {
  harness.billingAccessService.resetCacheMetrics();
  harness.sloMetricsService.reset();
  harness.capturingQueueService.clear();
  await harness.redisServiceStub.reset();
};

export const explainTenantQuery = async (
  harness: PerformanceTestHarness,
  tenantId: string,
  benchmark: string,
  sql: string,
  values: unknown[],
  expectedIndexNames: string[],
): Promise<ExplainCheckResult> => {
  const client = await harness.databaseService.acquireClient();
  const runtimeRoleName = harness.databaseSecurityService.getRuntimeRoleName();

  try {
    await client.query('BEGIN');
    await applyTenantQueryContext(client, runtimeRoleName, tenantId);
    const result = await client.query<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
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
      (node) => node.node_type === 'Seq Scan' && isTargetRelation(benchmark, node.relation_name),
    );

    return {
      benchmark,
      tenant_id: tenantId,
      expected_index_names: expectedIndexNames,
      used_expected_index: usedExpectedIndex,
      relation_has_seq_scan: relationHasSeqScan,
      execution_time_ms:
        typeof planWrapper.Plan['Actual Total Time'] === 'number'
          ? Number(planWrapper.Plan['Actual Total Time'].toFixed(2))
          : null,
      scan_nodes: scanNodes,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
};

export const analyzePerformanceTables = async (
  harness: PerformanceTestHarness,
): Promise<void> => {
  const client = await harness.databaseService.acquireClient();

  try {
    await client.query(`
      ANALYZE subscriptions;
      ANALYZE students;
      ANALYZE payment_intents;
      ANALYZE outbox_events;
    `);
  } finally {
    client.release();
  }
};

export const measureOutboxDispatchThroughput = async (
  harness: PerformanceTestHarness,
  trackedTenantIds: string[] = [],
): Promise<QueueDispatchThroughputResult> => {
  harness.sloMetricsService.reset();
  harness.capturingQueueService.clear();
  const startedAt = Date.now();
  const totalEnqueuedCount = await harness.outboxDispatcherService.dispatchPendingEvents();
  const dispatchDurationMs = Date.now() - startedAt;
  const databaseQueryCount = harness.sloMetricsService
    .getEvents({ subsystem: 'database' })
    .filter((event) => event.operation === 'db_query').length;
  const trackedTenantSet = new Set(trackedTenantIds);
  const matchedJobs =
    trackedTenantSet.size === 0
      ? harness.capturingQueueService.getJobs()
      : harness.capturingQueueService
          .getJobs()
          .filter((job) =>
            trackedTenantSet.has(String((job.payload as { tenant_id?: string }).tenant_id)),
          );
  const enqueuedCount = matchedJobs.length;

  return {
    enqueued_count: enqueuedCount,
    total_enqueued_count: totalEnqueuedCount,
    dispatch_duration_ms: dispatchDurationMs,
    throughput_jobs_per_second:
      dispatchDurationMs <= 0 ? enqueuedCount : Number(((enqueuedCount * 1000) / dispatchDurationMs).toFixed(2)),
    database_query_count: databaseQueryCount,
  };
};

export const queryRows = async <TRow extends QueryResultRow = QueryResultRow>(
  harness: PerformanceTestHarness,
  tenantId: string,
  text: string,
  values: unknown[] = [],
): Promise<TRow[]> =>
  runInTenantContext(harness, tenantId, async () => {
    const result = await harness.databaseService.query<TRow>(text, values);
    return result.rows;
  });

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(BillingSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
  await testingModule.get(StudentsSchemaService).onModuleInit();
  await testingModule.get(EventsSchemaService).onModuleInit();
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
  await client.query(format('SET LOCAL app.request_id = %L', `cost-performance:${tenantId}`));
  await client.query(format('SET LOCAL app.role = %L', 'owner'));
  await client.query(format('SET LOCAL app.session_id = %L', ''));
};

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Actual Total Time'?: number;
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

const isTargetRelation = (benchmark: string, relationName: string | null): boolean => {
  switch (benchmark) {
    case 'students_active_page':
      return relationName === 'students';
    case 'payments_recent_page':
      return relationName === 'payment_intents';
    case 'subscriptions_current_lookup':
      return relationName === 'subscriptions';
    default:
      return false;
  }
};
