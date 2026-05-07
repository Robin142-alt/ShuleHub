import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import { DatabaseModule } from '../../src/database/database.module';
import { BillingAccessService } from '../../src/modules/billing/billing-access.service';
import { BillingMpesaService } from '../../src/modules/billing/billing-mpesa.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { UsageRecordsRepository } from '../../src/modules/billing/repositories/usage-records.repository';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
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
import { MpesaCallbackProcessorService } from '../../src/modules/payments/mpesa-callback-processor.service';
import { MpesaService } from '../../src/modules/payments/mpesa.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { CallbackLogsRepository } from '../../src/modules/payments/repositories/callback-logs.repository';
import { MpesaTransactionsRepository } from '../../src/modules/payments/repositories/mpesa-transactions.repository';
import { PaymentIntentIdempotencyRepository } from '../../src/modules/payments/repositories/payment-intent-idempotency.repository';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { FraudDetectionService } from '../../src/modules/security/fraud-detection.service';
import { AttendanceService } from '../../src/modules/students/attendance.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { AttendanceSyncConflictResolverService } from '../../src/modules/sync/conflict-resolvers/attendance-sync-conflict-resolver.service';
import { FinanceSyncConflictResolverService } from '../../src/modules/sync/conflict-resolvers/finance-sync-conflict-resolver.service';
import { AttendanceRecordsRepository } from '../../src/modules/sync/repositories/attendance-records.repository';
import { SyncCursorsRepository } from '../../src/modules/sync/repositories/sync-cursors.repository';
import { SyncDevicesRepository } from '../../src/modules/sync/repositories/sync-devices.repository';
import { SyncOperationLogsRepository } from '../../src/modules/sync/repositories/sync-operation-logs.repository';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { InMemoryRedis } from './in-memory-redis';

class InMemoryRedisService {
  private readonly client = new InMemoryRedis();

  getClient(): InMemoryRedis {
    return this.client;
  }

  getBullConnectionOptions(): Record<string, unknown> {
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  async ping(): Promise<'up'> {
    await this.client.ping();
    return 'up';
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
      load: [configuration],
    }),
    CommonModule,
    DatabaseModule,
  ],
  providers: [
    AuthSchemaService,
    BillingSchemaService,
    EventsSchemaService,
    FinanceSchemaService,
    PaymentsSchemaService,
    StudentsSchemaService,
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
      provide: RedisService,
      useClass: InMemoryRedisService,
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
  ],
})
export class KenyanSchoolLoadTestModule {}

