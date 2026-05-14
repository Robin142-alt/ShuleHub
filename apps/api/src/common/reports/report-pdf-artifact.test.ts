import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createPdfReportArtifact } from './report-pdf-artifact';

test('createPdfReportArtifact creates a checksummed PDF manifest artifact', async () => {
  const artifact = await createPdfReportArtifact({
    reportId: 'exam-results',
    title: 'Exam results',
    filename: 'exam-results',
    generatedAt: '2026-05-14T08:00:00.000Z',
    filters: { class: 'Grade 8 Unity' },
    headers: ['Student', 'Score'],
    rows: [
      ['Aisha Njeri', 84],
      ['Brian Otieno', 69],
    ],
  });

  assert.equal(artifact.filename, 'exam-results.pdf');
  assert.equal(artifact.contentType, 'application/pdf');
  assert.equal(artifact.generatedAt, '2026-05-14T08:00:00.000Z');
  assert.equal(artifact.rowCount, 2);
  assert.equal(artifact.byteLength, artifact.content.length);
  assert.equal(artifact.checksumSha256, createHash('sha256').update(artifact.content).digest('hex'));
  assert.equal(artifact.content.subarray(0, 4).toString('ascii'), '%PDF');
});
