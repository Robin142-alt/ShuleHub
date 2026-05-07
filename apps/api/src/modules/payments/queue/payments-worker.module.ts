import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments.module';
import { PaymentsJobExecutionService } from '../services/payments-job-execution.service';
import { PaymentsQueueProcessor } from './payments-queue.processor';
import { PaymentsQueueRuntimeModule } from './payments-queue.runtime.module';

@Module({
  imports: [PaymentsQueueRuntimeModule, PaymentsModule],
  providers: [PaymentsQueueProcessor, PaymentsJobExecutionService],
})
export class PaymentsWorkerModule {}
