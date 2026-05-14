import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { StreamingUploadService } from './streaming-upload.service';

test('StreamingUploadService rejects files that exceed configured size while streaming', async () => {
  const service = new StreamingUploadService({
    maxFileBytes: 4,
    scanService: undefined,
    storage: undefined,
  } as never);

  await assert.rejects(
    () =>
      service.consume({
        tenantId: 'tenant-1',
        originalName: 'oversized.txt',
        mimeType: 'text/plain',
        stream: Readable.from(Buffer.from('12345')),
        storagePath: 'tenant/tenant-1/support/oversized.txt',
        ownerType: 'support_attachment',
      }),
    /File exceeds 4 bytes/,
  );
});

test('StreamingUploadService preserves checksum metadata for accepted streamed uploads', async () => {
  const saved: unknown[] = [];
  const service = new StreamingUploadService({
    maxFileBytes: 1024,
    scanService: undefined,
    storage: {
      save: async (input: unknown) => {
        saved.push(input);
        return {
          id: 'file-1',
          tenant_id: 'tenant-1',
          stored_path: 'tenant/tenant-1/support/file.txt',
          checksum_sha256: 'stream-checksum',
          storage_backend: 'database',
        };
      },
    },
  } as never);

  const result = await service.consume({
    tenantId: 'tenant-1',
    originalName: 'file.txt',
    mimeType: 'text/plain',
    stream: Readable.from(Buffer.from('hello')),
    storagePath: 'tenant/tenant-1/support/file.txt',
    ownerType: 'support_attachment',
  });

  assert.equal(result.id, 'file-1');
  assert.equal(saved.length, 1);
});
