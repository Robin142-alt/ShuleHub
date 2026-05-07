import { Module } from '@nestjs/common';

import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';
import { StudentCreatedConsumer } from './consumers/student-created.consumer';
import { EventConsumerRegistryService } from './event-consumer-registry.service';
import { EventConsumerService } from './event-consumer.service';
import { EventPublisherService } from './event-publisher.service';
import { EventsSchemaService } from './events-schema.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { StudentEventsService } from './student-events.service';
import { EventsConsumerWorker } from './queue/events-consumer.worker';
import { AuditLogsRepository } from './repositories/audit-logs.repository';
import { EventConsumerRunsRepository } from './repositories/event-consumer-runs.repository';
import { OutboxEventsRepository } from './repositories/outbox-events.repository';

@Module({
  providers: [
    EventsSchemaService,
    EventPublisherService,
    StudentEventsService,
    OutboxDispatcherService,
    EventConsumerService,
    EventConsumerRegistryService,
    EventsConsumerWorker,
    OutboxEventsRepository,
    EventConsumerRunsRepository,
    AuditLogsRepository,
    StudentCreatedConsumer,
    PaymentCompletedConsumer,
  ],
  exports: [EventPublisherService, StudentEventsService, AuditLogsRepository],
})
export class EventsModule {}
