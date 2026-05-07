import { randomUUID } from 'node:crypto';

import { Queue, Worker } from 'bullmq';
import { RedisOptions } from 'ioredis';

export interface QueueProbeSnapshot {
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

export interface SoakQueueProbe {
  readonly mode: 'bullmq' | 'simulated';
  start(): Promise<void>;
  sample(): Promise<QueueProbeSnapshot>;
  stop(): Promise<void>;
}

interface QueueProbeOptions {
  queueName: string;
  prefix: string;
  workerConcurrency: number;
  producerIntervalMs: number;
  mode: 'auto' | 'bullmq' | 'simulated';
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

class BullmqQueueProbe implements SoakQueueProbe {
  readonly mode = 'bullmq' as const;

  private readonly queue: Queue;
  private readonly worker: Worker;
  private producerTimer: NodeJS.Timeout | null = null;
  private produced = 0;
  private processed = 0;
  private failed = 0;

  constructor(
    connection: RedisOptions,
    private readonly options: QueueProbeOptions,
  ) {
    this.queue = new Queue(options.queueName, {
      connection,
      prefix: options.prefix,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    this.worker = new Worker(
      options.queueName,
      async () => {
        await sleep(randomBetween(10, 40));
        this.processed += 1;
      },
      {
        connection,
        prefix: options.prefix,
        concurrency: options.workerConcurrency,
      },
    );
    this.worker.on('failed', () => {
      this.failed += 1;
    });
  }

  async start(): Promise<void> {
    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();
    this.producerTimer = setInterval(() => {
      void this.queue
        .add('heartbeat', {
          heartbeat_id: randomUUID(),
          created_at: new Date().toISOString(),
        })
        .then(() => {
          this.produced += 1;
        })
        .catch(() => {
          this.failed += 1;
        });
    }, this.options.producerIntervalMs);
  }

  async sample(): Promise<QueueProbeSnapshot> {
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
    if (this.producerTimer) {
      clearInterval(this.producerTimer);
      this.producerTimer = null;
    }

    await this.worker.close();
    await this.queue.close();
  }
}

class SimulatedQueueProbe implements SoakQueueProbe {
  readonly mode = 'simulated' as const;

  private readonly queue: Array<{ id: string; created_at: number }> = [];
  private producerTimer: NodeJS.Timeout | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private active = 0;
  private produced = 0;
  private processed = 0;
  private failed = 0;
  private completed = 0;

  constructor(private readonly options: QueueProbeOptions) {}

  async start(): Promise<void> {
    this.producerTimer = setInterval(() => {
      this.queue.push({
        id: randomUUID(),
        created_at: Date.now(),
      });
      this.produced += 1;
    }, this.options.producerIntervalMs);

    this.schedulerTimer = setInterval(() => {
      this.pump();
    }, 15);
  }

  async sample(): Promise<QueueProbeSnapshot> {
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
    if (this.producerTimer) {
      clearInterval(this.producerTimer);
      this.producerTimer = null;
    }

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private pump(): void {
    while (
      this.active < this.options.workerConcurrency &&
      this.queue.length > 0
    ) {
      this.queue.shift();
      this.active += 1;

      setTimeout(() => {
        this.active -= 1;
        this.processed += 1;
        this.completed += 1;
      }, randomBetween(10, 40));
    }
  }
}

const buildSnapshot = (
  mode: 'bullmq' | 'simulated',
  produced: number,
  processed: number,
  failed: number,
  counts: Partial<Record<'waiting' | 'active' | 'delayed' | 'completed' | 'failed', number>>,
): QueueProbeSnapshot => {
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

export const createSoakQueueProbe = async (
  options: QueueProbeOptions,
): Promise<SoakQueueProbe> => {
  if (options.mode === 'simulated') {
    const probe = new SimulatedQueueProbe(options);
    await probe.start();
    return probe;
  }

  try {
    const probe = new BullmqQueueProbe(parseRedisConnectionOptions(), options);
    await probe.start();
    return probe;
  } catch (error) {
    if (options.mode === 'bullmq') {
      throw error;
    }

    const probe = new SimulatedQueueProbe(options);
    await probe.start();
    return probe;
  }
};

const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));
