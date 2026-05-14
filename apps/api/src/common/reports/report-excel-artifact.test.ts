import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import ExcelJS from 'exceljs';

import { createXlsxReportArtifact } from './report-excel-artifact';

test('createXlsxReportArtifact creates a stable workbook artifact with checksum metadata', async () => {
  const artifact = await createXlsxReportArtifact({
    reportId: 'student-fee-balances',
    title: 'Student fee balances',
    filename: 'student-fee-balances',
    generatedAt: '2026-05-14T08:00:00.000Z',
    filters: { term: 'Term 2' },
    headers: ['Student', 'Balance'],
    rows: [
      ['Aisha Njeri', 125000],
      ['Brian Otieno', 50000],
    ],
  });

  assert.equal(artifact.filename, 'student-fee-balances.xlsx');
  assert.equal(artifact.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(artifact.generatedAt, '2026-05-14T08:00:00.000Z');
  assert.equal(artifact.rowCount, 2);
  assert.equal(artifact.byteLength, artifact.content.length);
  assert.equal(artifact.checksumSha256, createHash('sha256').update(artifact.content).digest('hex'));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(artifact.content as never);
  const worksheet = workbook.getWorksheet('Student fee balances');

  assert.ok(worksheet);
  assert.equal(worksheet.getCell('A1').value, 'Student fee balances');
  assert.equal(worksheet.getCell('A4').value, 'Student');
  assert.equal(worksheet.getCell('B5').value, 125000);
});
