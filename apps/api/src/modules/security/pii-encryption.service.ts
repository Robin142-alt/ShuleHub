import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENCRYPTION_PREFIX = 'enc:v1';
const IV_LENGTH_BYTES = 12;

@Injectable()
export class PiiEncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    this.encryptionKey = this.resolveEncryptionKey(
      this.configService.get<string>('security.piiEncryptionKey') ?? '',
    );
  }

  encrypt(value: string, aad?: string): string {
    if (this.isEncrypted(value)) {
      return value;
    }

    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    if (aad) {
      cipher.setAAD(Buffer.from(aad, 'utf8'));
    }

    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      ENCRYPTION_PREFIX,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(value: string, aad?: string): string {
    if (!this.isEncrypted(value)) {
      return value;
    }

    const [, version, ivBase64, authTagBase64, ciphertextBase64] = value.split(':');

    if (version !== 'v1' || !ivBase64 || !authTagBase64 || !ciphertextBase64) {
      throw new InternalServerErrorException('Encrypted PII payload is malformed');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivBase64, 'base64'),
    );

    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf8'));
    }

    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  encryptNullable(value: string | null | undefined, aad?: string): string | null {
    if (value == null) {
      return null;
    }

    return this.encrypt(value, aad);
  }

  decryptNullable(value: string | null | undefined, aad?: string): string | null {
    if (value == null) {
      return null;
    }

    return this.decrypt(value, aad);
  }

  isEncrypted(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith(`${ENCRYPTION_PREFIX}:`);
  }

  maskPhoneNumber(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const digitsOnly = value.replace(/\D/g, '');

    if (digitsOnly.length <= 4) {
      return '*'.repeat(digitsOnly.length);
    }

    return `${digitsOnly.slice(0, 4)}${'*'.repeat(Math.max(0, digitsOnly.length - 6))}${digitsOnly.slice(-2)}`;
  }

  private resolveEncryptionKey(value: string): Buffer {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new InternalServerErrorException('PII encryption key is not configured');
    }

    if (/^[0-9a-fA-F]{64}$/.test(normalizedValue)) {
      return Buffer.from(normalizedValue, 'hex');
    }

    const base64Key = Buffer.from(normalizedValue, 'base64');

    if (base64Key.length === 32) {
      return base64Key;
    }

    const utf8Key = Buffer.from(normalizedValue, 'utf8');

    if (utf8Key.length === 32) {
      return utf8Key;
    }

    throw new InternalServerErrorException(
      'PII encryption key must be a 32-byte value encoded as base64, hex, or UTF-8 text',
    );
  }
}
