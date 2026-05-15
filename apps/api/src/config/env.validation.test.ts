import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnv } from './env.validation';

const requiredEnvironment = {
  DATABASE_URL: 'postgres://shulehub:secret@localhost:5432/shulehub',
  REDIS_URL: 'redis://localhost:6379',
  SECURITY_PII_ENCRYPTION_KEY: 'pii-encryption-key',
  MPESA_CONSUMER_KEY: 'consumer-key',
  MPESA_CONSUMER_SECRET: 'consumer-secret',
  MPESA_SHORT_CODE: '123456',
  MPESA_PASSKEY: 'mpesa-passkey',
  MPESA_CALLBACK_URL: 'https://api.example.test/mpesa/callback',
  MPESA_CALLBACK_SECRET: 'callback-secret',
  MPESA_LEDGER_DEBIT_ACCOUNT_CODE: '1100-MPESA-CLEARING',
  MPESA_LEDGER_CREDIT_ACCOUNT_CODE: '2100-CUSTOMER-DEPOSITS',
  JWT_SECRET: 'jwt-secret',
};

test('validateEnv allows startup when upload object storage is disabled', () => {
  assert.equal(validateEnv(requiredEnvironment), requiredEnvironment);
});

test('validateEnv rejects incomplete enabled upload object storage config', () => {
  assert.throws(
    () =>
      validateEnv({
        ...requiredEnvironment,
        UPLOAD_OBJECT_STORAGE_ENABLED: 'true',
        UPLOAD_OBJECT_STORAGE_ENDPOINT: 'http://objects.example.test',
        UPLOAD_OBJECT_STORAGE_PROVIDER: 'gcs',
      }),
    /UPLOAD_OBJECT_STORAGE_PROVIDER must be s3 or r2.*UPLOAD_OBJECT_STORAGE_ENDPOINT must be an HTTPS URL.*UPLOAD_OBJECT_STORAGE_BUCKET is required.*UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID is required.*UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY is required/s,
  );
});

test('validateEnv allows complete S3-compatible upload object storage config', () => {
  const env = {
    ...requiredEnvironment,
    UPLOAD_OBJECT_STORAGE_ENABLED: 'true',
    UPLOAD_OBJECT_STORAGE_PROVIDER: 'r2',
    UPLOAD_OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    UPLOAD_OBJECT_STORAGE_BUCKET: 'shule-hub-files',
    UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID: 'object-access-key',
    UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'object-secret-key',
  };

  assert.equal(validateEnv(env), env);
});

test('validateEnv rejects incomplete required support SMS configuration', () => {
  assert.throws(
    () =>
      validateEnv({
        ...requiredEnvironment,
        SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS: 'true',
        SUPPORT_PROVIDER_SMOKE_LIVE: 'true',
        SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL: 'http://sms.example.test/send',
      }),
    /SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL must be an HTTPS URL.*SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN is required.*SUPPORT_NOTIFICATION_SMS_RECIPIENTS is required.*SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL is required/s,
  );
});

test('validateEnv allows complete support SMS configuration', () => {
  const env = {
    ...requiredEnvironment,
    SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS: 'true',
    SUPPORT_PROVIDER_SMOKE_LIVE: 'true',
    SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL: 'https://sms.example.test/send',
    SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL: 'https://sms.example.test/health',
    SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN: 'sms-token',
    SUPPORT_NOTIFICATION_SMS_RECIPIENTS: '+254700000000',
  };

  assert.equal(validateEnv(env), env);
});

test('validateEnv rejects incomplete required malware scan configuration', () => {
  assert.throws(
    () =>
      validateEnv({
        ...requiredEnvironment,
        SUPPORT_PROVIDER_SMOKE_LIVE: 'true',
        UPLOAD_MALWARE_SCAN_REQUIRED: 'true',
        UPLOAD_MALWARE_SCAN_PROVIDER: 'clamav',
        UPLOAD_MALWARE_SCAN_API_URL: 'http://scanner.example.test/scan',
      }),
    /UPLOAD_MALWARE_SCAN_API_URL must be an HTTPS URL.*UPLOAD_MALWARE_SCAN_API_TOKEN is required.*UPLOAD_MALWARE_SCAN_HEALTH_URL is required/s,
  );
});

test('validateEnv allows complete malware scan configuration', () => {
  const env = {
    ...requiredEnvironment,
    SUPPORT_PROVIDER_SMOKE_LIVE: 'true',
    UPLOAD_MALWARE_SCAN_REQUIRED: 'true',
    UPLOAD_MALWARE_SCAN_PROVIDER: 'clamav',
    UPLOAD_MALWARE_SCAN_API_URL: 'https://scanner.example.test/scan',
    UPLOAD_MALWARE_SCAN_HEALTH_URL: 'https://scanner.example.test/health',
    UPLOAD_MALWARE_SCAN_API_TOKEN: 'scanner-token',
  };

  assert.equal(validateEnv(env), env);
});
