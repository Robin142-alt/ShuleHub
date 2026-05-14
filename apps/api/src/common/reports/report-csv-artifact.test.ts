import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createCsvReportArtifact } from './report-csv-artifact';

test('createCsvReportArtifact creates a stable checksummed CSV artifact', () => {
  const artifact = createCsvReportArtifact({
    reportId: 'applications',
    title: 'Applications register',
    filename: 'admissions-applications.csv',
    headers: ['Applicant', 'Notes', 'Verified'],
    rows: [
      ['Achieng, Otieno', 'Uses "quoted" values', true],
      ['Missing file', null, false],
    ],
    generatedAt: new Date('2026-05-14T08:00:00.000Z'),
  });

  assert.equal(artifact.report_id, 'applications');
  assert.equal(artifact.title, 'Applications register');
  assert.equal(artifact.filename, 'admissions-applications.csv');
  assert.equal(artifact.content_type, 'text/csv; charset=utf-8');
  assert.equal(artifact.generated_at, '2026-05-14T08:00:00.000Z');
  assert.equal(artifact.row_count, 2);
  assert.equal(
    artifact.csv,
    'Applicant,Notes,Verified\r\n"Achieng, Otieno","Uses ""quoted"" values",true\r\nMissing file,,false\r\n',
  );
  assert.equal(
    artifact.checksum_sha256,
    createHash('sha256').update(artifact.csv).digest('hex'),
  );
});
