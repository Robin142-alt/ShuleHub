import { BadRequestException } from '@nestjs/common';

import {
  assertUploadedFileIsMalwareFree,
  type ProviderMalwareScanResult,
} from './malware-scan';

export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILENAME_LENGTH = 180;
export const MAX_UPLOAD_FIELD_BYTES = 64 * 1024;
export const MAX_UPLOAD_FIELDS = 20;
export const MAX_UPLOAD_PARTS = 25;

export const UPLOAD_FORM_LIMITS = {
  fileSize: MAX_UPLOAD_FILE_BYTES,
  files: 1,
  fields: MAX_UPLOAD_FIELDS,
  fieldSize: MAX_UPLOAD_FIELD_BYTES,
  parts: MAX_UPLOAD_PARTS,
};

const ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.jpeg',
  '.jpg',
  '.json',
  '.log',
  '.pdf',
  '.png',
  '.txt',
  '.webp',
  '.xls',
  '.xlsx',
]);

const UNSAFE_FILENAME_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/;

export interface UploadFileMetadata {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  providerMalwareScan?: ProviderMalwareScanResult;
}

export function validateUploadedFile(file: UploadFileMetadata): void {
  assertSafeOriginalName(file.originalname);

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new BadRequestException('File exceeds the 10 MB upload limit');
  }

  const extension = getLowerExtension(file.originalname);
  const mimeType = file.mimetype.trim().toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mimeType) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException('Unsupported file type');
  }

  if (file.buffer && !matchesDeclaredContent(extension, mimeType, file.buffer)) {
    throw new BadRequestException('File content does not match declared type');
  }

  assertUploadedFileIsMalwareFree(file);
}

export function supportFileFilter(
  _request: unknown,
  file: UploadFileMetadata,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  try {
    validateUploadedFile({ ...file, size: 0 });
    callback(null, true);
  } catch (error) {
    callback(error as Error, false);
  }
}

function getLowerExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

function assertSafeOriginalName(originalname: string): void {
  const filename = originalname?.trim();

  if (!filename) {
    throw new BadRequestException('Uploaded file must have a filename');
  }

  if (
    filename.length > MAX_UPLOAD_FILENAME_LENGTH
    || filename === '.'
    || filename === '..'
    || filename.startsWith('..')
    || /^[a-zA-Z]:/.test(filename)
    || UNSAFE_FILENAME_CHARACTERS.test(filename)
  ) {
    throw new BadRequestException('Uploaded filename is not safe');
  }
}

function matchesDeclaredContent(extension: string, mimeType: string, buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  if (mimeType === 'image/png' || extension === '.png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === 'image/jpeg' || extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === 'image/webp' || extension === '.webp') {
    return (
      buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  if (isZipBackedDocument(extension, mimeType)) {
    return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  }

  if (extension === '.doc' || mimeType === 'application/msword') {
    return buffer.length >= 4
      && buffer[0] === 0xd0
      && buffer[1] === 0xcf
      && buffer[2] === 0x11
      && buffer[3] === 0xe0;
  }

  if (isTextBackedDocument(extension, mimeType)) {
    return !buffer.includes(0x00);
  }

  return true;
}

function isZipBackedDocument(extension: string, mimeType: string): boolean {
  return (
    extension === '.docx'
    || extension === '.xlsx'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function isTextBackedDocument(extension: string, mimeType: string): boolean {
  return (
    extension === '.csv'
    || extension === '.json'
    || extension === '.log'
    || extension === '.txt'
    || mimeType === 'application/json'
    || mimeType === 'text/csv'
    || mimeType === 'text/plain'
  );
}
