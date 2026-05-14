import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../../database/database.service';
import { RequestContextService } from '../request-context/request-context.service';

export interface DashboardSummaryInput {
  module: string;
  summaryId: string;
  role: string;
  metrics: Record<string, unknown>;
  sourceSnapshotIds?: string[];
  generatedAt?: string;
  staleAfter?: string | null;
}

export interface DashboardSummaryQuery {
  module?: string;
  role?: string;
  includeStale?: boolean;
  now?: string;
}

export interface DashboardSummarySnapshot {
  id: string;
  tenant_id: string;
  module: string;
  summary_id: string;
  role: string;
  metrics: Record<string, unknown>;
  source_snapshot_ids: string[];
  generated_at: string;
  stale_after: string | null;
  checksum_sha256: string;
  updated_at: string;
}

interface DashboardSummarySnapshotRow {
  id: string;
  tenant_id: string;
  module: string;
  summary_id: string;
  role: string;
  metrics: Record<string, unknown> | string;
  source_snapshot_ids: string[] | string;
  generated_at: string;
  stale_after: string | null;
  checksum_sha256: string;
  updated_at: string;
}

const RETIRED_ATTENDANCE_SUMMARY_ERROR =
  'Attendance dashboard summaries are retired. Use exams or active academic modules instead.';

@Injectable()
export class DashboardSummaryRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async upsertCurrentTenantSummary(input: DashboardSummaryInput): Promise<DashboardSummarySnapshot> {
    const context = this.requestContextService.requireStore();
    const tenantId = context.tenant_id?.trim() ?? '';

    if (!tenantId) {
      throw new BadRequestException('A tenant context is required to write dashboard summaries.');
    }

    return this.upsertSummary({
      tenantId,
      ...input,
    });
  }

  async listCurrentTenantSummaries(
    query: DashboardSummaryQuery = {},
  ): Promise<DashboardSummarySnapshot[]> {
    const context = this.requestContextService.requireStore();
    const tenantId = context.tenant_id?.trim() ?? '';

    if (!tenantId) {
      throw new BadRequestException('A tenant context is required to read dashboard summaries.');
    }

    return this.listSummaries({
      tenantId,
      ...query,
    });
  }

  async listSummaries(
    query: DashboardSummaryQuery & { tenantId: string },
  ): Promise<DashboardSummarySnapshot[]> {
    const errors = validateDashboardSummaryQuery(query);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: errors.join(' '),
        errors,
      });
    }

    const values: unknown[] = [query.tenantId.trim()];
    const predicates = ['tenant_id = $1'];
    const module = query.module?.trim();
    const role = query.role?.trim();

    if (module) {
      values.push(module);
      predicates.push(`module = $${values.length}`);
    }

    if (role) {
      values.push(role);
      predicates.push(`role = $${values.length}`);
    }

    if (!query.includeStale) {
      values.push(query.now ?? new Date().toISOString());
      predicates.push(`(stale_after IS NULL OR stale_after > $${values.length})`);
    }

    const result = await this.databaseService.query<DashboardSummarySnapshotRow>(
      `
        SELECT
          id::text,
          tenant_id,
          module,
          summary_id,
          role,
          metrics,
          source_snapshot_ids,
          generated_at::text,
          stale_after::text,
          checksum_sha256,
          updated_at::text
        FROM dashboard_summary_snapshots
        WHERE ${predicates.join('\n          AND ')}
        ORDER BY module ASC, role ASC, summary_id ASC
      `,
      values,
    );

    return result.rows.map(mapDashboardSummaryRow);
  }

  async upsertSummary(input: DashboardSummaryInput & { tenantId: string }): Promise<DashboardSummarySnapshot> {
    const errors = validateDashboardSummaryInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: errors.join(' '),
        errors,
      });
    }

    const metrics = normalizeRecord(input.metrics);
    const sourceSnapshotIds = input.sourceSnapshotIds ?? [];
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const staleAfter = input.staleAfter ?? null;
    const checksum = createDashboardSummaryChecksum({
      tenant_id: input.tenantId,
      module: input.module,
      summary_id: input.summaryId,
      role: input.role,
      metrics,
      source_snapshot_ids: sourceSnapshotIds,
      generated_at: generatedAt,
      stale_after: staleAfter,
    });

    const result = await this.databaseService.query<DashboardSummarySnapshotRow>(
      `
        INSERT INTO dashboard_summary_snapshots (
          tenant_id,
          module,
          summary_id,
          role,
          metrics,
          source_snapshot_ids,
          generated_at,
          stale_after,
          checksum_sha256
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
        ON CONFLICT (tenant_id, module, summary_id, role) DO UPDATE
        SET
          metrics = EXCLUDED.metrics,
          source_snapshot_ids = EXCLUDED.source_snapshot_ids,
          generated_at = EXCLUDED.generated_at,
          stale_after = EXCLUDED.stale_after,
          checksum_sha256 = EXCLUDED.checksum_sha256
        RETURNING
          id::text,
          tenant_id,
          module,
          summary_id,
          role,
          metrics,
          source_snapshot_ids,
          generated_at::text,
          stale_after::text,
          checksum_sha256,
          updated_at::text
      `,
      [
        input.tenantId,
        input.module,
        input.summaryId,
        input.role,
        JSON.stringify(metrics),
        JSON.stringify(sourceSnapshotIds),
        generatedAt,
        staleAfter,
        checksum,
      ],
    );

    return mapDashboardSummaryRow(result.rows[0]);
  }
}

export function validateDashboardSummaryInput(
  input: Partial<DashboardSummaryInput & { tenantId: string }>,
): string[] {
  const errors: string[] = [];

  if (!input.tenantId?.trim()) {
    errors.push('tenantId is required.');
  }

  if (!input.module?.trim()) {
    errors.push('module is required.');
  }

  if (!input.summaryId?.trim()) {
    errors.push('summaryId is required.');
  }

  if (!input.role?.trim()) {
    errors.push('role is required.');
  }

  if (!isPlainObject(input.metrics)) {
    errors.push('metrics must be an object.');
  }

  if (
    containsRetiredAttendanceReference(input.module)
    || containsRetiredAttendanceReference(input.summaryId)
    || containsRetiredAttendanceReference(input.metrics)
  ) {
    errors.push(RETIRED_ATTENDANCE_SUMMARY_ERROR);
  }

  if (
    input.sourceSnapshotIds !== undefined
    && (!Array.isArray(input.sourceSnapshotIds) || input.sourceSnapshotIds.some((id) => typeof id !== 'string' || !id.trim()))
  ) {
    errors.push('sourceSnapshotIds must be an array of non-empty strings.');
  }

  if (input.generatedAt !== undefined && Number.isNaN(Date.parse(input.generatedAt))) {
    errors.push('generatedAt must be an ISO timestamp.');
  }

  if (input.staleAfter !== undefined && input.staleAfter !== null && Number.isNaN(Date.parse(input.staleAfter))) {
    errors.push('staleAfter must be an ISO timestamp when provided.');
  }

  return errors;
}

export function validateDashboardSummaryQuery(
  query: Partial<DashboardSummaryQuery & { tenantId: string }>,
): string[] {
  const errors: string[] = [];

  if (!query.tenantId?.trim()) {
    errors.push('tenantId is required.');
  }

  if (
    containsRetiredAttendanceReference(query.module)
    || containsRetiredAttendanceReference(query.role)
  ) {
    errors.push(RETIRED_ATTENDANCE_SUMMARY_ERROR);
  }

  if (query.now !== undefined && Number.isNaN(Date.parse(query.now))) {
    errors.push('now must be an ISO timestamp.');
  }

  return errors;
}

function createDashboardSummaryChecksum(value: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function mapDashboardSummaryRow(row: DashboardSummarySnapshotRow): DashboardSummarySnapshot {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    module: row.module,
    summary_id: row.summary_id,
    role: row.role,
    metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics,
    source_snapshot_ids: typeof row.source_snapshot_ids === 'string'
      ? JSON.parse(row.source_snapshot_ids)
      : row.source_snapshot_ids,
    generated_at: row.generated_at,
    stale_after: row.stale_after,
    checksum_sha256: row.checksum_sha256,
    updated_at: row.updated_at,
  };
}

function normalizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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
