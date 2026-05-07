import { InMemoryRedis } from './in-memory-redis';

type RedisOperation =
  | 'get'
  | 'set'
  | 'del'
  | 'incr'
  | 'expire'
  | 'sadd'
  | 'srem'
  | 'smembers'
  | 'watch'
  | 'unwatch';

export class ToggleableInMemoryRedis extends InMemoryRedis {
  private readonly remainingFailures = new Map<RedisOperation, number>();

  failNext(operation: RedisOperation, count = 1): void {
    this.remainingFailures.set(operation, count);
  }

  override async get(key: string): Promise<string | null> {
    this.throwIfConfigured('get');
    return super.get(key);
  }

  override async set(
    key: string,
    value: string,
    mode?: string,
    ttlSeconds?: number,
  ): Promise<'OK'> {
    this.throwIfConfigured('set');
    return super.set(key, value, mode, ttlSeconds);
  }

  override async del(key: string): Promise<number> {
    this.throwIfConfigured('del');
    return super.del(key);
  }

  override async incr(key: string): Promise<number> {
    this.throwIfConfigured('incr');
    return super.incr(key);
  }

  override async expire(key: string, ttlSeconds: number): Promise<number> {
    this.throwIfConfigured('expire');
    return super.expire(key, ttlSeconds);
  }

  override async sadd(key: string, ...members: string[]): Promise<number> {
    this.throwIfConfigured('sadd');
    return super.sadd(key, ...members);
  }

  override async srem(key: string, ...members: string[]): Promise<number> {
    this.throwIfConfigured('srem');
    return super.srem(key, ...members);
  }

  override async smembers(key: string): Promise<string[]> {
    this.throwIfConfigured('smembers');
    return super.smembers(key);
  }

  override async watch(...keys: string[]): Promise<'OK'> {
    this.throwIfConfigured('watch');
    return super.watch(...keys);
  }

  override async unwatch(): Promise<'OK'> {
    this.throwIfConfigured('unwatch');
    return super.unwatch();
  }

  private throwIfConfigured(operation: RedisOperation): void {
    const remainingFailures = this.remainingFailures.get(operation) ?? 0;

    if (remainingFailures <= 0) {
      return;
    }

    if (remainingFailures === 1) {
      this.remainingFailures.delete(operation);
    } else {
      this.remainingFailures.set(operation, remainingFailures - 1);
    }

    throw new Error(`Simulated Redis failure during ${operation}`);
  }
}
