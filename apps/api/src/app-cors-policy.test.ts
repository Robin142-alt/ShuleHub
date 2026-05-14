import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCorsOriginPolicy } from './app-cors-policy';

test('resolveCorsOriginPolicy rejects empty credentialed production origins', () => {
  assert.throws(
    () =>
      resolveCorsOriginPolicy({
        nodeEnv: 'production',
        origins: [],
        credentials: true,
      }),
    /APP_CORS_ORIGINS must contain explicit HTTPS origins/,
  );
});

test('resolveCorsOriginPolicy rejects wildcard credentialed production origins', () => {
  assert.throws(
    () =>
      resolveCorsOriginPolicy({
        nodeEnv: 'production',
        origins: ['*'],
        credentials: true,
      }),
    /Wildcard CORS origins are not allowed in production/,
  );
});

test('resolveCorsOriginPolicy rejects non-HTTPS credentialed production origins', () => {
  assert.throws(
    () =>
      resolveCorsOriginPolicy({
        nodeEnv: 'production',
        origins: ['http://shule-hub-erp.vercel.app'],
        credentials: true,
      }),
    /Production CORS origins must be HTTPS URLs/,
  );
});

test('resolveCorsOriginPolicy allows explicit HTTPS production origins', () => {
  assert.deepEqual(
    resolveCorsOriginPolicy({
      nodeEnv: 'production',
      origins: ['https://shule-hub-erp.vercel.app'],
      credentials: true,
    }),
    ['https://shule-hub-erp.vercel.app'],
  );
});

test('resolveCorsOriginPolicy preserves permissive local development behavior', () => {
  assert.equal(
    resolveCorsOriginPolicy({
      nodeEnv: 'development',
      origins: [],
      credentials: true,
    }),
    true,
  );
});
