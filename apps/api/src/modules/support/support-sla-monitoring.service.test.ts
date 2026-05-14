import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { SupportSlaMonitoringService } from './support-sla-monitoring.service';

test('SupportSlaMonitoringService records overdue SLA breaches and notifies support', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    statusLogs: [],
    notifications: [],
    deliveredNotifications: [],
  };
  const service = new SupportSlaMonitoringService(
    {
      get: (key: string) => {
        if (key === 'support.slaBreachBatchSize') {
          return 25;
        }

        return undefined;
      },
    } as never,
    {
      listSlaBreachCandidates: async (options: Record<string, unknown>) => {
        captured.options = options;
        return [
          {
            id: '00000000-0000-0000-0000-00000000aaa1',
            tenant_id: 'tenant-baraka',
            ticket_number: 'SUP-2026-000151',
            subject: 'MPESA callbacks delayed',
            category: 'MPESA',
            priority: 'Critical',
            module_affected: 'MPESA',
            description: 'Callbacks delayed',
            status: 'Escalated',
            requester_user_id: '00000000-0000-0000-0000-000000000001',
            assigned_agent_id: null,
            first_response_due_at: '2026-05-08T08:15:00.000Z',
            resolution_due_at: '2026-05-08T10:00:00.000Z',
            context: {},
            school_name: 'School Alpha',
            created_at: '2026-05-08T08:00:00.000Z',
            updated_at: '2026-05-08T08:20:00.000Z',
            sla_breach_type: 'first_response',
            sla_due_at: '2026-05-08T08:15:00.000Z',
          },
        ];
      },
      createStatusLog: async (input: Record<string, unknown>) => {
        (captured.statusLogs as Record<string, unknown>[]).push(input);
      },
      createNotifications: async (inputs: Array<Record<string, unknown>>) => {
        (captured.notifications as Record<string, unknown>[]).push(...inputs);
        return inputs.map((input, index) => ({
          id: `notification-${index}`,
          delivery_status: input.channel === 'in_app' ? 'queued' : 'queued',
          delivery_attempts: 0,
          last_delivery_error: null,
          next_delivery_attempt_at: null,
          delivered_at: null,
          created_at: '2026-05-08T08:20:00.000Z',
          ...input,
        }));
      },
    } as never,
    requestContext,
    {
      deliverCreatedNotifications: async (notifications: unknown[]) => {
        (captured.deliveredNotifications as unknown[]).push(...notifications);
      },
    } as never,
  );

  const processed = await service.processDueSlaBreaches();

  assert.equal(processed, 1);
  assert.deepEqual(captured.options, { limit: 25 });
  assert.equal((captured.statusLogs as Record<string, unknown>[])[0]?.action, 'ticket.sla_breached');
  assert.deepEqual((captured.statusLogs as Record<string, unknown>[])[0]?.metadata, {
    breach_type: 'first_response',
    due_at: '2026-05-08T08:15:00.000Z',
    ticket_number: 'SUP-2026-000151',
    priority: 'Critical',
  });
  assert.deepEqual(
    (captured.notifications as Record<string, unknown>[]).map((item) => item.channel),
    ['in_app', 'email'],
  );
  assert.equal((captured.deliveredNotifications as unknown[]).length, 2);
});

test('SupportSlaMonitoringService runs scheduled scans under system request context', async () => {
  const requestContext = new RequestContextService();
  const service = new SupportSlaMonitoringService(
    {
      get: (key: string) => {
        if (key === 'support.slaBreachBatchSize') {
          return 10;
        }

        return undefined;
      },
    } as never,
    {
      listSlaBreachCandidates: async () => {
        const context = requestContext.getStore();
        assert.equal(context?.role, 'system');
        assert.equal(context?.path, '/internal/support/sla-breach-monitor');
        return [];
      },
    } as never,
    requestContext,
  );

  const processed = await service.processDueSlaBreaches();

  assert.equal(processed, 0);
});
