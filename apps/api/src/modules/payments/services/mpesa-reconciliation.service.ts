import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestContextService } from '../../../common/request-context/request-context.service';
import { DatabaseService } from '../../../database/database.service';
import {
  GenerateMpesaReconciliationReportInput,
  MpesaReconciliationDiscrepancy,
  MpesaReconciliationReport,
  MpesaReconciliationSummary,
} from '../payments.types';

interface SuccessfulMpesaRow {
  mpesa_transaction_id: string;
  payment_intent_id: string;
  checkout_request_id: string;
  merchant_request_id: string;
  mpesa_receipt_number: string | null;
  mpesa_amount_minor: string | null;
  ledger_transaction_id: string | null;
  transaction_occurred_at: Date | null;
  processed_at: Date | null;
  created_at: Date;
  linked_transaction_id: string | null;
  linked_transaction_reference: string | null;
  linked_transaction_amount_minor: string | null;
  linked_transaction_posted_at: Date | null;
}

interface MissingCallbackRow {
  payment_intent_id: string;
  checkout_request_id: string | null;
  merchant_request_id: string | null;
  amount_minor: string;
  status: string;
  observed_at: Date;
}

interface DuplicateReceiptRow {
  mpesa_receipt_number: string;
  duplicate_count: number;
  total_amount_minor: string;
  first_seen_at: Date;
  mpesa_transaction_ids: string[];
  checkout_request_ids: string[];
}

interface UnmatchedLedgerRow {
  transaction_id: string;
  reference: string;
  description: string;
  total_amount_minor: string;
  posted_at: Date;
  account_codes: string[];
}

@Injectable()
export class MpesaReconciliationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
  ) {}

  async generateDailyReport(
    input: GenerateMpesaReconciliationReportInput,
  ): Promise<MpesaReconciliationReport> {
    const tenantId = this.requireTenantId();
    const reportDate = this.normalizeReportDate(input.report_date);
    const { windowStart, windowEnd } = this.buildReportWindow(reportDate);
    const graceMinutes = this.normalizeGraceMinutes(input.missing_callback_grace_minutes);
    const missingCallbackCutoff = new Date(Date.now() - graceMinutes * 60_000);

    const [successfulMpesaRows, missingCallbackRows, duplicateReceiptRows, unmatchedLedgerRows] =
      await Promise.all([
        this.loadSuccessfulMpesaRows(tenantId, windowStart, windowEnd),
        this.loadMissingCallbackRows(tenantId, windowStart, windowEnd, missingCallbackCutoff),
        this.loadDuplicateReceiptRows(tenantId, windowStart, windowEnd),
        this.loadUnmatchedLedgerRows(tenantId, windowStart, windowEnd),
      ]);

    const discrepancies: MpesaReconciliationDiscrepancy[] = [];

    let successfulMpesaAmountMinor = 0n;
    let linkedLedgerAmountMinor = 0n;
    let matchedAmountMinor = 0n;
    let linkedLedgerTransactionCount = 0;
    let matchedTransactionCount = 0;
    let missingLedgerTransactionCount = 0;
    let amountMismatchCount = 0;

    for (const row of successfulMpesaRows) {
      successfulMpesaAmountMinor += this.parseMinorAmount(row.mpesa_amount_minor);

      if (row.linked_transaction_id && row.linked_transaction_amount_minor) {
        linkedLedgerTransactionCount += 1;
        linkedLedgerAmountMinor += this.parseMinorAmount(row.linked_transaction_amount_minor);
      }

      if (!row.ledger_transaction_id || !row.linked_transaction_id) {
        missingLedgerTransactionCount += 1;
        discrepancies.push({
          type: 'missing_ledger_transaction',
          severity: 'critical',
          detail: `Successful MPESA transaction "${row.checkout_request_id}" has no linked ledger posting`,
          occurred_at: this.resolveObservedAt(
            row.transaction_occurred_at,
            row.processed_at,
            row.created_at,
          ),
          payment_intent_id: row.payment_intent_id,
          mpesa_transaction_id: row.mpesa_transaction_id,
          ledger_transaction_id: row.ledger_transaction_id,
          checkout_request_id: row.checkout_request_id,
          mpesa_receipt_number: row.mpesa_receipt_number,
          expected_amount_minor: row.mpesa_amount_minor,
          actual_amount_minor: row.linked_transaction_amount_minor,
          metadata: {
            merchant_request_id: row.merchant_request_id,
            reference: row.linked_transaction_reference,
          },
        });
        continue;
      }

      if (
        row.mpesa_amount_minor == null ||
        row.linked_transaction_amount_minor == null ||
        row.mpesa_amount_minor !== row.linked_transaction_amount_minor
      ) {
        amountMismatchCount += 1;
        discrepancies.push({
          type: 'amount_mismatch',
          severity: 'critical',
          detail: `MPESA transaction "${row.checkout_request_id}" amount does not match ledger transaction "${row.linked_transaction_id}"`,
          occurred_at: this.resolveObservedAt(
            row.transaction_occurred_at,
            row.linked_transaction_posted_at,
            row.created_at,
          ),
          payment_intent_id: row.payment_intent_id,
          mpesa_transaction_id: row.mpesa_transaction_id,
          ledger_transaction_id: row.linked_transaction_id,
          checkout_request_id: row.checkout_request_id,
          mpesa_receipt_number: row.mpesa_receipt_number,
          expected_amount_minor: row.mpesa_amount_minor,
          actual_amount_minor: row.linked_transaction_amount_minor,
          metadata: {
            merchant_request_id: row.merchant_request_id,
            reference: row.linked_transaction_reference,
          },
        });
        continue;
      }

      matchedTransactionCount += 1;
      matchedAmountMinor += this.parseMinorAmount(row.mpesa_amount_minor);
    }

    for (const row of missingCallbackRows) {
      discrepancies.push({
        type: 'missing_callback',
        severity: 'warning',
        detail: `Payment intent "${row.payment_intent_id}" is still awaiting an MPESA callback`,
        occurred_at: row.observed_at.toISOString(),
        payment_intent_id: row.payment_intent_id,
        mpesa_transaction_id: null,
        ledger_transaction_id: null,
        checkout_request_id: row.checkout_request_id,
        mpesa_receipt_number: null,
        expected_amount_minor: row.amount_minor,
        actual_amount_minor: null,
        metadata: {
          merchant_request_id: row.merchant_request_id,
          payment_intent_status: row.status,
        },
      });
    }

    for (const row of duplicateReceiptRows) {
      discrepancies.push({
        type: 'duplicate_mpesa_receipt',
        severity: 'warning',
        detail: `MPESA receipt "${row.mpesa_receipt_number}" appears on ${row.duplicate_count} successful transactions`,
        occurred_at: row.first_seen_at.toISOString(),
        payment_intent_id: null,
        mpesa_transaction_id: row.mpesa_transaction_ids[0] ?? null,
        ledger_transaction_id: null,
        checkout_request_id: row.checkout_request_ids[0] ?? null,
        mpesa_receipt_number: row.mpesa_receipt_number,
        expected_amount_minor: row.total_amount_minor,
        actual_amount_minor: null,
        metadata: {
          duplicate_count: row.duplicate_count,
          mpesa_transaction_ids: row.mpesa_transaction_ids,
          checkout_request_ids: row.checkout_request_ids,
        },
      });
    }

    for (const row of unmatchedLedgerRows) {
      discrepancies.push({
        type: 'unmatched_ledger_transaction',
        severity: 'critical',
        detail: `Ledger transaction "${row.reference}" touches MPESA accounts but has no matching MPESA transaction`,
        occurred_at: row.posted_at.toISOString(),
        payment_intent_id: null,
        mpesa_transaction_id: null,
        ledger_transaction_id: row.transaction_id,
        checkout_request_id: null,
        mpesa_receipt_number: null,
        expected_amount_minor: null,
        actual_amount_minor: row.total_amount_minor,
        metadata: {
          description: row.description,
          account_codes: row.account_codes,
        },
      });
    }

    discrepancies.sort((left, right) => {
      if (left.occurred_at === right.occurred_at) {
        return left.type.localeCompare(right.type);
      }

      return left.occurred_at.localeCompare(right.occurred_at);
    });

    const summary: MpesaReconciliationSummary = {
      successful_mpesa_transaction_count: successfulMpesaRows.length,
      successful_mpesa_amount_minor: successfulMpesaAmountMinor.toString(),
      linked_ledger_transaction_count: linkedLedgerTransactionCount,
      linked_ledger_amount_minor: linkedLedgerAmountMinor.toString(),
      matched_transaction_count: matchedTransactionCount,
      matched_amount_minor: matchedAmountMinor.toString(),
      missing_callback_count: missingCallbackRows.length,
      missing_ledger_transaction_count: missingLedgerTransactionCount,
      amount_mismatch_count: amountMismatchCount,
      duplicate_receipt_group_count: duplicateReceiptRows.length,
      unmatched_ledger_transaction_count: unmatchedLedgerRows.length,
      discrepancy_count: discrepancies.length,
    };

    return {
      tenant_id: tenantId,
      report_date: reportDate,
      generated_at: new Date().toISOString(),
      window_started_at: windowStart.toISOString(),
      window_ended_at: windowEnd.toISOString(),
      is_balanced: discrepancies.length === 0,
      summary,
      discrepancies,
    };
  }

  private async loadSuccessfulMpesaRows(
    tenantId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<SuccessfulMpesaRow[]> {
    const result = await this.databaseService.query<SuccessfulMpesaRow>(
      `
        SELECT
          mt.id AS mpesa_transaction_id,
          mt.payment_intent_id,
          mt.checkout_request_id,
          mt.merchant_request_id,
          mt.mpesa_receipt_number,
          mt.amount_minor::text AS mpesa_amount_minor,
          mt.ledger_transaction_id,
          mt.transaction_occurred_at,
          mt.processed_at,
          mt.created_at,
          t.id AS linked_transaction_id,
          t.reference AS linked_transaction_reference,
          t.total_amount_minor::text AS linked_transaction_amount_minor,
          t.posted_at AS linked_transaction_posted_at
        FROM mpesa_transactions mt
        LEFT JOIN transactions t
          ON t.tenant_id = mt.tenant_id
         AND t.id = mt.ledger_transaction_id
        WHERE mt.tenant_id = $1
          AND mt.status = 'succeeded'
          AND COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at) >= $2::timestamptz
          AND COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at) < $3::timestamptz
        ORDER BY COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at) ASC, mt.id ASC
      `,
      [tenantId, windowStart.toISOString(), windowEnd.toISOString()],
    );

    return result.rows;
  }

  private async loadMissingCallbackRows(
    tenantId: string,
    windowStart: Date,
    windowEnd: Date,
    cutoff: Date,
  ): Promise<MissingCallbackRow[]> {
    const result = await this.databaseService.query<MissingCallbackRow>(
      `
        SELECT
          pi.id AS payment_intent_id,
          pi.checkout_request_id,
          pi.merchant_request_id,
          pi.amount_minor::text AS amount_minor,
          pi.status,
          COALESCE(pi.stk_requested_at, pi.created_at) AS observed_at
        FROM payment_intents pi
        LEFT JOIN mpesa_transactions mt
          ON mt.tenant_id = pi.tenant_id
         AND mt.payment_intent_id = pi.id
        WHERE pi.tenant_id = $1
          AND pi.status IN ('stk_requested', 'callback_received', 'processing')
          AND pi.checkout_request_id IS NOT NULL
          AND mt.id IS NULL
          AND COALESCE(pi.stk_requested_at, pi.created_at) >= $2::timestamptz
          AND COALESCE(pi.stk_requested_at, pi.created_at) < $3::timestamptz
          AND COALESCE(pi.stk_requested_at, pi.created_at) <= $4::timestamptz
        ORDER BY observed_at ASC, pi.id ASC
      `,
      [tenantId, windowStart.toISOString(), windowEnd.toISOString(), cutoff.toISOString()],
    );

    return result.rows;
  }

  private async loadDuplicateReceiptRows(
    tenantId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<DuplicateReceiptRow[]> {
    const result = await this.databaseService.query<DuplicateReceiptRow>(
      `
        SELECT
          mt.mpesa_receipt_number,
          COUNT(*)::integer AS duplicate_count,
          COALESCE(SUM(mt.amount_minor), 0)::text AS total_amount_minor,
          MIN(COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at)) AS first_seen_at,
          ARRAY_AGG(mt.id::text ORDER BY COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at), mt.id) AS mpesa_transaction_ids,
          ARRAY_AGG(mt.checkout_request_id ORDER BY COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at), mt.id) AS checkout_request_ids
        FROM mpesa_transactions mt
        WHERE mt.tenant_id = $1
          AND mt.status = 'succeeded'
          AND mt.mpesa_receipt_number IS NOT NULL
          AND COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at) >= $2::timestamptz
          AND COALESCE(mt.transaction_occurred_at, mt.processed_at, mt.created_at) < $3::timestamptz
        GROUP BY mt.mpesa_receipt_number
        HAVING COUNT(*) > 1
        ORDER BY first_seen_at ASC, mt.mpesa_receipt_number ASC
      `,
      [tenantId, windowStart.toISOString(), windowEnd.toISOString()],
    );

    return result.rows;
  }

  private async loadUnmatchedLedgerRows(
    tenantId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<UnmatchedLedgerRow[]> {
    const result = await this.databaseService.query<UnmatchedLedgerRow>(
      `
        WITH mpesa_accounts AS (
          SELECT id, code
          FROM accounts
          WHERE tenant_id = $1
            AND code = ANY($4::text[])
        ),
        candidate_transactions AS (
          SELECT DISTINCT
            t.id AS transaction_id,
            t.reference,
            t.description,
            t.total_amount_minor::text AS total_amount_minor,
            t.posted_at
          FROM transactions t
          JOIN ledger_entries le
            ON le.tenant_id = t.tenant_id
           AND le.transaction_id = t.id
          JOIN mpesa_accounts ma
            ON ma.id = le.account_id
          WHERE t.tenant_id = $1
            AND t.posted_at >= $2::timestamptz
            AND t.posted_at < $3::timestamptz
        )
        SELECT
          ct.transaction_id,
          ct.reference,
          ct.description,
          ct.total_amount_minor,
          ct.posted_at,
          ARRAY_AGG(DISTINCT ma.code ORDER BY ma.code) AS account_codes
        FROM candidate_transactions ct
        JOIN ledger_entries le
          ON le.tenant_id = $1
         AND le.transaction_id = ct.transaction_id
        JOIN mpesa_accounts ma
          ON ma.id = le.account_id
        LEFT JOIN mpesa_transactions mt
          ON mt.tenant_id = $1
         AND mt.ledger_transaction_id = ct.transaction_id
         AND mt.status = 'succeeded'
        WHERE mt.id IS NULL
        GROUP BY
          ct.transaction_id,
          ct.reference,
          ct.description,
          ct.total_amount_minor,
          ct.posted_at
        ORDER BY ct.posted_at ASC, ct.transaction_id ASC
      `,
      [
        tenantId,
        windowStart.toISOString(),
        windowEnd.toISOString(),
        this.getMpesaLedgerAccountCodes(),
      ],
    );

    return result.rows;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for MPESA reconciliation');
    }

    return tenantId;
  }

  private normalizeReportDate(value: string): string {
    const normalizedValue = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
      throw new BadRequestException(
        'MPESA reconciliation report_date must use the YYYY-MM-DD format',
      );
    }

    const [year, month, day] = normalizedValue.split('-').map((part) => Number(part));
    const validationDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    if (
      Number.isNaN(validationDate.getTime()) ||
      validationDate.getUTCFullYear() !== year ||
      validationDate.getUTCMonth() !== month - 1 ||
      validationDate.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        `MPESA reconciliation report_date "${normalizedValue}" is invalid`,
      );
    }

    return normalizedValue;
  }

  private normalizeGraceMinutes(value: number | undefined): number {
    if (value == null) {
      return 15;
    }

    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        'MPESA reconciliation missing_callback_grace_minutes must be a non-negative integer',
      );
    }

    return value;
  }

  private buildReportWindow(reportDate: string): { windowStart: Date; windowEnd: Date } {
    const windowStart = new Date(`${reportDate}T00:00:00+03:00`);

    if (Number.isNaN(windowStart.getTime())) {
      throw new BadRequestException(
        `MPESA reconciliation report_date "${reportDate}" could not be parsed`,
      );
    }

    return {
      windowStart,
      windowEnd: new Date(windowStart.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  private getMpesaLedgerAccountCodes(): string[] {
    return [
      this.configService.get<string>('mpesa.ledgerDebitAccountCode') ?? '1100-MPESA-CLEARING',
      this.configService.get<string>('mpesa.ledgerCreditAccountCode') ??
        '2100-CUSTOMER-DEPOSITS',
    ];
  }

  private parseMinorAmount(value: string | null): bigint {
    if (!value) {
      return 0n;
    }

    return BigInt(value);
  }

  private resolveObservedAt(...values: Array<Date | null | undefined>): string {
    const observedAt = values.find(
      (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()),
    );

    return (observedAt ?? new Date()).toISOString();
  }
}
