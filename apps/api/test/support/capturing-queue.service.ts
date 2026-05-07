import { randomUUID } from 'node:crypto';

import { JobsOptions } from 'bullmq';

export interface CapturedQueueJob<T = unknown> {
  id: string;
  job_name: string;
  payload: T;
  options?: JobsOptions;
  queue_name: string;
}

export class CapturingQueueService {
  private readonly jobs: CapturedQueueJob[] = [];

  async add<T>(
    jobName: string,
    payload: T,
    options?: JobsOptions,
    queueName = 'default',
  ): Promise<{ id: string }> {
    const job: CapturedQueueJob<T> = {
      id: String(options?.jobId ?? randomUUID()),
      job_name: jobName,
      payload,
      options,
      queue_name: queueName,
    };

    this.jobs.push(job);

    return {
      id: job.id,
    };
  }

  async addBulk<T>(
    jobs: Array<{
      job_name: string;
      payload: T;
      options?: JobsOptions;
    }>,
    queueName = 'default',
  ): Promise<Array<{ id: string }>> {
    const insertedJobs: Array<{ id: string }> = [];

    for (const job of jobs) {
      insertedJobs.push(
        await this.add(job.job_name, job.payload, job.options, queueName),
      );
    }

    return insertedJobs;
  }

  getJobs<T = unknown>(): CapturedQueueJob<T>[] {
    return [...this.jobs] as CapturedQueueJob<T>[];
  }

  clear(): void {
    this.jobs.length = 0;
  }

  async waitForJobs(count: number, timeoutMs = 5000): Promise<CapturedQueueJob[]> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (this.jobs.length >= count) {
        return this.getJobs();
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Timed out waiting for ${count} queued jobs; saw ${this.jobs.length}`);
  }

  async drain<T = unknown>(
    handler: (job: CapturedQueueJob<T>) => Promise<void>,
  ): Promise<Error[]> {
    const pendingJobs = this.getJobs<T>();
    this.clear();
    const errors: Error[] = [];

    for (const job of pendingJobs) {
      try {
        await handler(job);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    return errors;
  }
}
