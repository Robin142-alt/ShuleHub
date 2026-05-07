import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthModule } from '../../src/auth/auth.module';
import { CommonModule } from '../../src/common/common.module';
import { DatabaseModule } from '../../src/database/database.module';
import { DatabaseService } from '../../src/database/database.service';
import { JwtAuthGuard } from '../../src/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/guards/rbac.guard';
import { AbacGuard } from '../../src/guards/abac.guard';
import { BillingFeatureGuard } from '../../src/guards/billing-feature.guard';
import { AuthContextMiddleware } from '../../src/middleware/auth-context.middleware';
import { BillingFeatureMiddleware } from '../../src/middleware/billing-feature.middleware';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware';
import { TenantMiddleware } from '../../src/middleware/tenant.middleware';
import { TenantModule } from '../../src/tenant/tenant.module';
import { BillingAccessService } from '../../src/modules/billing/billing-access.service';
import { BillingController } from '../../src/modules/billing/billing.controller';
import { BillingMpesaService } from '../../src/modules/billing/billing-mpesa.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { UsageRecordsRepository } from '../../src/modules/billing/repositories/usage-records.repository';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { StudentEventsService } from '../../src/modules/events/student-events.service';
import { AuditLogsRepository } from '../../src/modules/events/repositories/audit-logs.repository';
import { OutboxEventsRepository } from '../../src/modules/events/repositories/outbox-events.repository';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { AccountsRepository } from '../../src/modules/finance/repositories/accounts.repository';
import { IdempotencyKeysRepository } from '../../src/modules/finance/repositories/idempotency-keys.repository';
import { LedgerEntriesRepository } from '../../src/modules/finance/repositories/ledger-entries.repository';
import { TransactionsRepository } from '../../src/modules/finance/repositories/transactions.repository';
import { AuditLogService } from '../../src/modules/observability/audit-log.service';
import { PaymentsController } from '../../src/modules/payments/payments.controller';
import { MpesaCallbackController } from '../../src/modules/payments/mpesa-callback.controller';
import { MpesaCallbackProcessorService } from '../../src/modules/payments/mpesa-callback-processor.service';
import { MpesaReplayProtectionService } from '../../src/modules/payments/mpesa-replay-protection.service';
import { MpesaService } from '../../src/modules/payments/mpesa.service';
import { MpesaSignatureService } from '../../src/modules/payments/mpesa-signature.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { CallbackLogsRepository } from '../../src/modules/payments/repositories/callback-logs.repository';
import { MpesaTransactionsRepository } from '../../src/modules/payments/repositories/mpesa-transactions.repository';
import { PaymentIntentIdempotencyRepository } from '../../src/modules/payments/repositories/payment-intent-idempotency.repository';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { FraudDetectionService } from '../../src/modules/security/fraud-detection.service';
import { AttendanceController } from '../../src/modules/students/attendance.controller';
import { StudentsController } from '../../src/modules/students/students.controller';
import { AttendanceService } from '../../src/modules/students/attendance.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { SyncController } from '../../src/modules/sync/sync.controller';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { AttendanceSyncConflictResolverService } from '../../src/modules/sync/conflict-resolvers/attendance-sync-conflict-resolver.service';
import { FinanceSyncConflictResolverService } from '../../src/modules/sync/conflict-resolvers/finance-sync-conflict-resolver.service';
import { AttendanceRecordsRepository } from '../../src/modules/sync/repositories/attendance-records.repository';
import { SyncCursorsRepository } from '../../src/modules/sync/repositories/sync-cursors.repository';
import { SyncDevicesRepository } from '../../src/modules/sync/repositories/sync-devices.repository';
import { SyncOperationLogsRepository } from '../../src/modules/sync/repositories/sync-operation-logs.repository';
import { QueueService } from '../../src/queue/queue.service';
import { CapturingQueueService } from './capturing-queue.service';
import { InMemoryMpesaReplayProtectionService } from './in-memory-mpesa-replay-protection.service';

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
  controllers: [
    StudentsController,
    AttendanceController,
    BillingController,
    PaymentsController,
    MpesaCallbackController,
    SyncController,
  ],
  providers: [
    StudentsSchemaService,
    BillingSchemaService,
    EventsSchemaService,
    FinanceSchemaService,
    PaymentsSchemaService,
    SyncSchemaService,
    PiiEncryptionService,
    StudentsService,
    AttendanceService,
    StudentsRepository,
    BillingService,
    BillingMpesaService,
    BillingAccessService,
    UsageMeterService,
    SubscriptionsRepository,
    InvoicesRepository,
    UsageRecordsRepository,
    EventPublisherService,
    StudentEventsService,
    OutboxEventsRepository,
    AuditLogsRepository,
    LedgerService,
    TransactionService,
    AccountsRepository,
    TransactionsRepository,
    LedgerEntriesRepository,
    IdempotencyKeysRepository,
    PaymentIntentIdempotencyRepository,
    PaymentIntentsRepository,
    CallbackLogsRepository,
    MpesaTransactionsRepository,
    MpesaService,
    MpesaSignatureService,
    MpesaCallbackProcessorService,
    SyncService,
    SyncOperationLogService,
    SyncDevicesRepository,
    SyncCursorsRepository,
    SyncOperationLogsRepository,
    AttendanceRecordsRepository,
    AttendanceSyncConflictResolverService,
    FinanceSyncConflictResolverService,
    AuditLogService,
    {
      provide: CapturingQueueService,
      useValue: new CapturingQueueService(),
    },
    {
      provide: QueueService,
      useExisting: CapturingQueueService,
    },
    {
      provide: InMemoryMpesaReplayProtectionService,
      useValue: new InMemoryMpesaReplayProtectionService(),
    },
    {
      provide: MpesaReplayProtectionService,
      useExisting: InMemoryMpesaReplayProtectionService,
    },
    {
      provide: FraudDetectionService,
      useValue: {
        async inspectPaymentIntentCreation(): Promise<void> {
          return undefined;
        },
        async recordCallbackFailure(): Promise<void> {
          return undefined;
        },
        async recordCallbackMismatch(): Promise<void> {
          return undefined;
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
      useClass: BillingFeatureGuard,
    },
  ],
})
export class WorkflowE2ETestModule implements NestModule {
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
