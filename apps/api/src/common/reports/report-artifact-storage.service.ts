import { Injectable } from '@nestjs/common';

import {
  DatabaseFileStorageService,
  type SignedFileObjectReadToken,
  type StoredFileObject,
} from '../uploads/database-file-storage.service';
import type { ReportArtifact } from './report-artifact';

export interface StoredReportArtifact {
  storage_path: string;
  checksum_sha256: string;
  storage_backend: StoredFileObject['storage_backend'];
  download_token?: SignedFileObjectReadToken;
}

export interface StoreReportArtifactInput {
  tenantId: string;
  module: string;
  reportId: string;
  artifact: ReportArtifact;
  actorUserId?: string | null;
  signingSecret?: string;
  now?: string;
}

@Injectable()
export class ReportArtifactStorageService {
  constructor(private readonly fileStorage: DatabaseFileStorageService) {}

  async storeArtifact(input: StoreReportArtifactInput): Promise<StoredReportArtifact> {
    const storagePath = buildReportArtifactStoragePath(input);
    const stored = await this.fileStorage.save({
      tenantId: input.tenantId,
      storagePath,
      originalFileName: input.artifact.filename,
      mimeType: input.artifact.contentType,
      sizeBytes: input.artifact.byteLength,
      buffer: input.artifact.content,
      retentionPolicy: 'reports',
      metadata: {
        module: input.module,
        report_id: input.reportId,
        row_count: input.artifact.rowCount,
        generated_at: input.artifact.generatedAt,
        checksum_sha256: input.artifact.checksumSha256,
      },
    });
    const downloadToken = input.signingSecret
      ? this.fileStorage.createSignedReadToken({
          tenantId: input.tenantId,
          storagePath: stored.stored_path,
          actorUserId: input.actorUserId ?? null,
          expiresAt: addMinutes(input.now ?? new Date().toISOString(), 15),
          signingSecret: input.signingSecret,
        })
      : undefined;

    return {
      storage_path: stored.stored_path,
      checksum_sha256: stored.sha256,
      storage_backend: stored.storage_backend,
      ...(downloadToken ? { download_token: downloadToken } : {}),
    };
  }
}

function buildReportArtifactStoragePath(input: StoreReportArtifactInput): string {
  const extension = input.artifact.filename.split('.').pop()?.toLowerCase() || 'bin';
  const module = sanitizePathSegment(input.module);
  const reportId = sanitizePathSegment(input.reportId);

  return `tenant/${input.tenantId}/reports/${module}/${reportId}/${input.artifact.checksumSha256}.${extension}`;
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'report';
}

function addMinutes(timestamp: string, minutes: number): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  return new Date(date.getTime() + minutes * 60_000).toISOString();
}
