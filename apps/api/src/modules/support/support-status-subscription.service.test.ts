import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpException, HttpStatus } from '@nestjs/common';

import { SupportStatusSubscriptionService } from './support-status-subscription.service';

test('SupportStatusSubscriptionService stores hashed contact and consent timestamp', async () => {
  let createdInput: Record<string, unknown> | null = null;
  const service = new SupportStatusSubscriptionService(
    {
      countRecentStatusSubscriptionAttempts: async () => 0,
      createStatusSubscription: async (input: Record<string, unknown>) => {
        createdInput = input;
        return { id: 'subscription-1' };
      },
      createStatusUnsubscribeToken: async () => ({ id: 'token-1' }),
    } as never,
    { get: () => 'status-secret' } as never,
  );

  const result = await service.subscribe({
    email: ' Parent@Example.COM ',
    consentSource: 'public_status_page',
    locale: 'en-KE',
    clientIp: '127.0.0.1',
    now: '2026-05-14T08:00:00.000Z',
  });

  assert.equal(result.status, 'subscribed');
  assert.equal((createdInput as { contact_hash?: string } | null)?.contact_hash?.length, 64);
  assert.equal((createdInput as { contact_ciphertext?: string } | null)?.contact_ciphertext, undefined);
  assert.equal((createdInput as { consent_at?: string } | null)?.consent_at, '2026-05-14T08:00:00.000Z');
});

test('SupportStatusSubscriptionService rate-limits repeated public submissions', async () => {
  const service = new SupportStatusSubscriptionService(
    {
      countRecentStatusSubscriptionAttempts: async () => 3,
      createStatusSubscription: async () => {
        throw new Error('rate-limited subscription should not be persisted');
      },
    } as never,
    { get: () => 'status-secret' } as never,
  );

  await assert.rejects(
    () =>
      service.subscribe({
        email: 'parent@example.com',
        consentSource: 'public_status_page',
        clientIp: '127.0.0.1',
      }),
    (error: unknown) =>
      error instanceof HttpException
      && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
  );
});

test('SupportStatusSubscriptionService unsubscribes through signed token without raw contact', async () => {
  let unsubscribedHash: string | null = null;
  const service = new SupportStatusSubscriptionService(
    {
      countRecentStatusSubscriptionAttempts: async () => 0,
      createStatusSubscription: async () => ({ id: 'subscription-1' }),
      createStatusUnsubscribeToken: async () => ({ id: 'token-1' }),
      unsubscribeStatusSubscriber: async (contactHash: string) => {
        unsubscribedHash = contactHash;
      },
      revokeStatusUnsubscribeToken: async () => undefined,
    } as never,
    { get: () => 'status-secret' } as never,
  );
  const subscribed = await service.subscribe({
    email: 'parent@example.com',
    consentSource: 'public_status_page',
  });

  const result = await service.unsubscribe({
    token: subscribed.unsubscribe_token,
  });

  assert.equal(result.status, 'unsubscribed');
  assert.equal(typeof unsubscribedHash, 'string');
  assert.equal((unsubscribedHash as unknown as string).length, 64);
});

test('SupportStatusSubscriptionService queues incident notifications without internal notes', async () => {
  const attempts: Array<Record<string, unknown>> = [];
  const service = new SupportStatusSubscriptionService(
    {
      listActiveStatusSubscribers: async () => [
        { id: 'sub-1', contact_hash: 'a'.repeat(64), locale: 'en-KE' },
        { id: 'sub-2', contact_hash: 'b'.repeat(64), locale: 'en-KE' },
      ],
      createStatusNotificationAttempt: async (input: Record<string, unknown>) => {
        attempts.push(input);
        return { id: `attempt-${attempts.length}` };
      },
    } as never,
    { get: () => 'status-secret' } as never,
  );

  const result = await service.queueIncidentNotifications({
    incidentId: 'incident-1',
    title: 'MPESA delayed',
    status: 'identified',
    updateSummary: 'Payment callbacks are delayed.',
    internalNotes: 'Provider secret escalation ID 123',
  });

  assert.equal(result.queued, 2);
  assert.equal(attempts.length, 2);
  assert.doesNotMatch(JSON.stringify(attempts), /secret escalation/i);
});

test('SupportStatusSubscriptionService sanitizes public status history', () => {
  const service = new SupportStatusSubscriptionService({} as never, { get: () => 'status-secret' } as never);

  const status = service.toPublicStatus({
    components: [{ id: 'component-1', name: 'API', status: 'operational' }],
    incidents: [
      {
        id: 'incident-active',
        title: 'Active incident',
        status: 'identified',
        impact: 'major',
        update_summary: 'Public update',
        internal_notes: 'Do not leak',
      },
      {
        id: 'incident-resolved',
        title: 'Resolved incident',
        status: 'resolved',
        impact: 'minor',
        update_summary: 'Resolved update',
        resolved_at: '2026-05-14T08:00:00.000Z',
      },
    ],
  });

  assert.equal(status.active_incidents.length, 1);
  assert.equal(status.historical_incidents.length, 1);
  assert.doesNotMatch(JSON.stringify(status), /internal_notes|Do not leak/);
});
