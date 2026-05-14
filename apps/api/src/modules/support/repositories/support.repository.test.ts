import assert from 'node:assert/strict';
import test from 'node:test';

import { SupportRepository } from './support.repository';

test('SupportRepository uses the production tenants.name column as the support school label', async () => {
  const queries: string[] = [];
  const repository = new SupportRepository({
    query: async (text: string) => {
      queries.push(text);
      return { rows: [] };
    },
  } as never);

  await repository.listTickets({
    search: 'academy',
    limit: 50,
    offset: 0,
  });
  await repository.findTicketByIdForAccess('00000000-0000-0000-0000-00000000aaa1');

  assert.equal(queries.some((query) => query.includes('tenant.school_name')), false);
  assert.equal(queries.every((query) => query.includes('tenant.name')), true);
  assert.equal(queries.every((query) => query.includes('AS school_name')), true);
});

test('SupportRepository leases due queued email notifications with row locking before retry delivery', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new SupportRepository({
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.claimDueQueuedEmailNotifications(50, 300000);

  const claimQuery = queries[0]?.text ?? '';
  assert.match(claimQuery, /FOR UPDATE SKIP LOCKED/);
  assert.match(claimQuery, /next_delivery_attempt_at = NOW\(\) \+ \(\$2::integer \* INTERVAL '1 millisecond'\)/);
  assert.match(claimQuery, /delivery_status = 'queued'/);
  assert.match(claimQuery, /channel = ANY\(\$3::text\[\]\)/);
  assert.deepEqual(queries[0]?.values, [50, 300000, ['email']]);
});

test('SupportRepository leases due queued email and SMS notifications for provider retry delivery', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new SupportRepository({
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.claimDueQueuedNotifications(25, 120000, ['email', 'sms']);

  const claimQuery = queries[0]?.text ?? '';
  assert.match(claimQuery, /FOR UPDATE SKIP LOCKED/);
  assert.match(claimQuery, /channel = ANY\(\$3::text\[\]\)/);
  assert.deepEqual(queries[0]?.values, [25, 120000, ['email', 'sms']]);
});

test('SupportRepository lists failed notification deliveries for dead-letter review', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new SupportRepository({
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.listNotificationDeadLetters({ limit: 25 });

  const deadLetterQuery = queries[0]?.text ?? '';
  assert.match(deadLetterQuery, /FROM support_notifications notification/);
  assert.match(deadLetterQuery, /notification.delivery_status = 'failed'/);
  assert.match(deadLetterQuery, /LEFT JOIN support_tickets ticket/);
  assert.match(deadLetterQuery, /LEFT JOIN tenants tenant/);
  assert.deepEqual(queries[0]?.values, [25]);
});

test('SupportRepository lists unresolved tickets with unrecorded SLA breaches', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new SupportRepository({
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.listSlaBreachCandidates({ limit: 40 });

  const breachQuery = queries[0]?.text ?? '';
  assert.match(breachQuery, /FROM support_tickets ticket/);
  assert.match(breachQuery, /ticket.status NOT IN \('Resolved', 'Closed'\)/);
  assert.match(breachQuery, /first_response_due_at < NOW\(\)/);
  assert.match(breachQuery, /resolution_due_at < NOW\(\)/);
  assert.match(breachQuery, /NOT EXISTS/);
  assert.match(breachQuery, /ticket.sla_breached/);
  assert.deepEqual(queries[0]?.values, [40]);
});

test('SupportRepository clears resolved and closed timestamps when tickets reopen', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new SupportRepository({
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.updateTicketStatus(
    '00000000-0000-0000-0000-00000000aaa1',
    'In Progress',
    '00000000-0000-0000-0000-000000000999',
  );

  const updateQuery = queries[0]?.text ?? '';
  assert.match(updateQuery, /WHEN \$2 NOT IN \('Resolved', 'Closed'\) THEN NULL/);
  assert.match(updateQuery, /WHEN \$2 <> 'Closed' THEN NULL/);
  assert.deepEqual(queries[0]?.values, [
    '00000000-0000-0000-0000-00000000aaa1',
    'In Progress',
    '00000000-0000-0000-0000-000000000999',
  ]);
});
