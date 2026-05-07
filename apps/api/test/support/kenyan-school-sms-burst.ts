import { randomUUID } from 'node:crypto';

import { Queue, Worker } from 'bullmq';
import { RedisOptions } from 'ioredis';

export interface SmsBurstQueueSnapshot {
  mode: 'bullmq' | 'simulated';
  produced: number;
  processed: number;
  failed: number;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  pending_backlog: number;
}

export interface SmsBurstQueue {
  readonly mode: 'bullmq' | 'simulated';
  enqueueBurst(input: {
    tenant_id: string;
    burst_type: string;
    recipients: number;
    virtual_timestamp: string;
  }): Promise<void>;
  sample(): Promise<SmsBurstQueueSnapshot>;
  stop(): Promise<void>;
}

interface SmsBurstQueueOptions {
  mode: 'auto' | 'bullmq' | 'simulated';
  queue_name: string;
  prefix: string;
  worker_concurrency: number;
  per_message_processing_ms: { min: number; max: number };
}

export const createSmsBurstQueue = async (
  options: SmsBurstQueueOptions,
): Promise<SmsBurstQueue> => {
  if (options.mode === 'simulated') {
    return new SimulatedSmsBurstQueue(options);
  }

  try {
    return new BullmqSmsBurstQueue(parseRedisConnectionOptions(), options);
  } catch (error) {
    if (options.mode === 'bullmq') {
      throw error;
    }

    return new SimulatedSmsBurstQueue(options);
  }
};

class BullmqSmsBurstQueue implements SmsBurstQueue {
  readonly mode = 'bullmq' as const;

  private readonly queue: Queue;
  private readonly worker: Worker;
  private produced = 0;
  private processed = 0;
  private failed = 0;

  constructor(
    connection: RedisOptions,
    private readonly options: SmsBurstQueueOptions,
  ) {
    this.queue = new Queue(options.queue_name, {
      connection,
      prefix: options.prefix,
      defaultJobOptions: {
        removeOnComplete: 5000,
        removeOnFail: 5000,
      },
    });
    this.worker = new Worker(
      options.queue_name,
      async () => {
        await sleep(randomBetween(
          options.per_message_processing_ms.min,
          options.per_message_processing_ms.max,
        ));
        this.processed += 1;
      },
      {
        connection,
        prefix: options.prefix,
        concurrency: options.worker_concurrency,
      },
    );
    this.worker.on('failed', () => {
      this.failed += 1;
    });
  }

  async enqueueBurst(input: {
    tenant_id: string;
    burst_type: string;
    recipients: number;
    virtual_timestamp: string;
  }): Promise<void> {
    const batchSize = Math.max(1, input.recipients);

    for (let index = 0; index < batchSize; index += 1) {
      await this.queue.add('sms.dispatch', {
        tenant_id: input.tenant_id,
        burst_type: input.burst_type,
        recipient_sequence: index + 1,
        virtual_timestamp: input.virtual_timestamp,
        message_id: randomUUID(),
      });
      this.produced += 1;
    }
  }

  async sample(): Promise<SmsBurstQueueSnapshot> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    );

    return buildSnapshot(this.mode, this.produced, this.processed, this.failed, counts);
  }

  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

class SimulatedSmsBurstQueue implements SmsBurstQueue {
  readonly mode = 'simulated' as const;

  private readonly queue: Array<{
    tenant_id: string;
    burst_type: string;
    virtual_timestamp: string;
  }> = [];
  private readonly activeTimers = new Set<NodeJS.Timeout>();
  private readonly scheduler: NodeJS.Timeout;
  private produced = 0;
  private processed = 0;
  private failed = 0;
  private completed = 0;
  private active = 0;

  constructor(private readonly options: SmsBurstQueueOptions) {
    this.scheduler = setInterval(() => {
      this.pump();
    }, 15);
  }

  async enqueueBurst(input: {
    tenant_id: string;
    burst_type: string;
    recipients: number;
    virtual_timestamp: string;
  }): Promise<void> {
    for (let index = 0; index < input.recipients; index += 1) {
      this.queue.push({
        tenant_id: input.tenant_id,
        burst_type: input.burst_type,
        virtual_timestamp: input.virtual_timestamp,
      });
      this.produced += 1;
    }
  }

  async sample(): Promise<SmsBurstQueueSnapshot> {
    return {
      mode: this.mode,
      produced: this.produced,
      processed: this.processed,
      failed: this.failed,
      waiting: this.queue.length,
      active: this.active,
      delayed: 0,
      completed: this.completed,
      pending_backlog: this.queue.length,
    };
  }

  async stop(): Promise<void> {
    clearInterval(this.scheduler);

    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }

    this.activeTimers.clear();
  }

  private pump(): void {
    while (
      this.active < this.options.worker_concurrency &&
      this.queue.length > 0
    ) {
      this.queue.shift();
      this.active += 1;
      const timer = setTimeout(() => {
        this.active -= 1;
        this.processed += 1;
        this.completed += 1;
        this.activeTimers.delete(timer);
      }, randomBetween(
        this.options.per_message_processing_ms.min,
        this.options.per_message_processing_ms.max,
      ));
      this.activeTimers.add(timer);
    }
  }
}

const parseRedisConnectionOptions = (): RedisOptions => {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  const databasePath = redisUrl.pathname.replace('/', '');

  return {
    host: redisUrl.hostname,
    port: redisUrl.port ? Number(redisUrl.port) : 6379,
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: databasePath ? Number(databasePath) : 0,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
};

const buildSnapshot = (
  mode: 'bullmq' | 'simulated',
  produced: number,
  processed: number,
  failed: number,
  counts: Partial<Record<'waiting' | 'active' | 'delayed' | 'completed' | 'failed', number>>,
): SmsBurstQueueSnapshot => {
  const waiting = Number(counts.waiting ?? 0);
  const active = Number(counts.active ?? 0);
  const delayed = Number(counts.delayed ?? 0);
  const completed = Number(counts.completed ?? 0);

  return {
    mode,
    produced,
    processed,
    failed,
    waiting,
    active,
    delayed,
    completed,
    pending_backlog: waiting + delayed,
  };
};

const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

