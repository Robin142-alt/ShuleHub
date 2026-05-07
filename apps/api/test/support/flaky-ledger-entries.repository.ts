import { Injectable } from '@nestjs/common';

import { LedgerEntriesRepository } from '../../src/modules/finance/repositories/ledger-entries.repository';
import { LedgerEntryEntity } from '../../src/modules/finance/entities/ledger-entry.entity';
import { ValidatedLedgerEntry } from '../../src/modules/finance/finance.types';

@Injectable()
export class FlakyLedgerEntriesRepository extends LedgerEntriesRepository {
  private remainingInsertFailures = 0;
  private failureMessage = 'Connection terminated unexpectedly';

  failNextInsert(count = 1, message = 'Connection terminated unexpectedly'): void {
    this.remainingInsertFailures = count;
    this.failureMessage = message;
  }

  override async insertEntries(
    tenantId: string,
    transactionId: string,
    entries: ValidatedLedgerEntry[],
  ): Promise<LedgerEntryEntity[]> {
    if (this.remainingInsertFailures > 0) {
      this.remainingInsertFailures -= 1;
      throw new Error(this.failureMessage);
    }

    return super.insertEntries(tenantId, transactionId, entries);
  }
}
