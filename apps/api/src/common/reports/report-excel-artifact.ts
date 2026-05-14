import { createHash } from 'node:crypto';

import ExcelJS from 'exceljs';

import {
  formatReportValue,
  normalizeReportFilename,
  normalizeReportGeneratedAt,
  type ReportArtifact,
  type ReportArtifactInput,
} from './report-artifact';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function createXlsxReportArtifact(
  input: ReportArtifactInput,
): Promise<ReportArtifact> {
  const generatedAt = normalizeReportGeneratedAt(input.generatedAt);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Shule Hub';
  workbook.created = new Date(generatedAt);
  workbook.modified = new Date(generatedAt);
  workbook.calcProperties.fullCalcOnLoad = false;

  const worksheet = workbook.addWorksheet(toSafeSheetName(input.title), {
    properties: {
      defaultRowHeight: 18,
    },
  });

  worksheet.addRow([input.title]);
  worksheet.addRow([`Generated at: ${generatedAt}`]);
  worksheet.addRow([`Filters: ${JSON.stringify(input.filters ?? {})}`]);
  worksheet.addRow(input.headers);

  for (const row of input.rows) {
    worksheet.addRow(row.map((value) => (value instanceof Date ? value.toISOString() : value)));
  }

  worksheet.getRow(1).font = { bold: true, size: 14 };
  worksheet.getRow(4).font = { bold: true };
  worksheet.columns.forEach((column, index) => {
    const header = input.headers[index] ?? '';
    const values = input.rows.map((row) => formatReportValue(row[index]));
    column.width = Math.min(
      48,
      Math.max(12, header.length, ...values.map((value) => value.length)) + 2,
    );
  });

  const written = await workbook.xlsx.writeBuffer();
  const content = Buffer.isBuffer(written)
    ? written
    : Buffer.from(written as ArrayBuffer);

  return {
    filename: normalizeReportFilename(input, 'xlsx'),
    contentType: XLSX_CONTENT_TYPE,
    byteLength: content.length,
    checksumSha256: createHash('sha256').update(content).digest('hex'),
    generatedAt,
    rowCount: input.rows.length,
    content,
  };
}

function toSafeSheetName(value: string): string {
  const trimmed = value.trim().replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ');

  return (trimmed || 'Report').slice(0, 31);
}
