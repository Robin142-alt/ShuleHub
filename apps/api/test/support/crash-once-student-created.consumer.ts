import { Injectable } from '@nestjs/common';

import { EventConsumerDescriptor, DomainEvent } from '../../src/modules/events/events.types';
import { AuditLogsRepository } from '../../src/modules/events/repositories/audit-logs.repository';

@Injectable()
export class CrashOnceStudentCreatedConsumer
  implements EventConsumerDescriptor<'student.created'>
{
  readonly name = 'chaos.student-created';
  readonly event_name = 'student.created' as const;
  private remainingCrashes = 1;

  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  crashNext(count = 1): void {
    this.remainingCrashes = count;
  }

  async handle(event: DomainEvent<'student.created'>): Promise<void> {
    if (this.remainingCrashes > 0) {
      this.remainingCrashes -= 1;
      throw new Error('Simulated queue worker crash');
    }

    await this.auditLogsRepository.createAuditLog({
      tenant_id: event.tenant_id,
      actor_user_id:
        typeof event.headers.user_id === 'string' ? event.headers.user_id : null,
      request_id:
        typeof event.headers.request_id === 'string' ? event.headers.request_id : null,
      action: 'chaos.student.created.processed',
      resource_type: 'student',
      resource_id: event.aggregate_id,
      metadata: {
        consumer: this.name,
        event_id: event.id,
        event_key: event.event_key,
      },
    });
  }
}
