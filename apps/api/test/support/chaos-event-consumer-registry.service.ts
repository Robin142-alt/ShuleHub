import { Injectable } from '@nestjs/common';

import { EventConsumerDescriptor, SupportedDomainEventName } from '../../src/modules/events/events.types';
import { CrashOnceStudentCreatedConsumer } from './crash-once-student-created.consumer';

@Injectable()
export class ChaosEventConsumerRegistryService {
  constructor(
    private readonly studentCreatedConsumer: CrashOnceStudentCreatedConsumer,
  ) {}

  getConsumersForEvent(
    eventName: SupportedDomainEventName,
  ): EventConsumerDescriptor[] {
    if (eventName === 'student.created') {
      return [this.studentCreatedConsumer];
    }

    return [];
  }
}
