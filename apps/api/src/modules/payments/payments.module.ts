import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { EventsModule } from '../events/events.module';
import { FinanceModule } from '../finance/finance.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SecurityModule } from '../security/security.module';
import { TenantFinanceModule } from '../tenant-finance/tenant-finance.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MpesaCallbackController } from './controllers/mpesa-callback.controller';
import { MpesaC2bController } from './controllers/mpesa-c2b.controller';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsSchemaService } from './payments-schema.service';
import { CallbackLogsRepository } from './repositories/callback-logs.repository';
import { MpesaC2bPaymentsRepository } from './repositories/mpesa-c2b-payments.repository';
import { MpesaTransactionsRepository } from './repositories/mpesa-transactions.repository';
import { PaymentIntentIdempotencyRepository } from './repositories/payment-intent-idempotency.repository';
import { PaymentIntentsRepository } from './repositories/payment-intents.repository';
import { PaymentsQueueModule } from './queue/payments-queue.module';
import { MpesaCallbackProcessorService } from './services/mpesa-callback-processor.service';
import { MpesaC2bService } from './services/mpesa-c2b.service';
import { MpesaPaymentRecoveryService } from './services/mpesa-payment-recovery.service';
import { MpesaReconciliationService } from './services/mpesa-reconciliation.service';
import { MpesaReplayProtectionService } from './services/mpesa-replay-protection.service';
import { MpesaService } from './services/mpesa.service';
import { MpesaSignatureService } from './services/mpesa-signature.service';
import { PaymentAllocationService } from './services/payment-allocation.service';

@Module({
  imports: [
    AuthModule,
    FinanceModule,
    EventsModule,
    ObservabilityModule,
    SecurityModule,
    TenantFinanceModule,
    IntegrationsModule,
    PaymentsQueueModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [PaymentsController, MpesaCallbackController, MpesaC2bController],
  providers: [
    PaymentsSchemaService,
    MpesaService,
    MpesaC2bService,
    MpesaSignatureService,
    MpesaReplayProtectionService,
    MpesaReconciliationService,
    MpesaPaymentRecoveryService,
    MpesaCallbackProcessorService,
    PaymentAllocationService,
    PaymentIntentIdempotencyRepository,
    PaymentIntentsRepository,
    CallbackLogsRepository,
    MpesaC2bPaymentsRepository,
    MpesaTransactionsRepository,
  ],
  exports: [
    MpesaService,
    MpesaC2bService,
    MpesaCallbackProcessorService,
    MpesaReconciliationService,
    MpesaPaymentRecoveryService,
    PaymentAllocationService,
    PaymentsQueueModule,
  ],
})
export class PaymentsModule {}
