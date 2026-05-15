import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runProviderCredentialSmoke,
  validateProviderCredentialEnvironment,
} from './provider-credential-smoke';

const configuredEnvironment = {
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_test_123456789',
  EMAIL_PROVIDER_SMOKE_URL: 'https://email.example.test/health',
  EMAIL_FROM: 'Shule Hub <support@shulehub.test>',
  PUBLIC_APP_URL: 'https://shule-hub-erp.example.test',
  SUPPORT_NOTIFICATION_EMAILS: 'support@shulehub.test,ops@shulehub.test',
  SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL: 'https://sms.example.test/hooks/shulehub',
  SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL: 'https://sms.example.test/health',
  SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN: 'sms-secret-token',
  SUPPORT_NOTIFICATION_SMS_RECIPIENTS: '+254700000001,+254700000002',
  SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS: 'true',
  SUPPORT_NOTIFICATION_RETRY_WORKER_ENABLED: 'true',
  SUPPORT_NOTIFICATION_MAX_ATTEMPTS: '3',
  SUPPORT_NOTIFICATION_RETRY_INTERVAL_MS: '60000',
  SUPPORT_NOTIFICATION_RETRY_BATCH_SIZE: '50',
  SUPPORT_NOTIFICATION_RETRY_LEASE_MS: '300000',
  UPLOAD_MALWARE_SCAN_PROVIDER: 'clamav',
  UPLOAD_MALWARE_SCAN_API_URL: 'https://scan.example.test/v1/files',
  UPLOAD_MALWARE_SCAN_HEALTH_URL: 'https://scan.example.test/health',
  UPLOAD_MALWARE_SCAN_API_TOKEN: 'scan-secret-token',
  UPLOAD_MALWARE_SCAN_REQUIRED: 'true',
  UPLOAD_OBJECT_STORAGE_ENABLED: 'true',
  UPLOAD_OBJECT_STORAGE_PROVIDER: 'r2',
  UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
  UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
  UPLOAD_OBJECT_STORAGE_REGION: 'auto',
  UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'object-access-key',
  UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'object-secret-key',
};

test('provider credential smoke check passes configured channels without exposing secrets', async () => {
  const result = await runProviderCredentialSmoke({
    env: configuredEnvironment,
    requireSms: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.checks.some((check) => check.id === 'transactional-email'), true);
  assert.equal(result.checks.some((check) => check.id === 'support-sms'), true);
  assert.equal(result.checks.some((check) => check.id === 'upload-malware-scan'), true);
  assert.equal(result.checks.some((check) => check.id === 'upload-object-storage'), true);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(configuredEnvironment.RESEND_API_KEY), false);
  assert.equal(serialized.includes(configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN), false);
  assert.equal(serialized.includes(configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_MALWARE_SCAN_API_TOKEN), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_MALWARE_SCAN_API_URL), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_OBJECT_STORAGE_ENDPOINT), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY), false);
});

test('provider credential smoke live checks probe SMS and malware health without exposing secrets', async () => {
  const probedUrls: string[] = [];
  const result = await runProviderCredentialSmoke({
    env: configuredEnvironment,
    requireSms: true,
    live: true,
    fetchImpl: async (url, init) => {
      probedUrls.push(url);
      assert.equal(init.method, 'GET');
      assert.equal(init.headers.Authorization.startsWith('Bearer '), true);
      return {
        ok: true,
        status: 200,
        text: async () => (
          url === configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL
            ? JSON.stringify({
              status: 'ok',
              dry_run: false,
              provider_configured: true,
              provider_ready: true,
            })
            : 'ok'
        ),
      };
    },
    objectStorageFetchImpl: async (_url, init) => {
      if (init.method === 'GET') {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Uint8Array.from(Buffer.from('shule-hub-provider-smoke')).buffer,
        };
      }

      return {
        ok: true,
        status: init.method === 'DELETE' ? 204 : 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'etag' ? '"provider-smoke-etag"' : null),
        },
      };
    },
  });

  assert.equal(
    result.checks.find((check) => check.id === 'live-support-sms-provider')?.status,
    'pass',
  );
  assert.equal(
    result.checks.find((check) => check.id === 'live-upload-malware-scan-provider')?.status,
    'pass',
  );
  assert.deepEqual(probedUrls, [
    configuredEnvironment.EMAIL_PROVIDER_SMOKE_URL ?? '',
    configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL,
    configuredEnvironment.UPLOAD_MALWARE_SCAN_HEALTH_URL,
  ].filter(Boolean));

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL), false);
  assert.equal(serialized.includes(configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_MALWARE_SCAN_HEALTH_URL), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_MALWARE_SCAN_API_TOKEN), false);
});

test('provider credential smoke live SMS check fails when relay is still in dry-run mode', async () => {
  const result = await runProviderCredentialSmoke({
    env: configuredEnvironment,
    requireSms: true,
    live: true,
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => (
        url === configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL
          ? JSON.stringify({
            status: 'ok',
            dry_run: true,
            provider_configured: false,
            provider_ready: false,
          })
          : 'ok'
      ),
    }),
    objectStorageFetchImpl: async (_url, init) => {
      if (init.method === 'GET') {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Uint8Array.from(Buffer.from('shule-hub-provider-smoke')).buffer,
        };
      }

      return {
        ok: true,
        status: init.method === 'DELETE' ? 204 : 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'etag' ? '"provider-smoke-etag"' : null),
        },
      };
    },
  });

  const smsCheck = result.checks.find((check) => check.id === 'live-support-sms-provider');

  assert.equal(result.ok, false);
  assert.equal(smsCheck?.status, 'fail');
  assert.match(smsCheck?.message ?? '', /dry-run mode/);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL), false);
  assert.equal(serialized.includes(configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN), false);
});

test('provider credential smoke live checks fail when required malware health URL is missing', async () => {
  const result = await runProviderCredentialSmoke({
    env: {
      ...configuredEnvironment,
      UPLOAD_MALWARE_SCAN_HEALTH_URL: '',
    },
    requireSms: true,
    live: true,
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => (
        url === configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL
          ? JSON.stringify({
            status: 'ok',
            dry_run: false,
            provider_configured: true,
            provider_ready: true,
          })
          : 'ok'
      ),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((check) => check.id === 'live-upload-malware-scan-provider')?.message,
    'UPLOAD_MALWARE_SCAN_HEALTH_URL is required when live upload malware scan smoke checks are enabled.',
  );
});

test('provider credential smoke live object storage writes reads and deletes tenant-scoped probe object', async () => {
  const objectRequests: Array<{ method: string; body?: Buffer }> = [];
  const expectedContent = Buffer.from('placeholder');
  let uploadedContent: Buffer = expectedContent;
  const result = await runProviderCredentialSmoke({
    env: configuredEnvironment,
    requireSms: true,
    live: true,
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => (
        url === configuredEnvironment.SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL
          ? JSON.stringify({
            status: 'ok',
            dry_run: false,
            provider_configured: true,
            provider_ready: true,
          })
          : 'ok'
      ),
    }),
    objectStorageFetchImpl: async (_url, init) => {
      objectRequests.push({
        method: init.method,
        body: init.method === 'PUT' ? init.body : undefined,
      });

      if (init.method === 'PUT') {
        uploadedContent = init.body;
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'etag' ? '"provider-smoke-etag"' : null),
          },
        };
      }

      if (init.method === 'GET') {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Uint8Array.from(uploadedContent).buffer,
        };
      }

      return {
        ok: true,
        status: 204,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.find((check) => check.id === 'live-upload-object-storage')?.status,
    'pass',
  );
  assert.deepEqual(objectRequests.map((request) => request.method), ['PUT', 'GET', 'DELETE']);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_OBJECT_STORAGE_ENDPOINT), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID), false);
  assert.equal(serialized.includes(configuredEnvironment.UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY), false);
});

test('provider credential validation fails when transactional email is incomplete', () => {
  const errors = validateProviderCredentialEnvironment({
    ...configuredEnvironment,
    RESEND_API_KEY: '',
  });

  assert.deepEqual(errors, [
    'RESEND_API_KEY is required for transactional email.',
  ]);
});

test('provider credential validation requires SMS settings to be complete when SMS is required', () => {
  const errors = validateProviderCredentialEnvironment(
    {
      ...configuredEnvironment,
      SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN: '',
      SUPPORT_NOTIFICATION_SMS_RECIPIENTS: '',
    },
    { requireSms: true },
  );

  assert.deepEqual(errors, [
    'SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN is required when support SMS smoke checks are enabled.',
    'SUPPORT_NOTIFICATION_SMS_RECIPIENTS must contain at least one recipient when support SMS smoke checks are enabled.',
  ]);
});

test('provider credential validation rejects retired attendance notification targets', () => {
  const errors = validateProviderCredentialEnvironment({
    ...configuredEnvironment,
    SUPPORT_NOTIFICATION_EMAILS: 'attendance@shulehub.test',
  });

  assert.deepEqual(errors, [
    'Provider smoke configuration references retired attendance functionality.',
  ]);
});

test('provider credential validation requires complete upload malware scan provider settings', () => {
  const errors = validateProviderCredentialEnvironment({
    ...configuredEnvironment,
    UPLOAD_MALWARE_SCAN_API_TOKEN: '',
  });

  assert.deepEqual(errors, [
    'UPLOAD_MALWARE_SCAN_API_TOKEN is required when upload malware scan smoke checks are enabled.',
  ]);
});

test('provider credential validation requires complete object storage settings when enabled', () => {
  const errors = validateProviderCredentialEnvironment({
    ...configuredEnvironment,
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'http://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: '',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: '',
  });

  assert.deepEqual(errors, [
    'UPLOAD_OBJECT_STORAGE_ENDPOINT must be an HTTPS URL when upload object storage is enabled.',
    'UPLOAD_OBJECT_STORAGE_BUCKET is required when upload object storage is enabled.',
    'UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY is required when upload object storage is enabled.',
  ]);
});
