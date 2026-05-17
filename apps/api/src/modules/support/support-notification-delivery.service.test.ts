import test from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { SupportNotificationDeliveryService } from './support-notification-delivery.service';

Logger.overrideLogger(false);

const originalFetch = globalThis.fetch;

test('SupportNotificationDeliveryService reports provider readiness without exposing secrets', async () => {
  const service = new SupportNotificationDeliveryService(
    {
      get: (key: string) => {
        if (key === 'support.notificationEmails') {
          return ['support@shulehub.test', 'ops@shulehub.test'];
        }

        if (key === 'support.notificationSmsWebhookUrl') {
          return 'https://sms-gateway.test/send';
        }

        if (key === 'support.notificationSmsWebhookToken') {
          return 'sms-secret-token';
        }

        if (key === 'support.notificationSmsRecipients') {
          return ['+254700000001'];
        }

        if (key === 'support.notificationRetryWorkerEnabled') {
          return true;
        }

        if (key === 'support.notificationRetryBatchSize') {
          return 25;
        }

        if (key === 'support.notificationRetryLeaseMs') {
          return 120000;
        }

        if (key === 'support.notificationMaxAttempts') {
          return 4;
        }

        return undefined;
      },
    } as never,
    {
      getTransactionalEmailStatus: () => ({
        provider: 'resend',
        status: 'configured',
        api_key_configured: true,
        sender_configured: true,
        public_app_url_configured: true,
      }),
    } as never,
    {} as never,
  );

  const status = await service.getProviderStatus();

  assert.deepEqual(status, {
    status: 'configured',
    email: {
      status: 'configured',
      provider: 'resend',
      transactional_email: 'configured',
      recipients_configured: true,
      recipient_count: 2,
    },
    sms: {
      status: 'configured',
      dispatch_provider_configured: true,
      dispatch_provider_status: 'configured',
      webhook_url_configured: true,
      webhook_token_configured: true,
      recipients_configured: true,
      recipient_count: 1,
      missing: [],
    },
    retry: {
      worker_enabled: true,
      interval_ms: 60000,
      batch_size: 25,
      lease_ms: 120000,
      max_attempts: 4,
    },
  });
  assert.equal(JSON.stringify(status).includes('sms-secret-token'), false);
  assert.equal(JSON.stringify(status).includes('sms-gateway.test'), false);
  assert.equal(JSON.stringify(status).includes('support@shulehub.test'), false);
});

test('SupportNotificationDeliveryService reports precise missing provider status for dashboard-managed SMS', async () => {
  const service = new SupportNotificationDeliveryService(
    {
      get: (key: string) => {
        if (key === 'support.notificationEmails') {
          return ['support@shulehub.test'];
        }

        if (key === 'support.notificationSmsRecipients') {
          return ['+254700000001'];
        }

        return undefined;
      },
    } as never,
    {
      getTransactionalEmailStatus: () => ({
        provider: 'resend',
        status: 'configured',
        api_key_configured: true,
        sender_configured: true,
        public_app_url_configured: true,
      }),
    } as never,
    {} as never,
    undefined,
    {
      getReadiness: async () => ({
        status: 'missing_provider',
        provider: null,
        missing: ['default_provider'],
      }),
    } as never,
  );

  const status = await service.getProviderStatus();

  assert.equal(status.status, 'missing_provider');
  assert.equal(status.sms.status, 'missing_provider');
  assert.equal(status.sms.dispatch_provider_configured, false);
  assert.deepEqual(status.sms.missing, ['default_provider']);
  assert.equal(JSON.stringify(status).includes('+254700000001'), false);
});

test('SupportNotificationDeliveryService sends support SMS notifications through platform dispatch when available', async () => {
  const dispatched: Array<Record<string, unknown>> = [];
  const deliveryUpdates: Array<{ id: string; status: string }> = [];
  const service = new SupportNotificationDeliveryService(
    { get: () => undefined } as never,
    {} as never,
    {
      markNotificationDelivery: async (id: string, status: string) => {
        deliveryUpdates.push({ id, status });
      },
    } as never,
    undefined,
    {
      send: async (input: Record<string, unknown>) => {
        dispatched.push(input);
        return {
          status: 'sent',
          provider_id: 'provider-1',
          provider_code: 'africas_talking',
          provider_message_id: 'message-1',
        };
      },
    } as never,
  );

  await service.deliverCreatedNotifications([
    {
      id: 'notification-platform-sms-1',
      tenant_id: 'tenant-a',
      ticket_id: 'ticket-1',
      recipient_user_id: null,
      recipient_type: 'support',
      channel: 'sms',
      title: 'Critical support ticket raised: SUP-2026-000151',
      body: 'School Alpha reported admission import failures.',
      delivery_status: 'queued',
      metadata: {
        recipient_phone: '+254700000003',
        ticket_number: 'SUP-2026-000151',
      },
      created_at: '2026-05-12T09:00:00.000Z',
    },
  ]);

  assert.equal(dispatched[0]?.to, '+254700000003');
  assert.equal(dispatched[0]?.message, 'School Alpha reported admission import failures.');
  assert.equal(dispatched[0]?.source, 'support_notification');
  assert.equal(dispatched[0]?.tenant_id, 'tenant-a');
  assert.deepEqual(deliveryUpdates, [{ id: 'notification-platform-sms-1', status: 'sent' }]);
});

test('SupportNotificationDeliveryService sends support email notifications to configured recipients', async () => {
  const sent: Array<{ to: string; title: string; body: string }> = [];
  const deliveryUpdates: Array<{ id: string; status: string }> = [];
  const service = new SupportNotificationDeliveryService(
    {
      get: (key: string) => {
        if (key === 'support.notificationEmails') {
          return ['support@shulehub.test', 'ops@shulehub.test'];
        }

        return undefined;
      },
    } as never,
    {
      sendSupportNotificationEmail: async (input: { to: string; title: string; body: string }) => {
        sent.push(input);
      },
    } as never,
    {
      markNotificationDelivery: async (id: string, status: string) => {
        deliveryUpdates.push({ id, status });
      },
    } as never,
  );

  await service.deliverCreatedNotifications([
    {
      id: 'notification-1',
      tenant_id: 'tenant-a',
      ticket_id: 'ticket-1',
      recipient_user_id: null,
      recipient_type: 'support',
      channel: 'email',
      title: 'Critical support ticket raised: SUP-2026-000145',
      body: 'School Alpha reported MPESA callbacks are failing.',
      delivery_status: 'queued',
      metadata: {},
      created_at: '2026-05-12T09:00:00.000Z',
    },
  ]);

  assert.deepEqual(
    sent.map((item) => item.to),
    ['support@shulehub.test', 'ops@shulehub.test'],
  );
  assert.equal(sent[0]?.title, 'Critical support ticket raised: SUP-2026-000145');
  assert.deepEqual(deliveryUpdates, [{ id: 'notification-1', status: 'sent' }]);
});

test('SupportNotificationDeliveryService sends support SMS notifications through the configured webhook provider', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const deliveryUpdates: Array<{ id: string; status: string }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ message_id: `sms-${requests.length}` }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = new SupportNotificationDeliveryService(
      {
        get: (key: string) => {
          if (key === 'support.notificationSmsWebhookUrl') {
            return 'https://sms-gateway.test/send';
          }

          if (key === 'support.notificationSmsWebhookToken') {
            return 'sms-secret-token';
          }

          if (key === 'support.notificationSmsRecipients') {
            return ['+254700000001', '+254700000002'];
          }

          return undefined;
        },
      } as never,
      {} as never,
      {
        markNotificationDelivery: async (id: string, status: string) => {
          deliveryUpdates.push({ id, status });
        },
      } as never,
    );

    await service.deliverCreatedNotifications([
      {
        id: 'notification-sms-1',
        tenant_id: 'tenant-a',
        ticket_id: 'ticket-1',
        recipient_user_id: null,
        recipient_type: 'support',
        channel: 'sms',
        title: 'Critical support ticket raised: SUP-2026-000150',
        body: 'School Alpha reported payment downtime.',
        delivery_status: 'queued',
        metadata: { ticket_number: 'SUP-2026-000150' },
        created_at: '2026-05-12T09:00:00.000Z',
      },
    ]);

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, 'https://sms-gateway.test/send');
    assert.equal(requests[0]?.init?.method, 'POST');
    assert.equal((requests[0]?.init?.headers as Record<string, string>)?.Authorization, 'Bearer sms-secret-token');
    assert.match(String(requests[0]?.init?.body), /"\+254700000001"/);
    assert.match(String(requests[0]?.init?.body), /SUP-2026-000150/);
    assert.deepEqual(deliveryUpdates, [{ id: 'notification-sms-1', status: 'sent' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SupportNotificationDeliveryService marks email notifications failed when no recipient can be resolved', async () => {
  const deliveryUpdates: Array<{ id: string; status: string }> = [];
  const alertNotifications: Array<Record<string, unknown>> = [];
  const service = new SupportNotificationDeliveryService(
    {
      get: () => [],
    } as never,
    {
      sendSupportNotificationEmail: async () => {
        throw new Error('email should not be attempted');
      },
    } as never,
    {
      findUserEmailForNotification: async () => null,
      markNotificationDelivery: async (id: string, status: string) => {
        deliveryUpdates.push({ id, status });
      },
      createNotifications: async (inputs: Array<Record<string, unknown>>) => {
        alertNotifications.push(...inputs);
        return [];
      },
    } as never,
  );

  await service.deliverCreatedNotifications([
    {
      id: 'notification-2',
      tenant_id: 'tenant-a',
      ticket_id: 'ticket-1',
      recipient_user_id: '00000000-0000-0000-0000-000000000001',
      recipient_type: 'school',
      channel: 'email',
      title: 'Support replied on SUP-2026-000145',
      body: 'A support agent replied.',
      delivery_status: 'queued',
      metadata: {},
      created_at: '2026-05-12T09:00:00.000Z',
    },
  ]);

  assert.deepEqual(deliveryUpdates, [{ id: 'notification-2', status: 'failed' }]);
  assert.equal(alertNotifications[0]?.title, 'Support notification delivery failed');
  assert.match(String(alertNotifications[0]?.body), /No email recipients resolved|Support replied/);
});

test('SupportNotificationDeliveryService keeps provider failures queued until retry attempts are exhausted', async () => {
  const deliveryUpdates: Array<{
    id: string;
    status: string;
    details?: {
      deliveryAttempts?: number;
      lastError?: string | null;
      nextAttemptAt?: string | null;
    };
  }> = [];
  const service = new SupportNotificationDeliveryService(
    {
      get: (key: string) => {
        if (key === 'support.notificationEmails') {
          return ['support@shulehub.test'];
        }

        if (key === 'support.notificationMaxAttempts') {
          return 3;
        }

        return undefined;
      },
    } as never,
    {
      sendSupportNotificationEmail: async () => {
        throw new Error('resend temporarily unavailable');
      },
    } as never,
    {
      markNotificationDelivery: async (
        id: string,
        status: string,
        details?: {
          deliveryAttempts?: number;
          lastError?: string | null;
          nextAttemptAt?: string | null;
        },
      ) => {
        deliveryUpdates.push({ id, status, details });
      },
    } as never,
  );

  await service.deliverCreatedNotifications([
    {
      id: 'notification-3',
      tenant_id: 'tenant-a',
      ticket_id: 'ticket-1',
      recipient_user_id: null,
      recipient_type: 'support',
      channel: 'email',
      title: 'Critical support ticket raised: SUP-2026-000146',
      body: 'School Alpha reported login failures.',
      delivery_status: 'queued',
      delivery_attempts: 1,
      metadata: {},
      created_at: '2026-05-12T09:00:00.000Z',
    },
  ]);

  assert.equal(deliveryUpdates.length, 1);
  assert.equal(deliveryUpdates[0]?.id, 'notification-3');
  assert.equal(deliveryUpdates[0]?.status, 'queued');
  assert.equal(deliveryUpdates[0]?.details?.deliveryAttempts, 2);
  assert.match(deliveryUpdates[0]?.details?.lastError ?? '', /resend temporarily unavailable/);
  assert.match(deliveryUpdates[0]?.details?.nextAttemptAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('SupportNotificationDeliveryService creates an in-app support alert when email retries are exhausted', async () => {
  const deliveryUpdates: Array<{
    id: string;
    status: string;
    details?: {
      deliveryAttempts?: number;
      lastError?: string | null;
      nextAttemptAt?: string | null;
    };
  }> = [];
  const alertNotifications: Array<Record<string, unknown>> = [];
  const service = new SupportNotificationDeliveryService(
    {
      get: (key: string) => {
        if (key === 'support.notificationEmails') {
          return ['support@shulehub.test'];
        }

        if (key === 'support.notificationMaxAttempts') {
          return 3;
        }

        return undefined;
      },
    } as never,
    {
      sendSupportNotificationEmail: async () => {
        throw new Error('resend permanently unavailable');
      },
    } as never,
    {
      markNotificationDelivery: async (
        id: string,
        status: string,
        details?: {
          deliveryAttempts?: number;
          lastError?: string | null;
          nextAttemptAt?: string | null;
        },
      ) => {
        deliveryUpdates.push({ id, status, details });
      },
      createNotifications: async (inputs: Array<Record<string, unknown>>) => {
        alertNotifications.push(...inputs);
        return [];
      },
    } as never,
  );

  await service.deliverCreatedNotifications([
    {
      id: 'notification-5',
      tenant_id: 'tenant-a',
      ticket_id: 'ticket-1',
      recipient_user_id: null,
      recipient_type: 'support',
      channel: 'email',
      title: 'Critical support ticket raised: SUP-2026-000148',
      body: 'School Alpha reported exam upload failures.',
      delivery_status: 'queued',
      delivery_attempts: 2,
      metadata: { ticket_number: 'SUP-2026-000148' },
      created_at: '2026-05-12T09:00:00.000Z',
    },
  ]);

  assert.equal(deliveryUpdates[0]?.status, 'failed');
  assert.equal(deliveryUpdates[0]?.details?.deliveryAttempts, 3);
  assert.deepEqual(alertNotifications, [
    {
      tenant_id: 'tenant-a',
      ticket_id: 'ticket-1',
      recipient_type: 'support',
      channel: 'in_app',
      title: 'Support notification delivery failed',
      body: 'Email delivery failed for "Critical support ticket raised: SUP-2026-000148" after 3 attempts.',
      metadata: {
        failed_notification_id: 'notification-5',
        failed_channel: 'email',
        failed_delivery_status: 'failed',
        delivery_attempts: 3,
        last_delivery_error: 'resend permanently unavailable',
        ticket_number: 'SUP-2026-000148',
      },
    },
  ]);
});

test('SupportNotificationDeliveryService claims due queued email notifications before retry delivery', async () => {
  const requestContext = new RequestContextService();
  const claimedLimits: Array<{ limit: number; leaseMs: number }> = [];
  const sent: Array<{ to: string; title: string; body: string }> = [];
  const deliveryUpdates: Array<{ id: string; status: string }> = [];
  const service = new SupportNotificationDeliveryService(
    {
      get: (key: string) => {
        if (key === 'support.notificationRetryBatchSize') {
          return 25;
        }

        if (key === 'support.notificationRetryLeaseMs') {
          return 120000;
        }

        return undefined;
      },
    } as never,
    {
      sendSupportNotificationEmail: async (input: { to: string; title: string; body: string }) => {
        sent.push(input);
      },
    } as never,
    {
      claimDueQueuedNotifications: async (
        limit: number,
        leaseMs: number,
        channels: Array<'email' | 'sms'>,
      ) => {
        const context = requestContext.getStore();
        assert.equal(context?.role, 'system');
        assert.equal(context?.path, '/internal/support/notification-retry');
        claimedLimits.push({ limit, leaseMs });
        assert.deepEqual(channels, ['email', 'sms']);

        return [
          {
            id: 'notification-4',
            tenant_id: 'tenant-a',
            ticket_id: 'ticket-1',
            recipient_user_id: null,
            recipient_type: 'support',
            channel: 'email',
            title: 'Critical support ticket raised: SUP-2026-000147',
            body: 'School Alpha reported fee receipt failures.',
            delivery_status: 'queued',
            delivery_attempts: 2,
            metadata: {
              recipient_email: 'lead@shulehub.test',
            },
            created_at: '2026-05-12T09:00:00.000Z',
          },
        ];
      },
      markNotificationDelivery: async (id: string, status: string) => {
        deliveryUpdates.push({ id, status });
      },
    } as never,
    requestContext,
  );

  const processed = await service.processDueQueuedEmailNotifications();

  assert.equal(processed, 1);
  assert.deepEqual(claimedLimits, [{ limit: 25, leaseMs: 120000 }]);
  assert.deepEqual(sent, [
    {
      to: 'lead@shulehub.test',
      title: 'Critical support ticket raised: SUP-2026-000147',
      body: 'School Alpha reported fee receipt failures.',
    },
  ]);
  assert.deepEqual(deliveryUpdates, [{ id: 'notification-4', status: 'sent' }]);
});
