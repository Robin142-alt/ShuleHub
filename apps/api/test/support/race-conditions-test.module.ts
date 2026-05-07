import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { BillingAccessService } from '../../src/modules/billing/billing-access.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { UsageRecordsRepository } from '../../src/modules/billing/repositories/usage-records.repository';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { AccountsRepository } from '../../src/modules/finance/repositories/accounts.repository';
import { IdempotencyKeysRepository } from '../../src/modules/finance/repositories/idempotency-keys.repository';
import { LedgerEntriesRepository } from '../../src/modules/finance/repositories/ledger-entries.repository';
import { TransactionsRepository } from '../../src/modules/finance/repositories/transactions.repository';
import { AuditLogService } from '../../src/modules/observability/audit-log.service';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { AttendanceService } from '../../src/modules/students/attendance.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { AttendanceSyncConflictResolverService } from '../../src/modules/sync/conflict-resolvers/attendance-sync-conflict-resolver.service';
import { FinanceSyncConflictResolverService } from '../../src/modules/sync/conflict-resolvers/finance-sync-conflict-resolver.service';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { AttendanceRecordsRepository } from '../../src/modules/sync/repositories/attendance-records.repository';
import { SyncCursorsRepository } from '../../src/modules/sync/repositories/sync-cursors.repository';
import { SyncDevicesRepository } from '../../src/modules/sync/repositories/sync-devices.repository';
import { SyncOperationLogsRepository } from '../../src/modules/sync/repositories/sync-operation-logs.repository';
import { StudentEventsService } from '../../src/modules/events/student-events.service';

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
    FinanceSchemaService,
    SyncSchemaService,
    BillingSchemaService,
    StudentsSchemaService,
    PiiEncryptionService,
    LedgerService,
    TransactionService,
    AccountsRepository,
    TransactionsRepository,
    LedgerEntriesRepository,
    IdempotencyKeysRepository,
    BillingService,
    BillingAccessService,
    UsageMeterService,
    SubscriptionsRepository,
    InvoicesRepository,
    UsageRecordsRepository,
    StudentsService,
    AttendanceService,
    StudentsRepository,
    SyncService,
    SyncOperationLogService,
    SyncDevicesRepository,
    SyncCursorsRepository,
    SyncOperationLogsRepository,
    AttendanceRecordsRepository,
    AttendanceSyncConflictResolverService,
    FinanceSyncConflictResolverService,
    {
      provide: AuditLogService,
      useValue: {
        async recordFinanceTransactionPosted(): Promise<void> {
          return undefined;
        },
      },
    },
    {
      provide: StudentEventsService,
      useValue: {
        async publishStudentCreated(): Promise<void> {
          return undefined;
        },
      },
    },
  ],
})
export class RaceConditionsTestModule {}
