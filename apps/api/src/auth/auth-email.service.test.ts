import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthEmailService } from './auth-email.service';

test('AuthEmailService reports transactional email as missing without secrets', () => {
  const service = new AuthEmailService({
    get: () => '',
  } as never);

  assert.deepEqual(service.getTransactionalEmailStatus(), {
    provider: 'resend',
    status: 'missing',
    api_key_configured: false,
    sender_configured: false,
    public_app_url_configured: false,
  });
});

test('AuthEmailService reports transactional email as configured without exposing secrets', () => {
  const service = new AuthEmailService({
    get: (key: string) => {
      if (key === 'email.provider') {
        return 'resend';
      }

      if (key === 'email.resendApiKey') {
        return 're_secret_key';
      }

      if (key === 'email.from') {
        return 'ShuleHub <noreply@example.test>';
      }

      if (key === 'email.publicAppUrl') {
        return 'https://shule-hub-erp.vercel.app';
      }

      return '';
    },
  } as never);

  const status = service.getTransactionalEmailStatus();

  assert.equal(status.status, 'configured');
  assert.equal(status.api_key_configured, true);
  assert.equal(status.sender_configured, true);
  assert.equal(status.public_app_url_configured, true);
  assert.equal(JSON.stringify(status).includes('re_secret_key'), false);
  assert.equal(JSON.stringify(status).includes('noreply@example.test'), false);
});
