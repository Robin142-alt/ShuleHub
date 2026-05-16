import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';
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
