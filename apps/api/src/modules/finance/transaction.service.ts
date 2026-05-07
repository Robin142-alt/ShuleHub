import { Injectable } from '@nestjs/common';

import {
  AccountBalanceSnapshot,
  PostFinancialTransactionInput,
  PostedFinancialTransaction,
} from './finance.types';
import { LedgerService } from './ledger.service';

@Injectable()
export class TransactionService {
  constructor(private readonly ledgerService: LedgerService) {}

  async postTransaction(input: PostFinancialTransactionInput): Promise<PostedFinancialTransaction> {
    return this.ledgerService.postTransaction(input);
  }

  async getAccountBalance(accountId: string): Promise<AccountBalanceSnapshot> {
    return this.ledgerService.getAccountBalance(accountId);
  }
}
