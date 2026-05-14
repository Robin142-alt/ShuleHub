import assert from 'node:assert/strict';
import test from 'node:test';

import { TrustedDeviceService } from './trusted-device.service';

test('TrustedDeviceService stores only hashed trusted device tokens', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const service = new TrustedDeviceService({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [{ trusted: true }] };
    },
  } as never);

  await service.trustDevice({
    userId: 'user-1',
    rawToken: 'device-token-raw',
    userAgent: 'Browser',
    ipAddress: '127.0.0.1',
  });

  assert.match(queries[0]?.text ?? '', /auth_trusted_devices/);
  assert.notEqual(queries[0]?.values[1], 'device-token-raw');
  assert.match(String(queries[0]?.values[1]), /^[a-f0-9]{64}$/);
});

test('TrustedDeviceService validates active trusted devices by token hash', async () => {
  const service = new TrustedDeviceService({
    query: async () => ({ rows: [{ trusted: true }] }),
  } as never);

  const trusted = await service.isTrustedDevice({
    userId: 'user-1',
    rawToken: 'device-token-raw',
  });

  assert.equal(trusted, true);
});
