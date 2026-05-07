import { Injectable } from '@nestjs/common';

import { DomainEvent, EventConsumerDescriptor } from '../events.types';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';

@Injectable()
export class PaymentCompletedConsumer
  implements EventConsumerDescriptor<'payment.completed'>
{
  readonly name = 'payment-completed.audit';
  readonly event_name = 'payment.completed' as const;

  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  async handle(event: DomainEvent<'payment.completed'>): Promise<void> {
    await this.auditLogsRepository.createAuditLog({
      tenant_id: event.tenant_id,
      actor_user_id:
        typeof event.headers.user_id === 'string' ? event.headers.user_id : null,
      request_id:
        typeof event.headers.request_id === 'string' ? event.headers.request_id : null,
      action: 'payment.completed',
      resource_type: 'payment',
      resource_id: event.aggregate_id,
      metadata: {
        consumer: this.name,
        event_id: event.id,
        event_key: event.event_key,
        payload: event.payload,
      },
    });
  }
}
