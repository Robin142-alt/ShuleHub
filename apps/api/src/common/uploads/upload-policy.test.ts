import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  runProviderMalwareScan,
  type ProviderMalwareScanFetch,
} from './malware-scan';
import { UploadMalwareScanService } from './upload-malware-scan.service';
import {
  MAX_UPLOAD_FILE_BYTES,
  UPLOAD_FORM_LIMITS,
  validateUploadedFile,
} from './upload-policy';

test('UPLOAD_FORM_LIMITS bounds multipart parser memory before application validation', () => {
  assert.deepEqual(UPLOAD_FORM_LIMITS, {
    fileSize: MAX_UPLOAD_FILE_BYTES,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
    parts: 25,
  });
});

test('validateUploadedFile accepts production support and admission document types', () => {
  assert.equal(
    validateUploadedFile({
      originalname: 'payment-callback.log',
      mimetype: 'text/plain',
      size: 512,
    }),
    undefined,
  );
  assert.equal(
    validateUploadedFile({
      originalname: 'fee-statement.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.7\n'),
    }),
    undefined,
  );
  assert.equal(
    validateUploadedFile({
      originalname: 'screenshot.png',
      mimetype: 'image/png',
      size: 2048,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }),
    undefined,
  );
});

test('validateUploadedFile rejects oversized uploads before they reach application services', () => {
  assert.throws(
    () =>
      validateUploadedFile({
        originalname: 'huge-diagnostic.zip',
        mimetype: 'application/zip',
        size: 10 * 1024 * 1024 + 1,
      }),
    /File exceeds the 10 MB upload limit/,
  );
});

test('validateUploadedFile rejects unsupported upload types even when the filename looks harmless', () => {
  assert.throws(
    () =>
      validateUploadedFile({
        originalname: 'report.pdf.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
      }),
    /Unsupported file type/,
  );
});

test('validateUploadedFile rejects unsafe original filenames before storage', () => {
  for (const originalname of [
    '../fee-statement.pdf',
    '..\\fee-statement.pdf',
    'C:\\temp\\fee-statement.pdf',
    'support/screenshot.png',
    'incident-note\u0000.txt',
    `${'a'.repeat(181)}.txt`,
  ]) {
    assert.throws(
      () =>
        validateUploadedFile({
          originalname,
          mimetype: 'text/plain',
          size: 512,
          buffer: Buffer.from('safe diagnostic note'),
        }),
      /Uploaded filename is not safe/,
    );
  }
});

test('validateUploadedFile rejects declared image/PDF types whose binary signature does not match', () => {
  assert.throws(
    () =>
      validateUploadedFile({
        originalname: 'screenshot.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('%PDF-1.7\n'),
      }),
    /File content does not match declared type/,
  );
});

test('validateUploadedFile rejects malware test signatures before storage', () => {
  assert.throws(
    () =>
      validateUploadedFile({
        originalname: 'incident-note.txt',
        mimetype: 'text/plain',
        size: 68,
        buffer: Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
      }),
    /malware screening/,
  );
});

test('validateUploadedFile accepts clean provider malware scan verdicts', () => {
  assert.equal(
    validateUploadedFile({
      originalname: 'fee-statement.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.7\nclean provider scanned document'),
      providerMalwareScan: {
        provider: 'clamav',
        status: 'clean',
        scannedAt: '2026-05-14T13:30:00.000Z',
      },
    }),
    undefined,
  );
});

test('validateUploadedFile rejects unsafe provider malware scan verdicts before storage', () => {
  assert.throws(
    () =>
      validateUploadedFile({
        originalname: 'incident-note.txt',
        mimetype: 'text/plain',
        size: 512,
        buffer: Buffer.from('provider scanned note'),
        providerMalwareScan: {
          provider: 'clamav',
          status: 'infected',
          signature: 'Win.Test.EICAR',
          scannedAt: '2026-05-14T13:30:00.000Z',
        },
      }),
    /provider malware scan rejected/i,
  );
});

test('runProviderMalwareScan posts upload content to the configured provider and returns clean verdicts', async () => {
  const content = Buffer.from('%PDF-1.7\nprovider scanned document');
  const requests: Array<{
    url: string;
    init: {
      method: 'POST';
      headers: Record<string, string>;
      body: string;
    };
  }> = [];

  const result = await runProviderMalwareScan({
    provider: 'webhook',
    apiUrl: 'https://scan.example.test/v1/files',
    apiToken: 'scan-secret-token',
    now: '2026-05-14T13:45:00.000Z',
    file: {
      originalname: 'fee-statement.pdf',
      mimetype: 'application/pdf',
      size: content.length,
      buffer: content,
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'clean',
          scan_id: 'scan-1',
          scanned_at: '2026-05-14T13:45:03.000Z',
        }),
      };
    },
  });

  assert.deepEqual(result, {
    provider: 'webhook',
    status: 'clean',
    scannedAt: '2026-05-14T13:45:03.000Z',
    scanId: 'scan-1',
  });
  assert.equal(requests.length, 1);

  const [{ url, init }] = requests;
  assert.equal(url, 'https://scan.example.test/v1/files');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer scan-secret-token');
  assert.equal(init.headers['Content-Type'], 'application/json');

  const body = JSON.parse(init.body) as {
    content_base64: string;
    filename: string;
    mime_type: string;
    sha256: string;
    size_bytes: number;
  };
  assert.deepEqual(body, {
    content_base64: content.toString('base64'),
    filename: 'fee-statement.pdf',
    mime_type: 'application/pdf',
    sha256: createHash('sha256').update(content).digest('hex'),
    size_bytes: content.length,
  });
  assert.equal(
    validateUploadedFile({
      originalname: 'fee-statement.pdf',
      mimetype: 'application/pdf',
      size: content.length,
      buffer: content,
      providerMalwareScan: result,
    }),
    undefined,
  );
});

test('runProviderMalwareScan returns unsafe verdicts when the provider reports infection', async () => {
  const content = Buffer.from('provider scanned support note');

  const result = await runProviderMalwareScan({
    provider: 'clamav',
    apiUrl: 'https://scan.example.test/v1/files',
    apiToken: 'scan-secret-token',
    now: '2026-05-14T13:50:00.000Z',
    file: {
      originalname: 'incident-note.txt',
      mimetype: 'text/plain',
      size: content.length,
      buffer: content,
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'infected',
        scanned_at: '2026-05-14T13:50:02.000Z',
        signature: 'Win.Test.EICAR',
      }),
    }),
  });

  assert.deepEqual(result, {
    provider: 'clamav',
    status: 'infected',
    scannedAt: '2026-05-14T13:50:02.000Z',
    signature: 'Win.Test.EICAR',
  });
  assert.throws(
    () =>
      validateUploadedFile({
        originalname: 'incident-note.txt',
        mimetype: 'text/plain',
        size: content.length,
        buffer: content,
        providerMalwareScan: result,
      }),
    /provider malware scan rejected/i,
  );
});

test('UploadMalwareScanService skips live scans when provider config is absent and scans are optional', async () => {
  const service = new UploadMalwareScanService({
    get: () => undefined,
  } as never);
  const fetchImpl: ProviderMalwareScanFetch = async () => {
    throw new Error('optional missing provider config should not call fetch');
  };

  const result = await service.scanIfConfigured(
    {
      originalname: 'incident-note.txt',
      mimetype: 'text/plain',
      size: 128,
      buffer: Buffer.from('support note'),
    },
    fetchImpl,
  );

  assert.equal(result, undefined);
});

test('UploadMalwareScanService invokes configured providers and returns clean verdicts', async () => {
  const content = Buffer.from('provider scanned support note');
  const env: Record<string, string> = {
    UPLOAD_MALWARE_SCAN_PROVIDER: 'clamav',
    UPLOAD_MALWARE_SCAN_API_URL: 'https://scan.example.test/v1/files',
    UPLOAD_MALWARE_SCAN_API_TOKEN: 'scan-secret-token',
  };
  const service = new UploadMalwareScanService({
    get: (key: string) => env[key],
  } as never);
  const calls: string[] = [];
  const fetchImpl: ProviderMalwareScanFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'clean',
        scan_id: 'scan-2',
        scanned_at: '2026-05-14T14:10:02.000Z',
      }),
    };
  };

  const result = await service.scanIfConfigured(
    {
      originalname: 'incident-note.txt',
      mimetype: 'text/plain',
      size: content.length,
      buffer: content,
    },
    fetchImpl,
  );

  assert.deepEqual(calls, ['https://scan.example.test/v1/files']);
  assert.deepEqual(result, {
    provider: 'clamav',
    status: 'clean',
    scannedAt: '2026-05-14T14:10:02.000Z',
    scanId: 'scan-2',
  });
});
