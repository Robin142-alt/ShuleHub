import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { EventConsumerRegistryService } from '../../src/modules/events/event-consumer-registry.service';
import { EventConsumerService } from '../../src/modules/events/event-consumer.service';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { OutboxDispatcherService } from '../../src/modules/events/outbox-dispatcher.service';
import { AuditLogsRepository } from '../../src/modules/events/repositories/audit-logs.repository';
import { EventConsumerRunsRepository } from '../../src/modules/events/repositories/event-consumer-runs.repository';
import { OutboxEventsRepository } from '../../src/modules/events/repositories/outbox-events.repository';
import { QueueService } from '../../src/queue/queue.service';
import { CapturingQueueService } from './capturing-queue.service';
import { ChaosEventConsumerRegistryService } from './chaos-event-consumer-registry.service';
import { CrashOnceStudentCreatedConsumer } from './crash-once-student-created.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
      load: [configuration],
    }),
    CommonModule,
    DatabaseModule,
  ],
  providers: [
    AuthSchemaService,
    EventsSchemaService,
    EventPublisherService,
    EventConsumerService,
    OutboxDispatcherService,
    OutboxEventsRepository,
    EventConsumerRunsRepository,
    AuditLogsRepository,
    CrashOnceStudentCreatedConsumer,
    ChaosEventConsumerRegistryService,
    CapturingQueueService,
    {
      provide: EventConsumerRegistryService,
      useExisting: ChaosEventConsumerRegistryService,
    },
    {
      provide: QueueService,
      useExisting: CapturingQueueService,
    },
  ],
})
export class GameDayEventsTestModule {}
