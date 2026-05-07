import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

import { REDIS_CLIENT } from './redis.constants';
import { buildRedisClientOptions } from './redis.options';
import { RedisCacheService } from './redis-cache.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisConnection');
        const { url, clientOptions } = buildRedisClientOptions(configService, logger);
        const client = new Redis(url, clientOptions);

        client.on('connect', () => {
          logger.log('Redis socket connected');
        });

        client.on('ready', () => {
          logger.log('Redis client ready');
        });

        client.on('error', (error) => {
          logger.error(`Redis error: ${error.message}`, error.stack);
        });

        client.on('close', () => {
          logger.warn('Redis connection closed');
        });

        client.on('reconnecting', (delay: number) => {
          logger.warn(`Redis reconnecting in ${delay}ms`);
        });

        client.on('end', () => {
          logger.error('Redis connection ended');
        });

        return client;
      },
    },
    RedisService,
    RedisCacheService,
  ],
  exports: [RedisService, RedisCacheService, REDIS_CLIENT],
})
export class RedisModule {}
