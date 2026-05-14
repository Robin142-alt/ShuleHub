import assert from 'node:assert/strict';
import test from 'node:test';

import { ReportExportWorkerService } from './report-export.worker';

const payload = {
  tenant_id: 'tenant-a',
  requested_by_user_id: 'user-1',
  request_id: 'req-export-1',
  module: 'exams',
  report_id: 'exam-results',
  format: 'pdf' as const,
  filters: { class_section_id: 'class-1' },
  estimated_rows: 2,
  enqueued_at: '2026-05-14T08:00:00.000Z',
};

test('ReportExportWorkerService stores artifacts and creates immutable snapshot manifests', async () => {
  const calls: string[] = [];
  const worker = new ReportExportWorkerService(
    {
      storeArtifact: async () => {
        calls.push('store');
        return {
          storage_path: 'tenant/tenant-a/reports/exams/exam-results/artifact.pdf',
          checksum_sha256: 'c'.repeat(64),
        };
      },
    } as never,
    {
      saveManifest: async (manifest: Record<string, unknown>) => {
        calls.push('manifest');
        return {
          id: 'snapshot-row-1',
          snapshot_id: manifest.snapshot_id,
          manifest_checksum_sha256: manifest.manifest_checksum_sha256,
          created_at: '2026-05-14T08:00:00.000Z',
        };
      },
    } as never,
  );

  const result = await worker.execute(payload, {
    title: 'Exam results',
    headers: ['Student', 'Score'],
    rows: [
      ['Aisha Njeri', 84],
      ['Brian Otieno', 69],
    ],
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.artifact.format, 'pdf');
  assert.equal(result.artifact.row_count, 2);
  assert.equal(result.snapshot.manifest_checksum_sha256.length, 64);
  assert.deepEqual(calls, ['store', 'manifest']);
});

test('ReportExportWorkerService rejects retired attendance exports', async () => {
  const worker = new ReportExportWorkerService({} as never, {} as never);

  await assert.rejects(
    () =>
      worker.execute({
        ...payload,
        module: 'attendance',
        report_id: 'daily-attendance',
      }),
    /Attendance exports are retired/,
  );
});

test('ReportExportWorkerService deduplicates identical export requests', async () => {
  let storeCount = 0;
  const worker = new ReportExportWorkerService(
    {
      storeArtifact: async () => {
        storeCount += 1;
        return {
          storage_path: 'tenant/tenant-a/reports/exams/exam-results/artifact.pdf',
          checksum_sha256: 'd'.repeat(64),
        };
      },
    } as never,
    {
      saveManifest: async (manifest: Record<string, unknown>) => ({
        id: 'snapshot-row-1',
        snapshot_id: manifest.snapshot_id,
        manifest_checksum_sha256: manifest.manifest_checksum_sha256,
        created_at: '2026-05-14T08:00:00.000Z',
      }),
    } as never,
  );

  const source = {
    title: 'Exam results',
    headers: ['Student', 'Score'],
    rows: [['Aisha Njeri', 84]],
  };

  const first = await worker.execute(payload, source);
  const second = await worker.execute(payload, source);

  assert.equal(storeCount, 1);
  assert.equal(second.deduplicated, true);
  assert.equal(second.snapshot.snapshot_id, first.snapshot.snapshot_id);
});
