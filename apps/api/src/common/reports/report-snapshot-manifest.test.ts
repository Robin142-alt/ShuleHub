import assert from 'node:assert/strict';
import test from 'node:test';

import { createCsvReportArtifact } from './report-csv-artifact';
import {
  createReportSnapshotManifest,
  validateReportSnapshotManifestInput,
} from './report-snapshot-manifest';

test('createReportSnapshotManifest builds a checksummed immutable report snapshot manifest', () => {
  const artifact = createCsvReportArtifact({
    reportId: 'stock-valuation',
    title: 'Stock valuation',
    filename: 'inventory-stock-valuation.csv',
    headers: ['Item', 'Value'],
    rows: [['Exercise books', 2400]],
    generatedAt: new Date('2026-05-14T09:15:00.000Z'),
  });

  const manifest = createReportSnapshotManifest({
    tenantId: 'tenant-a',
    module: 'inventory',
    reportId: artifact.report_id,
    title: artifact.title,
    format: 'csv',
    artifact: {
      filename: artifact.filename,
      contentType: artifact.content_type,
      rowCount: artifact.row_count,
      checksumSha256: artifact.checksum_sha256,
      generatedAt: artifact.generated_at,
    },
    filters: { location: 'main-store' },
    generatedByUserId: 'user-a',
  });

  assert.equal(manifest.tenant_id, 'tenant-a');
  assert.equal(manifest.module, 'inventory');
  assert.equal(manifest.report_id, 'stock-valuation');
  assert.equal(manifest.snapshot_id, `report-snapshot:tenant-a:inventory:stock-valuation:csv:${artifact.checksum_sha256.slice(0, 16)}`);
  assert.equal(manifest.artifact.checksum_sha256, artifact.checksum_sha256);
  assert.equal(manifest.artifact.row_count, 1);
  assert.equal(manifest.generated_by_user_id, 'user-a');
  assert.deepEqual(manifest.filters, { location: 'main-store' });
  assert.match(manifest.manifest_checksum_sha256, /^[a-f0-9]{64}$/);
});

test('validateReportSnapshotManifestInput rejects retired attendance snapshots', () => {
  assert.deepEqual(
    validateReportSnapshotManifestInput({
      tenantId: 'tenant-a',
      module: 'attendance',
      reportId: 'daily-attendance',
      title: 'Daily attendance',
      format: 'csv',
      artifact: {
        filename: 'attendance.csv',
        contentType: 'text/csv',
        rowCount: 1,
        checksumSha256: 'a'.repeat(64),
        generatedAt: '2026-05-14T09:15:00.000Z',
      },
    }),
    [
      'Attendance report snapshots are retired. Use exams or active academic modules instead.',
    ],
  );
});
