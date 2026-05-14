import { BadRequestException, Injectable } from '@nestjs/common';
import type { JobsOptions } from 'bullmq';

import { QueueService } from '../../queue/queue.service';
import { RequestContextService } from '../request-context/request-context.service';

export const REPORT_EXPORT_QUEUE_NAME = 'report-exports';
export const REPORT_EXPORT_JOB_NAME = 'report.export.generate';
export const DEFAULT_SYNC_EXPORT_ROW_LIMIT = 10000;

const RETIRED_ATTENDANCE_EXPORT_ERROR =
  'Attendance exports are retired. Use the exams or active academic modules instead.';

const REPORT_EXPORT_JOB_OPTIONS: Omit<JobsOptions, 'jobId'> = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 30000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportExportQueueDecisionInput {
  estimated_rows?: number | null;
  estimatedRows?: number | null;
  force_async?: boolean;
  forceAsync?: boolean;
  sync_row_limit?: number;
  syncRowLimit?: number;
}

export interface ReportExportJobInput {
  tenant_id: string;
  requested_by_user_id?: string | null;
  request_id: string;
  module: string;
  report_id: string;
  format?: ReportExportFormat | string;
  filters?: Record<string, unknown> | null;
  estimated_rows?: number | null;
}

export interface CurrentRequestReportExportInput {
  module: string;
  report_id: string;
  format?: ReportExportFormat | string;
  filters?: Record<string, unknown> | null;
  estimated_rows?: number | null;
}

export interface QueueReportExportRequest {
  format?: ReportExportFormat | string;
  filters?: Record<string, unknown> | null;
  estimated_rows?: number | null;
}

export interface ReportExportJobPayload {
  tenant_id: string;
  requested_by_user_id: string | null;
  request_id: string;
  module: string;
  report_id: string;
  format: ReportExportFormat;
  filters?: Record<string, unknown>;
  estimated_rows?: number;
  enqueued_at: string;
}

export interface ReportExportJobResponse {
  job_id: string;
  queue_name: string;
  state: string;
  module: string;
  report_id: string;
  format: ReportExportFormat;
  queued_at: string;
}

export function shouldQueueReportExport(input: ReportExportQueueDecisionInput): boolean {
  if (input.force_async ?? input.forceAsync ?? false) {
    return true;
  }

  const estimatedRows = input.estimated_rows ?? input.estimatedRows;

  if (estimatedRows === undefined || estimatedRows === null) {
    return false;
  }

  const syncRowLimit =
    input.sync_row_limit ?? input.syncRowLimit ?? DEFAULT_SYNC_EXPORT_ROW_LIMIT;

  return estimatedRows > syncRowLimit;
}

export function validateReportExportJobPayload(
  payload: Partial<ReportExportJobPayload>,
): string[] {
  const errors: string[] = [];

  if (!payload.tenant_id?.trim()) {
    errors.push('tenant_id is required.');
  }

  if (!payload.request_id?.trim()) {
    errors.push('request_id is required.');
  }

  if (!payload.module?.trim()) {
    errors.push('module is required.');
  }

  if (!payload.report_id?.trim()) {
    errors.push('report_id is required.');
  }

  if (!isReportExportFormat(payload.format)) {
    errors.push('format must be csv, xlsx, or pdf.');
  }

  if (payload.filters !== undefined && !isPlainObject(payload.filters)) {
    errors.push('filters must be an object when provided.');
  }

  if (
    containsRetiredAttendanceReference(payload.module) ||
    containsRetiredAttendanceReference(payload.report_id) ||
    containsRetiredAttendanceReference(payload.filters)
  ) {
    errors.push(RETIRED_ATTENDANCE_EXPORT_ERROR);
  }

  return errors;
}

export function buildReportExportJobId(payload: ReportExportJobPayload): string {
  return [
    'report-exports',
    payload.tenant_id,
    payload.module,
    payload.report_id,
    payload.request_id,
  ]
    .map(sanitizeJobIdSegment)
    .join(':');
}

@Injectable()
export class ReportExportQueueService {
  constructor(
    private readonly queueService: QueueService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async enqueueCurrentRequestReportExport(
    input: CurrentRequestReportExportInput,
  ): Promise<ReportExportJobResponse> {
    const context = this.requestContextService.requireStore();

    return this.enqueueReportExport({
      ...input,
      tenant_id: context.tenant_id ?? '',
      requested_by_user_id: context.user_id ?? null,
      request_id: context.request_id,
    });
  }

  async enqueueReportExport(input: ReportExportJobInput): Promise<ReportExportJobResponse> {
    const queuedAt = new Date().toISOString();
    const payload: ReportExportJobPayload = {
      tenant_id: input.tenant_id,
      requested_by_user_id: input.requested_by_user_id ?? null,
      request_id: input.request_id,
      module: input.module,
      report_id: input.report_id,
      format: normalizeReportExportFormat(input.format),
      enqueued_at: queuedAt,
    };

    if (input.filters !== undefined && input.filters !== null) {
      payload.filters = input.filters;
    }

    if (typeof input.estimated_rows === 'number') {
      payload.estimated_rows = input.estimated_rows;
    }

    const errors = validateReportExportJobPayload(payload);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Report export job is invalid.',
        errors,
      });
    }

    const jobId = buildReportExportJobId(payload);
    const job = await this.queueService.add<ReportExportJobPayload>(
      REPORT_EXPORT_JOB_NAME,
      payload,
      {
        jobId,
        ...REPORT_EXPORT_JOB_OPTIONS,
      },
      REPORT_EXPORT_QUEUE_NAME,
    );
    const state = typeof job.getState === 'function' ? await job.getState() : 'queued';

    return {
      job_id: job.id?.toString() ?? jobId,
      queue_name: REPORT_EXPORT_QUEUE_NAME,
      state,
      module: payload.module,
      report_id: payload.report_id,
      format: payload.format,
      queued_at: queuedAt,
    };
  }
}

function normalizeReportExportFormat(format: ReportExportJobInput['format']): ReportExportFormat {
  const normalizedFormat = (format ?? 'csv').toString().trim().toLowerCase();

  if (!isReportExportFormat(normalizedFormat)) {
    return normalizedFormat as ReportExportFormat;
  }

  return normalizedFormat;
}

function isReportExportFormat(format: unknown): format is ReportExportFormat {
  return format === 'csv' || format === 'xlsx' || format === 'pdf';
}

function containsRetiredAttendanceReference(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  return JSON.stringify(value).toLowerCase().includes('attendance');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sanitizeJobIdSegment(segment: string): string {
  return (
    segment
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}
