import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface UploadedSupportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class SupportAttachmentStorageService {
  async save(input: {
    tenantId: string;
    ticketId: string;
    file: UploadedSupportFile;
  }) {
    const extension = this.extractExtension(input.file.originalname);
    const fileName = `${this.slugify(input.file.originalname.replace(extension, ''))}-${randomUUID()}${extension}`;
    const relativeDirectory = join('tenant', input.tenantId, 'support', input.ticketId);
    const relativePath = join(relativeDirectory, fileName);
    const targetDirectory = join(process.cwd(), 'artifacts', 'uploads', relativeDirectory);

    await mkdir(targetDirectory, { recursive: true });
    await writeFile(join(process.cwd(), 'artifacts', 'uploads', relativePath), input.file.buffer);

    return {
      stored_path: relativePath.replace(/\\/g, '/'),
      original_file_name: input.file.originalname,
      mime_type: input.file.mimetype,
      size_bytes: input.file.size,
    };
  }

  private extractExtension(filename: string) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot) : '';
  }

  private slugify(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'support-attachment';
  }
}
