import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { SupportService } from './support.service';

test('SupportService creates a critical ticket with diagnostic context, escalation, notifications, and audit trail', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    notifications: [],
    messages: [],
    statusLogs: [],
  };

  const service = new SupportService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      ensureDefaultCategories: async (tenantId: string) => {
        captured.defaultCategoryTenantId = tenantId;
      },
      findCategoryByName: async () => ({
        id: 'category-mpesa',
        name: 'MPESA',
        response_sla_minutes: 15,
        resolution_sla_minutes: 120,
      }),
      generateTicketNumber: async () => 'SUP-2026-000145',
      createTicket: async (input: Record<string, unknown>) => {
        captured.ticket = input;
        return {
          id: '00000000-0000-0000-0000-00000000aaa1',
          created_at: '2026-05-08T08:00:00.000Z',
          updated_at: '2026-05-08T08:00:00.000Z',
          school_name: 'Baraka Academy',
          ...input,
        };
      },
      createMessage: async (input: Record<string, unknown>) => {
        (captured.messages as Record<string, unknown>[]).push(input);
        return {
          id: '00000000-0000-0000-0000-00000000bbb1',
          created_at: '2026-05-08T08:00:01.000Z',
          ...input,
        };
      },
      createStatusLog: async (input: Record<string, unknown>) => {
        (captured.statusLogs as Record<string, unknown>[]).push(input);
      },
      createNotifications: async (inputs: Array<Record<string, unknown>>) => {
        (captured.notifications as Record<string, unknown>[]).push(...inputs);
      },
    } as never,
    {} as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-support-1',
      tenant_id: 'tenant-baraka',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'principal',
      session_id: 'session-support-1',
      permissions: ['support:create', 'support:view'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'Mozilla/5.0 Chrome/124 Android',
      method: 'POST',
      path: '/support/tickets',
      started_at: '2026-05-08T08:00:00.000Z',
    },
    () =>
      service.createTicket({
        subject: 'MPESA callbacks are failing',
        category: 'MPESA',
        priority: 'Critical',
        module_affected: 'MPESA',
        description: 'Callbacks are returning 500 and receipts are not matching learners.',
        browser: 'Chrome 124',
        device: 'Android phone',
        current_page_url: '/school/principal/mpesa',
        app_version: '2026.05.08',
        error_logs: ['POST /mpesa/callback 500'],
      }),
  );

  assert.equal(response.ticket.ticket_number, 'SUP-2026-000145');
  assert.equal(response.ticket.status, 'Escalated');
  assert.equal(captured.defaultCategoryTenantId, 'tenant-baraka');
  assert.deepEqual(captured.ticket, {
    tenant_id: 'tenant-baraka',
    ticket_number: 'SUP-2026-000145',
    subject: 'MPESA callbacks are failing',
    category: 'MPESA',
    priority: 'Critical',
    module_affected: 'MPESA',
    description: 'Callbacks are returning 500 and receipts are not matching learners.',
    status: 'Escalated',
    requester_user_id: '00000000-0000-0000-0000-000000000001',
    assigned_agent_id: null,
    first_response_due_at: '2026-05-08T08:15:00.000Z',
    resolution_due_at: '2026-05-08T10:00:00.000Z',
    context: {
      request_id: 'req-support-1',
      browser: 'Chrome 124',
      device: 'Android phone',
      current_page_url: '/school/principal/mpesa',
      app_version: '2026.05.08',
      error_logs: ['POST /mpesa/callback 500'],
      user_agent: 'Mozilla/5.0 Chrome/124 Android',
      client_ip: '127.0.0.1',
      method: 'POST',
      path: '/support/tickets',
    },
  });
  assert.equal((captured.messages as Record<string, unknown>[])[0]?.author_type, 'school');
  assert.equal((captured.statusLogs as Record<string, unknown>[])[0]?.action, 'ticket.created');
  assert.equal((captured.notifications as Record<string, unknown>[]).length, 2);
  assert.deepEqual(
    (captured.notifications as Record<string, unknown>[]).map((item) => item.channel),
    ['in_app', 'email'],
  );
  assert.match(
    String((captured.notifications as Record<string, unknown>[])[0]?.title),
    /Critical support ticket raised/,
  );
});

test('SupportService keeps internal notes private while public replies notify the school', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    notes: [],
    messages: [],
    notifications: [],
  };
  const existingTicket = {
    id: '00000000-0000-0000-0000-00000000aaa1',
    tenant_id: 'tenant-baraka',
    ticket_number: 'SUP-2026-000145',
    subject: 'MPESA callbacks are failing',
    category: 'MPESA',
    priority: 'Critical',
    module_affected: 'MPESA',
    description: 'Callbacks failing',
    status: 'In Progress',
    requester_user_id: '00000000-0000-0000-0000-000000000001',
    assigned_agent_id: null,
    first_response_due_at: '2026-05-08T08:15:00.000Z',
    resolution_due_at: '2026-05-08T10:00:00.000Z',
    first_responded_at: null,
    context: {},
    created_at: '2026-05-08T08:00:00.000Z',
    updated_at: '2026-05-08T08:00:00.000Z',
  };

  const service = new SupportService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findTicketByIdForAccess: async () => existingTicket,
      createMessage: async (input: Record<string, unknown>) => {
        (captured.messages as Record<string, unknown>[]).push(input);
        return {
          id: '00000000-0000-0000-0000-00000000ccc1',
          created_at: '2026-05-08T08:10:00.000Z',
          ...input,
        };
      },
      markFirstResponseIfNeeded: async (ticketId: string, respondedAt: string) => {
        captured.firstResponse = { ticketId, respondedAt };
      },
      updateTicketStatus: async (_ticketId: string, status: string) => ({
        ...existingTicket,
        status,
      }),
      createStatusLog: async (input: Record<string, unknown>) => {
        captured.statusLog = input;
      },
      createNotifications: async (inputs: Array<Record<string, unknown>>) => {
        (captured.notifications as Record<string, unknown>[]).push(...inputs);
      },
      createInternalNote: async (input: Record<string, unknown>) => {
        (captured.notes as Record<string, unknown>[]).push(input);
        return {
          id: '00000000-0000-0000-0000-00000000ddd1',
          created_at: '2026-05-08T08:11:00.000Z',
          ...input,
        };
      },
    } as never,
    {} as never,
  );

  await requestContext.run(
    {
      request_id: 'req-support-reply-1',
      tenant_id: 'global',
      user_id: '00000000-0000-0000-0000-000000000999',
      role: 'platform_owner',
      session_id: 'session-support-agent',
      permissions: ['support:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'support-console',
      method: 'POST',
      path: '/support/tickets/00000000-0000-0000-0000-00000000aaa1/messages',
      started_at: '2026-05-08T08:10:00.000Z',
    },
    async () => {
      await service.replyToTicket('00000000-0000-0000-0000-00000000aaa1', {
        body: 'We have isolated the Daraja callback retry issue and are monitoring receipts.',
        next_status: 'Waiting for School',
      });

      await service.addInternalNote('00000000-0000-0000-0000-00000000aaa1', {
        note: 'Bug confirmed. Deploying fix tonight.',
      });
    },
  );

  assert.equal((captured.messages as Record<string, unknown>[]).length, 1);
  assert.equal((captured.messages as Record<string, unknown>[])[0]?.author_type, 'support');
  assert.equal((captured.messages as Record<string, unknown>[])[0]?.body, 'We have isolated the Daraja callback retry issue and are monitoring receipts.');
  assert.equal((captured.notes as Record<string, unknown>[]).length, 1);
  assert.equal((captured.notes as Record<string, unknown>[])[0]?.note, 'Bug confirmed. Deploying fix tonight.');
  assert.equal((captured.notifications as Record<string, unknown>[]).length, 2);
  assert.match(String((captured.notifications as Record<string, unknown>[])[0]?.title), /Support replied/);
});
