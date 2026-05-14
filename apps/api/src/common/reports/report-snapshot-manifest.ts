import { createHash } from 'node:crypto';

export type ReportSnapshotFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportSnapshotArtifactInput {
  filename: string;
  contentType: string;
  rowCount: number;
  checksumSha256: string;
  generatedAt: string;
}

export interface ReportSnapshotManifestInput {
  tenantId: string;
  module: string;
  reportId: string;
  title: string;
  format: ReportSnapshotFormat | string;
  artifact: ReportSnapshotArtifactInput;
  filters?: Record<string, unknown>;
  generatedByUserId?: string | null;
}

export interface ReportSnapshotManifest {
  snapshot_id: string;
  tenant_id: string;
  module: string;
  report_id: string;
  title: string;
  format: ReportSnapshotFormat;
  artifact: {
    filename: string;
    content_type: string;
    row_count: number;
    checksum_sha256: string;
    generated_at: string;
  };
  filters: Record<string, unknown>;
  generated_by_user_id: string | null;
  manifest_checksum_sha256: string;
}

const RETIRED_ATTENDANCE_SNAPSHOT_ERROR =
  'Attendance report snapshots are retired. Use exams or active academic modules instead.';

export function createReportSnapshotManifest(
  input: ReportSnapshotManifestInput,
): ReportSnapshotManifest {
  const errors = validateReportSnapshotManifestInput(input);

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const format = normalizeReportSnapshotFormat(input.format);
  const snapshotWithoutChecksum = {
    snapshot_id: buildReportSnapshotId(input, format),
    tenant_id: input.tenantId.trim(),
    module: input.module.trim(),
    report_id: input.reportId.trim(),
    title: input.title.trim(),
    format,
    artifact: {
      filename: input.artifact.filename.trim(),
      content_type: input.artifact.contentType.trim(),
      row_count: input.artifact.rowCount,
      checksum_sha256: input.artifact.checksumSha256.trim().toLowerCase(),
      generated_at: input.artifact.generatedAt.trim(),
    },
    filters: input.filters ?? {},
    generated_by_user_id: input.generatedByUserId?.trim() || null,
  };

  return {
    ...snapshotWithoutChecksum,
    manifest_checksum_sha256: createHash('sha256')
      .update(canonicalJson(snapshotWithoutChecksum))
      .digest('hex'),
  };
}

export function validateReportSnapshotManifestInput(
  input: Partial<ReportSnapshotManifestInput>,
): string[] {
  const errors: string[] = [];

  if (!input.tenantId?.trim()) {
    errors.push('tenantId is required.');
  }

  if (!input.module?.trim()) {
    errors.push('module is required.');
  }

  if (!input.reportId?.trim()) {
    errors.push('reportId is required.');
  }

  if (!input.title?.trim()) {
    errors.push('title is required.');
  }

  if (!isReportSnapshotFormat(input.format)) {
    errors.push('format must be csv, xlsx, or pdf.');
  }

  if (!input.artifact) {
    errors.push('artifact is required.');
  } else {
    if (!input.artifact.filename?.trim()) {
      errors.push('artifact.filename is required.');
    }

    if (!input.artifact.contentType?.trim()) {
      errors.push('artifact.contentType is required.');
    }

    if (!Number.isInteger(input.artifact.rowCount) || input.artifact.rowCount < 0) {
      errors.push('artifact.rowCount must be a non-negative integer.');
    }

    if (!/^[a-f0-9]{64}$/i.test(input.artifact.checksumSha256 ?? '')) {
      errors.push('artifact.checksumSha256 must be a SHA-256 hex digest.');
    }

    if (!input.artifact.generatedAt?.trim() || Number.isNaN(Date.parse(input.artifact.generatedAt))) {
      errors.push('artifact.generatedAt must be an ISO timestamp.');
    }
  }

  if (input.filters !== undefined && !isPlainObject(input.filters)) {
    errors.push('filters must be an object when provided.');
  }

  if (
    containsRetiredAttendanceReference(input.module)
    || containsRetiredAttendanceReference(input.reportId)
    || containsRetiredAttendanceReference(input.title)
    || containsRetiredAttendanceReference(input.artifact?.filename)
    || containsRetiredAttendanceReference(input.filters)
  ) {
    errors.push(RETIRED_ATTENDANCE_SNAPSHOT_ERROR);
  }

  return errors;
}

function buildReportSnapshotId(
  input: ReportSnapshotManifestInput,
  format: ReportSnapshotFormat,
): string {
  return [
    'report-snapshot',
    input.tenantId,
    input.module,
    input.reportId,
    format,
    input.artifact.checksumSha256.slice(0, 16),
  ]
    .map(sanitizeSnapshotIdSegment)
    .join(':');
}

function normalizeReportSnapshotFormat(format: ReportSnapshotManifestInput['format']): ReportSnapshotFormat {
  const normalized = format.toString().trim().toLowerCase();

  return normalized as ReportSnapshotFormat;
}

function isReportSnapshotFormat(format: unknown): format is ReportSnapshotFormat {
  return format === 'csv' || format === 'xlsx' || format === 'pdf';
}

function containsRetiredAttendanceReference(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  return JSON.stringify(value).toLowerCase().includes('attendance');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeSnapshotIdSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
