import { Injectable } from '@nestjs/common';

import { MpesaCallbackProcessorService } from './mpesa-callback-processor.service';
import {
  ProcessPaymentJobData,
  ProcessPaymentJobResult,
} from '../queue/payments-queue.types';

@Injectable()
export class PaymentsJobExecutionService {
  constructor(
    private readonly mpesaCallbackProcessorService: MpesaCallbackProcessorService,
  ) {}

  async processPayment(
    payload: ProcessPaymentJobData,
    jobId: string,
  ): Promise<ProcessPaymentJobResult> {
    return this.mpesaCallbackProcessorService.processPaymentJob(payload, jobId);
  }
}
