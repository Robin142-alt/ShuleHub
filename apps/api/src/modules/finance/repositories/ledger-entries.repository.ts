import { Injectable } from '@nestjs/common';
import format from 'pg-format';

import { DatabaseService } from '../../../database/database.service';
import { LedgerEntryEntity } from '../entities/ledger-entry.entity';
import { AccountBalanceSnapshot, ValidatedLedgerEntry } from '../finance.types';

interface LedgerEntryRow {
  id: string;
  tenant_id: string;
  transaction_id: string;
  account_id: string;
  line_number: number;
  direction: LedgerEntryEntity['direction'];
  amount_minor: string;
  currency_code: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface BalanceRow {
  account_id: string;
  account_code: string;
  currency_code: string;
  normal_balance: AccountBalanceSnapshot['normal_balance'];
  debit_total_minor: string;
  credit_total_minor: string;
}

@Injectable()
export class LedgerEntriesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async insertEntries(
    tenantId: string,
    transactionId: string,
    entries: ValidatedLedgerEntry[],
  ): Promise<LedgerEntryEntity[]> {
    const values = entries.map((entry) => [
      tenantId,
      transactionId,
      entry.account_id,
      entry.line_number,
      entry.direction,
      entry.amount_minor,
      entry.currency_code,
      entry.description ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ]);

    const query = format(
      `
        INSERT INTO ledger_entries (
          tenant_id,
          transaction_id,
          account_id,
          line_number,
          direction,
          amount_minor,
          currency_code,
          description,
          metadata
        )
        VALUES %L
        RETURNING
          id,
          tenant_id,
          transaction_id,
          account_id,
          line_number,
          direction,
          amount_minor::text,
          currency_code,
          description,
          metadata,
          created_at,
          updated_at
      `,
      values,
    );

    const result = await this.databaseService.query<LedgerEntryRow>(query);
    return result.rows.map((row) => this.mapLedgerEntry(row));
  }

  async calculateBalances(tenantId: string, accountIds: string[]): Promise<Map<string, AccountBalanceSnapshot>> {
    const uniqueAccountIds = Array.from(new Set(accountIds));

    if (uniqueAccountIds.length === 0) {
      return new Map();
    }

    const result = await this.databaseService.query<BalanceRow>(
      `
        SELECT
          a.id AS account_id,
          a.code AS account_code,
          a.currency_code,
          a.normal_balance,
          COALESCE(
            SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END),
            0
          )::text AS debit_total_minor,
          COALESCE(
            SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END),
            0
          )::text AS credit_total_minor
        FROM accounts a
        LEFT JOIN ledger_entries le
          ON le.tenant_id = a.tenant_id
         AND le.account_id = a.id
        WHERE a.tenant_id = $1
          AND a.id = ANY($2::uuid[])
        GROUP BY a.id, a.code, a.currency_code, a.normal_balance
      `,
      [tenantId, uniqueAccountIds],
    );

    return new Map(
      result.rows.map((row) => [
        row.account_id,
        {
          account_id: row.account_id,
          account_code: row.account_code,
          currency_code: row.currency_code,
          normal_balance: row.normal_balance,
          debit_total_minor: row.debit_total_minor,
          credit_total_minor: row.credit_total_minor,
          balance_minor: '0',
        },
      ]),
    );
  }

  async findByTransactionId(
    tenantId: string,
    transactionId: string,
  ): Promise<LedgerEntryEntity[]> {
    const result = await this.databaseService.query<LedgerEntryRow>(
      `
        SELECT
          id,
          tenant_id,
          transaction_id,
          account_id,
          line_number,
          direction,
          amount_minor::text,
          currency_code,
          description,
          metadata,
          created_at,
          updated_at
        FROM ledger_entries
        WHERE tenant_id = $1
          AND transaction_id = $2::uuid
        ORDER BY line_number ASC
      `,
      [tenantId, transactionId],
    );

    return result.rows.map((row) => this.mapLedgerEntry(row));
  }

  private mapLedgerEntry(row: LedgerEntryRow): LedgerEntryEntity {
    return Object.assign(new LedgerEntryEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
