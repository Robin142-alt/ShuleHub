import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { FinancialTransactionEntity } from '../entities/transaction.entity';

interface TransactionRow {
  id: string;
  tenant_id: string;
  idempotency_key_id: string;
  reference: string;
  description: string;
  currency_code: string;
  total_amount_minor: string;
  entry_count: number;
  effective_at: Date;
  posted_at: Date;
  created_by_user_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateTransactionInput {
  tenant_id: string;
  idempotency_key_id: string;
  reference: string;
  description: string;
  currency_code: string;
  total_amount_minor: string;
  entry_count: number;
  effective_at: string;
  posted_at: string;
  created_by_user_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async acquireReferenceLock(tenantId: string, reference: string): Promise<void> {
    await this.databaseService.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`finance:transaction:${tenantId}:${reference}`],
    );
  }

  async createTransaction(input: CreateTransactionInput): Promise<FinancialTransactionEntity> {
    const result = await this.databaseService.query<TransactionRow>(
      `
        INSERT INTO transactions (
          tenant_id,
          idempotency_key_id,
          reference,
          description,
          currency_code,
          total_amount_minor,
          entry_count,
          effective_at,
          posted_at,
          created_by_user_id,
          request_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::bigint, $7, $8::timestamptz, $9::timestamptz, $10::uuid, $11, $12::jsonb)
        RETURNING
          id,
          tenant_id,
          idempotency_key_id,
          reference,
          description,
          currency_code,
          total_amount_minor::text,
          entry_count,
          effective_at,
          posted_at,
          created_by_user_id,
          request_id,
          metadata,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.idempotency_key_id,
        input.reference,
        input.description,
        input.currency_code,
        input.total_amount_minor,
        input.entry_count,
        input.effective_at,
        input.posted_at,
        input.created_by_user_id,
        input.request_id,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapTransaction(result.rows[0]);
  }

  async findByReference(
    tenantId: string,
    reference: string,
  ): Promise<FinancialTransactionEntity | null> {
    const result = await this.databaseService.query<TransactionRow>(
      `
        SELECT
          id,
          tenant_id,
          idempotency_key_id,
          reference,
          description,
          currency_code,
          total_amount_minor::text,
          entry_count,
          effective_at,
          posted_at,
          created_by_user_id,
          request_id,
          metadata,
          created_at,
          updated_at
        FROM transactions
        WHERE tenant_id = $1
          AND reference = $2
        LIMIT 1
      `,
      [tenantId, reference],
    );

    return result.rows[0] ? this.mapTransaction(result.rows[0]) : null;
  }

  private mapTransaction(row: TransactionRow): FinancialTransactionEntity {
    return Object.assign(new FinancialTransactionEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
