import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

/**
 * Tenant-aware Redis cache service.
 *
 * All cache keys are automatically namespaced by tenant_id to prevent
 * cross-tenant data leakage. Keys use the format:
 *   cache:{tenant_id}:{namespace}:{key}
 *
 * Cache operations gracefully degrade — a Redis failure will NOT break
 * the request flow; it will simply bypass the cache.
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private static readonly KEY_PREFIX = 'cache';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get a cached value. Returns null on miss or Redis failure.
   */
  async get<T>(tenantId: string, namespace: string, key: string): Promise<T | null> {
    try {
      const cacheKey = this.buildKey(tenantId, namespace, key);
      const raw = await this.redisService.getClient().get(cacheKey);

      if (raw === null) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(
        `Cache GET failed for ${namespace}:${key} — ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Set a cached value with TTL in seconds.
   */
  async set<T>(
    tenantId: string,
    namespace: string,
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      const cacheKey = this.buildKey(tenantId, namespace, key);
      await this.redisService.getClient().set(cacheKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Cache SET failed for ${namespace}:${key} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get a cached value, or compute it and cache it if not found.
   * This is the primary API for read-through caching.
   */
  async getOrSet<T>(
    tenantId: string,
    namespace: string,
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(tenantId, namespace, key);

    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(tenantId, namespace, key, value, ttlSeconds);

    return value;
  }

  /**
   * Invalidate a specific cache key.
   */
  async invalidate(tenantId: string, namespace: string, key: string): Promise<void> {
    try {
      const cacheKey = this.buildKey(tenantId, namespace, key);
      await this.redisService.getClient().del(cacheKey);
    } catch (error) {
      this.logger.warn(
        `Cache DEL failed for ${namespace}:${key} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Invalidate all cache keys for a tenant within a namespace.
   * Uses SCAN to avoid blocking Redis.
   */
  async invalidateNamespace(tenantId: string, namespace: string): Promise<number> {
    try {
      const pattern = `${RedisCacheService.KEY_PREFIX}:${tenantId}:${namespace}:*`;
      const client = this.redisService.getClient();
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          await client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      return deletedCount;
    } catch (error) {
      this.logger.warn(
        `Cache namespace invalidation failed for ${namespace} — ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Batch get multiple keys in a single Redis MGET call.
   */
  async mget<T>(
    tenantId: string,
    namespace: string,
    keys: string[],
  ): Promise<Map<string, T>> {
    if (keys.length === 0) {
      return new Map();
    }

    try {
      const cacheKeys = keys.map((key) => this.buildKey(tenantId, namespace, key));
      const values = await this.redisService.getClient().mget(...cacheKeys);
      const result = new Map<string, T>();

      for (let i = 0; i < keys.length; i++) {
        const raw = values[i];

        if (raw !== null) {
          try {
            result.set(keys[i], JSON.parse(raw) as T);
          } catch {
            // Skip entries with parse errors
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `Cache MGET failed for ${namespace} — ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Map();
    }
  }

  private buildKey(tenantId: string, namespace: string, key: string): string {
    return `${RedisCacheService.KEY_PREFIX}:${tenantId}:${namespace}:${key}`;
  }
}
