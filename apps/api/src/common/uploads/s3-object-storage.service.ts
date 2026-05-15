import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

export interface ObjectStoragePutInput {
  tenantId: string;
  storagePath: string;
  mimeType: string;
  buffer: Buffer;
  now?: string;
}

export interface ObjectStorageGetInput {
  tenantId: string;
  storagePath: string;
  now?: string;
}

export interface ObjectStoragePutResult {
  provider: string;
  bucket: string;
  key: string;
  storage_path: string;
  sha256: string;
  etag?: string;
}

export interface ObjectStorageGetResult {
  content: Buffer;
  sha256: string;
}

export type ObjectStorageFetchInit = {
  method: 'PUT';
  headers: Record<string, string>;
  body: Buffer;
} | {
  method: 'GET';
  headers: Record<string, string>;
} | {
  method: 'DELETE';
  headers: Record<string, string>;
};

export interface ObjectStorageFetchResponse {
  ok: boolean;
  status: number;
  headers?: {
    get(name: string): string | null;
  };
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export type ObjectStorageFetch = (
  url: string,
  init: ObjectStorageFetchInit,
) => Promise<ObjectStorageFetchResponse>;

interface S3CompatibleObjectStorageConfig {
  provider: string;
  endpoint: URL;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

@Injectable()
export class S3CompatibleObjectStorageService {
  constructor(private readonly configService: ConfigService) {}

  async putObject(
    input: ObjectStoragePutInput,
    fetchImpl: ObjectStorageFetch = defaultObjectStorageFetch,
  ): Promise<ObjectStoragePutResult> {
    this.assertTenantScopedStoragePath(input.tenantId, input.storagePath);

    const config = this.resolveConfig();
    const payloadHash = createHash('sha256').update(input.buffer).digest('hex');
    const amzDate = formatAmzDate(input.now);
    const dateStamp = amzDate.slice(0, 8);
    const objectKey = input.storagePath.trim();
    const objectPath = `/${encodePathSegment(config.bucket)}/${encodeObjectKey(objectKey)}`;
    const url = `${config.endpoint.origin}${objectPath}`;
    const headers: Record<string, string> = {
      'Content-Type': normalizeMimeType(input.mimeType),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'x-amz-meta-tenant-id': input.tenantId.trim(),
    };

    headers.Authorization = signS3Request({
      method: 'PUT',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      dateStamp,
      amzDate,
      host: config.endpoint.host,
      canonicalUri: objectPath,
      headers,
      payloadHash,
    });

    let response: ObjectStorageFetchResponse;

    try {
      response = await fetchImpl(url, {
        method: 'PUT',
        headers,
        body: input.buffer,
      });
    } catch {
      throw new ServiceUnavailableException('Object storage upload failed');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Object storage upload failed');
    }

    const etag = normalizeEtag(response.headers?.get('etag') ?? undefined);
    const result: ObjectStoragePutResult = {
      provider: config.provider,
      bucket: config.bucket,
      key: objectKey,
      storage_path: objectKey,
      sha256: payloadHash,
    };

    if (etag) {
      result.etag = etag;
    }

    return result;
  }

  async getObject(
    input: ObjectStorageGetInput,
    fetchImpl: ObjectStorageFetch = defaultObjectStorageFetch,
  ): Promise<ObjectStorageGetResult> {
    this.assertTenantScopedStoragePath(input.tenantId, input.storagePath);

    const config = this.resolveConfig();
    const amzDate = formatAmzDate(input.now);
    const dateStamp = amzDate.slice(0, 8);
    const objectKey = input.storagePath.trim();
    const objectPath = `/${encodePathSegment(config.bucket)}/${encodeObjectKey(objectKey)}`;
    const url = `${config.endpoint.origin}${objectPath}`;
    const headers: Record<string, string> = {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': amzDate,
      'x-amz-meta-tenant-id': input.tenantId.trim(),
    };

    headers.Authorization = signS3Request({
      method: 'GET',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      dateStamp,
      amzDate,
      host: config.endpoint.host,
      canonicalUri: objectPath,
      headers,
      payloadHash: 'UNSIGNED-PAYLOAD',
    });

    let response: ObjectStorageFetchResponse;

    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers,
      });
    } catch {
      throw new ServiceUnavailableException('Object storage download failed');
    }

    if (!response.ok || !response.arrayBuffer) {
      throw new ServiceUnavailableException('Object storage download failed');
    }

    const content = Buffer.from(await response.arrayBuffer());

    return {
      content,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }

  async deleteObject(
    input: ObjectStorageGetInput,
    fetchImpl: ObjectStorageFetch = defaultObjectStorageFetch,
  ): Promise<void> {
    this.assertTenantScopedStoragePath(input.tenantId, input.storagePath);

    const config = this.resolveConfig();
    const amzDate = formatAmzDate(input.now);
    const dateStamp = amzDate.slice(0, 8);
    const objectKey = input.storagePath.trim();
    const objectPath = `/${encodePathSegment(config.bucket)}/${encodeObjectKey(objectKey)}`;
    const url = `${config.endpoint.origin}${objectPath}`;
    const headers: Record<string, string> = {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': amzDate,
      'x-amz-meta-tenant-id': input.tenantId.trim(),
    };

    headers.Authorization = signS3Request({
      method: 'DELETE',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      dateStamp,
      amzDate,
      host: config.endpoint.host,
      canonicalUri: objectPath,
      headers,
      payloadHash: 'UNSIGNED-PAYLOAD',
    });

    let response: ObjectStorageFetchResponse;

    try {
      response = await fetchImpl(url, {
        method: 'DELETE',
        headers,
      });
    } catch {
      throw new ServiceUnavailableException('Object storage delete failed');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('Object storage delete failed');
    }
  }

  private resolveConfig(): S3CompatibleObjectStorageConfig {
    const provider = (this.readConfig('UPLOAD_OBJECT_STORAGE_PROVIDER') ?? 's3').toLowerCase();

    if (provider !== 's3' && provider !== 'r2') {
      throw new BadRequestException('Unsupported upload object storage provider');
    }

    return {
      provider,
      endpoint: parseHttpsUrl(this.readConfig('UPLOAD_OBJECT_STORAGE_ENDPOINT')),
      bucket: parseBucketName(this.readConfig('UPLOAD_OBJECT_STORAGE_BUCKET')),
      region: this.readConfig('UPLOAD_OBJECT_STORAGE_REGION') ?? (provider === 'r2' ? 'auto' : 'us-east-1'),
      accessKeyId: requireConfigSecret(this.readConfig('UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID'), 'access key'),
      secretAccessKey: requireConfigSecret(this.readConfig('UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY'), 'secret key'),
    };
  }

  private readConfig(key: string): string | undefined {
    const value = this.configService.get<string | undefined>(key);

    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed || undefined;
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
}

const defaultObjectStorageFetch: ObjectStorageFetch = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.method === 'PUT' ? new Uint8Array(init.body) : undefined,
  });

  return {
    ok: response.ok,
    status: response.status,
    headers: {
      get: (name: string) => response.headers.get(name),
    },
    arrayBuffer: async () => response.arrayBuffer(),
  };
};

function signS3Request(input: {
  method: 'DELETE' | 'GET' | 'PUT';
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  dateStamp: string;
  amzDate: string;
  host: string;
  canonicalUri: string;
  headers: Record<string, string>;
  payloadHash: string;
}): string {
  const signingHeaders = {
    ...input.headers,
    host: input.host,
  };
  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(signingHeaders);
  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  const credentialScope = `${input.dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    input.amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const signingKey = getSignatureKey(input.secretAccessKey, input.dateStamp, input.region, 's3');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return [
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');
}

function canonicalizeHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    canonicalHeaders: entries.map(([name, value]) => `${name}:${value}\n`).join(''),
    signedHeaders: entries.map(([name]) => name).join(';'),
  };
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const dateRegionKey = createHmac('sha256', dateKey).update(region).digest();
  const dateRegionServiceKey = createHmac('sha256', dateRegionKey).update(service).digest();
  return createHmac('sha256', dateRegionServiceKey).update('aws4_request').digest();
}

function parseHttpsUrl(value: string | undefined): URL {
  try {
    const url = new URL(value ?? '');

    if (url.protocol !== 'https:') {
      throw new Error('Object storage endpoint must use HTTPS');
    }

    return url;
  } catch {
    throw new BadRequestException('Object storage endpoint must use HTTPS');
  }
}

function parseBucketName(value: string | undefined): string {
  const bucket = value?.trim();

  if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new BadRequestException('Object storage bucket name is invalid');
  }

  return bucket;
}

function requireConfigSecret(value: string | undefined, label: string): string {
  if (!value) {
    throw new BadRequestException(`Object storage ${label} is required`);
  }

  return value;
}

function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();

  if (!normalized) {
    throw new BadRequestException('Object storage upload requires a MIME type');
  }

  return normalized;
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeEtag(etag: string | undefined): string | undefined {
  const normalized = etag?.trim().replace(/^"|"$/g, '');
  return normalized || undefined;
}

function formatAmzDate(timestamp: string | undefined): string {
  const date = timestamp ? new Date(timestamp) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Object storage upload timestamp must be an ISO timestamp');
  }

  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(encodePathSegment).join('/');
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
