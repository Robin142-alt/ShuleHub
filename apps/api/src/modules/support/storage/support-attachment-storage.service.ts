import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { posix as pathPosix } from 'node:path';

import type { ProviderMalwareScanResult } from '../../../common/uploads/malware-scan';
import { StreamingUploadService } from '../../../common/uploads/streaming-upload.service';

export interface UploadedSupportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  providerMalwareScan?: ProviderMalwareScanResult;
}

@Injectable()
export class SupportAttachmentStorageService {
  constructor(private readonly streamingUploads: StreamingUploadService) {}

  async save(input: {
    tenantId: string;
    ticketId: string;
    file: UploadedSupportFile;
  }) {
    const extension = this.extractExtension(input.file.originalname);
    const fileName = `${this.slugify(input.file.originalname.replace(extension, ''))}-${randomUUID()}${extension}`;
    const storedPath = pathPosix.join('tenant', input.tenantId, 'support', input.ticketId, fileName);

    return this.streamingUploads.consume({
      tenantId: input.tenantId,
      storagePath: storedPath,
      originalName: input.file.originalname,
      mimeType: input.file.mimetype,
      stream: Readable.from(input.file.buffer),
      ownerType: 'support_attachment',
      providerMalwareScan: input.file.providerMalwareScan,
      metadata: {
        domain: 'support',
        ticket_id: input.ticketId,
      },
    });
  }

  private extractExtension(filename: string) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot) : '';
  }

  private slugify(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'support-attachment';
  }
}
