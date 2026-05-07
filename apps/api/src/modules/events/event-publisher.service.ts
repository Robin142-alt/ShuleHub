import { BadRequestException, Injectable } from '@nestjs/common';

import { AUTH_ANONYMOUS_USER_ID } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import {
  DomainEvent,
  PaymentCompletedPayload,
  PublishDomainEventInput,
  StudentCreatedPayload,
  SupportedDomainEventName,
} from './events.types';
import { OutboxEventsRepository } from './repositories/outbox-events.repository';

@Injectable()
export class EventPublisherService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly outboxEventsRepository: OutboxEventsRepository,
  ) {}

  async publish<TName extends SupportedDomainEventName>(
    input: Omit<PublishDomainEventInput<TName>, 'tenant_id' | 'headers'> & {
      tenant_id?: string;
      headers?: Record<string, unknown>;
    },
  ): Promise<DomainEvent<TName>> {
    const requestContext = this.requestContext.requireStore();
    const tenantId = input.tenant_id ?? requestContext.tenant_id;

    if (!tenantId) {
      throw new BadRequestException('Tenant context is required for domain event publishing');
    }

    return this.outboxEventsRepository.createEvent({
      tenant_id: tenantId,
      event_key: this.requireNonEmptyText(input.event_key, 'event_key'),
      event_name: input.event_name,
      aggregate_type: this.requireNonEmptyText(input.aggregate_type, 'aggregate_type'),
      aggregate_id: this.requireNonEmptyText(input.aggregate_id, 'aggregate_id'),
      payload: input.payload,
      headers: {
        request_id: requestContext.request_id,
        trace_id: requestContext.trace_id,
        span_id: requestContext.span_id,
        parent_span_id: requestContext.parent_span_id,
        user_id:
          requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
            ? requestContext.user_id
            : null,
        role: requestContext.role,
        session_id: requestContext.session_id,
        ...input.headers,
      },
      available_at: input.available_at,
    }) as Promise<DomainEvent<TName>>;
  }

  async publishStudentCreated(payload: StudentCreatedPayload): Promise<DomainEvent<'student.created'>> {
    return this.publish({
      event_key: `student.created:${payload.student_id}`,
      event_name: 'student.created',
      aggregate_type: 'student',
      aggregate_id: payload.student_id,
      payload,
    });
  }

  async publishPaymentCompleted(
    payload: PaymentCompletedPayload,
  ): Promise<DomainEvent<'payment.completed'>> {
    return this.publish({
      event_key: `payment.completed:${payload.payment_intent_id}`,
      event_name: 'payment.completed',
      aggregate_type: 'payment',
      aggregate_id: payload.payment_intent_id,
      payload,
    });
  }

  private requireNonEmptyText(value: string, fieldName: string): string {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new BadRequestException(`Domain event ${fieldName} is required`);
    }

    return normalizedValue;
  }
}
