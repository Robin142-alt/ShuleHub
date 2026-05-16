import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PaymentsModule } from '../payments/payments.module';
import { FinanceModule } from '../finance/finance.module';
import { BillingController } from './billing.controller';
import { BillingAccessService } from './billing-access.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingMpesaService } from './billing-mpesa.service';
import { BillingNotificationService } from './billing-notification.service';
import { BillingSchemaService } from './billing-schema.service';
import { BillingService } from './billing.service';
import { ManualFeePaymentService } from './manual-fee-payment.service';
import { StudentFeePaymentAllocationService } from './student-fee-payment-allocation.service';
import { BillingLifecycleGuard } from '../../guards/billing-lifecycle.guard';
import { InvoicesRepository } from './repositories/invoices.repository';
import { ManualFeePaymentsRepository } from './repositories/manual-fee-payments.repository';
import { BillingNotificationsRepository } from './repositories/billing-notifications.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { UsageRecordsRepository } from './repositories/usage-records.repository';
import { UsageMeterService } from './usage-meter.service';
import { BillingFeatureGuard } from '../../guards/billing-feature.guard';
import { FeeStructuresRepository } from './repositories/fee-structures.repository';

@Module({
  imports: [FinanceModule, forwardRef(() => PaymentsModule)],
  controllers: [BillingController],
  providers: [
    BillingSchemaService,
    BillingService,
    BillingAccessService,
    BillingLifecycleService,
    BillingNotificationService,
    BillingMpesaService,
    ManualFeePaymentService,
    StudentFeePaymentAllocationService,
    UsageMeterService,
    SubscriptionsRepository,
    InvoicesRepository,
    FeeStructuresRepository,
    ManualFeePaymentsRepository,
    BillingNotificationsRepository,
    UsageRecordsRepository,
    {
      provide: APP_GUARD,
      useClass: BillingLifecycleGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BillingFeatureGuard,
    },
  ],
  exports: [
    BillingAccessService,
    BillingLifecycleService,
    BillingNotificationService,
    BillingService,
    BillingMpesaService,
    ManualFeePaymentService,
    StudentFeePaymentAllocationService,
    UsageMeterService,
    SubscriptionsRepository,
    InvoicesRepository,
    FeeStructuresRepository,
  ],
})
export class BillingModule {}
