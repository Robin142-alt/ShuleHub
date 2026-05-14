import assert from 'node:assert/strict';
import test from 'node:test';

import { ReportArtifactStorageService } from './report-artifact-storage.service';

test('ReportArtifactStorageService stores tenant-scoped report artifacts and signed download tokens', async () => {
  const savedInputs: Array<Record<string, unknown>> = [];
  const service = new ReportArtifactStorageService({
    save: async (input: Record<string, unknown>) => {
      savedInputs.push(input);
      return {
        stored_path: input.storagePath,
        original_file_name: input.originalFileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        sha256: 'a'.repeat(64),
        storage_backend: 'database',
        retention_policy: 'reports',
        retention_expires_at: null,
      };
    },
    createSignedReadToken: (input: Record<string, unknown>) => ({
      token: `signed:${input.storagePath}`,
      storage_path: input.storagePath,
      expires_at: input.expiresAt,
    }),
  } as never);

  const stored = await service.storeArtifact({
    tenantId: 'tenant-a',
    module: 'billing',
    reportId: 'invoices',
    artifact: {
      filename: 'invoices.pdf',
      contentType: 'application/pdf',
      byteLength: 12,
      checksumSha256: 'b'.repeat(64),
      generatedAt: '2026-05-14T08:00:00.000Z',
      rowCount: 1,
      content: Buffer.from('pdf-content'),
    },
    actorUserId: 'user-1',
    signingSecret: 'download-secret',
    now: '2026-05-14T08:00:00.000Z',
  });

  assert.equal(savedInputs.length, 1);
  assert.equal(savedInputs[0].storagePath, `tenant/tenant-a/reports/billing/invoices/${'b'.repeat(64)}.pdf`);
  assert.equal(stored.download_token?.token, `signed:${savedInputs[0].storagePath}`);
});
