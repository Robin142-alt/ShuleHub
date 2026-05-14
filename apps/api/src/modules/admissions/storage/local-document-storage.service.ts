import { Injectable } from '@nestjs/common';
import { posix as pathPosix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { ProviderMalwareScanResult } from '../../../common/uploads/malware-scan';
import { StreamingUploadService } from '../../../common/uploads/streaming-upload.service';

export interface UploadedBinaryFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  providerMalwareScan?: ProviderMalwareScanResult;
}

@Injectable()
export class AdmissionDocumentStorageService {
  constructor(private readonly streamingUploads: StreamingUploadService) {}

  async save(input: {
    tenantId: string;
    scope: string;
    file: UploadedBinaryFile;
  }) {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const extension = this.extractExtension(input.file.originalname);
    const fileName = `${this.slugify(input.scope)}-${randomUUID()}${extension}`;
    const storedPath = pathPosix.join('tenant', input.tenantId, input.scope, year, month, fileName);

    return this.streamingUploads.consume({
      tenantId: input.tenantId,
      storagePath: storedPath,
      originalName: input.file.originalname,
      mimeType: input.file.mimetype,
      stream: Readable.from(input.file.buffer),
      ownerType: 'admission_document',
      providerMalwareScan: input.file.providerMalwareScan,
      metadata: {
        domain: input.scope,
      },
    });
  }

  private extractExtension(filename: string) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot) : '';
  }

  private slugify(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
