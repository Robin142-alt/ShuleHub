import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { QueueModule } from '../../queue/queue.module';
import { EventsModule } from '../events/events.module';
import { AuditLogService } from './audit-log.service';
import { GradesAuditService } from './grades-audit.service';
import { ObservabilityController } from './observability.controller';
import { SloMetricsService } from './slo-metrics.service';
import { SloMonitoringService } from './slo-monitoring.service';
import { StructuredLoggerService } from './structured-logger.service';

@Global()
@Module({
  imports: [DatabaseModule, RedisModule, QueueModule, EventsModule],
  controllers: [ObservabilityController],
  providers: [
    StructuredLoggerService,
    AuditLogService,
    GradesAuditService,
    SloMetricsService,
    SloMonitoringService,
  ],
  exports: [
    StructuredLoggerService,
    AuditLogService,
    GradesAuditService,
    SloMetricsService,
    SloMonitoringService,
  ],
})
export class ObservabilityModule {}
