import assert from 'node:assert/strict';
import test from 'node:test';

import { MfaService } from './mfa.service';

test('MfaService requires a challenge for high-privilege roles without a trusted device', async () => {
  const service = new MfaService({} as never);

  await assert.rejects(
    () =>
      service.enforceLoginChallenge({
        userId: 'user-1',
        role: 'admin',
        permissions: ['users:write'],
        mfaEnabled: true,
        mfaCode: undefined,
        trustedDevice: false,
      }),
    /MFA challenge required/,
  );
});

test('MfaService consumes a verified challenge before allowing high-privilege login', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const service = new MfaService({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [{ verified: true }] };
    },
  } as never);

  const result = await service.enforceLoginChallenge({
    userId: 'user-1',
    role: 'platform_owner',
    permissions: ['*:*'],
    mfaEnabled: true,
    mfaCode: '123456',
    trustedDevice: false,
  });

  assert.equal(result.status, 'verified');
  assert.match(queries[0]?.text ?? '', /auth_mfa_challenges/);
  assert.equal(queries[0]?.values[0], 'user-1');
});
