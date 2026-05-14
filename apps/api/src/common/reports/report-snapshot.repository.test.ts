import assert from 'node:assert/strict';
import test from 'node:test';

import { PATH_METADATA } from '@nestjs/common/constants';

import { PERMISSIONS_KEY } from '../../auth/auth.constants';
import { ReportExportJobsController } from './report-export-jobs.controller';
import { createReportSnapshotManifest } from './report-snapshot-manifest';
import { ReportSnapshotRepository } from './report-snapshot.repository';
import { ReportSnapshotSchemaService } from './report-snapshot-schema.service';

test('ReportSnapshotSchemaService creates tenant-scoped immutable report snapshot tables', async () => {
  let schemaSql = '';
  const service = new ReportSnapshotSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS report_snapshots/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS report_snapshot_audit_logs/);
  assert.match(schemaSql, /ALTER TABLE report_snapshots FORCE ROW LEVEL SECURITY/);
  assert.match(schemaSql, /ALTER TABLE report_snapshot_audit_logs FORCE ROW LEVEL SECURITY/);
  assert.match(schemaSql, /CONSTRAINT ck_report_snapshots_module_not_attendance/);
  assert.match(schemaSql, /CONSTRAINT ck_report_snapshots_checksum/);
  assert.match(schemaSql, /CREATE TRIGGER trg_report_snapshots_prevent_mutation/);
  assert.match(schemaSql, /CREATE TRIGGER trg_report_snapshot_audit_logs_prevent_mutation/);
});

test('ReportSnapshotRepository persists a report snapshot manifest and audit log atomically', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    withRequestTransaction: async <T>(callback: () => Promise<T>) => callback(),
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return {
        rows: [
          {
            id: 'snapshot-row-1',
            snapshot_id: values[1],
            manifest_checksum_sha256: values[10],
            created_at: '2026-05-14T09:30:00.000Z',
          },
        ],
      };
    },
  };
  const requestContext = {
    requireStore: () => ({
      request_id: 'req-1',
      user_id: 'user-1',
    }),
  };
  const repository = new ReportSnapshotRepository(database as never, requestContext as never);
  const manifest = createReportSnapshotManifest({
    tenantId: 'tenant-a',
    module: 'inventory',
    reportId: 'stock-valuation',
    title: 'Stock valuation',
    format: 'csv',
    artifact: {
      filename: 'inventory-stock-valuation.csv',
      contentType: 'text/csv',
      rowCount: 1,
      checksumSha256: 'a'.repeat(64),
      generatedAt: '2026-05-14T09:15:00.000Z',
    },
    generatedByUserId: 'user-1',
  });

  const stored = await repository.saveManifest(manifest);

  assert.equal(stored.snapshot_id, manifest.snapshot_id);
  assert.equal(stored.manifest_checksum_sha256, manifest.manifest_checksum_sha256);
  assert.equal(queries.length, 2);
  assert.match(queries[0]?.sql ?? '', /INSERT INTO report_snapshots/);
  assert.match(queries[1]?.sql ?? '', /INSERT INTO report_snapshot_audit_logs/);
  assert.equal(queries[0]?.values[0], 'tenant-a');
  assert.equal(queries[0]?.values[1], manifest.snapshot_id);
  assert.equal(queries[0]?.values[10], manifest.manifest_checksum_sha256);
  assert.equal(queries[1]?.values[0], 'tenant-a');
  assert.equal(queries[1]?.values[1], manifest.snapshot_id);
  assert.equal(queries[1]?.values[2], 'report.snapshot.created');
  assert.equal(queries[1]?.values[3], 'user-1');
  assert.equal(queries[1]?.values[4], 'req-1');
});

test('ReportExportJobsController exposes report export jobs as a read endpoint', () => {
  const handler = ReportExportJobsController.prototype.listExportJobs as unknown as Function;

  assert.equal(typeof handler, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'export-jobs');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), ['reports:read']);
});

test('ReportSnapshotRepository lists recent completed export jobs for the current tenant', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return {
        rows: [
          {
            job_id: 'snapshot-row-1',
            snapshot_id: 'report-snapshot:tenant-a:exams:term-2:csv:aaaaaaaaaaaaaaaa',
            module: 'exams',
            report_id: 'term-results',
            format: 'csv',
            state: 'completed',
            created_at: '2026-05-14T09:30:00.000Z',
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
  const repository = new ReportSnapshotRepository(database as never, requestContext as never);

  const jobs = await (repository as unknown as {
    listCompletedExportJobs: (input?: { limit?: number }) => Promise<Array<Record<string, unknown>>>;
  }).listCompletedExportJobs({ limit: 50 });

  assert.equal(jobs[0]?.state, 'completed');
  assert.match(queries[0]?.sql ?? '', /FROM report_snapshots/);
  assert.equal(queries[0]?.values[0], 'tenant-a');
  assert.equal(queries[0]?.values[1], 50);
});
