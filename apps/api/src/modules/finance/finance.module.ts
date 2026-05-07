import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SyncModule } from '../sync/sync.module';
import { FinanceSchemaService } from './finance-schema.service';
import { LedgerService } from './ledger.service';
import { TransactionService } from './transaction.service';
import { AccountsRepository } from './repositories/accounts.repository';
import { TransactionsRepository } from './repositories/transactions.repository';
import { LedgerEntriesRepository } from './repositories/ledger-entries.repository';
import { IdempotencyKeysRepository } from './repositories/idempotency-keys.repository';

@Module({
  imports: [AuthModule, SyncModule, ObservabilityModule],
  providers: [
    FinanceSchemaService,
    LedgerService,
    TransactionService,
    AccountsRepository,
    TransactionsRepository,
    LedgerEntriesRepository,
    IdempotencyKeysRepository,
  ],
  exports: [FinanceSchemaService, LedgerService, TransactionService, AccountsRepository],
})
export class FinanceModule {}
