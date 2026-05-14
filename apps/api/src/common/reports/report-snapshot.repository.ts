import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { RequestContextService } from '../request-context/request-context.service';
import {
  type ReportSnapshotManifest,
  validateReportSnapshotManifestInput,
} from './report-snapshot-manifest';

export interface StoredReportSnapshot {
  id: string;
  snapshot_id: string;
  manifest_checksum_sha256: string;
  created_at: string;
}

export interface ReportExportJobSummary {
  job_id: string;
  snapshot_id: string;
  module: string;
  report_id: string;
  format: string;
  state: 'completed';
  artifact: Record<string, unknown>;
  filters: Record<string, unknown>;
  generated_by_user_id: string | null;
  created_at: string;
}

interface StoredReportSnapshotRow {
  id: string;
  snapshot_id: string;
  manifest_checksum_sha256: string;
  created_at: string;
}

@Injectable()
export class ReportSnapshotRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async saveManifest(manifest: ReportSnapshotManifest): Promise<StoredReportSnapshot> {
    const context = this.requestContextService.requireStore();
    const validationErrors = validateReportSnapshotManifestInput({
      tenantId: manifest.tenant_id,
      module: manifest.module,
      reportId: manifest.report_id,
      title: manifest.title,
      format: manifest.format,
      artifact: {
        filename: manifest.artifact.filename,
        contentType: manifest.artifact.content_type,
        rowCount: manifest.artifact.row_count,
        checksumSha256: manifest.artifact.checksum_sha256,
        generatedAt: manifest.artifact.generated_at,
      },
      filters: manifest.filters,
      generatedByUserId: manifest.generated_by_user_id,
    });

    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Report snapshot manifest is invalid.',
        errors: validationErrors,
      });
    }

    return this.databaseService.withRequestTransaction(async () => {
      const snapshot = await this.insertSnapshot(manifest);
      await this.insertAuditLog(manifest, context.user_id ?? null, context.request_id ?? null);

      return snapshot;
    });
  }

  async listCompletedExportJobs(
    input: { limit?: number } = {},
  ): Promise<ReportExportJobSummary[]> {
    const context = this.requestContextService.requireStore();
    const tenantId = context.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for report export jobs');
    }

    const limit = normalizeLimit(input.limit);
    const result = await this.databaseService.query<ReportExportJobSummary>(
      `
        SELECT
          id::text AS job_id,
          snapshot_id,
          module,
          report_id,
          format,
          'completed' AS state,
          artifact,
          filters,
          generated_by_user_id,
          created_at::text
        FROM report_snapshots
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [tenantId, limit],
    );

    return result.rows;
  }

  private async insertSnapshot(manifest: ReportSnapshotManifest): Promise<StoredReportSnapshot> {
    const result = await this.databaseService.query<StoredReportSnapshotRow>(
      `
        INSERT INTO report_snapshots (
          tenant_id,
          snapshot_id,
          module,
          report_id,
          title,
          format,
          artifact,
          filters,
          generated_by_user_id,
          manifest,
          manifest_checksum_sha256
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11)
        RETURNING id::text, snapshot_id, manifest_checksum_sha256, created_at::text
      `,
      [
        manifest.tenant_id,
        manifest.snapshot_id,
        manifest.module,
        manifest.report_id,
        manifest.title,
        manifest.format,
        JSON.stringify(manifest.artifact),
        JSON.stringify(manifest.filters),
        manifest.generated_by_user_id,
        JSON.stringify(manifest),
        manifest.manifest_checksum_sha256,
      ],
    );

    const row = result.rows[0];

    return {
      id: row.id,
      snapshot_id: row.snapshot_id,
      manifest_checksum_sha256: row.manifest_checksum_sha256,
      created_at: row.created_at,
    };
  }

  private async insertAuditLog(
    manifest: ReportSnapshotManifest,
    actorUserId: string | null,
    requestId: string | null,
  ): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO report_snapshot_audit_logs (
          tenant_id,
          snapshot_id,
          action,
          actor_user_id,
          request_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        manifest.tenant_id,
        manifest.snapshot_id,
        'report.snapshot.created',
        actorUserId,
        requestId,
        JSON.stringify({
          module: manifest.module,
          report_id: manifest.report_id,
          format: manifest.format,
          row_count: manifest.artifact.row_count,
          artifact_checksum_sha256: manifest.artifact.checksum_sha256,
          manifest_checksum_sha256: manifest.manifest_checksum_sha256,
        }),
      ],
    );
  }
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 100;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 500);
}
