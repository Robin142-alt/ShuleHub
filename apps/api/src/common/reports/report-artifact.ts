export type ReportArtifactFormat = 'csv' | 'xlsx' | 'pdf';
export type ReportArtifactValue = string | number | boolean | Date | null | undefined;

export interface ReportArtifactInput {
  reportId: string;
  title: string;
  module?: string;
  filename?: string;
  headers: string[];
  rows: ReportArtifactValue[][];
  filters?: Record<string, unknown>;
  generatedAt?: Date | string;
}

export interface ReportArtifact {
  filename: string;
  contentType: string;
  byteLength: number;
  checksumSha256: string;
  generatedAt: string;
  rowCount: number;
  content: Buffer;
}

export function normalizeReportGeneratedAt(value: Date | string | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error('Report generatedAt must be a valid timestamp.');
  }

  return date.toISOString();
}

export function normalizeReportFilename(
  input: Pick<ReportArtifactInput, 'filename' | 'reportId'>,
  extension: ReportArtifactFormat,
): string {
  const fallback = `${input.reportId.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'report'}.${extension}`;
  const filename = input.filename?.trim() || fallback;

  return filename.toLowerCase().endsWith(`.${extension}`)
    ? filename
    : `${filename}.${extension}`;
}

export function formatReportValue(value: ReportArtifactValue): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}
