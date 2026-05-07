import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';

import { AUTH_ANONYMOUS_USER_ID } from '../src/auth/auth.constants';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseService } from '../src/database/database.service';
import { TransactionService } from '../src/modules/finance/transaction.service';
import { GradesAuditService } from '../src/modules/observability/grades-audit.service';
import { SloMetricsService } from '../src/modules/observability/slo-metrics.service';
import { SloMonitoringService } from '../src/modules/observability/slo-monitoring.service';
import { DEFAULT_QUEUE_NAME } from '../src/queue/queue.constants';
import { CapturingStructuredLoggerService } from './support/capturing-structured-logger.service';
import {
  ObservabilityQueueProbeService,
  ObservabilityRedisProbeService,
  ObservabilityTestModule,
} from './support/observability-test.module';

jest.setTimeout(180000);

type AuditLogRow = {
  tenant_id: string;
  request_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
};

describe('Observability traceability', () => {
  let app: INestApplication;
  let testingModule: TestingModule;
  let pool: Pool;
  let requestContext: RequestContextService;
  let databaseService: DatabaseService;
  let transactionService: TransactionService;
  let gradesAuditService: GradesAuditService;
  let sloMetricsService: SloMetricsService;
  let sloMonitoringService: SloMonitoringService;
  let queueProbeService: ObservabilityQueueProbeService;
  let redisProbeService: ObservabilityRedisProbeService;
  let logger: CapturingStructuredLoggerService;

  const tenantIds = new Set<string>();

  beforeAll(async () => {
    ensureIntegrationEnv();
    pool = createDatabasePool();

    testingModule = await Test.createTestingModule({
      imports: [ObservabilityTestModule],
    }).compile();

    app = testingModule.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    requestContext = testingModule.get(RequestContextService);
    databaseService = testingModule.get(DatabaseService);
    transactionService = testingModule.get(TransactionService);
    gradesAuditService = testingModule.get(GradesAuditService);
    sloMetricsService = testingModule.get(SloMetricsService);
    sloMonitoringService = testingModule.get(SloMonitoringService);
    queueProbeService = testingModule.get(ObservabilityQueueProbeService);
    redisProbeService = testingModule.get(ObservabilityRedisProbeService);
    logger = testingModule.get(CapturingStructuredLoggerService);
  });

  beforeEach(async () => {
    sloMetricsService.reset();
    queueProbeService.reset();
    redisProbeService.reset();
    await sloMonitoringService.refreshSnapshot();
    logger.reset();
  });

  afterAll(async () => {
    await cleanupSeedData(pool, [...tenantIds]);
    await app?.close();
    await pool?.end();
  });

  test('request logs include tenant_id and request_id for received and completed events', async () => {
    const tenantId = `obslog-${seedSuffix()}`;
    const requestId = `req-${seedSuffix()}`;
    const traceId = `trace-${seedSuffix()}`;
    tenantIds.add(tenantId);
    logger.reset();

    const response = await request(app.getHttpServer())
      .get('/trace-probe')
      .set('host', `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`)
      .set('x-request-id', requestId)
      .set('x-trace-id', traceId)
      .expect(200);

    assert.equal(response.headers['x-request-id'], requestId);
    assert.equal(response.headers['x-trace-id'], traceId);

    const records = logger.snapshot();
    const received = findLogRecord(records, 'request.received');
    const completed = findLogRecord(records, 'request.completed');

    assert.ok(received, 'expected request.received log record');
    assert.ok(completed, 'expected request.completed log record');
    assert.equal(received.tenant_id, tenantId);
    assert.equal(received.request_id, requestId);
    assert.equal(received.trace_id, traceId);
    assert.equal(received.user_id, AUTH_ANONYMOUS_USER_ID);
    assert.equal(typeof received.span_id, 'string');
    assert.equal(completed.tenant_id, tenantId);
    assert.equal(completed.request_id, requestId);
    assert.equal(completed.trace_id, traceId);
    assert.equal(completed.status_code, 200);
  });

  test('trace context survives API to queue to DB hops without blind spots', async () => {
    const tenantId = `obstrace-${seedSuffix()}`;
    const requestId = `trace-${seedSuffix()}`;
    const traceId = `trace-${seedSuffix()}`;
    tenantIds.add(tenantId);

    const response = await request(app.getHttpServer())
      .get('/trace-probe/queue')
      .set('host', `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`)
      .set('x-request-id', requestId)
      .set('x-trace-id', traceId)
      .expect(200);

    assert.equal(response.body.data.trace_id, traceId);
    assert.equal(response.body.data.request_id, requestId);

    const records = logger.snapshot();
    const requestReceived = findLogRecord(records, 'request.received');
    const queueEnqueued = findLogRecord(records, 'queue.job.enqueued');
    const queueStarted = findLogRecord(records, 'queue.job.started');
    const dbQuery = findLogRecord(records, 'db.query.completed');
    const queueCompleted = findLogRecord(records, 'queue.job.completed');
    const requestCompleted = findLogRecord(records, 'request.completed');

    for (const record of [
      requestReceived,
      queueEnqueued,
      queueStarted,
      dbQuery,
      queueCompleted,
      requestCompleted,
    ]) {
      assert.equal(record.trace_id, traceId);
      assert.equal(record.request_id, requestId);
      assert.equal(record.tenant_id, tenantId);
    }

    assert.equal(queueStarted.parent_span_id, requestReceived.span_id);
    assert.equal(dbQuery.trace_id, traceId);
    assert.equal(dbQuery.path, '/internal/trace-probe/queue');
    assert.equal(typeof dbQuery.db_query_fingerprint, 'string');
    assert.equal(dbQuery.db_statement_type, 'SELECT');
  });

  test('observability endpoints expose subsystem dashboards, metrics, and health', async () => {
    const tenantId = `obsdash-${seedSuffix()}`;
    tenantIds.add(tenantId);

    sloMetricsService.recordMpesaStkPush({
      outcome: 'success',
      duration_ms: 225,
      tenant_id: tenantId,
      payment_intent_id: randomUUID(),
    });
    sloMetricsService.recordSyncOperation({
      operation: 'sync_pull',
      outcome: 'success',
      duration_ms: 140,
      tenant_id: tenantId,
      device_id: 'device-1',
    });
    queueProbeService.setCounts(DEFAULT_QUEUE_NAME, {
      waiting: 4,
      active: 1,
      delayed: 2,
      completed: 12,
      failed: 0,
    });

    const dashboardResponse = await request(app.getHttpServer())
      .get('/observability/dashboard')
      .set('host', `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`)
      .expect(200);
    const dashboard = dashboardResponse.body.data;

    assert.equal(dashboard.overall_status, 'healthy');
    assert.equal(dashboard.infrastructure.postgres, 'up');
    assert.equal(dashboard.infrastructure.redis, 'up');
    assert.equal(dashboard.subsystem_cards.length, 4);
    assert.deepEqual(
      dashboard.subsystem_cards.map((card: { subsystem: string }) => card.subsystem).sort(),
      ['api', 'mpesa', 'queue', 'sync'],
    );

    const metricsResponse = await request(app.getHttpServer())
      .get('/observability/metrics')
      .set('host', `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`)
      .expect(200);
    const metrics = metricsResponse.body.data;

    assert.ok(metrics.event_counts.mpesa >= 1);
    assert.ok(metrics.event_counts.sync >= 1);
    assert.ok(typeof metrics.event_counts.database === 'number');
    assert.equal(metrics.subsystem_metrics.queue.total_backlog, 7);
    assert.ok(Object.prototype.hasOwnProperty.call(metrics.subsystem_metrics, 'database'));

    const healthResponse = await request(app.getHttpServer())
      .get('/health')
      .set('host', `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`)
      .expect(200);
    const health = healthResponse.body.data;

    assert.equal(health.status, 'ok');
    assert.equal(health.slo.overall_status, 'healthy');
    assert.equal(health.request_context.tenant_id, tenantId);
  });

  test('SLO violations raise alerts and surface degraded realtime health', async () => {
    const tenantId = `obsalert-${seedSuffix()}`;
    const tenantHost = `${tenantId}.${process.env.APP_BASE_DOMAIN ?? 'integration.test'}`;
    tenantIds.add(tenantId);

    sloMetricsService.recordMpesaStkPush({
      outcome: 'failure',
      duration_ms: 820,
      tenant_id: tenantId,
      payment_intent_id: randomUUID(),
      error_message: 'Safaricom gateway timeout',
    });
    queueProbeService.setCounts(DEFAULT_QUEUE_NAME, {
      waiting: 300,
      active: 0,
      delayed: 25,
      completed: 0,
      failed: 2,
    });

    const alertsResponse = await request(app.getHttpServer())
      .get('/observability/alerts')
      .set('host', tenantHost)
      .expect(200);
    const alerts = alertsResponse.body.data;

    const alertIds = alerts.alerts.map((alert: { objective_id: string }) => alert.objective_id);
    assert.ok(alertIds.includes('mpesa.stk_success_rate'));
    assert.ok(alertIds.includes('queue.backlog'));

    const healthResponse = await request(app.getHttpServer())
      .get('/observability/health')
      .set('host', tenantHost)
      .expect(200);
    const health = healthResponse.body.data;

    assert.notEqual(health.overall_status, 'healthy');
    assert.ok(health.active_alert_count >= 2);
  });

  test('finance postings create audit logs with tenant_id and request_id', async () => {
    const tenantId = `obsfin-${seedSuffix()}`;
    const requestId = `finance-${seedSuffix()}`;
    tenantIds.add(tenantId);
    const accountIds = await createLedgerFixture(tenantId, requestId);

    const posted = await runInTenantContext(tenantId, requestId, () =>
      transactionService.postTransaction({
        idempotency_key: `obs-fin:${tenantId}:${seedSuffix()}`,
        reference: `OBS-FIN-${seedSuffix()}`,
        description: 'Observability finance audit check',
        entries: [
          {
            account_id: accountIds.debit_account_id,
            direction: 'debit',
            amount_minor: '12500',
          },
          {
            account_id: accountIds.credit_account_id,
            direction: 'credit',
            amount_minor: '12500',
          },
        ],
      }),
    );

    const auditLog = await getAuditLog(pool, tenantId, 'finance.transaction.posted', posted.transaction_id);

    assert.ok(auditLog, 'expected finance audit log row');
    assert.equal(auditLog.tenant_id, tenantId);
    assert.equal(auditLog.request_id, requestId);
    assert.equal(auditLog.resource_type, 'finance_transaction');
    assert.equal(auditLog.resource_id, posted.transaction_id);
    assert.equal(auditLog.metadata.reference, posted.reference);
  });

  test('grade changes create audit logs with tenant_id and request_id', async () => {
    const tenantId = `obsgrade-${seedSuffix()}`;
    const requestId = `grade-${seedSuffix()}`;
    const gradeId = randomUUID();
    const studentId = randomUUID();
    const assessmentId = randomUUID();
    tenantIds.add(tenantId);

    await runInTenantContext(tenantId, requestId, () =>
      gradesAuditService.recordGradeAction({
        action: 'grade.updated',
        grade_id: gradeId,
        student_id: studentId,
        assessment_id: assessmentId,
        metadata: {
          score: 91,
          source: 'observability.integration-spec',
        },
      }),
    );

    const auditLog = await getAuditLog(pool, tenantId, 'grade.updated', gradeId);

    assert.ok(auditLog, 'expected grade audit log row');
    assert.equal(auditLog.tenant_id, tenantId);
    assert.equal(auditLog.request_id, requestId);
    assert.equal(auditLog.resource_type, 'grade');
    assert.equal(auditLog.resource_id, gradeId);
    assert.equal(auditLog.metadata.student_id, studentId);
    assert.equal(auditLog.metadata.assessment_id, assessmentId);
    assert.equal(auditLog.metadata.score, 91);
  });

  const runInTenantContext = async <T>(
    tenantId: string,
    requestId: string,
    callback: () => Promise<T>,
  ): Promise<T> =>
    requestContext.run(
      {
        request_id: requestId,
        tenant_id: tenantId,
        user_id: AUTH_ANONYMOUS_USER_ID,
        role: 'owner',
        session_id: null,
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: '127.0.0.1',
        user_agent: 'observability-integration-tests',
        method: 'TEST',
        path: '/integration/observability',
        started_at: new Date().toISOString(),
      },
      callback,
    );

  const createLedgerFixture = async (
    tenantId: string,
    requestId: string,
  ): Promise<{
    debit_account_id: string;
    credit_account_id: string;
  }> => {
    const debitAccountId = randomUUID();
    const creditAccountId = randomUUID();

    await runInTenantContext(tenantId, requestId, async () => {
      await databaseService.withRequestTransaction(async () => {
        await databaseService.query(
          `
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
            VALUES
              ($1::uuid, $2, $3, 'Observability Cash', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
              ($4::uuid, $2, $5, 'Observability Revenue', 'revenue', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
          `,
          [
            debitAccountId,
            tenantId,
            `OBS-1000-${seedSuffix()}`,
            creditAccountId,
            `OBS-4000-${seedSuffix()}`,
          ],
        );
      });
    });

    return {
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId,
    };
  };
});

const ensureIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? 'integration.test';
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'shule-hub-integration-tests';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'shule-hub-integration-clients';
  process.env.JWT_ACCESS_TOKEN_SECRET =
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'integration-access-secret';
  process.env.JWT_REFRESH_TOKEN_SECRET =
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';
  process.env.DATABASE_RUNTIME_ROLE =
    process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for observability integration tests');
  }
};

const createDatabasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL ?? '';

  return new Pool({
    connectionString,
    application_name: 'shule-hub-observability-tests',
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
};

const findLogRecord = (
  records: Record<string, unknown>[],
  message: string,
): Record<string, unknown> => {
  const record = records.find((candidate) => candidate.message === message);

  if (!record) {
    throw new Error(`Expected log record for message "${message}"`);
  }

  return record;
};

const getAuditLog = async (
  pool: Pool,
  tenantId: string,
  action: string,
  resourceId: string,
): Promise<AuditLogRow | null> => {
  const client = await pool.connect();

  try {
    const result = await client.query<AuditLogRow>(
      `
        SELECT
          tenant_id,
          request_id,
          action,
          resource_type,
          resource_id,
          actor_user_id,
          metadata
        FROM audit_logs
        WHERE tenant_id = $1
          AND action = $2
          AND resource_id = $3::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, action, resourceId],
    );

    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
};

const cleanupSeedData = async (pool: Pool, tenantIds: string[]): Promise<void> => {
  if (tenantIds.length === 0) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER USER');
    await client.query('ALTER TABLE transactions DISABLE TRIGGER USER');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM ledger_entries WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM transactions WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM idempotency_keys WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query(`DELETE FROM accounts WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
    await client.query('ALTER TABLE transactions ENABLE TRIGGER USER');
    await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER USER');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const seedSuffix = (): string => randomUUID().replace(/-/g, '').slice(0, 8);
