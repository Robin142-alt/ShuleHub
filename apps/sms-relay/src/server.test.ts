import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

import { createSmsRelayServer, redactPhone, type RelayFetch } from './server';

const baseEnv = {
  SMS_RELAY_AUTH_TOKEN: 'relay-token',
  SMS_PROVIDER: 'africastalking',
  SMS_PROVIDER_API_URL: 'https://sms-provider.example.test/send',
  SMS_PROVIDER_API_KEY: 'provider-key',
  SMS_PROVIDER_USERNAME: 'shulehub',
  SMS_PROVIDER_SENDER_ID: 'SHULEHUB',
};

test('GET /health returns readiness without secrets', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/health`);
    const payload = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      status: 'ok',
      provider: 'africastalking',
      dry_run: false,
    });
    assert.equal(JSON.stringify(payload).includes(baseEnv.SMS_PROVIDER_API_KEY), false);
  } finally {
    await close();
  }
});

test('POST /send rejects missing bearer token', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });

    assert.equal(response.status, 401);
  } finally {
    await close();
  }
});

test('POST /send rejects invalid phone numbers', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer relay-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validPayload(), to: 'not-a-phone' }),
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /Invalid recipient phone number/);
  } finally {
    await close();
  }
});

test('POST /send maps ShuleHub payload to Africa Talking provider request', async () => {
  const providerRequests: Array<Parameters<RelayFetch>> = [];
  const { baseUrl, close } = await startTestServer({
    fetchImpl: async (...args) => {
      providerRequests.push(args);
      return { ok: true, status: 201, text: async () => 'queued' };
    },
  });

  try {
    const response = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer relay-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validPayload()),
    });

    assert.equal(response.status, 202);
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0][0], baseEnv.SMS_PROVIDER_API_URL);
    assert.equal(providerRequests[0][1].headers.apiKey, baseEnv.SMS_PROVIDER_API_KEY);
    const providerBody = new URLSearchParams(providerRequests[0][1].body);
    assert.equal(providerBody.get('username'), 'shulehub');
    assert.equal(providerBody.get('to'), '+254700000001');
    assert.equal(providerBody.get('from'), 'SHULEHUB');
    assert.match(providerBody.get('message') ?? '', /Critical ticket/);
    assert.match(providerBody.get('message') ?? '', /Ticket: ticket-1/);
  } finally {
    await close();
  }
});

test('POST /send returns non-2xx when provider fails so API retry worker can retry', async () => {
  const { baseUrl, close } = await startTestServer({
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'provider down' }),
  });

  try {
    const response = await fetch(`${baseUrl}/send`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer relay-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validPayload()),
    });

    assert.equal(response.status, 502);
  } finally {
    await close();
  }
});

test('redactPhone keeps only the final four digits for logs', () => {
  assert.equal(redactPhone('+254 700 000 123'), '***0123');
});

function validPayload() {
  return {
    to: '+254700000001',
    title: 'Critical ticket',
    message: 'A critical support ticket was raised.',
    tenant_id: 'tenant-a',
    ticket_id: 'ticket-1',
    notification_id: 'notification-1',
    metadata: { ticket_number: 'SUP-2026-000001' },
  };
}

async function startTestServer(options: { fetchImpl?: RelayFetch } = {}) {
  const server = createSmsRelayServer({
    env: baseEnv,
    fetchImpl: options.fetchImpl ?? (async () => ({ ok: true, status: 200, text: async () => 'ok' })),
    logger: {
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}
