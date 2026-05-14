import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { DatabaseService } from '../../database/database.service';
import {
  S3CompatibleObjectStorageService,
  type ObjectStoragePutResult,
} from './s3-object-storage.service';

export interface StoredFileObject {
  stored_path: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_backend: 'database' | 'object_storage';
  retention_policy: string;
  retention_expires_at: string | null;
}

export interface StoredFileObjectRead extends StoredFileObject {
  content: Buffer;
}

export interface SignedFileObjectReadToken {
  token: string;
  storage_path: string;
  expires_at: string;
}

export interface ExpiredFileObjectPurgeResult {
  deleted_count: number;
  deleted_bytes: number;
  storage_paths: string[];
}

interface StoredFileObjectRow {
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: string | number;
  sha256: string;
  storage_backend?: string | null;
  object_storage_provider?: string | null;
  object_storage_bucket?: string | null;
  object_storage_key?: string | null;
  object_storage_etag?: string | null;
  retention_policy: string;
  retention_expires_at: string | null;
}

interface StoredFileObjectReadRow extends StoredFileObjectRow {
  content: Buffer | Uint8Array | null;
}

interface SignedFileObjectReadPayload {
  purpose: 'file_object.read';
  tenant_id: string;
  storage_path: string;
  actor_user_id: string | null;
  expires_at: string;
}

@Injectable()
export class DatabaseFileStorageService {
  constructor(
    private readonly databaseService: DatabaseService,
    @Optional() private readonly objectStorage?: S3CompatibleObjectStorageService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async save(input: {
    tenantId: string;
    storagePath: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
    metadata?: Record<string, unknown>;
    retentionPolicy?: string;
    retentionExpiresAt?: string | null;
  }): Promise<StoredFileObject> {
    this.assertTenantScopedStoragePath(input.tenantId, input.storagePath);

    const retentionPolicy = normalizeRetentionPolicy(input.retentionPolicy);
    const retentionExpiresAt = normalizeRetentionExpiry(input.retentionExpiresAt);
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');
    const objectStorage = await this.writeObjectStorageIfEnabled({
      tenantId: input.tenantId,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      buffer: input.buffer,
      sha256,
    });
    const storageBackend = objectStorage ? 'object_storage' : 'database';
    const metadata = objectStorage
      ? {
        ...(input.metadata ?? {}),
        object_storage: {
          provider: objectStorage.provider,
          bucket: objectStorage.bucket,
          key: objectStorage.key,
          etag: objectStorage.etag,
        },
      }
      : input.metadata ?? {};
    const result = await this.databaseService.query<StoredFileObjectRow>(
      `
        INSERT INTO file_objects (
          tenant_id,
          storage_path,
          original_file_name,
          mime_type,
          size_bytes,
          sha256,
          content,
          metadata,
          retention_policy,
          retention_expires_at,
          storage_backend,
          object_storage_provider,
          object_storage_bucket,
          object_storage_key,
          object_storage_etag
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15)
        RETURNING
          storage_path,
          original_file_name,
          mime_type,
          size_bytes,
          sha256,
          storage_backend,
          object_storage_provider,
          object_storage_bucket,
          object_storage_key,
          object_storage_etag,
          retention_policy,
          retention_expires_at::text
      `,
      [
        input.tenantId,
        input.storagePath,
        input.originalFileName,
        input.mimeType,
        input.sizeBytes,
        sha256,
        objectStorage ? null : input.buffer,
        JSON.stringify(metadata),
        retentionPolicy,
        retentionExpiresAt,
        storageBackend,
        objectStorage?.provider ?? null,
        objectStorage?.bucket ?? null,
        objectStorage?.key ?? null,
        objectStorage?.etag ?? null,
      ],
    );

    const row = result.rows[0];

    return mapStoredFileObjectRow(row);
  }

  createSignedReadToken(input: {
    tenantId: string;
    storagePath: string;
    actorUserId?: string | null;
    expiresAt: string;
    signingSecret: string;
  }): SignedFileObjectReadToken {
    const secret = requireSigningSecret(input.signingSecret);
    const tenantId = input.tenantId.trim();
    const storagePath = input.storagePath.trim();

    this.assertTenantScopedStoragePath(tenantId, storagePath);

    if (Number.isNaN(Date.parse(input.expiresAt))) {
      throw new BadRequestException('Signed file read token expiry must be an ISO timestamp');
    }

    const payload: SignedFileObjectReadPayload = {
      purpose: 'file_object.read',
      tenant_id: tenantId,
      storage_path: storagePath,
      actor_user_id: input.actorUserId?.trim() || null,
      expires_at: input.expiresAt,
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = signTokenPayload(encodedPayload, secret);

    return {
      token: `${encodedPayload}.${signature}`,
      storage_path: storagePath,
      expires_at: input.expiresAt,
    };
  }

  async readWithSignedToken(input: {
    tenantId: string;
    token: string;
    signingSecret: string;
    now?: string;
  }): Promise<StoredFileObjectRead> {
    const payload = verifySignedReadPayload(input.token, requireSigningSecret(input.signingSecret));
    const requestedTenantId = input.tenantId.trim();

    if (payload.tenant_id !== requestedTenantId) {
      throw new BadRequestException('Signed file read token must match the tenant-scoped storage path');
    }

    this.assertTenantScopedStoragePath(payload.tenant_id, payload.storage_path);

    const nowMs = input.now ? Date.parse(input.now) : Date.now();

    if (Number.isNaN(nowMs)) {
      throw new BadRequestException('Signed file read timestamp must be an ISO timestamp');
    }

    if (Date.parse(payload.expires_at) <= nowMs) {
      throw new BadRequestException('Signed file read token has expired');
    }

    const result = await this.databaseService.query<StoredFileObjectReadRow>(
      `
        SELECT
          storage_path,
          original_file_name,
          mime_type,
          size_bytes,
          sha256,
          content,
          storage_backend,
          object_storage_provider,
          object_storage_bucket,
          object_storage_key,
          object_storage_etag
        FROM file_objects
        WHERE tenant_id = $1
          AND storage_path = $2
        LIMIT 1
      `,
      [payload.tenant_id, payload.storage_path],
    );
    const row = result.rows[0];

    if (!row) {
      throw new BadRequestException('File object was not found');
    }

    const content = await this.readFileContent(row, payload.tenant_id, payload.storage_path);

    return {
      stored_path: row.storage_path,
      original_file_name: row.original_file_name,
      mime_type: row.mime_type,
      size_bytes: Number(row.size_bytes),
      sha256: row.sha256,
      storage_backend: normalizeStorageBackend(row.storage_backend),
      retention_policy: row.retention_policy,
      retention_expires_at: row.retention_expires_at,
      content,
    };
  }

  async purgeExpiredFileObjects(input: {
    now: string;
    batchSize?: number;
  }): Promise<ExpiredFileObjectPurgeResult> {
    const now = normalizeRetentionExpiry(input.now);

    if (!now) {
      throw new BadRequestException('A retention purge timestamp is required');
    }

    const batchSize = input.batchSize ?? 500;

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new BadRequestException('Retention purge batch size must be between 1 and 1000');
    }

    const result = await this.databaseService.query<{
      storage_path: string;
      size_bytes: string | number;
    }>(
      `
        WITH expired_file_objects AS (
          SELECT id
          FROM file_objects
          WHERE retention_expires_at IS NOT NULL
            AND retention_expires_at <= $1
          ORDER BY retention_expires_at ASC, created_at ASC
          LIMIT $2
        )
        DELETE FROM file_objects file_object
        USING expired_file_objects expired
        WHERE file_object.id = expired.id
        RETURNING file_object.storage_path, file_object.size_bytes
      `,
      [now, batchSize],
    );

    return {
      deleted_count: result.rows.length,
      deleted_bytes: result.rows.reduce((total, row) => total + Number(row.size_bytes), 0),
      storage_paths: result.rows.map((row) => row.storage_path),
    };
  }

  private assertTenantScopedStoragePath(tenantId: string, storagePath: string): void {
    const safeTenantId = tenantId.trim();
    const safeStoragePath = storagePath.trim();
    const expectedPrefix = `tenant/${safeTenantId}/`;
    const pathSegments = safeStoragePath.split('/');

    if (
      !safeTenantId
      || !safeStoragePath.startsWith(expectedPrefix)
      || safeStoragePath.startsWith('/')
      || safeStoragePath.includes('\\')
      || pathSegments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new BadRequestException('Uploaded file must use a tenant-scoped storage path');
    }
  }

  private async writeObjectStorageIfEnabled(input: {
    tenantId: string;
    storagePath: string;
    mimeType: string;
    buffer: Buffer;
    sha256: string;
  }): Promise<ObjectStoragePutResult | undefined> {
    if (!this.isObjectStorageEnabled()) {
      return undefined;
    }

    if (!this.objectStorage) {
      throw new BadRequestException('Object storage is enabled but not configured');
    }

    const stored = await this.objectStorage.putObject({
      tenantId: input.tenantId,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });

    if (stored.sha256 !== input.sha256) {
      throw new BadRequestException('Object storage upload checksum mismatch');
    }

    return stored;
  }

  private async readFileContent(
    row: StoredFileObjectReadRow,
    tenantId: string,
    storagePath: string,
  ): Promise<Buffer> {
    const storageBackend = normalizeStorageBackend(row.storage_backend);

    if (storageBackend === 'database') {
      if (!row.content) {
        throw new BadRequestException('File object content is missing');
      }

      return Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
    }

    if (!this.objectStorage) {
      throw new BadRequestException('Object storage reader is not configured');
    }

    const object = await this.objectStorage.getObject({
      tenantId,
      storagePath,
    });

    if (object.sha256 !== row.sha256) {
      throw new BadRequestException('File object checksum mismatch');
    }

    return object.content;
  }

  private isObjectStorageEnabled(): boolean {
    const value =
      this.configService?.get<boolean | string | undefined>('UPLOAD_OBJECT_STORAGE_ENABLED')
      ?? this.configService?.get<boolean | string | undefined>('uploads.objectStorageEnabled')
      ?? process.env.UPLOAD_OBJECT_STORAGE_ENABLED;

    return parseBooleanConfig(value);
  }
}

function mapStoredFileObjectRow(row: StoredFileObjectRow): StoredFileObject {
  return {
    stored_path: row.storage_path,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    storage_backend: normalizeStorageBackend(row.storage_backend),
    retention_policy: row.retention_policy,
    retention_expires_at: row.retention_expires_at,
  };
}

function normalizeStorageBackend(storageBackend: string | null | undefined): 'database' | 'object_storage' {
  return storageBackend === 'object_storage' ? 'object_storage' : 'database';
}

function parseBooleanConfig(value: boolean | string | undefined): boolean {
  if (value === true) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function verifySignedReadPayload(token: string, signingSecret: string): SignedFileObjectReadPayload {
  const [encodedPayload, signature, extra] = token.split('.');

  if (!encodedPayload || !signature || extra !== undefined) {
    throw new BadRequestException('Signed file read token is invalid');
  }

  const expectedSignature = signTokenPayload(encodedPayload, signingSecret);

  if (!safeEqual(signature, expectedSignature)) {
    throw new BadRequestException('Signed file read token is invalid');
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<SignedFileObjectReadPayload>;

    if (
      payload.purpose !== 'file_object.read'
      || !payload.tenant_id?.trim()
      || !payload.storage_path?.trim()
      || !payload.expires_at?.trim()
      || Number.isNaN(Date.parse(payload.expires_at))
    ) {
      throw new BadRequestException('Signed file read token is invalid');
    }

    return {
      purpose: 'file_object.read',
      tenant_id: payload.tenant_id,
      storage_path: payload.storage_path,
      actor_user_id: payload.actor_user_id?.trim() || null,
      expires_at: payload.expires_at,
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Signed file read token is invalid');
  }
}

function normalizeRetentionPolicy(retentionPolicy: string | undefined): string {
  const policy = retentionPolicy?.trim() || 'operational';

  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(policy)) {
    throw new BadRequestException('File retention policy must be a short policy identifier');
  }

  return policy;
}

function normalizeRetentionExpiry(retentionExpiresAt: string | null | undefined): string | null {
  if (retentionExpiresAt === undefined || retentionExpiresAt === null) {
    return null;
  }

  const expiresAt = retentionExpiresAt.trim();

  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
    throw new BadRequestException('File retention expiry must be an ISO timestamp');
  }

  return expiresAt;
}

function signTokenPayload(encodedPayload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(encodedPayload).digest('base64url');
}

function requireSigningSecret(signingSecret: string): string {
  const secret = signingSecret.trim();

  if (!secret) {
    throw new BadRequestException('A file object signing secret is required');
  }

  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
