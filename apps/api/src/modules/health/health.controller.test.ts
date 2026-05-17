import assert from 'node:assert/strict';
import test from 'node:test';

import { HealthController } from './health.controller';

test('HealthController readiness surfaces transactional email configuration without secrets', async () => {
  const controller = new HealthController(
    {
      requireStore: () => ({
        request_id: 'req-health',
        tenant_id: 'green-valley',
        user_id: 'system',
        role: 'system',
        session_id: null,
        is_authenticated: false,
      }),
    } as never,
    {
      ping: async () => 'up',
      getPoolMetrics: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as never,
    { ping: async () => 'up' } as never,
    undefined,
    undefined,
    {
      getTransactionalEmailStatus: () => ({
        provider: 'resend',
        status: 'configured',
        api_key_configured: true,
        sender_configured: true,
        public_app_url_configured: true,
      }),
    } as never,
  );

  const readiness = await controller.getReadiness();

  assert.equal(readiness.services.transactional_email, 'configured');
  assert.deepEqual(readiness.email, {
    provider: 'resend',
    status: 'configured',
    api_key_configured: true,
    sender_configured: true,
    public_app_url_configured: true,
  });
  assert.equal(JSON.stringify(readiness).includes('re_secret'), false);
});

test('HealthController readiness surfaces production CORS allowlist status without origin values', async () => {
  const controller = new HealthController(
    {
      requireStore: () => ({
        request_id: 'req-cors',
        tenant_id: null,
        user_id: 'system',
        role: 'system',
        session_id: null,
        is_authenticated: false,
      }),
    } as never,
    {
      ping: async () => 'up',
      getPoolMetrics: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as never,
    { ping: async () => 'up' } as never,
    undefined,
    undefined,
    undefined,
    {
      get: <T>(key: string) =>
        ({
          'app.corsEnabled': true,
          'app.nodeEnv': 'production',
          'app.corsOrigins': ['https://shule-hub-erp.vercel.app'],
          'app.corsCredentials': true,
        })[key] as T | undefined,
    } as never,
  );

  const readiness = await controller.getReadiness();

  assert.deepEqual(readiness.cors, {
    status: 'configured',
    credentials: true,
    allow_all_origins: false,
    origin_count: 1,
    production_locked: true,
  });
  assert.equal(JSON.stringify(readiness).includes('shule-hub-erp.vercel.app'), false);
});

test('HealthController readiness surfaces support notification provider status without secrets', async () => {
  const controller = new HealthController(
    {
      requireStore: () => ({
        request_id: 'req-support-notifications',
        tenant_id: null,
        user_id: 'system',
        role: 'system',
        session_id: null,
        is_authenticated: false,
      }),
    } as never,
    {
      ping: async () => 'up',
      getPoolMetrics: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as never,
    { ping: async () => 'up' } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      getProviderStatus: () => ({
        status: 'configured',
        email: {
          status: 'configured',
          provider: 'resend',
          transactional_email: 'configured',
          recipients_configured: true,
          recipient_count: 2,
        },
        sms: {
          status: 'configured',
          dispatch_provider_configured: true,
          dispatch_provider_status: 'configured',
          webhook_url_configured: true,
          webhook_token_configured: true,
          recipients_configured: true,
          recipient_count: 1,
          missing: [],
        },
        retry: {
          worker_enabled: true,
          interval_ms: 60000,
          batch_size: 25,
          lease_ms: 120000,
          max_attempts: 4,
        },
      }),
    } as never,
  );

  const readiness = await controller.getReadiness();

  assert.equal(readiness.services.support_notifications, 'configured');
  assert.equal(readiness.support_notifications?.email.recipient_count, 2);
  assert.equal(readiness.support_notifications?.sms.dispatch_provider_configured, true);
  assert.equal(JSON.stringify(readiness).includes('sms-secret-token'), false);
  assert.equal(JSON.stringify(readiness).includes('support@shulehub.test'), false);
});

test('HealthController readiness surfaces object storage and malware scanning without secrets', async () => {
  const controller = new HealthController(
    {
      requireStore: () => ({
        request_id: 'req-upload-readiness',
        tenant_id: null,
        user_id: 'system',
        role: 'system',
        session_id: null,
        is_authenticated: false,
      }),
    } as never,
    {
      ping: async () => 'up',
      getPoolMetrics: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as never,
    { ping: async () => 'up' } as never,
    undefined,
    undefined,
    undefined,
    {
      get: <T>(key: string) =>
        ({
          UPLOAD_OBJECT_STORAGE_ENABLED: 'true',
          UPLOAD_OBJECT_STORAGE_PROVIDER: 'r2',
          UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
          UPLOAD_OBJECT_STORAGE_BUCKET: 'shulehub-files',
          UPLOAD_OBJECT_STORAGE_REGION: 'auto',
          UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key-id',
          UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-access-key',
          UPLOAD_MALWARE_SCAN_REQUIRED: 'true',
          UPLOAD_MALWARE_SCAN_PROVIDER: 'clamav',
          UPLOAD_MALWARE_SCAN_API_URL: 'https://scanner.example.test/scan',
          UPLOAD_MALWARE_SCAN_API_TOKEN: 'scanner-token',
          UPLOAD_MALWARE_SCAN_HEALTH_URL: 'https://scanner.example.test/health',
        })[key] as T | undefined,
    } as never,
  );

  const readiness = await controller.getReadiness();

  assert.equal(readiness.status, 'ok');
  assert.equal(readiness.services.object_storage, 'configured');
  assert.equal(readiness.services.malware_scanning, 'configured');
  assert.deepEqual(readiness.object_storage, {
    status: 'configured',
    enabled: true,
    provider: 'r2',
    endpoint_configured: true,
    bucket_configured: true,
    region_configured: true,
    access_key_configured: true,
    secret_key_configured: true,
    missing: [],
  });
  assert.deepEqual(readiness.malware_scanning, {
    status: 'configured',
    required: true,
    provider_configured: true,
    api_url_configured: true,
    api_token_configured: true,
    health_url_configured: true,
    missing: [],
  });
  assert.equal(JSON.stringify(readiness).includes('secret-access-key'), false);
  assert.equal(JSON.stringify(readiness).includes('scanner-token'), false);
});

test('HealthController readiness is degraded when required upload security providers are incomplete', async () => {
  const controller = new HealthController(
    {
      requireStore: () => ({
        request_id: 'req-upload-readiness-missing',
        tenant_id: null,
        user_id: 'system',
        role: 'system',
        session_id: null,
        is_authenticated: false,
      }),
    } as never,
    {
      ping: async () => 'up',
      getPoolMetrics: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as never,
    { ping: async () => 'up' } as never,
    undefined,
    undefined,
    undefined,
    {
      get: <T>(key: string) =>
        ({
          UPLOAD_OBJECT_STORAGE_ENABLED: 'true',
          UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
          UPLOAD_MALWARE_SCAN_REQUIRED: 'true',
          UPLOAD_MALWARE_SCAN_PROVIDER: 'clamav',
        })[key] as T | undefined,
    } as never,
  );

  const readiness = await controller.getReadiness();

  assert.equal(readiness.status, 'degraded');
  assert.equal(readiness.services.object_storage, 'missing_credentials');
  assert.equal(readiness.services.malware_scanning, 'missing_credentials');
  assert.deepEqual(readiness.object_storage.missing, ['bucket', 'access_key', 'secret_key']);
  assert.deepEqual(readiness.malware_scanning.missing, ['api_url', 'api_token']);
});
