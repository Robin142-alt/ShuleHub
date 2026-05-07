import { Injectable } from '@nestjs/common';

import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';
import { StudentCreatedConsumer } from './consumers/student-created.consumer';
import { EventConsumerDescriptor, SupportedDomainEventName } from './events.types';

@Injectable()
export class EventConsumerRegistryService {
  private readonly consumersByEventName = new Map<
    SupportedDomainEventName,
    EventConsumerDescriptor[]
  >();

  constructor(
    studentCreatedConsumer: StudentCreatedConsumer,
    paymentCompletedConsumer: PaymentCompletedConsumer,
  ) {
    this.register(studentCreatedConsumer);
    this.register(paymentCompletedConsumer);
  }

  getConsumersForEvent(eventName: SupportedDomainEventName): EventConsumerDescriptor[] {
    return this.consumersByEventName.get(eventName) ?? [];
  }

  private register(consumer: EventConsumerDescriptor): void {
    const existingConsumers = this.consumersByEventName.get(consumer.event_name) ?? [];
    this.consumersByEventName.set(consumer.event_name, [...existingConsumers, consumer]);
  }
}
