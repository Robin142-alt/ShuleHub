import { Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { BillingAccessService } from '../../src/modules/billing/billing-access.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
import { OutboxDispatcherService } from '../../src/modules/events/outbox-dispatcher.service';
import { OutboxEventsRepository } from '../../src/modules/events/repositories/outbox-events.repository';
import { SloMetricsService } from '../../src/modules/observability/slo-metrics.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { QueueService } from '../../src/queue/queue.service';
import { CapturingQueueService } from './capturing-queue.service';
import { InMemoryRedis } from './in-memory-redis';

@Injectable()
export class CostPerformanceRedisServiceStub {
  private readonly client = new InMemoryRedis();

  getClient(): InMemoryRedis {
    return this.client;
  }

  getBullConnectionOptions() {
    return {
      host: '127.0.0.1',
      port: 6379,
    };
  }

  async ping(): Promise<'up'> {
    return 'up';
  }

  async reset(): Promise<void> {
    await this.client.quit();
  }
}

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
    BillingSchemaService,
    EventsSchemaService,
    PaymentsSchemaService,
    StudentsSchemaService,
    PiiEncryptionService,
    BillingAccessService,
    BillingService,
    SubscriptionsRepository,
    InvoicesRepository,
    StudentsRepository,
    PaymentIntentsRepository,
    OutboxEventsRepository,
    EventPublisherService,
    OutboxDispatcherService,
    SloMetricsService,
    {
      provide: CapturingQueueService,
      useValue: new CapturingQueueService(),
    },
    {
      provide: QueueService,
      useExisting: CapturingQueueService,
    },
    CostPerformanceRedisServiceStub,
    {
      provide: RedisService,
      useExisting: CostPerformanceRedisServiceStub,
    },
  ],
  exports: [
    BillingAccessService,
    BillingService,
    CostPerformanceRedisServiceStub,
    EventPublisherService,
    OutboxDispatcherService,
    PaymentIntentsRepository,
    SloMetricsService,
    StudentsRepository,
    SubscriptionsRepository,
    CapturingQueueService,
  ],
})
export class CostPerformanceTestModule {}
