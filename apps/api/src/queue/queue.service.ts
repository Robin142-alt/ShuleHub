import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';

import { RedisService } from '../infrastructure/redis/redis.service';
import { DEFAULT_QUEUE_NAME } from './queue.constants';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  getQueue(queueName = DEFAULT_QUEUE_NAME): Queue {
    const existingQueue = this.queues.get(queueName);

    if (existingQueue) {
      return existingQueue;
    }

    const queue = new Queue(queueName, {
      connection: this.redisService.getBullConnectionOptions(),
      prefix: this.configService.get<string>('queue.prefix') ?? 'shule-hub',
      defaultJobOptions: {
        attempts: Number(this.configService.get<number>('queue.defaultJobAttempts') ?? 3),
        removeOnComplete: Number(this.configService.get<number>('queue.removeOnComplete') ?? 1000),
        removeOnFail: Number(this.configService.get<number>('queue.removeOnFail') ?? 5000),
      },
    });

    this.queues.set(queueName, queue);
    this.logger.log(`BullMQ queue "${queueName}" initialized`);

    return queue;
  }

  async add<T>(
    jobName: string,
    payload: T,
    options?: JobsOptions,
    queueName = DEFAULT_QUEUE_NAME,
  ) {
    return this.getQueue(queueName).add(jobName, payload, options);
  }

  async addBulk<T>(
    jobs: Array<{
      job_name: string;
      payload: T;
      options?: JobsOptions;
    }>,
    queueName = DEFAULT_QUEUE_NAME,
  ) {
    if (jobs.length === 0) {
      return [];
    }

    return this.getQueue(queueName).addBulk(
      jobs.map((job) => ({
        name: job.job_name,
        data: job.payload,
        opts: job.options,
      })),
    );
  }

  async getJobCounts(
    queueName = DEFAULT_QUEUE_NAME,
  ): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  }> {
    const counts = await this.getQueue(queueName).getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
    );

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    };
  }

  async getQueueLagSnapshot(
    queueName = DEFAULT_QUEUE_NAME,
  ): Promise<{
    oldest_waiting_age_ms: number | null;
    oldest_delayed_age_ms: number | null;
  }> {
    const queue = this.getQueue(queueName);
    const [waitingJobs, delayedJobs] = await Promise.all([
      queue.getJobs(['waiting'], 0, 0, true),
      queue.getJobs(['delayed'], 0, 0, true),
    ]);
    const now = Date.now();

    return {
      oldest_waiting_age_ms: waitingJobs[0]?.timestamp
        ? Math.max(0, now - waitingJobs[0].timestamp)
        : null,
      oldest_delayed_age_ms: delayedJobs[0]?.timestamp
        ? Math.max(0, now - delayedJobs[0].timestamp)
        : null,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Array.from(this.queues.values()).map(async (queue) => {
        await queue.close();
      }),
    );
  }
}
