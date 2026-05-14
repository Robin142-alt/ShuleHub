import assert from 'node:assert/strict';
import test from 'node:test';

import { MagicLinkService } from './magic-link.service';

test('MagicLinkService consumes a login token exactly once', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const service = new MagicLinkService({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return {
        rows: [{
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          email: 'user@example.test',
          consumed_at: '2026-05-14T12:00:00.000Z',
        }],
      };
    },
  } as never);

  const result = await service.consumeLoginLink({
    token: 'single-use-token',
    now: '2026-05-14T12:00:00.000Z',
  });

  assert.equal(result.user_id, 'user-1');
  assert.match(queries[0]?.text ?? '', /consumed_at\s+IS\s+NULL/i);
  assert.notEqual(queries[0]?.values[0], 'single-use-token');
});

test('MagicLinkService rejects reused or expired login tokens', async () => {
  const service = new MagicLinkService({
    query: async () => ({ rows: [] }),
  } as never);

  await assert.rejects(
    () =>
      service.consumeLoginLink({
        token: 'already-used',
        now: '2026-05-14T12:00:00.000Z',
      }),
    /Magic link is invalid or expired/,
  );
});
