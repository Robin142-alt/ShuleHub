import assert from 'node:assert/strict';
import test from 'node:test';

import { UnauthorizedException } from '@nestjs/common';

import { AuthInvitationService } from './auth-invitation.service';

test('AuthInvitationService consumes invitation tokens by hash and never returns the token', async () => {
  const rawToken = 'invite-token-with-enough-entropy-for-production-tests';
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let passwordPassedToHasher = '';

  const service = new AuthInvitationService(
    {
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });

        return {
          rows: [
            {
              user_id: '00000000-0000-0000-0000-000000000701',
              tenant_id: 'green-valley',
              email: 'principal@example.test',
              display_name: 'Principal User',
              role_code: 'owner',
            },
          ],
        };
      },
    } as never,
    {
      hash: async (password: string) => {
        passwordPassedToHasher = password;
        return 'hashed-password';
      },
    } as never,
  );

  const response = await service.acceptInvitation({
    token: rawToken,
    password: 'StrongPass123',
    display_name: 'Principal User',
  });

  assert.equal(passwordPassedToHasher, 'StrongPass123');
  assert.equal(response.success, true);
  assert.equal(response.tenant_id, 'green-valley');
  assert.equal(response.role, 'owner');
  assert.equal(JSON.stringify(response).includes(rawToken), false);
  assert.match(String(queries[0]?.values[0]), /^[a-f0-9]{64}$/);
  assert.notEqual(queries[0]?.values[0], rawToken);
});

test('AuthInvitationService maps expired invitation token database errors to UnauthorizedException', async () => {
  const service = new AuthInvitationService(
    {
      query: async () => {
        throw new Error('Invalid or expired invitation token');
      },
    } as never,
    {
      hash: async () => 'hashed-password',
    } as never,
  );

  await assert.rejects(
    () =>
      service.acceptInvitation({
        token: 'expired-invite-token-with-enough-entropy',
        password: 'StrongPass123',
        display_name: 'Principal User',
      }),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === 'Invalid or expired invitation token',
  );
});
