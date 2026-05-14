import assert from 'node:assert/strict';
import test from 'node:test';

import { UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthRecoveryService } from './auth-recovery.service';

test('AuthRecoveryService maps expired recovery token database errors to UnauthorizedException', async () => {
  const service = new AuthRecoveryService(
    {} as never,
    {
      query: async () => {
        throw new Error('Invalid or expired recovery token');
      },
    } as never,
    {
      hash: async () => 'hashed-password',
    } as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.resetPassword({
        token: 'expired-recovery-token-with-enough-entropy',
        password: 'StrongPass123',
      }),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === 'Invalid or expired recovery token',
  );
});

test('AuthEmailVerificationService issues a verification email for the current user', async () => {
  const requestContext = new RequestContextService();
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const sentEmails: Array<{ to: string; verifyUrl: string }> = [];

  const service = new AuthEmailVerificationService(
    requestContext,
    {
      query: async (sql: string, values: unknown[]) => {
        queries.push({ sql, values });

        if (sql.includes('FROM users')) {
          return {
            rows: [
              {
                id: '00000000-0000-0000-0000-00000000e001',
                tenant_id: 'tenant-alpha',
                email: 'admin@school.test',
                display_name: 'School Admin',
                email_verified_at: null,
              },
            ],
          };
        }

        if (sql.includes('app.create_email_verification_action')) {
          return {
            rows: [
              {
                token_id: '00000000-0000-0000-0000-00000000e101',
                outbox_id: '00000000-0000-0000-0000-00000000e102',
              },
            ],
          };
        }

        if (sql.includes('app.mark_auth_email_outbox_delivery')) {
          return { rows: [] };
        }

        throw new Error(`Unexpected query: ${sql}`);
      },
    } as never,
    {
      assertEmailVerificationConfigured: () => undefined,
      sendEmailVerificationEmail: async (input: { to: string; verifyUrl: string }) => {
        sentEmails.push(input);
      },
    } as never,
    {
      get: (key: string) => {
        if (key === 'email.publicAppUrl') return 'https://school.example';
        if (key === 'email.emailVerificationTtlMinutes') return 60;
        return undefined;
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-email-verification',
      tenant_id: 'tenant-alpha',
      user_id: '00000000-0000-0000-0000-00000000e001',
      role: 'admin',
      session_id: 'session-email-verification',
      permissions: ['auth:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'node-test',
      method: 'POST',
      path: '/auth/email-verification/request',
      started_at: '2026-05-13T00:00:00.000Z',
    },
    () => service.requestEmailVerification({ ip_address: null, user_agent: null }),
  );

  const createActionQuery = queries.find((query) => query.sql.includes('app.create_email_verification_action'));

  assert.equal(response.success, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'admin@school.test');
  assert.match(sentEmails[0].verifyUrl, /^https:\/\/school\.example\/verify-email\?token=/);
  assert.equal(createActionQuery?.values[0], 'tenant-alpha');
  assert.equal(createActionQuery?.values[1], '00000000-0000-0000-0000-00000000e001');
  assert.equal(createActionQuery?.values[2], 'admin@school.test');
  assert.match(String(createActionQuery?.values[3]), /^[a-f0-9]{64}$/);
});

test('AuthEmailVerificationService consumes verification tokens through the schema function', async () => {
  const service = new AuthEmailVerificationService(
    {} as never,
    {
      query: async (sql: string, values: unknown[]) => {
        assert.match(sql, /app\.consume_email_verification_action/);
        assert.match(String(values[0]), /^[a-f0-9]{64}$/);
        return {
          rows: [
            {
              user_id: '00000000-0000-0000-0000-00000000e001',
              email: 'admin@school.test',
              tenant_id: 'tenant-alpha',
            },
          ],
        };
      },
    } as never,
    {} as never,
    {} as never,
  );

  const response = await service.verifyEmail({
    token: 'email-verification-token-with-enough-entropy',
  });

  assert.equal(response.success, true);
  assert.equal(response.message, 'Email verified successfully.');
});

test('AuthEmailVerificationService maps invalid verification tokens to UnauthorizedException', async () => {
  const service = new AuthEmailVerificationService(
    {} as never,
    {
      query: async () => {
        throw new Error('Invalid or expired email verification token');
      },
    } as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.verifyEmail({
        token: 'expired-email-verification-token-with-enough-entropy',
      }),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === 'Invalid or expired email verification token',
  );
});
