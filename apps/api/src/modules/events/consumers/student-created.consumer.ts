import { Injectable } from '@nestjs/common';

import { EventConsumerDescriptor, DomainEvent } from '../events.types';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';

@Injectable()
export class StudentCreatedConsumer implements EventConsumerDescriptor<'student.created'> {
  readonly name = 'student-created.audit';
  readonly event_name = 'student.created' as const;

  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  async handle(event: DomainEvent<'student.created'>): Promise<void> {
    await this.auditLogsRepository.createAuditLog({
      tenant_id: event.tenant_id,
      actor_user_id:
        typeof event.headers.user_id === 'string' ? event.headers.user_id : null,
      request_id:
        typeof event.headers.request_id === 'string' ? event.headers.request_id : null,
      action: 'student.created',
      resource_type: 'student',
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
