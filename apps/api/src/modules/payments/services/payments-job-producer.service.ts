import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import {
  PAYMENTS_PROCESS_JOB,
  PAYMENTS_QUEUE_NAME,
} from '../payments.constants';
import {
  EnqueuePaymentJobData,
  EnqueuePaymentJobResult,
  ProcessPaymentJobData,
  ProcessPaymentJobResult,
} from '../queue/payments-queue.types';

@Injectable()
export class PaymentsJobProducerService {
  private readonly logger = new Logger(PaymentsJobProducerService.name);

  constructor(
    @InjectQueue(PAYMENTS_QUEUE_NAME)
    private readonly paymentsQueue: Queue<
      ProcessPaymentJobData,
      ProcessPaymentJobResult,
      typeof PAYMENTS_PROCESS_JOB
    >,
  ) {}

  async enqueuePayment(data: EnqueuePaymentJobData): Promise<EnqueuePaymentJobResult> {
    const payload: ProcessPaymentJobData = {
      ...data,
      enqueued_at: new Date().toISOString(),
    };
    const jobId = this.buildJobId(payload);
    const existingJob = await this.paymentsQueue.getJob(jobId);

    if (existingJob) {
      return this.mapQueueResult(existingJob, payload, true);
    }

    try {
      const job = await this.paymentsQueue.add(PAYMENTS_PROCESS_JOB, payload, {
        jobId,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5000,
        },
      });

      this.logger.log(
        JSON.stringify({
          event: 'payments.queue.enqueued',
          queue_name: PAYMENTS_QUEUE_NAME,
          job_id: job.id,
          tenant_id: payload.tenant_id,
          checkout_request_id: payload.checkout_request_id,
          callback_log_id: payload.callback_log_id ?? null,
        }),
      );

      return this.mapQueueResult(job, payload, false);
    } catch (error) {
      if (this.isDuplicateJobError(error)) {
        const duplicatedJob = await this.paymentsQueue.getJob(jobId);

        if (duplicatedJob) {
          return this.mapQueueResult(duplicatedJob, payload, true);
        }
      }

      this.logger.error(
        `Failed to enqueue payment job "${jobId}": ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  buildJobId(data: Pick<ProcessPaymentJobData, 'tenant_id' | 'checkout_request_id'>): string {
    return `${PAYMENTS_QUEUE_NAME}:${data.tenant_id}:${data.checkout_request_id}`;
  }

  private async mapQueueResult(
    job: Job<ProcessPaymentJobData, ProcessPaymentJobResult, typeof PAYMENTS_PROCESS_JOB>,
    payload: ProcessPaymentJobData,
    deduplicated: boolean,
  ): Promise<EnqueuePaymentJobResult> {
    return {
      job_id: String(job.id),
      queue_name: PAYMENTS_QUEUE_NAME,
      tenant_id: payload.tenant_id,
      checkout_request_id: payload.checkout_request_id,
      deduplicated,
      state: await job.getState(),
    };
  }

  private isDuplicateJobError(error: unknown): boolean {
    return (
      error instanceof Error &&
      /job.*exists|duplicated/i.test(error.message)
    );
  }
}
