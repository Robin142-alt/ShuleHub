import { createHash } from 'node:crypto';

export type ReportCsvValue = string | number | boolean | Date | null | undefined;

export interface CsvReportArtifactInput {
  reportId: string;
  title: string;
  filename: string;
  headers: ReportCsvValue[];
  rows: ReportCsvValue[][];
  generatedAt?: Date;
}

export function createCsvReportArtifact(input: CsvReportArtifactInput) {
  const csv = renderCsv([input.headers, ...input.rows]);

  return {
    report_id: input.reportId,
    title: input.title,
    filename: input.filename,
    content_type: 'text/csv; charset=utf-8',
    generated_at: (input.generatedAt ?? new Date()).toISOString(),
    row_count: input.rows.length,
    checksum_sha256: createHash('sha256').update(csv).digest('hex'),
    csv,
  };
}

function renderCsv(rows: ReportCsvValue[][]) {
  return `${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n')}\r\n`;
}

function escapeCsvValue(value: ReportCsvValue) {
  const normalized =
    value instanceof Date
      ? value.toISOString()
      : value === null || value === undefined
        ? ''
        : `${value}`;

  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}
