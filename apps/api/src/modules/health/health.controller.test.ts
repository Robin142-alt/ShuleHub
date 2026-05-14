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
          webhook_url_configured: true,
          webhook_token_configured: true,
          recipients_configured: true,
          recipient_count: 1,
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
  assert.equal(readiness.support_notifications?.sms.webhook_token_configured, true);
  assert.equal(JSON.stringify(readiness).includes('sms-secret-token'), false);
  assert.equal(JSON.stringify(readiness).includes('support@shulehub.test'), false);
});
