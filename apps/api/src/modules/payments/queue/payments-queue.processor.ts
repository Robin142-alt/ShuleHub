import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import {
  PAYMENTS_PROCESS_JOB,
  PAYMENTS_QUEUE_NAME,
} from '../payments.constants';
import { PaymentsJobExecutionService } from '../services/payments-job-execution.service';
import {
  ProcessPaymentJobData,
  ProcessPaymentJobResult,
} from './payments-queue.types';

@Processor(PAYMENTS_QUEUE_NAME, { concurrency: 5 })
export class PaymentsQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsQueueProcessor.name);

  constructor(
    private readonly paymentsJobExecutionService: PaymentsJobExecutionService,
  ) {
    super();
  }

  async process(
    job: Job<ProcessPaymentJobData, ProcessPaymentJobResult, typeof PAYMENTS_PROCESS_JOB>,
  ): Promise<ProcessPaymentJobResult> {
    if (job.name !== PAYMENTS_PROCESS_JOB) {
      throw new Error(`Unsupported payment job "${job.name}"`);
    }

    return this.paymentsJobExecutionService.processPayment(job.data, String(job.id));
  }

  @OnWorkerEvent('active')
  onActive(job: Job<ProcessPaymentJobData, ProcessPaymentJobResult>): void {
    this.logger.log(
      JSON.stringify({
        event: 'payments.queue.active',
        queue_name: PAYMENTS_QUEUE_NAME,
        job_name: job.name,
        job_id: job.id,
        tenant_id: job.data.tenant_id,
        checkout_request_id: job.data.checkout_request_id,
        callback_log_id: job.data.callback_log_id ?? null,
      }),
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(
    job: Job<ProcessPaymentJobData, ProcessPaymentJobResult>,
    result: ProcessPaymentJobResult,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'payments.queue.completed',
        queue_name: PAYMENTS_QUEUE_NAME,
        job_name: job.name,
        job_id: job.id,
        tenant_id: result.tenant_id,
        checkout_request_id: result.checkout_request_id,
        callback_log_id: result.callback_log_id,
        payment_intent_id: result.payment_intent_id,
        ledger_transaction_id: result.ledger_transaction_id,
        status: result.status,
      }),
    );
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<ProcessPaymentJobData, ProcessPaymentJobResult> | undefined,
    error: Error,
  ): void {
    this.logger.error(
      JSON.stringify({
        event: 'payments.queue.failed',
        queue_name: PAYMENTS_QUEUE_NAME,
        job_name: job?.name ?? PAYMENTS_PROCESS_JOB,
        job_id: job?.id ?? 'unknown',
        tenant_id: job?.data.tenant_id ?? null,
        checkout_request_id: job?.data.checkout_request_id ?? null,
        callback_log_id: job?.data.callback_log_id ?? null,
        error_message: error.message,
      }),
      error.stack,
    );
  }
}
