import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PaymentsModule } from '../payments/payments.module';
import { BillingController } from './billing.controller';
import { BillingAccessService } from './billing-access.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingMpesaService } from './billing-mpesa.service';
import { BillingNotificationService } from './billing-notification.service';
import { BillingSchemaService } from './billing-schema.service';
import { BillingService } from './billing.service';
import { BillingLifecycleGuard } from '../../guards/billing-lifecycle.guard';
import { InvoicesRepository } from './repositories/invoices.repository';
import { BillingNotificationsRepository } from './repositories/billing-notifications.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { UsageRecordsRepository } from './repositories/usage-records.repository';
import { UsageMeterService } from './usage-meter.service';
import { BillingFeatureGuard } from '../../guards/billing-feature.guard';

@Module({
  imports: [forwardRef(() => PaymentsModule)],
  controllers: [BillingController],
  providers: [
    BillingSchemaService,
    BillingService,
    BillingAccessService,
    BillingLifecycleService,
    BillingNotificationService,
    BillingMpesaService,
    UsageMeterService,
    SubscriptionsRepository,
    InvoicesRepository,
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
    UsageMeterService,
    SubscriptionsRepository,
  ],
})
export class BillingModule {}
