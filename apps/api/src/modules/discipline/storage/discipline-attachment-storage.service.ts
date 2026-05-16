import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
import { Readable } from 'node:stream';

import type { ProviderMalwareScanResult } from '../../../common/uploads/malware-scan';
import { StreamingUploadService } from '../../../common/uploads/streaming-upload.service';

export interface UploadedDisciplineFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  providerMalwareScan?: ProviderMalwareScanResult;
}

@Injectable()
export class DisciplineAttachmentStorageService {
  constructor(private readonly streamingUploads: StreamingUploadService) {}

  async save(input: {
    tenantId: string;
    incidentId: string;
    file: UploadedDisciplineFile;
  }) {
    const extension = this.extractExtension(input.file.originalname);
    const baseName = input.file.originalname.replace(extension, '');
    const fileName = `${this.slugify(baseName)}-${randomUUID()}${extension}`;
    const storagePath = pathPosix.join(
      'tenant',
      input.tenantId,
      'discipline',
      input.incidentId,
      'attachments',
      fileName,
    );

    return this.streamingUploads.consume({
      tenantId: input.tenantId,
      storagePath,
      originalName: input.file.originalname,
      mimeType: input.file.mimetype,
      stream: Readable.from(input.file.buffer),
      ownerType: 'discipline_attachment',
      providerMalwareScan: input.file.providerMalwareScan,
      metadata: {
        domain: 'discipline',
        incident_id: input.incidentId,
      },
    });
  }

  private extractExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot) : '';
  }

  private slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'discipline-evidence';
  }
}
