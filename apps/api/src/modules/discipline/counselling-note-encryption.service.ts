import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedCounsellingNotePayload {
  encrypted_note: string;
  note_nonce: string;
  note_auth_tag: string;
}

@Injectable()
export class CounsellingNoteEncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    this.key = this.resolveKey(this.configService.get<string>('security.piiEncryptionKey') ?? '');
  }

  encrypt(note: string): EncryptedCounsellingNotePayload {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(note, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted_note: ciphertext.toString('base64'),
      note_nonce: nonce.toString('base64'),
      note_auth_tag: authTag.toString('base64'),
    };
  }

  decrypt(payload: EncryptedCounsellingNotePayload): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(payload.note_nonce, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(payload.note_auth_tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.encrypted_note, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private resolveKey(value: string): Buffer {
    const normalizedValue = value.trim();

    if (/^[0-9a-fA-F]{64}$/.test(normalizedValue)) {
      return Buffer.from(normalizedValue, 'hex');
    }

    const base64 = Buffer.from(normalizedValue, 'base64');

    if (base64.length === 32) {
      return base64;
    }

    const utf8 = Buffer.from(normalizedValue, 'utf8');

    if (utf8.length === 32) {
      return utf8;
    }

    throw new InternalServerErrorException(
      'Counselling note encryption key must be a 32-byte value encoded as base64, hex, or UTF-8 text',
    );
  }
}
