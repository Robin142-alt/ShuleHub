import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { PAYMENTS_QUEUE_NAME } from '../payments.constants';
import { PaymentsJobProducerService } from '../services/payments-job-producer.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PAYMENTS_QUEUE_NAME,
    }),
  ],
  providers: [PaymentsJobProducerService],
  exports: [PaymentsJobProducerService, BullModule],
})
export class PaymentsQueueModule {}
