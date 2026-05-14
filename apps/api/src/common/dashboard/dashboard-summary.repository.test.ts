import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardSummaryRepository } from './dashboard-summary.repository';
import { DashboardSummarySchemaService } from './dashboard-summary-schema.service';

test('DashboardSummarySchemaService creates tenant-scoped dashboard summary snapshot tables', async () => {
  let schemaSql = '';
  const service = new DashboardSummarySchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS dashboard_summary_snapshots/);
  assert.match(schemaSql, /ALTER TABLE dashboard_summary_snapshots FORCE ROW LEVEL SECURITY/);
  assert.match(schemaSql, /CONSTRAINT ck_dashboard_summary_module_not_attendance/);
  assert.match(schemaSql, /CONSTRAINT ck_dashboard_summary_checksum/);
  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_dashboard_summary_tenant_module_role/);
  assert.match(schemaSql, /CREATE TRIGGER trg_dashboard_summary_snapshots_set_updated_at/);
});

test('DashboardSummaryRepository upserts an active-module summary with checksum metadata', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return {
        rows: [
          {
            id: 'summary-row-1',
            tenant_id: values[0],
            module: values[1],
            summary_id: values[2],
            role: values[3],
            metrics: JSON.parse(values[4] as string),
            source_snapshot_ids: JSON.parse(values[5] as string),
            generated_at: values[6],
            stale_after: values[7],
            checksum_sha256: values[8],
            updated_at: '2026-05-14T10:00:00.000Z',
          },
        ],
      };
    },
  };
  const requestContext = {
    requireStore: () => ({
      tenant_id: 'tenant-a',
    }),
  };
  const repository = new DashboardSummaryRepository(database as never, requestContext as never);

  const summary = await repository.upsertCurrentTenantSummary({
    module: 'inventory',
    summaryId: 'storekeeper-home',
    role: 'storekeeper',
    metrics: {
      low_stock_items: 4,
      pending_requests: 2,
    },
    sourceSnapshotIds: ['report-snapshot:tenant-a:inventory:stock-valuation:csv:aaaaaaaaaaaaaaaa'],
    generatedAt: '2026-05-14T09:55:00.000Z',
    staleAfter: '2026-05-14T10:10:00.000Z',
  });

  assert.equal(summary.tenant_id, 'tenant-a');
  assert.equal(summary.module, 'inventory');
  assert.equal(summary.summary_id, 'storekeeper-home');
  assert.equal(summary.role, 'storekeeper');
  assert.deepEqual(summary.metrics, {
    low_stock_items: 4,
    pending_requests: 2,
  });
  assert.match(summary.checksum_sha256, /^[a-f0-9]{64}$/);
  assert.match(queries[0]?.sql ?? '', /INSERT INTO dashboard_summary_snapshots/);
  assert.match(queries[0]?.sql ?? '', /ON CONFLICT \(tenant_id, module, summary_id, role\) DO UPDATE/);
  assert.equal(queries[0]?.values[0], 'tenant-a');
  assert.equal(queries[0]?.values[1], 'inventory');
  assert.equal(queries[0]?.values[2], 'storekeeper-home');
});

test('DashboardSummaryRepository rejects retired attendance summaries before writing', async () => {
  const repository = new DashboardSummaryRepository({
    query: async () => {
      throw new Error('summary should not be written');
    },
  } as never, {
    requireStore: () => ({ tenant_id: 'tenant-a' }),
  } as never);

  await assert.rejects(
    () =>
      repository.upsertCurrentTenantSummary({
        module: 'attendance',
        summaryId: 'daily-attendance',
        role: 'teacher',
        metrics: { present: 10 },
      }),
    /attendance dashboard summaries are retired/i,
  );
});

test('DashboardSummaryRepository lists current tenant summaries by active module and role', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const repository = new DashboardSummaryRepository({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });

      return {
        rows: [
          {
            id: 'summary-row-2',
            tenant_id: values[0],
            module: values[1],
            summary_id: 'storekeeper-home',
            role: values[2],
            metrics: '{"low_stock_items":1}',
            source_snapshot_ids: '["snapshot-1"]',
            generated_at: '2026-05-14T09:55:00.000Z',
            stale_after: '2026-05-14T10:10:00.000Z',
            checksum_sha256: 'b'.repeat(64),
            updated_at: '2026-05-14T09:56:00.000Z',
          },
        ],
      };
    },
  } as never, {
    requireStore: () => ({ tenant_id: 'tenant-a' }),
  } as never);

  const summaries = await repository.listCurrentTenantSummaries({
    module: 'inventory',
    role: 'storekeeper',
    now: '2026-05-14T10:00:00.000Z',
  });

  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0]?.metrics, { low_stock_items: 1 });
  assert.deepEqual(summaries[0]?.source_snapshot_ids, ['snapshot-1']);
  assert.match(queries[0]?.sql ?? '', /SELECT\s+id::text/);
  assert.match(queries[0]?.sql ?? '', /FROM dashboard_summary_snapshots/);
  assert.match(queries[0]?.sql ?? '', /module = \$2/);
  assert.match(queries[0]?.sql ?? '', /role = \$3/);
  assert.match(queries[0]?.sql ?? '', /stale_after IS NULL OR stale_after > \$4/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    'inventory',
    'storekeeper',
    '2026-05-14T10:00:00.000Z',
  ]);
});

test('DashboardSummaryRepository rejects retired attendance summary reads before querying', async () => {
  const repository = new DashboardSummaryRepository({
    query: async () => {
      throw new Error('summary should not be read');
    },
  } as never, {
    requireStore: () => ({ tenant_id: 'tenant-a' }),
  } as never);

  await assert.rejects(
    () =>
      repository.listCurrentTenantSummaries({
        module: 'attendance',
        role: 'teacher',
      }),
    /attendance dashboard summaries are retired/i,
  );
});
