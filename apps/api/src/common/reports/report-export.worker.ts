import { BadRequestException, Injectable } from '@nestjs/common';

import { createCsvReportArtifact } from './report-csv-artifact';
import {
  type ReportArtifact,
  type ReportArtifactFormat,
  type ReportArtifactInput,
} from './report-artifact';
import { ReportArtifactStorageService } from './report-artifact-storage.service';
import { createXlsxReportArtifact } from './report-excel-artifact';
import { createPdfReportArtifact } from './report-pdf-artifact';
import {
  type ReportExportJobPayload,
  validateReportExportJobPayload,
} from './report-export-queue';
import {
  createReportSnapshotManifest,
  type ReportSnapshotManifest,
} from './report-snapshot-manifest';
import {
  ReportSnapshotRepository,
  type StoredReportSnapshot,
} from './report-snapshot.repository';

export interface ReportExportSourceData {
  title: string;
  headers: string[];
  rows: ReportArtifactInput['rows'];
}

export interface ReportExportWorkerResult {
  status: 'completed';
  deduplicated: boolean;
  artifact: {
    filename: string;
    content_type: string;
    format: ReportArtifactFormat;
    row_count: number;
    checksum_sha256: string;
    storage_path: string;
  };
  snapshot: ReportSnapshotManifest & {
    persisted?: StoredReportSnapshot;
  };
}

@Injectable()
export class ReportExportWorkerService {
  private readonly completedExports = new Map<string, ReportExportWorkerResult>();

  constructor(
    private readonly artifactStorage: ReportArtifactStorageService,
    private readonly snapshotRepository: ReportSnapshotRepository,
  ) {}

  async execute(
    payload: ReportExportJobPayload,
    sourceData?: ReportExportSourceData,
  ): Promise<ReportExportWorkerResult> {
    const validationErrors = validateReportExportJobPayload(payload);

    if (validationErrors.length > 0) {
      throw new BadRequestException(validationErrors.join(' '));
    }

    const dedupeKey = buildExportDedupeKey(payload);
    const existing = this.completedExports.get(dedupeKey);

    if (existing) {
      return {
        ...existing,
        deduplicated: true,
      };
    }

    const source = sourceData ?? buildDefaultSourceData(payload);
    const artifact = await createArtifact(payload, source);
    const storedArtifact = await this.artifactStorage.storeArtifact({
      tenantId: payload.tenant_id,
      module: payload.module,
      reportId: payload.report_id,
      artifact,
      actorUserId: payload.requested_by_user_id,
    });
    const manifest = createReportSnapshotManifest({
      tenantId: payload.tenant_id,
      module: payload.module,
      reportId: payload.report_id,
      title: source.title,
      format: payload.format,
      artifact: {
        filename: artifact.filename,
        contentType: artifact.contentType,
        rowCount: artifact.rowCount,
        checksumSha256: artifact.checksumSha256,
        generatedAt: artifact.generatedAt,
      },
      filters: payload.filters ?? {},
      generatedByUserId: payload.requested_by_user_id,
    });
    const persisted = await this.snapshotRepository.saveManifest(manifest);
    const result: ReportExportWorkerResult = {
      status: 'completed',
      deduplicated: false,
      artifact: {
        filename: artifact.filename,
        content_type: artifact.contentType,
        format: payload.format,
        row_count: artifact.rowCount,
        checksum_sha256: artifact.checksumSha256,
        storage_path: storedArtifact.storage_path,
      },
      snapshot: {
        ...manifest,
        persisted,
      },
    };

    this.completedExports.set(dedupeKey, result);
    return result;
  }
}

async function createArtifact(
  payload: ReportExportJobPayload,
  source: ReportExportSourceData,
): Promise<ReportArtifact> {
  const input: ReportArtifactInput = {
    reportId: payload.report_id,
    module: payload.module,
    title: source.title,
    filename: `${payload.module}-${payload.report_id}.${payload.format}`,
    generatedAt: payload.enqueued_at,
    filters: payload.filters ?? {},
    headers: source.headers,
    rows: source.rows,
  };

  if (payload.format === 'xlsx') {
    return createXlsxReportArtifact(input);
  }

  if (payload.format === 'pdf') {
    return createPdfReportArtifact(input);
  }

  const csvArtifact = createCsvReportArtifact({
    reportId: input.reportId,
    title: input.title,
    filename: input.filename ?? `${input.reportId}.csv`,
    headers: input.headers,
    rows: input.rows,
    generatedAt: new Date(input.generatedAt ?? Date.now()),
  });
  const content = Buffer.from(csvArtifact.csv, 'utf8');

  return {
    filename: csvArtifact.filename,
    contentType: csvArtifact.content_type,
    byteLength: content.length,
    checksumSha256: csvArtifact.checksum_sha256,
    generatedAt: csvArtifact.generated_at,
    rowCount: csvArtifact.row_count,
    content,
  };
}

function buildDefaultSourceData(payload: ReportExportJobPayload): ReportExportSourceData {
  return {
    title: `${payload.module} ${payload.report_id}`.replace(/[-_]+/g, ' '),
    headers: ['Module', 'Report', 'Request ID', 'Estimated Rows'],
    rows: [[payload.module, payload.report_id, payload.request_id, payload.estimated_rows ?? 0]],
  };
}

function buildExportDedupeKey(payload: ReportExportJobPayload): string {
  return JSON.stringify({
    tenant_id: payload.tenant_id,
    requested_by_user_id: payload.requested_by_user_id,
    request_id: payload.request_id,
    module: payload.module,
    report_id: payload.report_id,
    format: payload.format,
    filters: payload.filters ?? {},
  });
}
