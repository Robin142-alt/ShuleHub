import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../../config/configuration';
import { RedisModule } from '../../../infrastructure/redis/redis.module';
import { QueueModule } from '../../../queue/queue.module';
import { validatePaymentsQueueEnv } from './payments-queue.env';
import { PaymentsQueueModule } from './payments-queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      load: [configuration],
      validate: validatePaymentsQueueEnv,
    }),
    RedisModule,
    QueueModule,
    PaymentsQueueModule,
  ],
  exports: [PaymentsQueueModule],
})
export class PaymentsQueueRuntimeModule {}
