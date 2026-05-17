import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';

import { PERMISSIONS_KEY } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { PiiEncryptionService } from '../security/pii-encryption.service';
import { PlatformSmsRepository } from './platform-sms.repository';
import { IntegrationsSchemaService } from './integrations-schema.service';
import { PlatformSmsController } from './platform-sms.controller';
import { PlatformSmsService } from './platform-sms.service';
import { SchoolSmsWalletService } from './school-sms-wallet.service';
import { SchoolSmsWalletRepository } from './school-sms-wallet.repository';
import { SmsDispatchService } from './sms-dispatch.service';
import { DarajaIntegrationService } from './daraja-integration.service';
import { ParentPortalAuthService } from './parent-portal-auth.service';

test('IntegrationsSchemaService creates tenant-scoped SMS, Daraja, parent OTP, and onboarding tables', async () => {
  let schemaSql = '';
  const service = new IntegrationsSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS platform_sms_providers/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS school_sms_wallets/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS school_integrations/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS parent_otp_challenges/);
  assert.match(schemaSql, /request_path NOT IN \('\/auth\/parent\/otp\/request', '\/auth\/parent\/otp\/verify'\)/);
  assert.match(schemaSql, /ALTER TABLE school_sms_wallets FORCE ROW LEVEL SECURITY/);
});

test('PlatformSmsService stores encrypted credentials and returns only masked provider metadata', async () => {
  const written: Record<string, unknown>[] = [];
  const service = new PlatformSmsService(
    {
      createProvider: async (input: Record<string, unknown>) => {
        written.push(input);
        return {
          id: 'provider-1',
          provider_name: 'Africa\'s Talking',
          provider_code: 'africas_talking',
          api_key_ciphertext: String(input.api_key_ciphertext),
          username_ciphertext: String(input.username_ciphertext),
          sender_id: 'SHULEHUB',
          is_active: true,
          is_default: true,
          last_test_status: null,
          last_tested_at: null,
          created_at: '2026-05-16T00:00:00.000Z',
          updated_at: '2026-05-16T00:00:00.000Z',
        };
      },
    } as never,
    {
      encrypt: (value: string) => `enc:${value}`,
      decrypt: (value: string) => value.replace(/^enc:/, ''),
    } as never,
    { getStore: () => ({ user_id: 'platform-owner' }) } as never,
  );

  const provider = await service.createProvider({
    provider_name: 'Africa\'s Talking',
    provider_code: 'africas_talking',
    api_key: 'live-api-key-secret',
    username: 'shulehub',
    sender_id: 'SHULEHUB',
    is_active: true,
    is_default: true,
  });

  assert.equal(written[0]?.api_key_ciphertext, 'enc:live-api-key-secret');
  assert.equal(provider.api_key_masked.endsWith('cret'), true);
  assert.equal(JSON.stringify(provider).includes('live-api-key-secret'), false);
});

test('SchoolSmsWalletService rejects SMS sends when balance is exhausted', async () => {
  const service = new SchoolSmsWalletService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'teacher-1' }) } as never,
    {
      reserveSmsCredits: async () => ({
        accepted: false,
        reason: 'SMS balance exhausted',
        log_id: 'sms-log-1',
        balance_after: 0,
      }),
    } as never,
  );

  await assert.rejects(
    () =>
      service.sendSms({
        recipient: '+254700000001',
        message: 'Fee reminder',
        message_type: 'fee_reminder',
      }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message === 'SMS balance exhausted',
  );
});

test('SmsDispatchService reports missing credential fields without exposing secrets', async () => {
  const service = new SmsDispatchService({
    getDefaultProviderForDispatch: async () => ({
      provider: {
        id: 'provider-1',
        provider_name: 'Africa\'s Talking',
        provider_code: 'africas_talking',
        api_key_ciphertext: 'encrypted',
        username_ciphertext: 'encrypted',
        sender_id: 'SHULEHUB',
        base_url: null,
        is_active: true,
        is_default: true,
        last_test_status: null,
        last_tested_at: null,
        created_at: '2026-05-16T00:00:00.000Z',
        updated_at: '2026-05-16T00:00:00.000Z',
      },
      api_key: 'live-api-key-secret',
      username: 'shulehub',
    }),
  } as never);

  const readiness = await service.getReadiness();

  assert.equal(readiness.status, 'missing_credentials');
  assert.deepEqual(readiness.missing, ['base_url']);
  assert.equal(JSON.stringify(readiness).includes('live-api-key-secret'), false);
});

test('SmsDispatchService maps Africa Talking provider dispatch without logging secrets', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        SMSMessageData: {
          Recipients: [{ messageId: 'ATX-123' }],
        },
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const service = new SmsDispatchService({
      getDefaultProviderForDispatch: async () => ({
        provider: {
          id: 'provider-1',
          provider_name: 'Africa\'s Talking',
          provider_code: 'africas_talking',
          api_key_ciphertext: 'encrypted',
          username_ciphertext: 'encrypted',
          sender_id: 'SHULEHUB',
          base_url: 'https://sms.example.test/send',
          is_active: true,
          is_default: true,
          last_test_status: 'ok',
          last_tested_at: '2026-05-16T00:00:00.000Z',
          created_at: '2026-05-16T00:00:00.000Z',
          updated_at: '2026-05-16T00:00:00.000Z',
        },
        api_key: 'live-api-key-secret',
        username: 'shulehub',
      }),
    } as never);

    const result = await service.send({
      tenant_id: 'tenant-a',
      to: '+254700000001',
      message: 'Fee balance reminder',
      source: 'school_sms',
    });

    assert.equal(result.provider_id, 'provider-1');
    assert.equal(result.provider_message_id, 'ATX-123');
    assert.equal(requests[0]?.url, 'https://sms.example.test/send');
    assert.equal((requests[0]?.init?.headers as Record<string, string>)?.apiKey, 'live-api-key-secret');
    assert.equal(String(requests[0]?.init?.body).includes('Fee+balance+reminder'), true);
    assert.equal(JSON.stringify(result).includes('live-api-key-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DarajaIntegrationService masks credentials after save and never returns raw secrets', async () => {
  const saved: Record<string, unknown>[] = [];
  const service = new DarajaIntegrationService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'finance-1' }) } as never,
    {
      upsertDarajaIntegration: async (input: Record<string, unknown>) => {
        saved.push(input);
        return {
          id: 'integration-1',
          tenant_id: 'tenant-a',
          integration_type: 'mpesa_daraja',
          paybill_number: '123456',
          till_number: null,
          shortcode: '123456',
          consumer_key_ciphertext: String(input.consumer_key_ciphertext),
          consumer_secret_ciphertext: String(input.consumer_secret_ciphertext),
          passkey_ciphertext: String(input.passkey_ciphertext),
          environment: 'sandbox',
          callback_url: 'https://api.example.test/payments/mpesa/callback/integration-1',
          is_active: false,
          last_test_status: null,
          last_tested_at: null,
          created_at: '2026-05-16T00:00:00.000Z',
          updated_at: '2026-05-16T00:00:00.000Z',
        };
      },
      appendIntegrationLog: async () => undefined,
    } as never,
    {
      encrypt: (value: string) => `enc:${value}`,
    } as never,
  );

  const response = await service.saveDarajaSettings({
    paybill_number: '123456',
    shortcode: '123456',
    consumer_key: 'consumer-key-live',
    consumer_secret: 'consumer-secret-live',
    passkey: 'passkey-live',
    environment: 'sandbox',
  });

  assert.equal(saved[0]?.consumer_secret_ciphertext, 'enc:consumer-secret-live');
  assert.equal(response.consumer_secret_masked?.endsWith('live'), true);
  assert.equal(JSON.stringify(response).includes('consumer-secret-live'), false);
});

test('PlatformSmsController protects provider management with platform permissions', () => {
  const handler = PlatformSmsController.prototype.listProviders as unknown as Function;

  assert.equal(typeof handler, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'sms/providers');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), ['*:*']);
});

test('ParentPortalAuthService creates a generic OTP challenge without exposing the OTP code', async () => {
  const service = new ParentPortalAuthService(
    {
      getStore: () => ({
        request_id: 'req-parent-otp',
        tenant_id: null,
        client_ip: '127.0.0.1',
        user_agent: 'test-suite',
      }),
      setTenantId: () => undefined,
      requireStore: () => ({ tenant_id: 'tenant-a' }),
    } as never,
    {
      findParentAuthSubject: async () => ({
        user_id: 'parent-1',
        tenant_id: 'tenant-a',
        role_id: 'role-parent',
        role_code: 'parent',
        email: 'parent@example.test',
        display_name: 'Parent User',
        phone_number_hash: 'hash-phone',
        phone_number_last4: '0001',
      }),
      createOtpChallenge: async () => ({
        id: 'challenge-1',
        tenant_id: 'tenant-a',
        user_id: 'parent-1',
        email: 'parent@example.test',
        phone_hash: 'hash-phone',
        phone_last4: '0001',
        otp_hash: 'hashed-otp',
        expires_at: '2026-05-16T00:10:00.000Z',
        consumed_at: null,
        attempts: 0,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => '0123456789abcdef0123456789abcdef' } as never,
    { synchronizeRequestSession: async () => undefined } as never,
    { sendSms: async () => ({ status: 'sent' }) } as never,
  );

  const response = await service.requestOtp({ identifier: '+254700000001' });

  assert.equal(response.sent, true);
  assert.equal(response.challenge_id, 'challenge-1');
  assert.equal(JSON.stringify(response).includes('000000'), false);
  assert.equal(JSON.stringify(response).includes('123456'), false);
});

test('ParentPortalAuthService rejects OTP verification if the challenge subject changes', async () => {
  const pepper = '0123456789abcdef0123456789abcdef';
  const otpHash = createHash('sha256').update(`123456:${pepper}`).digest('hex');
  let consumed = false;
  let tokenIssued = false;
  const service = new ParentPortalAuthService(
    {
      getStore: () => ({
        request_id: 'req-parent-otp',
        tenant_id: null,
        client_ip: '127.0.0.1',
        user_agent: 'test-suite',
      }),
      setTenantId: () => undefined,
      requireStore: () => ({ tenant_id: 'tenant-a' }),
    } as never,
    {
      findChallengeForVerify: async () => ({
        id: 'challenge-1',
        tenant_id: 'tenant-a',
        user_id: 'parent-1',
        email: 'parent@example.test',
        phone_hash: 'hash-phone',
        phone_last4: '0001',
        otp_hash: otpHash,
        expires_at: '2999-05-16T00:10:00.000Z',
        consumed_at: null,
        attempts: 0,
      }),
      findParentAuthSubject: async () => ({
        user_id: 'parent-2',
        tenant_id: 'tenant-a',
        role_id: 'role-parent',
        role_code: 'parent',
        email: 'parent@example.test',
        display_name: 'Parent User',
        phone_number_hash: 'hash-phone',
        phone_number_last4: '0001',
      }),
      consumeChallenge: async () => {
        consumed = true;
        return true;
      },
      incrementAttempts: async () => undefined,
    } as never,
    { ensureTenantAuthorizationBaseline: async () => undefined, getPermissionsByRoleId: async () => [] } as never,
    {
      issueTokenPair: async () => {
        tokenIssued = true;
        return {};
      },
    } as never,
    { createSession: async () => undefined } as never,
    { get: () => pepper } as never,
    { synchronizeRequestSession: async () => undefined } as never,
  );

  await assert.rejects(
    () => service.verifyOtp({ challenge_id: 'challenge-1', otp_code: '123456' }),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === 'Parent account is no longer active',
  );
  assert.equal(consumed, false);
  assert.equal(tokenIssued, false);
});

test('ParentPortalAuthService consumes OTP challenges before issuing tokens', async () => {
  const pepper = '0123456789abcdef0123456789abcdef';
  const otpHash = createHash('sha256').update(`123456:${pepper}`).digest('hex');
  let tokenIssued = false;
  const service = new ParentPortalAuthService(
    {
      getStore: () => ({
        request_id: 'req-parent-otp',
        tenant_id: null,
        client_ip: '127.0.0.1',
        user_agent: 'test-suite',
      }),
      setTenantId: () => undefined,
      requireStore: () => ({ tenant_id: 'tenant-a' }),
    } as never,
    {
      findChallengeForVerify: async () => ({
        id: 'challenge-1',
        tenant_id: 'tenant-a',
        user_id: 'parent-1',
        email: 'parent@example.test',
        phone_hash: 'hash-phone',
        phone_last4: '0001',
        otp_hash: otpHash,
        expires_at: '2999-05-16T00:10:00.000Z',
        consumed_at: null,
        attempts: 0,
      }),
      findParentAuthSubject: async () => ({
        user_id: 'parent-1',
        tenant_id: 'tenant-a',
        role_id: 'role-parent',
        role_code: 'parent',
        email: 'parent@example.test',
        display_name: 'Parent User',
        phone_number_hash: 'hash-phone',
        phone_number_last4: '0001',
      }),
      consumeChallenge: async () => false,
      incrementAttempts: async () => undefined,
    } as never,
    { ensureTenantAuthorizationBaseline: async () => undefined, getPermissionsByRoleId: async () => [] } as never,
    {
      issueTokenPair: async () => {
        tokenIssued = true;
        return {};
      },
    } as never,
    { createSession: async () => undefined } as never,
    { get: () => pepper } as never,
    { synchronizeRequestSession: async () => undefined } as never,
  );

  await assert.rejects(
    () => service.verifyOtp({ challenge_id: 'challenge-1', otp_code: '123456' }),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === 'Verification code has expired',
  );
  assert.equal(tokenIssued, false);
});

test('SchoolSmsWalletRepository reserves SMS credits transactionally with conditional balance guards', async () => {
  const queries: string[] = [];
  let usedTransaction = false;
  const wallet = {
    id: 'wallet-1',
    tenant_id: 'tenant-a',
    sms_balance: 10,
    monthly_used: 0,
    monthly_limit: 100,
    sms_plan: 'starter',
    low_balance_threshold: 5,
    allow_negative_balance: false,
    billing_status: 'active',
    last_reset_at: null,
    created_at: '2026-05-16T00:00:00.000Z',
    updated_at: '2026-05-16T00:00:00.000Z',
  };
  const repository = new SchoolSmsWalletRepository({
    withRequestTransaction: async (callback: () => Promise<unknown>) => {
      usedTransaction = true;
      return callback();
    },
    query: async (sql: string) => {
      queries.push(sql);

      if (sql.includes('INSERT INTO school_sms_wallets') || sql.includes('FOR UPDATE')) {
        return { rows: [wallet] };
      }

      if (sql.includes('UPDATE school_sms_wallets') && sql.includes('sms_balance = sms_balance - $2')) {
        return { rows: [{ sms_balance: 9, monthly_used: 1 }] };
      }

      if (sql.includes('INSERT INTO sms_logs')) {
        return { rows: [{ id: 'sms-log-1' }] };
      }

      return { rows: [] };
    },
  } as never);

  const reserved = await repository.reserveSmsCredits({
    tenant_id: 'tenant-a',
    recipient_ciphertext: 'enc-recipient',
    recipient_last4: '0001',
    recipient_hash: 'hash-recipient',
    message_ciphertext: 'enc-message',
    message_preview: 'Fee reminder',
    message_type: 'fee_reminder',
    credit_cost: 1,
    sent_by_user_id: 'teacher-1',
  });

  const updateSql = queries.find((sql) => sql.includes('sms_balance = sms_balance - $2')) ?? '';

  assert.equal(usedTransaction, true);
  assert.equal(reserved.accepted, true);
  assert.match(updateSql, /allow_negative_balance\s+OR sms_balance >= \$2/);
  assert.match(updateSql, /monthly_used \+ \$2 <= monthly_limit/);
});

test('SchoolSmsWalletRepository makes SMS credit refunds idempotent', async () => {
  const queries: string[] = [];
  let usedTransaction = false;
  const repository = new SchoolSmsWalletRepository({
    withRequestTransaction: async (callback: () => Promise<unknown>) => {
      usedTransaction = true;
      return callback();
    },
    query: async (sql: string) => {
      queries.push(sql);

      if (sql.includes('FROM sms_wallet_transactions')) {
        return { rows: [{ id: 'existing-refund' }] };
      }

      return { rows: [] };
    },
  } as never);

  await repository.refundSmsCredits({
    tenant_id: 'tenant-a',
    log_id: 'sms-log-1',
    credit_cost: 1,
    reason: 'sms_dispatch_failed',
    actor_user_id: 'teacher-1',
  });

  assert.equal(usedTransaction, true);
  assert.equal(
    queries.some((sql) => sql.includes('pg_advisory_xact_lock')),
    true,
  );
  assert.equal(
    queries.some((sql) => sql.includes('SET sms_balance = sms_balance + $2')),
    false,
  );
});

test('Integrations providers expose concrete Nest dependency metadata', () => {
  assert.deepEqual(Reflect.getMetadata('design:paramtypes', IntegrationsSchemaService), [DatabaseService]);
  assert.deepEqual(
    Reflect.getMetadata('design:paramtypes', PlatformSmsService).slice(0, 2),
    [PlatformSmsRepository, PiiEncryptionService],
  );
  assert.deepEqual(
    Reflect.getMetadata('design:paramtypes', SchoolSmsWalletService).slice(0, 1),
    [RequestContextService],
  );
});
