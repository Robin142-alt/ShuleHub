import { Module } from '@nestjs/common';

import { SupportRepository } from './repositories/support.repository';
import { SupportAttachmentStorageService } from './storage/support-attachment-storage.service';
import { SupportController } from './support.controller';
import { SupportNotificationDeliveryService } from './support-notification-delivery.service';
import { SupportSchemaService } from './support-schema.service';
import { SupportService } from './support.service';
import { SupportSlaMonitoringService } from './support-sla-monitoring.service';
import { SupportStatusSubscriptionService } from './support-status-subscription.service';

@Module({
  controllers: [SupportController],
  providers: [
    SupportSchemaService,
    SupportService,
    SupportNotificationDeliveryService,
    SupportSlaMonitoringService,
    SupportStatusSubscriptionService,
    SupportRepository,
    SupportAttachmentStorageService,
  ],
  exports: [
    SupportService,
    SupportRepository,
    SupportNotificationDeliveryService,
    SupportSlaMonitoringService,
    SupportStatusSubscriptionService,
  ],
})
export class SupportModule {}
