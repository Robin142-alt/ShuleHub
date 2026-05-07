import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import { RedisModule } from '../infrastructure/redis/redis.module';
import { RedisService } from '../infrastructure/redis/redis.service';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      inject: [RedisService, ConfigService],
      useFactory: (
        redisService: RedisService,
        configService: ConfigService,
      ) => ({
        connection: redisService.getBullConnectionOptions(),
        prefix: configService.get<string>('queue.prefix') ?? 'shule-hub',
        defaultJobOptions: {
          attempts: Number(configService.get<number>('queue.defaultJobAttempts') ?? 3),
          removeOnComplete: Number(configService.get<number>('queue.removeOnComplete') ?? 1000),
          removeOnFail: Number(configService.get<number>('queue.removeOnFail') ?? 5000),
        },
      }),
    }),
  ],
  providers: [QueueService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
