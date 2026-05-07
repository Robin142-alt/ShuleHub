import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface UploadedBinaryFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class LocalDocumentStorageService {
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
    const relativeDirectory = join(input.tenantId, input.scope, year, month);
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
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
