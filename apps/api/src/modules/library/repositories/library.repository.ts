import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import type {
  IssueLibraryCopyDto,
  ReserveLibraryCopyDto,
  ReturnLibraryCopyDto,
} from '../dto/library.dto';

@Injectable()
export class LibraryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findCopyForUpdate(tenantId: string, copyId: string) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM library_copies
        WHERE tenant_id = $1
          AND id = $2::uuid
        FOR UPDATE
      `,
      [tenantId, copyId],
    );

    return result.rows[0] ?? null;
  }

  async findCopyByScanCodeForUpdate(tenantId: string, scanCode: string) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM library_copies
        WHERE tenant_id = $1
          AND (
            id::text = $2
            OR accession_number = $2
            OR barcode = $2
            OR qr_code = $2
          )
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, scanCode],
    );

    return result.rows[0] ?? null;
  }

  async findBorrowerByScanCode(tenantId: string, scanCode: string) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM library_borrowers
        WHERE tenant_id = $1
          AND (
            id::text = $2
            OR subject_id::text = $2
            OR scan_code = $2
          )
        LIMIT 1
      `,
      [tenantId, scanCode],
    );

    return result.rows[0] ?? null;
  }

  async issueCopy(input: IssueLibraryCopyDto & {
    tenant_id: string;
    issued_by_user_id: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        UPDATE library_copies
        SET status = 'issued',
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND status = 'available'
        RETURNING id::text, status
      `,
      [input.tenant_id, input.copy_id],
    );

    return result.rows[0] ?? null;
  }

  async createReservation(input: ReserveLibraryCopyDto & {
    tenant_id: string;
  }) {
    const result = await this.databaseService.query(
      `
        WITH next_position AS (
          SELECT COALESCE(MAX(queue_position), 0) + 1 AS queue_position
          FROM library_reservations
          WHERE tenant_id = $1
            AND catalog_item_id = $2::uuid
            AND status = 'waiting'
        )
        INSERT INTO library_reservations (
          tenant_id,
          catalog_item_id,
          borrower_id,
          queue_position
        )
        SELECT $1, $2::uuid, $3::uuid, queue_position
        FROM next_position
        RETURNING id::text, queue_position
      `,
      [input.tenant_id, input.catalog_item_id, input.borrower_id],
    );

    return result.rows[0];
  }

  async findLoanForReturn(tenantId: string, loanId: string) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM library_circulation_ledger
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND action = 'issue'
        LIMIT 1
      `,
      [tenantId, loanId],
    );

    return result.rows[0] ?? null;
  }

  async findActiveLoanByCopyId(tenantId: string, copyId: string) {
    const result = await this.databaseService.query(
      `
        SELECT issue.*
        FROM library_circulation_ledger issue
        WHERE issue.tenant_id = $1
          AND issue.copy_id = $2::uuid
          AND issue.action = 'issue'
          AND NOT EXISTS (
            SELECT 1
            FROM library_circulation_ledger returned
            WHERE returned.tenant_id = issue.tenant_id
              AND returned.copy_id = issue.copy_id
              AND returned.borrower_id = issue.borrower_id
              AND returned.action = 'return'
              AND returned.created_at >= issue.created_at
          )
        ORDER BY issue.created_at DESC
        LIMIT 1
      `,
      [tenantId, copyId],
    );

    return result.rows[0] ?? null;
  }

  async returnCopy(input: ReturnLibraryCopyDto & {
    tenant_id: string;
    copy_id?: string | null;
  }) {
    if (input.copy_id) {
      await this.databaseService.query(
        `
          UPDATE library_copies
          SET status = 'available',
              updated_at = NOW()
          WHERE tenant_id = $1
            AND id = $2::uuid
        `,
        [input.tenant_id, input.copy_id],
      );
    }

    return { id: input.loan_id, status: 'returned' };
  }

  async createFine(input: {
    tenant_id: string;
    borrower_id: string;
    copy_id?: string | null;
    reason: string;
    amount_minor: number;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO library_fines (
          tenant_id,
          borrower_id,
          copy_id,
          reason,
          amount_minor
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5)
        RETURNING id::text, amount_minor
      `,
      [
        input.tenant_id,
        input.borrower_id,
        input.copy_id ?? null,
        input.reason,
        input.amount_minor,
      ],
    );

    return result.rows[0];
  }

  async listCirculation(input: {
    tenant_id: string;
    borrower_id?: string;
    copy_id?: string;
    action?: string;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT
          ledger.id::text,
          ledger.copy_id::text,
          ledger.borrower_id::text,
          ledger.action,
          ledger.metadata,
          ledger.created_at::text,
          copy.accession_number,
          catalog.title,
          catalog.author,
          borrower.borrower_type
        FROM library_circulation_ledger ledger
        LEFT JOIN library_copies copy
          ON copy.tenant_id = ledger.tenant_id
         AND copy.id = ledger.copy_id
        LEFT JOIN library_catalog_items catalog
          ON catalog.tenant_id = copy.tenant_id
         AND catalog.id = copy.catalog_item_id
        LEFT JOIN library_borrowers borrower
          ON borrower.tenant_id = ledger.tenant_id
         AND borrower.id = ledger.borrower_id
        WHERE ledger.tenant_id = $1
          AND ($2::uuid IS NULL OR ledger.borrower_id = $2::uuid)
          AND ($3::uuid IS NULL OR ledger.copy_id = $3::uuid)
          AND ($4::text IS NULL OR ledger.action = $4)
        ORDER BY ledger.created_at DESC
        LIMIT 500
      `,
      [
        input.tenant_id,
        input.borrower_id ?? null,
        input.copy_id ?? null,
        input.action ?? null,
      ],
    );

    return result.rows;
  }

  async appendLedger(input: {
    tenant_id: string;
    copy_id?: string | null;
    borrower_id?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.databaseService.query(
      `
        INSERT INTO library_circulation_ledger (
          tenant_id,
          copy_id,
          borrower_id,
          action,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        input.tenant_id,
        input.copy_id ?? null,
        input.borrower_id ?? null,
        input.action,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
