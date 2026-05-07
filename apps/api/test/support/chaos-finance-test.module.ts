import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { AccountsRepository } from '../../src/modules/finance/repositories/accounts.repository';
import { IdempotencyKeysRepository } from '../../src/modules/finance/repositories/idempotency-keys.repository';
import { LedgerEntriesRepository } from '../../src/modules/finance/repositories/ledger-entries.repository';
import { TransactionsRepository } from '../../src/modules/finance/repositories/transactions.repository';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { AuditLogService } from '../../src/modules/observability/audit-log.service';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';
import { FlakyLedgerEntriesRepository } from './flaky-ledger-entries.repository';

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
    LedgerService,
    TransactionService,
    AccountsRepository,
    TransactionsRepository,
    IdempotencyKeysRepository,
    FlakyLedgerEntriesRepository,
    {
      provide: LedgerEntriesRepository,
      useExisting: FlakyLedgerEntriesRepository,
    },
    {
      provide: AuditLogService,
      useValue: {
        async recordFinanceTransactionPosted(): Promise<void> {
          return undefined;
        },
      },
    },
    {
      provide: SyncOperationLogService,
      useValue: {
        async recordServerOperation(): Promise<void> {
          return undefined;
        },
      },
    },
  ],
})
export class ChaosFinanceTestModule {}
