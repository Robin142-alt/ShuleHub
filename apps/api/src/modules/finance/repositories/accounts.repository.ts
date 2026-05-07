import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { AccountEntity } from '../entities/account.entity';

interface AccountRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  category: AccountEntity['category'];
  normal_balance: AccountEntity['normal_balance'];
  currency_code: string;
  allow_manual_entries: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AccountsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(tenantId: string, accountId: string): Promise<AccountEntity | null> {
    const result = await this.databaseService.query<AccountRow>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          category,
          normal_balance,
          currency_code,
          allow_manual_entries,
          is_active,
          metadata,
          created_at,
          updated_at
        FROM accounts
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1
      `,
      [tenantId, accountId],
    );

    return result.rows[0] ? this.mapAccount(result.rows[0]) : null;
  }

  async findByCode(tenantId: string, accountCode: string): Promise<AccountEntity | null> {
    const result = await this.databaseService.query<AccountRow>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          category,
          normal_balance,
          currency_code,
          allow_manual_entries,
          is_active,
          metadata,
          created_at,
          updated_at
        FROM accounts
        WHERE tenant_id = $1
          AND code = $2
        LIMIT 1
      `,
      [tenantId, accountCode],
    );

    return result.rows[0] ? this.mapAccount(result.rows[0]) : null;
  }

  async findByIds(tenantId: string, accountIds: string[]): Promise<AccountEntity[]> {
    const uniqueAccountIds = Array.from(new Set(accountIds));

    if (uniqueAccountIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<AccountRow>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          category,
          normal_balance,
          currency_code,
          allow_manual_entries,
          is_active,
          metadata,
          created_at,
          updated_at
        FROM accounts
        WHERE tenant_id = $1
          AND id = ANY($2::uuid[])
        ORDER BY id ASC
      `,
      [tenantId, uniqueAccountIds],
    );

    return result.rows.map((row) => this.mapAccount(row));
  }

  async lockAccountsByIds(tenantId: string, accountIds: string[]): Promise<AccountEntity[]> {
    const uniqueAccountIds = Array.from(new Set(accountIds));

    if (uniqueAccountIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<AccountRow>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          category,
          normal_balance,
          currency_code,
          allow_manual_entries,
          is_active,
          metadata,
          created_at,
          updated_at
        FROM accounts
        WHERE tenant_id = $1
          AND id = ANY($2::uuid[])
        ORDER BY id ASC
        FOR UPDATE
      `,
      [tenantId, uniqueAccountIds],
    );

    return result.rows.map((row) => this.mapAccount(row));
  }

  private mapAccount(row: AccountRow): AccountEntity {
    return Object.assign(new AccountEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
