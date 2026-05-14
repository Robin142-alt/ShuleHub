import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import {
  DatabaseFileStorageService,
  type StoredFileObject,
} from './database-file-storage.service';
import type { ProviderMalwareScanResult } from './malware-scan';
import { UploadMalwareScanService } from './upload-malware-scan.service';
import {
  MAX_UPLOAD_FILE_BYTES,
  validateUploadedFile,
} from './upload-policy';

export type StreamingUploadOwnerType =
  | 'admission_document'
  | 'hr_document'
  | 'library_attachment'
  | 'support_attachment';

export interface StreamingUploadServiceOptions {
  maxFileBytes?: number;
  scanService?: Pick<UploadMalwareScanService, 'scanIfConfigured'>;
  storage?: Pick<DatabaseFileStorageService, 'save'>;
}

export interface ConsumeStreamingUploadInput {
  tenantId: string;
  originalName: string;
  mimeType: string;
  stream: Readable | AsyncIterable<Buffer | Uint8Array | string>;
  storagePath: string;
  ownerType: StreamingUploadOwnerType;
  providerMalwareScan?: ProviderMalwareScanResult;
  metadata?: Record<string, unknown>;
  retentionPolicy?: string;
  retentionExpiresAt?: string | null;
}

export type StreamingUploadResult = StoredFileObject & Record<string, unknown>;

@Injectable()
export class StreamingUploadService {
  private readonly maxFileBytes: number;
  private readonly scanService?: Pick<UploadMalwareScanService, 'scanIfConfigured'>;
  private readonly storage?: Pick<DatabaseFileStorageService, 'save'>;

  constructor(options: StreamingUploadServiceOptions = {}) {
    this.maxFileBytes = options.maxFileBytes ?? MAX_UPLOAD_FILE_BYTES;
    this.scanService = options.scanService;
    this.storage = options.storage;
  }

  async consume(input: ConsumeStreamingUploadInput): Promise<StreamingUploadResult> {
    const { buffer, sizeBytes, checksumSha256 } = await this.readBoundedStream(input.stream);
    const baseFile = {
      originalname: input.originalName,
      mimetype: input.mimeType,
      size: sizeBytes,
      buffer,
      providerMalwareScan: input.providerMalwareScan,
    };

    validateUploadedFile(baseFile);
    const providerMalwareScan = input.providerMalwareScan
      ?? await this.scanService?.scanIfConfigured(baseFile);
    const scannedFile = {
      ...baseFile,
      providerMalwareScan,
    };

    validateUploadedFile(scannedFile);

    if (!this.storage) {
      throw new BadRequestException('Streaming upload storage is not configured');
    }

    return this.storage.save({
      tenantId: input.tenantId,
      storagePath: input.storagePath,
      originalFileName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes,
      buffer,
      metadata: {
        ...(input.metadata ?? {}),
        owner_type: input.ownerType,
        checksum_sha256: checksumSha256,
        provider_malware_scan: providerMalwareScan
          ? {
            provider: providerMalwareScan.provider,
            status: providerMalwareScan.status,
            scanned_at: providerMalwareScan.scannedAt,
            scan_id: providerMalwareScan.scanId,
            signature: providerMalwareScan.signature,
          }
          : undefined,
      },
      retentionPolicy: input.retentionPolicy,
      retentionExpiresAt: input.retentionExpiresAt,
    }) as Promise<StreamingUploadResult>;
  }

  private async readBoundedStream(
    stream: Readable | AsyncIterable<Buffer | Uint8Array | string>,
  ): Promise<{ buffer: Buffer; sizeBytes: number; checksumSha256: string }> {
    const chunks: Buffer[] = [];
    const hash = createHash('sha256');
    let sizeBytes = 0;

    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += buffer.length;

      if (sizeBytes > this.maxFileBytes) {
        throw new BadRequestException(`File exceeds ${this.maxFileBytes} bytes`);
      }

      hash.update(buffer);
      chunks.push(buffer);
    }

    return {
      buffer: Buffer.concat(chunks, sizeBytes),
      sizeBytes,
      checksumSha256: hash.digest('hex'),
    };
  }
}
