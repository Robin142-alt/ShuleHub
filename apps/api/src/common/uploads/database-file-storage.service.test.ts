import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { DatabaseFileStorageService } from './database-file-storage.service';
import { FILE_OBJECT_STORAGE_SCHEMA_SQL } from './file-object-schema';
import { S3CompatibleObjectStorageService, type ObjectStorageFetch } from './s3-object-storage.service';

test('file object schema tracks retention policy and expiry for stored uploads', () => {
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /retention_policy text NOT NULL DEFAULT 'operational'/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /retention_expires_at timestamptz/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /ADD COLUMN IF NOT EXISTS retention_policy text NOT NULL DEFAULT 'operational'/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /CREATE INDEX IF NOT EXISTS ix_file_objects_retention_expiry/);
});

test('file object schema supports external object storage metadata without database content', () => {
  assert.doesNotMatch(FILE_OBJECT_STORAGE_SCHEMA_SQL, /content bytea NOT NULL/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /content bytea/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /storage_backend text NOT NULL DEFAULT 'database'/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /object_storage_provider text/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /object_storage_bucket text/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /object_storage_key text/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /object_storage_etag text/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /ck_file_objects_storage_backend/);
  assert.match(FILE_OBJECT_STORAGE_SCHEMA_SQL, /ck_file_objects_database_content/);
});

test('DatabaseFileStorageService stores tenant-scoped objects with a checksum', async () => {
  const buffer = Buffer.from('%PDF-1.7\nsupport diagnostic');
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const storage = new DatabaseFileStorageService({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });

      return {
        rows: [
          {
            storage_path: values[1],
            original_file_name: values[2],
            mime_type: values[3],
            size_bytes: values[4],
            sha256: values[5],
          },
        ],
      };
    },
  } as never);

  const stored = await storage.save({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
    originalFileName: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: buffer.length,
    buffer,
    metadata: { domain: 'support', ticket_id: 'ticket-1' },
  });

  assert.equal(stored.stored_path, 'tenant/tenant-a/support/ticket-1/file.pdf');
  assert.equal(stored.sha256, createHash('sha256').update(buffer).digest('hex'));
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO file_objects/);
  assert.equal(queries[0].values[0], 'tenant-a');
  assert.equal(queries[0].values[6], buffer);
  assert.deepEqual(JSON.parse(queries[0].values[7] as string), {
    domain: 'support',
    ticket_id: 'ticket-1',
  });
});

test('DatabaseFileStorageService writes enabled uploads to object storage and stores external metadata', async () => {
  const buffer = Buffer.from('%PDF-1.7\nexternal object storage upload');
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const objectStorageCalls: Array<Record<string, unknown>> = [];
  const storage = new DatabaseFileStorageService(
    {
      query: async (sql: string, values: unknown[]) => {
        queries.push({ sql, values });

        return {
          rows: [
            {
              storage_path: values[1],
              original_file_name: values[2],
              mime_type: values[3],
              size_bytes: values[4],
              sha256: values[5],
              retention_policy: values[8],
              retention_expires_at: values[9],
            },
          ],
        };
      },
    } as never,
    {
      putObject: async (input: Record<string, unknown>) => {
        objectStorageCalls.push(input);
        return {
          provider: 'r2',
          bucket: 'shule-hub-files',
          key: input.storagePath,
          storage_path: input.storagePath,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          etag: 'etag-1',
        };
      },
    } as never,
    {
      get: (key: string) => (key === 'UPLOAD_OBJECT_STORAGE_ENABLED' ? 'true' : undefined),
    } as never,
  );

  const stored = await storage.save({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
    originalFileName: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: buffer.length,
    buffer,
    metadata: { domain: 'support', ticket_id: 'ticket-1' },
  });

  assert.equal(stored.stored_path, 'tenant/tenant-a/support/ticket-1/file.pdf');
  assert.equal(objectStorageCalls.length, 1);
  assert.deepEqual(objectStorageCalls[0], {
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  assert.match(queries[0].sql, /object_storage_provider/);
  assert.equal(queries[0].values[6], null);
  assert.equal(queries[0].values[10], 'object_storage');
  assert.equal(queries[0].values[11], 'r2');
  assert.equal(queries[0].values[12], 'shule-hub-files');
  assert.equal(queries[0].values[13], 'tenant/tenant-a/support/ticket-1/file.pdf');
  assert.equal(queries[0].values[14], 'etag-1');
  assert.deepEqual(JSON.parse(queries[0].values[7] as string), {
    domain: 'support',
    ticket_id: 'ticket-1',
    object_storage: {
      provider: 'r2',
      bucket: 'shule-hub-files',
      key: 'tenant/tenant-a/support/ticket-1/file.pdf',
      etag: 'etag-1',
    },
  });
});

test('DatabaseFileStorageService stores retention metadata for tenant file objects', async () => {
  const buffer = Buffer.from('document retention');
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const storage = new DatabaseFileStorageService({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });

      return {
        rows: [
          {
            storage_path: values[1],
            original_file_name: values[2],
            mime_type: values[3],
            size_bytes: values[4],
            sha256: values[5],
            retention_policy: values[8],
            retention_expires_at: values[9],
          },
        ],
      };
    },
  } as never);

  const stored = await storage.save({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/admissions/birth-certificate.pdf',
    originalFileName: 'birth-certificate.pdf',
    mimeType: 'application/pdf',
    sizeBytes: buffer.length,
    buffer,
    metadata: { domain: 'admissions' },
    retentionPolicy: 'admissions-records',
    retentionExpiresAt: '2033-05-14T00:00:00.000Z',
  });

  assert.equal(stored.retention_policy, 'admissions-records');
  assert.equal(stored.retention_expires_at, '2033-05-14T00:00:00.000Z');
  assert.match(queries[0]?.sql ?? '', /retention_policy/);
  assert.match(queries[0]?.sql ?? '', /retention_expires_at/);
  assert.equal(queries[0]?.values[8], 'admissions-records');
  assert.equal(queries[0]?.values[9], '2033-05-14T00:00:00.000Z');
});

test('DatabaseFileStorageService rejects storage paths outside the tenant namespace', async () => {
  const storage = new DatabaseFileStorageService({
    query: async () => {
      throw new Error('file object should not be written');
    },
  } as never);

  await assert.rejects(
    () =>
      storage.save({
        tenantId: 'tenant-a',
        storagePath: 'tenant/tenant-b/support/ticket-1/file.pdf',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 8,
        buffer: Buffer.from('%PDF-1.7'),
      }),
    /tenant-scoped storage path/i,
  );

  await assert.rejects(
    () =>
      storage.save({
        tenantId: 'tenant-a',
        storagePath: 'tenant/tenant-a/support/../file.pdf',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 8,
        buffer: Buffer.from('%PDF-1.7'),
      }),
    /tenant-scoped storage path/i,
  );
});

test('DatabaseFileStorageService creates signed private read tokens and reads tenant file objects', async () => {
  const content = Buffer.from('%PDF-1.7\nprivate document');
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const storage = new DatabaseFileStorageService({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });

      return {
        rows: [
          {
            storage_path: values[1],
            original_file_name: 'document.pdf',
            mime_type: 'application/pdf',
            size_bytes: content.length,
            sha256: createHash('sha256').update(content).digest('hex'),
            content,
          },
        ],
      };
    },
  } as never);

  const signedRead = storage.createSignedReadToken({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/admissions/document.pdf',
    actorUserId: 'user-1',
    expiresAt: '2026-05-14T13:15:00.000Z',
    signingSecret: 'test-signing-secret',
  });
  const file = await storage.readWithSignedToken({
    tenantId: 'tenant-a',
    actorUserId: 'user-1',
    token: signedRead.token,
    signingSecret: 'test-signing-secret',
    now: '2026-05-14T13:00:00.000Z',
  });

  assert.equal(signedRead.expires_at, '2026-05-14T13:15:00.000Z');
  assert.equal(file.stored_path, 'tenant/tenant-a/admissions/document.pdf');
  assert.equal(file.original_file_name, 'document.pdf');
  assert.equal(file.content, content);
  assert.match(queries[0]?.sql ?? '', /FROM file_objects/);
  assert.match(queries[0]?.sql ?? '', /tenant_id = \$1/);
  assert.match(queries[0]?.sql ?? '', /storage_path = \$2/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    'tenant/tenant-a/admissions/document.pdf',
  ]);
});

test('DatabaseFileStorageService requires actor binding when minting signed private read tokens', () => {
  const storage = new DatabaseFileStorageService({
    query: async () => {
      throw new Error('token creation should not query');
    },
  } as never);

  assert.throws(
    () =>
      storage.createSignedReadToken({
        tenantId: 'tenant-a',
        storagePath: 'tenant/tenant-a/admissions/document.pdf',
        expiresAt: '2026-05-14T13:15:00.000Z',
        signingSecret: 'test-signing-secret',
      }),
    /require an actor user/i,
  );
});

test('DatabaseFileStorageService reads signed external object storage files through the adapter', async () => {
  const content = Buffer.from('%PDF-1.7\nexternal private document');
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const objectReads: Array<Record<string, unknown>> = [];
  const storage = new DatabaseFileStorageService(
    {
      query: async (sql: string, values: unknown[]) => {
        queries.push({ sql, values });

        return {
          rows: [
            {
              storage_path: values[1],
              original_file_name: 'document.pdf',
              mime_type: 'application/pdf',
              size_bytes: content.length,
              sha256: createHash('sha256').update(content).digest('hex'),
              content: null,
              storage_backend: 'object_storage',
              object_storage_provider: 'r2',
              object_storage_bucket: 'shule-hub-files',
              object_storage_key: values[1],
            },
          ],
        };
      },
    } as never,
    {
      getObject: async (input: Record<string, unknown>) => {
        objectReads.push(input);
        return {
          content,
          sha256: createHash('sha256').update(content).digest('hex'),
        };
      },
    } as never,
    undefined,
  );
  const token = storage.createSignedReadToken({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/admissions/document.pdf',
    actorUserId: 'user-1',
    expiresAt: '2026-05-14T13:15:00.000Z',
    signingSecret: 'test-signing-secret',
  }).token;

  const file = await storage.readWithSignedToken({
    tenantId: 'tenant-a',
    actorUserId: 'user-1',
    token,
    signingSecret: 'test-signing-secret',
    now: '2026-05-14T13:00:00.000Z',
  });

  assert.deepEqual(objectReads, [
    {
      tenantId: 'tenant-a',
      storagePath: 'tenant/tenant-a/admissions/document.pdf',
    },
  ]);
  assert.equal(file.content, content);
  assert.match(queries[0]?.sql ?? '', /storage_backend/);
  assert.match(queries[0]?.sql ?? '', /object_storage_key/);
});

test('DatabaseFileStorageService rejects external object storage reads with checksum mismatches', async () => {
  const storage = new DatabaseFileStorageService(
    {
      query: async (_sql: string, values: unknown[]) => ({
        rows: [
          {
            storage_path: values[1],
            original_file_name: 'document.pdf',
            mime_type: 'application/pdf',
            size_bytes: 8,
            sha256: createHash('sha256').update('expected').digest('hex'),
            content: null,
            storage_backend: 'object_storage',
            object_storage_provider: 'r2',
            object_storage_bucket: 'shule-hub-files',
            object_storage_key: values[1],
          },
        ],
      }),
    } as never,
    {
      getObject: async () => ({
        content: Buffer.from('tampered'),
        sha256: createHash('sha256').update('tampered').digest('hex'),
      }),
    } as never,
    undefined,
  );
  const token = storage.createSignedReadToken({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/admissions/document.pdf',
    actorUserId: 'user-1',
    expiresAt: '2026-05-14T13:15:00.000Z',
    signingSecret: 'test-signing-secret',
  }).token;

  await assert.rejects(
    () =>
      storage.readWithSignedToken({
        tenantId: 'tenant-a',
        actorUserId: 'user-1',
        token,
        signingSecret: 'test-signing-secret',
        now: '2026-05-14T13:00:00.000Z',
      }),
    /checksum/i,
  );
});

test('DatabaseFileStorageService rejects expired or tenant-mismatched signed read tokens before querying', async () => {
  let queryCount = 0;
  const storage = new DatabaseFileStorageService({
    query: async () => {
      queryCount += 1;
      throw new Error('expired or mismatched token should not read');
    },
  } as never);
  const token = storage.createSignedReadToken({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
    actorUserId: 'user-1',
    expiresAt: '2026-05-14T13:15:00.000Z',
    signingSecret: 'test-signing-secret',
  }).token;

  await assert.rejects(
    () =>
      storage.readWithSignedToken({
        tenantId: 'tenant-a',
        actorUserId: 'user-1',
        token,
        signingSecret: 'test-signing-secret',
        now: '2026-05-14T13:16:00.000Z',
      }),
    /expired/i,
  );

  await assert.rejects(
    () =>
      storage.readWithSignedToken({
        tenantId: 'tenant-b',
        actorUserId: 'user-1',
        token,
        signingSecret: 'test-signing-secret',
        now: '2026-05-14T13:00:00.000Z',
      }),
    /tenant-scoped/i,
  );
  assert.equal(queryCount, 0);
});

test('DatabaseFileStorageService rejects actor-mismatched signed read tokens before querying', async () => {
  let queryCount = 0;
  const storage = new DatabaseFileStorageService({
    query: async () => {
      queryCount += 1;
      throw new Error('actor-mismatched token should not read');
    },
  } as never);
  const token = storage.createSignedReadToken({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/private-note.pdf',
    actorUserId: 'user-1',
    expiresAt: '2026-05-14T13:15:00.000Z',
    signingSecret: 'test-signing-secret',
  }).token;

  await assert.rejects(
    () =>
      storage.readWithSignedToken({
        tenantId: 'tenant-a',
        actorUserId: 'user-2',
        token,
        signingSecret: 'test-signing-secret',
        now: '2026-05-14T13:00:00.000Z',
      }),
    /does not belong to this actor/i,
  );
  assert.equal(queryCount, 0);
});

test('DatabaseFileStorageService purges expired file objects in bounded batches', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const storage = new DatabaseFileStorageService({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });

      return {
        rows: [
          {
            storage_path: 'tenant/tenant-a/support/old-1.pdf',
            size_bytes: '12',
          },
          {
            storage_path: 'tenant/tenant-a/support/old-2.pdf',
            size_bytes: 8,
          },
        ],
      };
    },
  } as never);

  const result = await storage.purgeExpiredFileObjects({
    now: '2026-05-14T13:30:00.000Z',
    batchSize: 50,
  });

  assert.deepEqual(result, {
    deleted_count: 2,
    deleted_bytes: 20,
    storage_paths: [
      'tenant/tenant-a/support/old-1.pdf',
      'tenant/tenant-a/support/old-2.pdf',
    ],
  });
  assert.match(queries[0]?.sql ?? '', /WITH expired_file_objects AS/);
  assert.match(queries[0]?.sql ?? '', /DELETE FROM file_objects/);
  assert.match(queries[0]?.sql ?? '', /retention_expires_at <= \$1/);
  assert.match(queries[0]?.sql ?? '', /LIMIT \$2/);
  assert.deepEqual(queries[0]?.values, ['2026-05-14T13:30:00.000Z', 50]);
});

test('S3CompatibleObjectStorageService stores tenant-scoped objects with signed PUT requests', async () => {
  const buffer = Buffer.from('%PDF-1.7\ns3 compatible upload');
  const env: Record<string, string> = {
    UPLOAD_OBJECT_STORAGE_PROVIDER: 'r2',
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
    UPLOAD_OBJECT_STORAGE_REGION: 'auto',
    UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
  };
  const requests: Array<{
    url: string;
    init: Parameters<ObjectStorageFetch>[1];
  }> = [];
  const storage = new S3CompatibleObjectStorageService({
    get: (key: string) => env[key],
  } as never);
  const fetchImpl: ObjectStorageFetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'etag' ? '"etag-1"' : null),
      },
    };
  };

  const stored = await storage.putObject({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
    mimeType: 'application/pdf',
    buffer,
    now: '2026-05-14T14:45:00.000Z',
  }, fetchImpl);

  assert.deepEqual(stored, {
    provider: 'r2',
    bucket: 'shule-hub-files',
    key: 'tenant/tenant-a/support/ticket-1/file.pdf',
    storage_path: 'tenant/tenant-a/support/ticket-1/file.pdf',
    sha256: createHash('sha256').update(buffer).digest('hex'),
    etag: 'etag-1',
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://objects.example.test/shule-hub-files/tenant/tenant-a/support/ticket-1/file.pdf');
  assert.equal(requests[0].init.method, 'PUT');
  assert.equal(requests[0].init.body, buffer);
  assert.equal(requests[0].init.headers['Content-Type'], 'application/pdf');
  assert.equal(requests[0].init.headers['x-amz-content-sha256'], stored.sha256);
  assert.equal(requests[0].init.headers['x-amz-date'], '20260514T144500Z');
  assert.match(
    requests[0].init.headers.Authorization,
    /^AWS4-HMAC-SHA256 Credential=access-key\/20260514\/auto\/s3\/aws4_request, SignedHeaders=/,
  );
  assert.doesNotMatch(requests[0].init.headers.Authorization, /secret-key/);
});

test('S3CompatibleObjectStorageService rejects object keys outside the tenant namespace before upload', async () => {
  const env: Record<string, string> = {
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
    UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
  };
  const storage = new S3CompatibleObjectStorageService({
    get: (key: string) => env[key],
  } as never);
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      storage.putObject(
        {
          tenantId: 'tenant-a',
          storagePath: 'tenant/tenant-b/support/ticket-1/file.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7\nwrong tenant'),
          now: '2026-05-14T14:45:00.000Z',
        },
        async () => {
          fetchCalls += 1;
          throw new Error('cross-tenant upload should not reach object storage');
        },
      ),
    /tenant-scoped storage path/i,
  );
  assert.equal(fetchCalls, 0);
});

test('S3CompatibleObjectStorageService deletes tenant-scoped objects with signed DELETE requests', async () => {
  const env: Record<string, string> = {
    UPLOAD_OBJECT_STORAGE_PROVIDER: 'r2',
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
    UPLOAD_OBJECT_STORAGE_REGION: 'auto',
    UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
  };
  const requests: Array<{
    url: string;
    init: Parameters<ObjectStorageFetch>[1];
  }> = [];
  const storage = new S3CompatibleObjectStorageService({
    get: (key: string) => env[key],
  } as never);

  await storage.deleteObject({
    tenantId: 'tenant-a',
    storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
    now: '2026-05-14T14:45:00.000Z',
  }, async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 204,
    };
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://objects.example.test/shule-hub-files/tenant/tenant-a/support/ticket-1/file.pdf');
  assert.equal(requests[0].init.method, 'DELETE');
  assert.equal(requests[0].init.headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
  assert.equal(requests[0].init.headers['x-amz-date'], '20260514T144500Z');
  assert.match(
    requests[0].init.headers.Authorization,
    /^AWS4-HMAC-SHA256 Credential=access-key\/20260514\/auto\/s3\/aws4_request, SignedHeaders=/,
  );
  assert.doesNotMatch(requests[0].init.headers.Authorization, /secret-key/);
});

test('S3CompatibleObjectStorageService rejects object keys outside the tenant namespace before delete', async () => {
  const env: Record<string, string> = {
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
    UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
  };
  const storage = new S3CompatibleObjectStorageService({
    get: (key: string) => env[key],
  } as never);
  let fetchCalls = 0;

  await assert.rejects(
    () =>
      storage.deleteObject(
        {
          tenantId: 'tenant-a',
          storagePath: 'tenant/tenant-b/support/ticket-1/file.pdf',
          now: '2026-05-14T14:45:00.000Z',
        },
        async () => {
          fetchCalls += 1;
          throw new Error('cross-tenant delete should not reach object storage');
        },
      ),
    /tenant-scoped storage path/i,
  );
  assert.equal(fetchCalls, 0);
});

test('S3CompatibleObjectStorageService reports failed object deletes as unavailable', async () => {
  const env: Record<string, string> = {
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
    UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
  };
  const storage = new S3CompatibleObjectStorageService({
    get: (key: string) => env[key],
  } as never);

  await assert.rejects(
    () =>
      storage.deleteObject(
        {
          tenantId: 'tenant-a',
          storagePath: 'tenant/tenant-a/support/ticket-1/file.pdf',
          now: '2026-05-14T14:45:00.000Z',
        },
        async () => ({
          ok: false,
          status: 503,
        }),
      ),
    /Object storage delete failed/,
  );
});
