import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { EventsModule } from '../events/events.module';
import { FinanceModule } from '../finance/finance.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SecurityModule } from '../security/security.module';
import { MpesaCallbackController } from './controllers/mpesa-callback.controller';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsSchemaService } from './payments-schema.service';
import { CallbackLogsRepository } from './repositories/callback-logs.repository';
import { MpesaTransactionsRepository } from './repositories/mpesa-transactions.repository';
import { PaymentIntentIdempotencyRepository } from './repositories/payment-intent-idempotency.repository';
import { PaymentIntentsRepository } from './repositories/payment-intents.repository';
import { PaymentsQueueModule } from './queue/payments-queue.module';
import { MpesaCallbackProcessorService } from './services/mpesa-callback-processor.service';
import { MpesaPaymentRecoveryService } from './services/mpesa-payment-recovery.service';
import { MpesaReconciliationService } from './services/mpesa-reconciliation.service';
import { MpesaReplayProtectionService } from './services/mpesa-replay-protection.service';
import { MpesaService } from './services/mpesa.service';
import { MpesaSignatureService } from './services/mpesa-signature.service';

@Module({
  imports: [
    AuthModule,
    FinanceModule,
    EventsModule,
    ObservabilityModule,
    SecurityModule,
    PaymentsQueueModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [PaymentsController, MpesaCallbackController],
  providers: [
    PaymentsSchemaService,
    MpesaService,
    MpesaSignatureService,
    MpesaReplayProtectionService,
    MpesaReconciliationService,
    MpesaPaymentRecoveryService,
    MpesaCallbackProcessorService,
    PaymentIntentIdempotencyRepository,
    PaymentIntentsRepository,
    CallbackLogsRepository,
    MpesaTransactionsRepository,
  ],
  exports: [
    MpesaService,
    MpesaCallbackProcessorService,
    MpesaReconciliationService,
    MpesaPaymentRecoveryService,
    PaymentsQueueModule,
  ],
})
export class PaymentsModule {}
