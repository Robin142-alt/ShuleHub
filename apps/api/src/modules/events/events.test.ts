import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { EventConsumerRegistryService } from './event-consumer-registry.service';
import { EventConsumerService } from './event-consumer.service';
import { EventPublisherService } from './event-publisher.service';
import { DomainEvent } from './events.types';

test('EventPublisherService writes student.created events with request headers', async () => {
  const requestContext = new RequestContextService();
  let publishedEvent: Record<string, unknown> | null = null;
  const service = new EventPublisherService(requestContext, {
    createEvent: async (input: Record<string, unknown>) => {
      publishedEvent = input;
      return {
        id: 'event-1',
        tenant_id: input.tenant_id,
        event_key: input.event_key,
        event_name: input.event_name,
        aggregate_type: input.aggregate_type,
        aggregate_id: input.aggregate_id,
        payload: input.payload,
        headers: input.headers,
        status: 'pending',
        attempt_count: 0,
        available_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
        published_at: null,
        last_error: null,
        created_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
        updated_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
      };
    },
  } as never);

  await requestContext.run(
    {
      request_id: 'req-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/events/student-created',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.publishStudentCreated({
        tenant_id: 'tenant-a',
        student_id: '00000000-0000-0000-0000-000000000101',
        created_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        admission_number: 'ADM-1001',
      }),
  );

  assert.ok(publishedEvent);
  const writtenEvent = publishedEvent as Record<string, unknown>;

  assert.equal(writtenEvent.tenant_id, 'tenant-a');
  assert.equal(
    writtenEvent.event_key,
    'student.created:00000000-0000-0000-0000-000000000101',
  );
  assert.equal(writtenEvent.event_name, 'student.created');
  assert.equal(writtenEvent.aggregate_type, 'student');
  assert.equal(
    writtenEvent.aggregate_id,
    '00000000-0000-0000-0000-000000000101',
  );
  assert.deepEqual(writtenEvent.payload, {
    tenant_id: 'tenant-a',
    student_id: '00000000-0000-0000-0000-000000000101',
    created_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
    created_by_user_id: '00000000-0000-0000-0000-000000000001',
    admission_number: 'ADM-1001',
  });
  const headers = writtenEvent.headers as Record<string, unknown>;

  assert.equal(headers.request_id, 'req-1');
  assert.equal(headers.trace_id, 'req-1');
  assert.equal(
    headers.user_id,
    '00000000-0000-0000-0000-000000000001',
  );
  assert.equal(headers.role, 'owner');
  assert.equal(headers.session_id, 'session-1');
  assert.equal(typeof headers.span_id, 'string');
  assert.equal(headers.parent_span_id, null);
  assert.equal(writtenEvent.available_at, undefined);
});

test('EventConsumerService skips already-completed consumers', async () => {
  const requestContext = new RequestContextService();
  let consumerInvocations = 0;
  const event: DomainEvent<'student.created'> = {
    id: 'event-1',
    tenant_id: 'tenant-a',
    event_key: 'student.created:student-1',
    event_name: 'student.created',
    aggregate_type: 'student',
    aggregate_id: '00000000-0000-0000-0000-000000000111',
    payload: {
      tenant_id: 'tenant-a',
      student_id: '00000000-0000-0000-0000-000000000111',
      created_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
      created_by_user_id: null,
    },
    headers: {
      request_id: 'req-1',
    },
    status: 'processing',
    attempt_count: 1,
    available_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
    published_at: null,
    last_error: null,
    created_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
    updated_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
  };
  const consumer = {
    name: 'student-created.audit',
    event_name: 'student.created' as const,
    handle: async (): Promise<void> => {
      consumerInvocations += 1;
    },
  };
  const service = new EventConsumerService(
    {
      get: (key: string): number | undefined => {
        if (key === 'events.retryDelayMs') {
          return 5000;
        }

        if (key === 'events.maxAttempts') {
          return 25;
        }

        return undefined;
      },
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findById: async (): Promise<DomainEvent> => event,
      markPublished: async (): Promise<void> => undefined,
      markFailed: async (): Promise<void> => undefined,
    } as never,
    {
      acquireRun: async () => ({
        id: 'run-1',
        tenant_id: 'tenant-a',
        outbox_event_id: event.id,
        event_key: event.event_key,
        consumer_name: consumer.name,
        status: 'completed' as const,
        attempt_count: 1,
        last_error: null,
        processed_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
        created_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
        updated_at: new Date('2026-04-26T00:00:00.000Z').toISOString(),
      }),
      markAttempt: async (): Promise<void> => undefined,
      markCompleted: async (): Promise<void> => undefined,
      markFailed: async (): Promise<void> => undefined,
    } as never,
    {
      getConsumersForEvent: () => [consumer],
    } as unknown as EventConsumerRegistryService,
  );

  await service.consume({
    outbox_event_id: event.id,
    tenant_id: event.tenant_id,
    request_id: 'req-1',
  });

  assert.equal(consumerInvocations, 0);
});
