import { Injectable } from '@nestjs/common';

import { DomainEvent, StudentCreatedPayload } from './events.types';
import { EventPublisherService } from './event-publisher.service';

@Injectable()
export class StudentEventsService {
  constructor(private readonly eventPublisher: EventPublisherService) {}

  async publishStudentCreated(
    payload: StudentCreatedPayload,
  ): Promise<DomainEvent<'student.created'>> {
    return this.eventPublisher.publishStudentCreated(payload);
  }
}
