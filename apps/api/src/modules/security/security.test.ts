import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { sanitizeRequestPath } from '../../common/request-path.util';
import { FraudDetectionService } from './fraud-detection.service';
import { PiiEncryptionService } from './pii-encryption.service';
import { RateLimitService } from './rate-limit.service';

class FakeRedisClient {
  private readonly store = new Map<string, { value: number; expires_at: number | null }>();

  async incr(key: string): Promise<number> {
    this.evictExpiredKey(key);
    const existing = this.store.get(key) ?? { value: 0, expires_at: null };
    existing.value += 1;
    this.store.set(key, existing);
    return existing.value;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const existing = this.store.get(key);

    if (!existing) {
      return 0;
    }

    existing.expires_at = Date.now() + ttlSeconds * 1000;
    this.store.set(key, existing);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    this.evictExpiredKey(key);
    const existing = this.store.get(key);

    if (!existing?.expires_at) {
      return -1;
    }

    return Math.max(1, Math.ceil((existing.expires_at - Date.now()) / 1000));
  }

  private evictExpiredKey(key: string): void {
    const existing = this.store.get(key);

    if (existing?.expires_at && existing.expires_at <= Date.now()) {
      this.store.delete(key);
    }
  }
}

const encryptionKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

test('PiiEncryptionService encrypts and decrypts field values', () => {
  const service = new PiiEncryptionService({
    get: (): string => encryptionKey,
  } as never);
  const encrypted = service.encrypt('Grace Otieno', 'students:tenant-a:primary_guardian_name');

  assert.notEqual(encrypted, 'Grace Otieno');
  assert.equal(
    service.decrypt(encrypted, 'students:tenant-a:primary_guardian_name'),
    'Grace Otieno',
  );
  assert.equal(service.maskPhoneNumber('254700000001'), '2547******01');
});

test('sanitizeRequestPath redacts auth tokens and one-time codes from URL query strings', () => {
  assert.equal(
    sanitizeRequestPath('/auth/invitations/accept?token=raw-token&tenant=school-a'),
    '/auth/invitations/accept?token=%5Bredacted%5D&tenant=school-a',
  );
  assert.equal(
    sanitizeRequestPath('https://api.example.test/auth/password-recovery/reset?token=raw-token#fragment'),
    '/auth/password-recovery/reset?token=%5Bredacted%5D',
  );
  assert.equal(
    sanitizeRequestPath('/auth/parent/otp/verify?code=123456&phone=254700000001'),
    '/auth/parent/otp/verify?code=%5Bredacted%5D&phone=254700000001',
  );
});

test('RateLimitService blocks requests after the configured threshold', async () => {
  const requestContext = new RequestContextService();
  const redisClient = new FakeRedisClient();
  const service = new RateLimitService(
    {
      get: (key: string): number | undefined => {
        if (key === 'security.rateLimitWindowSeconds') {
          return 60;
        }

        if (key === 'security.authRateLimitMaxRequests') {
          return 2;
        }

        if (key === 'security.authSessionRateLimitMaxRequests') {
          return 2;
        }

        if (key === 'security.rateLimitMaxRequests') {
          return 100;
        }

        return undefined;
      },
    } as never,
    requestContext,
    {
      getClient: () => redisClient,
    } as never,
  );

  const outcomes = await requestContext.run(
    {
      request_id: 'req-rate-1',
      tenant_id: 'tenant-a',
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/auth/login',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    async () => [
      await service.evaluateRequest({
        path: '/auth/login',
        originalUrl: '/auth/login',
        url: '/auth/login',
      } as never),
      await service.evaluateRequest({
        path: '/auth/login',
        originalUrl: '/auth/login',
        url: '/auth/login',
      } as never),
      await service.evaluateRequest({
        path: '/auth/login',
        originalUrl: '/auth/login',
        url: '/auth/login',
      } as never),
    ],
  );

  assert.equal(outcomes[0].allowed, true);
  assert.equal(outcomes[1].allowed, true);
  assert.equal(outcomes[2].allowed, false);
  assert.equal(outcomes[2].limit, 2);
  assert.equal(outcomes[2].route_key, 'auth-session');
});

test('RateLimitService applies tighter buckets to parent OTP and recovery flows', async () => {
  const requestContext = new RequestContextService();
  const redisClient = new FakeRedisClient();
  const service = new RateLimitService(
    {
      get: (key: string): number | undefined => {
        if (key === 'security.rateLimitWindowSeconds') {
          return 60;
        }

        if (key === 'security.parentOtpRateLimitMaxRequests') {
          return 1;
        }

        if (key === 'security.authRecoveryRateLimitMaxRequests') {
          return 1;
        }

        if (key === 'security.rateLimitMaxRequests') {
          return 100;
        }

        return undefined;
      },
    } as never,
    requestContext,
    {
      getClient: () => redisClient,
    } as never,
  );

  const [otpFirst, otpSecond, recoveryFirst, recoverySecond] = await requestContext.run(
    {
      request_id: 'req-rate-2',
      tenant_id: null,
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/auth/parent/otp/request',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    async () => [
      await service.evaluateRequest({
        path: '/auth/parent/otp/request',
        originalUrl: '/auth/parent/otp/request',
        url: '/auth/parent/otp/request',
      } as never),
      await service.evaluateRequest({
        path: '/auth/parent/otp/request',
        originalUrl: '/auth/parent/otp/request',
        url: '/auth/parent/otp/request',
      } as never),
      await service.evaluateRequest({
        path: '/auth/password-recovery/request',
        originalUrl: '/auth/password-recovery/request',
        url: '/auth/password-recovery/request',
      } as never),
      await service.evaluateRequest({
        path: '/auth/password-recovery/request',
        originalUrl: '/auth/password-recovery/request',
        url: '/auth/password-recovery/request',
      } as never),
    ],
  );

  assert.equal(otpFirst.allowed, true);
  assert.equal(otpSecond.allowed, false);
  assert.equal(otpSecond.route_key, 'auth-parent-otp');
  assert.equal(recoveryFirst.allowed, true);
  assert.equal(recoverySecond.allowed, false);
  assert.equal(recoverySecond.route_key, 'auth-recovery');
});

test('RateLimitService treats MPESA callback aliases as provider callback traffic', async () => {
  const requestContext = new RequestContextService();
  const redisClient = new FakeRedisClient();
  const service = new RateLimitService(
    {
      get: (key: string): number | undefined => {
        if (key === 'security.rateLimitWindowSeconds') {
          return 60;
        }

        if (key === 'security.mpesaCallbackRateLimitMaxRequests') {
          return 1;
        }

        return 100;
      },
    } as never,
    requestContext,
    {
      getClient: () => redisClient,
    } as never,
  );

  const outcomes = await requestContext.run(
    {
      request_id: 'req-rate-3',
      tenant_id: 'tenant-a',
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'safaricom',
      method: 'POST',
      path: '/mpesa/c2b/confirmation',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    async () => [
      await service.evaluateRequest({
        path: '/mpesa/c2b/confirmation',
        originalUrl: '/mpesa/c2b/confirmation',
        url: '/mpesa/c2b/confirmation',
      } as never),
      await service.evaluateRequest({
        path: '/mpesa/c2b/confirmation',
        originalUrl: '/mpesa/c2b/confirmation',
        url: '/mpesa/c2b/confirmation',
      } as never),
    ],
  );

  assert.equal(outcomes[0].route_key, 'mpesa-callback');
  assert.equal(outcomes[0].allowed, true);
  assert.equal(outcomes[1].allowed, false);
});

test('FraudDetectionService emits a high-value audit alert', async () => {
  const redisClient = new FakeRedisClient();
  let capturedAuditEvent: Record<string, unknown> | null = null;
  let capturedLog: Record<string, unknown> | null = null;
  const encryptionService = new PiiEncryptionService({
    get: (): string => encryptionKey,
  } as never);
  const service = new FraudDetectionService(
    {
      get: (key: string): string | number | undefined => {
        if (key === 'security.fraudHighValueAmountMinor') {
          return '5000000';
        }

        if (key === 'security.fraudVelocityWindowSeconds') {
          return 900;
        }

        if (key === 'security.fraudVelocityThreshold') {
          return 5;
        }

        return undefined;
      },
    } as never,
    {
      query: async (): Promise<{ rows: Array<{ phone_number: string; account_reference: string; amount_minor: string }> }> => ({
        rows: [],
      }),
    } as never,
    {
      getClient: () => redisClient,
    } as never,
    encryptionService,
    {
      recordSecurityEvent: async (input: Record<string, unknown>) => {
        capturedAuditEvent = input;
      },
    } as never,
    {
      warn: (message: Record<string, unknown>) => {
        capturedLog = message;
      },
    } as never,
  );

  await service.inspectPaymentIntentCreation({
    tenant_id: 'tenant-a',
    payment_intent_id: 'payment-intent-1',
    amount_minor: '6000000',
    phone_number: '254700000001',
    account_reference: 'INV-1',
    external_reference: 'invoice-1',
  });

  assert.ok(capturedAuditEvent);
  const auditEvent = capturedAuditEvent as {
    action: string;
    resource_id: string;
    metadata: { phone_number_masked: string };
  };
  assert.equal(auditEvent.action, 'fraud.payment.high_value_detected');
  assert.equal(auditEvent.resource_id, 'payment-intent-1');
  assert.equal(auditEvent.metadata.phone_number_masked, '2547******01');
  assert.ok(capturedLog);
});
