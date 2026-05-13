import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisOptions } from 'ioredis';

import { REDIS_DEFAULT_URL } from './redis.constants';

export interface BullRedisConnectionOptions extends RedisOptions {
  url: string;
}

const RETRY_DELAY_CEILING_MS = 5000;

export const resolveRedisUrl = (configService: ConfigService): string =>
  configService.get<string>('redis.url') ?? REDIS_DEFAULT_URL;

export const requiresRedisTls = (redisUrl: string): boolean => {
  try {
    const parsedUrl = new URL(redisUrl);
    return parsedUrl.protocol === 'rediss:' || parsedUrl.hostname.endsWith('.upstash.io');
  } catch {
    return redisUrl.startsWith('rediss://');
  }
};

export const buildRedisClientOptions = (
  configService: ConfigService,
  logger: Logger,
): {
  url: string;
  clientOptions: RedisOptions;
  bullConnection: BullRedisConnectionOptions;
} => {
  const redisUrl = resolveRedisUrl(configService);
  const useTls = requiresRedisTls(redisUrl);
  const connectTimeout = Number(configService.get<number>('redis.connectTimeoutMs') ?? 10000);
  const isServerlessRuntime = Boolean(configService.get<boolean>('app.isServerlessRuntime'));

  const sharedOptions: RedisOptions = {
    lazyConnect: true,
    connectTimeout,
    maxRetriesPerRequest: isServerlessRuntime ? 0 : null,
    enableOfflineQueue: !isServerlessRuntime,
    enableReadyCheck: false,
    tls: useTls ? {} : undefined,
    retryStrategy: (attempt) => {
      if (isServerlessRuntime) {
        logger.warn('Redis reconnect disabled for serverless runtime');
        return null;
      }

      const delay = Math.min(250 * 2 ** Math.min(attempt, 4), RETRY_DELAY_CEILING_MS);
      logger.warn(`Redis reconnect scheduled in ${delay}ms (attempt ${attempt})`);
      return delay;
    },
    reconnectOnError: (error) => {
      const message = error.message.toLowerCase();
      const shouldReconnect =
        message.includes('readonly') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('connection is closed');

      if (shouldReconnect) {
        logger.warn(`Redis reconnect requested after error: ${error.message}`);
      }

      return shouldReconnect;
    },
  };

  return {
    url: redisUrl,
    clientOptions: sharedOptions,
    bullConnection: {
      url: redisUrl,
      ...sharedOptions,
    },
  };
};
