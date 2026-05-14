import assert from 'node:assert/strict';
import test from 'node:test';
import { PATH_METADATA } from '@nestjs/common/constants';

import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { SupportController } from './support.controller';
import { SupportSchemaService } from './support-schema.service';
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
          school_name: 'School Alpha',
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

test('SupportController exposes public system status without support permissions', () => {
  const handler = SupportController.prototype.getPublicSystemStatus as unknown as Function;

  assert.equal(typeof handler, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'public/system-status');
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
  assert.equal(Reflect.hasMetadata(PERMISSIONS_KEY, handler), false);
});

test('SupportSchemaService adds full-text indexes for ticket and knowledge-base search', async () => {
  let schemaSql = '';
  const service = new SupportSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_support_tickets_search_vector/);
  assert.match(schemaSql, /ON support_tickets\s+USING GIN/);
  assert.match(schemaSql, /ticket_number/);
  assert.match(schemaSql, /description/);
  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_support_kb_articles_search_vector/);
  assert.match(schemaSql, /ON support_kb_articles\s+USING GIN/);
  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_support_kb_articles_tags/);
  assert.doesNotMatch(schemaSql, /array_to_string\(tags/);
  assert.doesNotMatch(schemaSql, /attendance/i);
});

test('SupportService adds SMS escalation notifications for critical tickets when SMS provider config is present', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    notifications: [],
  };
  const service = new SupportService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      ensureDefaultCategories: async () => undefined,
      findCategoryByName: async () => ({
        id: 'category-mpesa',
        name: 'MPESA',
        response_sla_minutes: 15,
        resolution_sla_minutes: 120,
      }),
      generateTicketNumber: async () => 'SUP-2026-000150',
      createTicket: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-00000000aaa2',
        created_at: '2026-05-08T08:00:00.000Z',
        updated_at: '2026-05-08T08:00:00.000Z',
        school_name: 'School Alpha',
        ...input,
      }),
      createMessage: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-00000000bbb2',
        created_at: '2026-05-08T08:00:01.000Z',
        ...input,
      }),
      createStatusLog: async () => undefined,
      createNotifications: async (inputs: Array<Record<string, unknown>>) => {
        (captured.notifications as Record<string, unknown>[]).push(...inputs);
        return [];
      },
    } as never,
    {} as never,
    undefined,
    {
      get: (key: string) => {
        if (key === 'support.notificationSmsWebhookUrl') {
          return 'https://sms-gateway.test/send';
        }

        if (key === 'support.notificationSmsRecipients') {
          return ['+254700000001'];
        }

        return undefined;
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-support-sms-1',
      tenant_id: 'tenant-baraka',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'principal',
      session_id: 'session-support-sms',
      permissions: ['support:create', 'support:view'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'Mozilla/5.0 Chrome/124',
      method: 'POST',
      path: '/support/tickets',
      started_at: '2026-05-08T08:00:00.000Z',
    },
    () =>
      service.createTicket({
        subject: 'MPESA outage',
        category: 'MPESA',
        priority: 'Critical',
        module_affected: 'MPESA',
        description: 'Payment callback processing is down.',
      }),
  );

  assert.deepEqual(
    (captured.notifications as Record<string, unknown>[]).map((item) => item.channel),
    ['in_app', 'email', 'sms'],
  );
  assert.equal((captured.notifications as Record<string, unknown>[])[2]?.title, 'Critical support ticket raised: SUP-2026-000150');
});

test('SupportService dispatches critical ticket notifications through the delivery service', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    deliveredNotifications: [],
  };
  const service = new SupportService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      ensureDefaultCategories: async () => undefined,
      findCategoryByName: async () => ({
        id: 'category-mpesa',
        name: 'MPESA',
        response_sla_minutes: 15,
        resolution_sla_minutes: 120,
      }),
      generateTicketNumber: async () => 'SUP-2026-000152',
      createTicket: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-00000000aaa3',
        created_at: '2026-05-08T08:00:00.000Z',
        updated_at: '2026-05-08T08:00:00.000Z',
        school_name: 'School Alpha',
        ...input,
      }),
      createMessage: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-00000000bbb3',
        created_at: '2026-05-08T08:00:01.000Z',
        ...input,
      }),
      createStatusLog: async () => undefined,
      createNotifications: async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((input, index) => ({
          id: `notification-${index + 1}`,
          delivery_status: 'queued',
          delivery_attempts: 0,
          created_at: '2026-05-08T08:00:02.000Z',
          ...input,
        })),
    } as never,
    {} as never,
    {
      deliverCreatedNotifications: async (notifications: Array<Record<string, unknown>>) => {
        (captured.deliveredNotifications as Array<Record<string, unknown>>).push(...notifications);
      },
    } as never,
    {
      get: (key: string) => {
        if (key === 'support.notificationSmsWebhookUrl') {
          return 'https://sms-gateway.test/send';
        }

        if (key === 'support.notificationSmsRecipients') {
          return ['+254700000001'];
        }

        return undefined;
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-support-critical-notify-1',
      tenant_id: 'tenant-baraka',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'principal',
      session_id: 'session-support-critical',
      permissions: ['support:create', 'support:view'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'Mozilla/5.0 Chrome/124',
      method: 'POST',
      path: '/support/tickets',
      started_at: '2026-05-08T08:00:00.000Z',
    },
    () =>
      service.createTicket({
        subject: 'MPESA outage',
        category: 'MPESA',
        priority: 'Critical',
        module_affected: 'MPESA',
        description: 'Payment callback processing is down.',
      }),
  );

  assert.deepEqual(
    (captured.deliveredNotifications as Array<Record<string, unknown>>).map((item) => item.channel),
    ['in_app', 'email', 'sms'],
  );
  assert.equal(
    (captured.deliveredNotifications as Array<Record<string, unknown>>)[1]?.title,
    'Critical support ticket raised: SUP-2026-000152',
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

test('SupportService reopens resolved tickets when the school replies', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    messages: [],
    notifications: [],
    statusLogs: [],
  };
  const existingTicket = {
    id: '00000000-0000-0000-0000-00000000aaa1',
    tenant_id: 'tenant-baraka',
    ticket_number: 'SUP-2026-000145',
    subject: 'MPESA callbacks are failing',
    category: 'MPESA',
    priority: 'High',
    module_affected: 'MPESA',
    description: 'Callbacks failing',
    status: 'Resolved',
    requester_user_id: '00000000-0000-0000-0000-000000000001',
    assigned_agent_id: '00000000-0000-0000-0000-000000000099',
    first_response_due_at: '2026-05-08T08:15:00.000Z',
    resolution_due_at: '2026-05-08T10:00:00.000Z',
    first_responded_at: '2026-05-08T08:12:00.000Z',
    resolved_at: '2026-05-08T10:00:00.000Z',
    closed_at: null,
    context: {},
    created_at: '2026-05-08T08:00:00.000Z',
    updated_at: '2026-05-08T10:00:00.000Z',
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
          id: '00000000-0000-0000-0000-00000000ccc2',
          created_at: '2026-05-08T10:15:00.000Z',
          ...input,
        };
      },
      updateTicketStatus: async (_ticketId: string, status: string) => ({
        ...existingTicket,
        status,
        resolved_at: null,
      }),
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
      request_id: 'req-support-reopen-1',
      tenant_id: 'tenant-baraka',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'principal',
      session_id: 'session-school-reply',
      permissions: ['support:reply', 'support:view'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'school-console',
      method: 'POST',
      path: '/support/tickets/00000000-0000-0000-0000-00000000aaa1/messages',
      started_at: '2026-05-08T10:15:00.000Z',
    },
    () =>
      service.replyToTicket('00000000-0000-0000-0000-00000000aaa1', {
        body: 'The receipts failed again after the fix.',
      }),
  );

  assert.equal(response.ticket.status, 'In Progress');
  assert.equal((captured.messages as Record<string, unknown>[])[0]?.author_type, 'school');
  assert.equal((captured.statusLogs as Record<string, unknown>[])[0]?.action, 'ticket.reopened');
  assert.deepEqual((captured.statusLogs as Record<string, unknown>[])[0]?.metadata, {
    source: 'reply',
    author_type: 'school',
    requested_status: null,
  });
  assert.equal((captured.notifications as Record<string, unknown>[])[0]?.recipient_type, 'support');
});

test('SupportService requires support agents to explicitly reopen closed tickets before replying', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {
    messages: [],
  };
  const existingTicket = {
    id: '00000000-0000-0000-0000-00000000aaa1',
    tenant_id: 'tenant-baraka',
    ticket_number: 'SUP-2026-000145',
    subject: 'MPESA callbacks are failing',
    category: 'MPESA',
    priority: 'High',
    module_affected: 'MPESA',
    description: 'Callbacks failing',
    status: 'Closed',
    requester_user_id: '00000000-0000-0000-0000-000000000001',
    assigned_agent_id: '00000000-0000-0000-0000-000000000099',
    first_response_due_at: '2026-05-08T08:15:00.000Z',
    resolution_due_at: '2026-05-08T10:00:00.000Z',
    first_responded_at: '2026-05-08T08:12:00.000Z',
    resolved_at: '2026-05-08T10:00:00.000Z',
    closed_at: '2026-05-08T11:00:00.000Z',
    context: {},
    created_at: '2026-05-08T08:00:00.000Z',
    updated_at: '2026-05-08T11:00:00.000Z',
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
        return input;
      },
    } as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-support-closed-reply-1',
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
          started_at: '2026-05-08T11:15:00.000Z',
        },
        () =>
          service.replyToTicket('00000000-0000-0000-0000-00000000aaa1', {
            body: 'Following up on the closed issue.',
          }),
      ),
    /Closed support tickets require an explicit reopen status/,
  );

  assert.equal((captured.messages as Record<string, unknown>[]).length, 0);
});

test('SupportService records previous and new assignee details in assignment audit logs', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {};
  const existingTicket = {
    id: '00000000-0000-0000-0000-00000000aaa1',
    tenant_id: 'tenant-baraka',
    ticket_number: 'SUP-2026-000145',
    subject: 'MPESA callbacks are failing',
    category: 'MPESA',
    priority: 'High',
    module_affected: 'MPESA',
    description: 'Callbacks failing',
    status: 'In Progress',
    requester_user_id: '00000000-0000-0000-0000-000000000001',
    assigned_agent_id: '00000000-0000-0000-0000-000000000099',
    first_response_due_at: '2026-05-08T08:15:00.000Z',
    resolution_due_at: '2026-05-08T10:00:00.000Z',
    first_responded_at: '2026-05-08T08:12:00.000Z',
    resolved_at: null,
    closed_at: null,
    context: {},
    created_at: '2026-05-08T08:00:00.000Z',
    updated_at: '2026-05-08T11:00:00.000Z',
  };

  const service = new SupportService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findTicketByIdForAccess: async () => existingTicket,
      assignTicket: async (_ticketId: string, assignedAgentId: string) => ({
        ...existingTicket,
        assigned_agent_id: assignedAgentId,
      }),
      createStatusLog: async (input: Record<string, unknown>) => {
        captured.statusLog = input;
      },
    } as never,
    {} as never,
  );

  await requestContext.run(
    {
      request_id: 'req-support-assign-1',
      tenant_id: 'global',
      user_id: '00000000-0000-0000-0000-000000000999',
      role: 'platform_owner',
      session_id: 'session-support-agent',
      permissions: ['support:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'support-console',
      method: 'PATCH',
      path: '/support/tickets/00000000-0000-0000-0000-00000000aaa1/assign',
      started_at: '2026-05-08T11:20:00.000Z',
    },
    () =>
      service.assignTicket('00000000-0000-0000-0000-00000000aaa1', {
        assigned_agent_id: '00000000-0000-0000-0000-000000000100',
      }),
  );

  assert.equal((captured.statusLog as Record<string, unknown>).action, 'ticket.assigned');
  assert.deepEqual((captured.statusLog as Record<string, unknown>).metadata, {
    previous_assigned_agent_id: '00000000-0000-0000-0000-000000000099',
    assigned_agent_id: '00000000-0000-0000-0000-000000000100',
    reassigned: true,
  });
});

test('SupportService exposes failed support notification deliveries only to support operators', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {};
  const service = new SupportService(
    requestContext,
    {} as never,
    {
      listNotificationDeadLetters: async (options: Record<string, unknown>) => {
        captured.options = options;
        return [
          {
            id: '00000000-0000-0000-0000-00000000eee1',
            tenant_id: 'tenant-baraka',
            ticket_id: '00000000-0000-0000-0000-00000000aaa1',
            recipient_user_id: null,
            recipient_type: 'support',
            channel: 'email',
            title: 'Critical support ticket raised: SUP-2026-000145',
            body: 'School Alpha reported MPESA callbacks in MPESA.',
            delivery_status: 'failed',
            delivery_attempts: 3,
            last_delivery_error: 'SMTP rejected recipient',
            next_delivery_attempt_at: null,
            delivered_at: null,
            metadata: { ticket_number: 'SUP-2026-000145' },
            created_at: '2026-05-08T08:00:00.000Z',
          },
        ];
      },
    } as never,
    {} as never,
  );

  const deadLetters = await requestContext.run(
    {
      request_id: 'req-support-dead-letter-1',
      tenant_id: 'global',
      user_id: '00000000-0000-0000-0000-000000000999',
      role: 'platform_owner',
      session_id: 'session-support-agent',
      permissions: ['support:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'support-console',
      method: 'GET',
      path: '/support/admin/notifications/dead-letter',
      started_at: '2026-05-08T08:10:00.000Z',
    },
    () => service.listNotificationDeadLetters(),
  );

  assert.deepEqual(captured.options, { limit: 30 });
  assert.equal(deadLetters[0]?.delivery_status, 'failed');
  assert.equal(deadLetters[0]?.last_delivery_error, 'SMTP rejected recipient');
});

test('SupportService scans attachments before tenant file persistence when upload scanning is configured', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {};
  const service = new SupportService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findTicketByIdForAccess: async () => ({
        id: '00000000-0000-0000-0000-00000000aaa1',
        tenant_id: 'tenant-baraka',
        status: 'Open',
      }),
      createAttachment: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-00000000bbb1',
        ...input,
      }),
      createStatusLog: async (input: Record<string, unknown>) => {
        captured.statusLog = input;
      },
    } as never,
    {
      save: async (input: Record<string, unknown>) => {
        captured.savedFile = input.file;
        return {
          stored_path: 'tenant/tenant-baraka/support/00000000-0000-0000-0000-00000000aaa1/incident-note.txt',
          original_file_name: 'incident-note.txt',
          mime_type: 'text/plain',
          size_bytes: 128,
        };
      },
    } as never,
    undefined,
    undefined,
    {
      scanIfConfigured: async (file: Record<string, unknown>) => {
        captured.scannedFile = file;
        return {
          provider: 'clamav',
          status: 'clean',
          scannedAt: '2026-05-14T14:20:00.000Z',
        };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-support-upload-scan-1',
      tenant_id: 'tenant-baraka',
      user_id: '00000000-0000-0000-0000-000000000999',
      role: 'support_agent',
      session_id: 'session-support-agent',
      permissions: ['support:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'support-console',
      method: 'POST',
      path: '/support/tickets/00000000-0000-0000-0000-00000000aaa1/attachments',
      started_at: '2026-05-14T14:20:00.000Z',
    },
    () =>
      service.uploadAttachment(
        '00000000-0000-0000-0000-00000000aaa1',
        {},
        {
          originalname: 'incident-note.txt',
          mimetype: 'text/plain',
          size: 128,
          buffer: Buffer.from('support incident note'),
        },
      ),
  );

  assert.equal((captured.scannedFile as { originalname: string }).originalname, 'incident-note.txt');
  assert.deepEqual((captured.savedFile as { providerMalwareScan: unknown }).providerMalwareScan, {
    provider: 'clamav',
    status: 'clean',
    scannedAt: '2026-05-14T14:20:00.000Z',
  });
});
