import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthModule } from '../../src/auth/auth.module';
import { AbacGuard } from '../../src/guards/abac.guard';
import { BillingFeatureGuard } from '../../src/guards/billing-feature.guard';
import { BillingLifecycleGuard } from '../../src/guards/billing-lifecycle.guard';
import { JwtAuthGuard } from '../../src/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/guards/rbac.guard';
import { AuthContextMiddleware } from '../../src/middleware/auth-context.middleware';
import { BillingFeatureMiddleware } from '../../src/middleware/billing-feature.middleware';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware';
import { TenantMiddleware } from '../../src/middleware/tenant.middleware';
import { CommonModule } from '../../src/common/common.module';
import { DatabaseModule } from '../../src/database/database.module';
import { BillingAccessService } from '../../src/modules/billing/billing-access.service';
import { BillingController } from '../../src/modules/billing/billing.controller';
import { BillingLifecycleService } from '../../src/modules/billing/billing-lifecycle.service';
import { BillingMpesaService } from '../../src/modules/billing/billing-mpesa.service';
import { BillingNotificationService } from '../../src/modules/billing/billing-notification.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { BillingNotificationsRepository } from '../../src/modules/billing/repositories/billing-notifications.repository';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { UsageRecordsRepository } from '../../src/modules/billing/repositories/usage-records.repository';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { StudentEventsService } from '../../src/modules/events/student-events.service';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { StructuredLoggerService } from '../../src/modules/observability/structured-logger.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { AttendanceController } from '../../src/modules/students/attendance.controller';
import { StudentsController } from '../../src/modules/students/students.controller';
import { AttendanceService } from '../../src/modules/students/attendance.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { AttendanceRecordsRepository } from '../../src/modules/sync/repositories/attendance-records.repository';
import { SyncOperationLogsRepository } from '../../src/modules/sync/repositories/sync-operation-logs.repository';
import { TenantModule } from '../../src/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
      load: [configuration],
    }),
    CommonModule,
    TenantModule,
    DatabaseModule,
    AuthModule,
  ],
  controllers: [StudentsController, AttendanceController, BillingController],
  providers: [
    StudentsSchemaService,
    BillingSchemaService,
    EventsSchemaService,
    FinanceSchemaService,
    PaymentsSchemaService,
    SyncSchemaService,
    StudentsService,
    AttendanceService,
    BillingService,
    UsageMeterService,
    BillingAccessService,
    BillingLifecycleService,
    SyncOperationLogService,
    StudentsRepository,
    AttendanceRecordsRepository,
    SyncOperationLogsRepository,
    SubscriptionsRepository,
    InvoicesRepository,
    BillingNotificationsRepository,
    UsageRecordsRepository,
    PiiEncryptionService,
    {
      provide: BillingNotificationService,
      useValue: {
        queueLifecycleNotifications: async () => undefined,
        listSubscriptionNotifications: async () => [],
      },
    },
    {
      provide: StructuredLoggerService,
      useValue: {
        logEvent: () => undefined,
      },
    },
    {
      provide: StudentEventsService,
      useValue: {
        publishStudentCreated: async () => undefined,
      },
    },
    {
      provide: BillingMpesaService,
      useValue: {
        createInvoicePaymentIntent: async () => {
          throw new Error('Billing MPESA flow is outside scope for billing correctness tests');
        },
      },
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BillingLifecycleGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BillingFeatureGuard,
    },
  ],
})
export class BillingCorrectnessTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        RequestContextMiddleware,
        TenantMiddleware,
        AuthContextMiddleware,
        BillingFeatureMiddleware,
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
