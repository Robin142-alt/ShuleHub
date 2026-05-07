import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryResultRow } from 'pg';

import { AUTH_ANONYMOUS_USER_ID } from '../src/auth/auth.constants';
import { AuthSchemaService } from '../src/auth/auth-schema.service';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseSecurityService } from '../src/database/database-security.service';
import { DatabaseService } from '../src/database/database.service';
import { FinanceSchemaService } from '../src/modules/finance/finance-schema.service';
import { LedgerEntriesRepository } from '../src/modules/finance/repositories/ledger-entries.repository';
import { TransactionService } from '../src/modules/finance/transaction.service';
import { AuditLogService } from '../src/modules/observability/audit-log.service';
import {
  GenerateMpesaReconciliationReportInput,
  MpesaReconciliationReport,
  ProcessMpesaCallbackJobPayload,
} from '../src/modules/payments/payments.types';
import { MpesaCallbackProcessorService } from '../src/modules/payments/mpesa-callback-processor.service';
import { MpesaReconciliationService } from '../src/modules/payments/mpesa-reconciliation.service';
import { PaymentsSchemaService } from '../src/modules/payments/payments-schema.service';
import { MpesaService } from '../src/modules/payments/mpesa.service';
import { SyncSchemaService } from '../src/modules/sync/sync-schema.service';
import { CapturingQueueService } from './support/capturing-queue.service';
import { FinanceIntegrityTestModule } from './support/finance-integrity-test.module';
import { FlakyLedgerEntriesRepository } from './support/flaky-ledger-entries.repository';
import { InMemoryMpesaReplayProtectionService } from './support/in-memory-mpesa-replay-protection.service';
import { MpesaAdversarialTestModule } from './support/mpesa-adversarial-test.module';
import { MpesaMockServer } from './support/mpesa-mock-server';

jest.setTimeout(600000);

interface AuditLogServiceStub {
  shouldFail: boolean;
  recordFinanceTransactionPosted(): Promise<void>;
}

interface TenantAccountsFixture {
  tenant_id: string;
  cash_account_id: string;
  revenue_account_id: string;
}

interface DailyTruthSummary {
  direct_successful_post_count: number;
  direct_failed_post_count: number;
  mpesa_successful_payment_count: number;
  mpesa_amount_minor: bigint;
}

interface SettledMpesaPayment {
  payment_intent_id: string;
  checkout_request_id: string;
  ledger_transaction_id: string;
  amount_minor: string;
}

const RECONCILIATION_CYCLES = 2;
const DIRECT_LEDGER_POSTS_PER_DAY = 6;
const MPESA_PAYMENTS_PER_DAY = 3;
const TRUTH_TEST_SEED = 20260427;

describe('Financial truth integration', () => {
  let testingModule: TestingModule;
  let app: INestApplication;
  let requestContext: RequestContextService;
  let databaseService: DatabaseService;
  let transactionService: TransactionService;
  let mpesaService: MpesaService;
  let mpesaCallbackProcessor: MpesaCallbackProcessorService;
  let reconciliationService: MpesaReconciliationService;
  let queueService: CapturingQueueService;
  let replayProtectionService: InMemoryMpesaReplayProtectionService;
  let flakyLedgerEntriesRepository: FlakyLedgerEntriesRepository;
  let auditLogServiceStub: AuditLogServiceStub;
  let mockServer: MpesaMockServer;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    const callbackPort = await reservePort();
    mockServer = new MpesaMockServer('mpesa-test-secret');
    await mockServer.start();
    ensureIntegrationEnv(callbackPort, mockServer.baseUrl);

    const schemaBootstrapModule = await Test.createTestingModule({
      imports: [FinanceIntegrityTestModule],
    }).compile();
    await initializeIntegrationModule(schemaBootstrapModule);
    await schemaBootstrapModule.close();

    auditLogServiceStub = {
      shouldFail: false,
      async recordFinanceTransactionPosted(): Promise<void> {
        if (this.shouldFail) {
          throw new Error('Injected audit log failure');
        }
      },
    };

    testingModule = await Test.createTestingModule({
      imports: [MpesaAdversarialTestModule],
    })
      .overrideProvider(LedgerEntriesRepository)
      .useClass(FlakyLedgerEntriesRepository)
      .overrideProvider(AuditLogService)
      .useValue(auditLogServiceStub)
      .compile();

    app = testingModule.createNestApplication({
      rawBody: true,
    });
    await app.init();
    await app.listen(callbackPort, '127.0.0.1');

    requestContext = testingModule.get(RequestContextService);
    databaseService = testingModule.get(DatabaseService);
    transactionService = testingModule.get(TransactionService);
    mpesaService = testingModule.get(MpesaService);
    mpesaCallbackProcessor = testingModule.get(MpesaCallbackProcessorService);
    reconciliationService = testingModule.get(MpesaReconciliationService);
    queueService = testingModule.get(CapturingQueueService);
    replayProtectionService = testingModule.get(InMemoryMpesaReplayProtectionService);
    flakyLedgerEntriesRepository = testingModule.get(
      LedgerEntriesRepository,
    ) as FlakyLedgerEntriesRepository;
  });

  afterEach(async () => {
    mockServer.reset();
    queueService.clear();
    replayProtectionService.reset();
    auditLogServiceStub.shouldFail = false;
  });

  afterAll(async () => {
    await app?.close();
    await mockServer?.stop();
  });

  test('continuous random postings and MPESA settlements stay balanced at every checkpoint and reconcile cleanly every day', async () => {
    const tenantId = registerTenantId('financial-truth');
    const reconciliationDate = currentNairobiDate();
    const rng = createDeterministicRandom(TRUTH_TEST_SEED);
    const fixture = await ensureTenantAccounts(tenantId);
    const cumulativeSummary: DailyTruthSummary = {
      direct_successful_post_count: 0,
      direct_failed_post_count: 0,
      mpesa_successful_payment_count: 0,
      mpesa_amount_minor: 0n,
    };

    for (let cycleIndex = 0; cycleIndex < RECONCILIATION_CYCLES; cycleIndex += 1) {
      const reportDate = reconciliationDate;

      for (let directIndex = 0; directIndex < DIRECT_LEDGER_POSTS_PER_DAY; directIndex += 1) {
        const amountMinor = randomAmountMinor(rng, 900, 42500);
        const timestamp = buildDayTimestamp(
          reportDate,
          8 * 60 + cycleIndex * DIRECT_LEDGER_POSTS_PER_DAY * 11 + directIndex * 11,
        );
        const reference = `TRUTH-LEDGER-${reportDate}-${cycleIndex}-${directIndex}-${randomUUID().slice(0, 8)}`;
        const failureMode =
          directIndex === 1
            ? 'ledger_insert'
            : directIndex === 4
              ? 'audit'
              : null;

        if (failureMode === 'ledger_insert') {
          flakyLedgerEntriesRepository.failNextInsert(1, 'Injected ledger insert failure');

          await expect(
            postLedgerTransaction(fixture, {
              idempotency_key: `truth:ledger-fail:${tenantId}:${cycleIndex}:${directIndex}`,
              reference,
              description: 'Injected ledger insert failure',
              amount_minor: amountMinor,
              effective_at: timestamp,
              posted_at: timestamp,
            }),
          ).rejects.toThrow(/Injected ledger insert failure/);

          expect(await countTransactionsByReference(tenantId, reference)).toBe(0);
          cumulativeSummary.direct_failed_post_count += 1;
        } else if (failureMode === 'audit') {
          auditLogServiceStub.shouldFail = true;

          await expect(
            postLedgerTransaction(fixture, {
              idempotency_key: `truth:audit-fail:${tenantId}:${cycleIndex}:${directIndex}`,
              reference,
              description: 'Injected audit failure',
              amount_minor: amountMinor,
              effective_at: timestamp,
              posted_at: timestamp,
            }),
          ).rejects.toThrow(/Injected audit log failure/);

          auditLogServiceStub.shouldFail = false;
          expect(await countTransactionsByReference(tenantId, reference)).toBe(0);
          cumulativeSummary.direct_failed_post_count += 1;
        } else {
          const posted = await postLedgerTransaction(fixture, {
            idempotency_key: `truth:ledger:${tenantId}:${cycleIndex}:${directIndex}`,
            reference,
            description: `Truth check posting ${directIndex + 1}`,
            amount_minor: amountMinor,
            effective_at: timestamp,
            posted_at: timestamp,
          });

          expect(posted.reference).toBe(reference);
          cumulativeSummary.direct_successful_post_count += 1;
        }

        await assertLedgerTruth(tenantId);
      }

      for (let paymentIndex = 0; paymentIndex < MPESA_PAYMENTS_PER_DAY; paymentIndex += 1) {
        const amountMinor = randomStkAmountMinor(rng, 1500, 28000);
        const callbackDuplicateCount = paymentIndex === 1 ? 2 : randomInteger(rng, 1, 3);
        const injectSettlementFailure = cycleIndex !== 1 && paymentIndex === 1;

        const settledPayment = await createAndSettleMpesaPayment({
          tenant_id: tenantId,
          amount_minor: amountMinor,
          phone_number: buildPhoneNumber(rng),
          account_reference: `ACC-${tenantId}-${reportDate}-${cycleIndex}-${paymentIndex}`,
          external_reference: `EXT-${tenantId}-${reportDate}-${cycleIndex}-${paymentIndex}`,
          callback_duplicate_count: injectSettlementFailure
            ? Math.max(callbackDuplicateCount, 2)
            : callbackDuplicateCount,
          inject_settlement_failure: injectSettlementFailure,
        });

        cumulativeSummary.mpesa_successful_payment_count += 1;
        cumulativeSummary.mpesa_amount_minor += BigInt(settledPayment.amount_minor);

        expect(await countMpesaTransactionsByCheckoutRequest(tenantId, settledPayment.checkout_request_id)).toBe(1);
        expect(
          await countTransactionsByReference(
            tenantId,
            `MPESA-${settledPayment.checkout_request_id}`,
          ),
        ).toBe(1);
        await assertLedgerTruth(tenantId);
        await assertNoOpenPaymentIntents(tenantId);
      }

      const report = await generateReport(tenantId, {
        report_date: reportDate,
        missing_callback_grace_minutes: 0,
      });

      expect(report.is_balanced).toBe(true);
      expect(report.summary.discrepancy_count).toBe(0);
      expect(report.discrepancies).toHaveLength(0);
      expect(report.summary.successful_mpesa_transaction_count).toBe(
        cumulativeSummary.mpesa_successful_payment_count,
      );
      expect(report.summary.linked_ledger_transaction_count).toBe(
        cumulativeSummary.mpesa_successful_payment_count,
      );
      expect(report.summary.matched_transaction_count).toBe(
        cumulativeSummary.mpesa_successful_payment_count,
      );
      expect(report.summary.successful_mpesa_amount_minor).toBe(
        cumulativeSummary.mpesa_amount_minor.toString(),
      );
      expect(report.summary.linked_ledger_amount_minor).toBe(
        cumulativeSummary.mpesa_amount_minor.toString(),
      );
      expect(report.summary.matched_amount_minor).toBe(
        cumulativeSummary.mpesa_amount_minor.toString(),
      );
    }

    const overallLedgerVsMpesa = await queryRow<{
      mpesa_total_minor: string;
      linked_ledger_total_minor: string;
    }>(
      tenantId,
      `
        SELECT
          COALESCE(SUM(mt.amount_minor), 0)::text AS mpesa_total_minor,
          COALESCE(SUM(t.total_amount_minor), 0)::text AS linked_ledger_total_minor
        FROM mpesa_transactions mt
        LEFT JOIN transactions t
          ON t.tenant_id = mt.tenant_id
         AND t.id = mt.ledger_transaction_id
        WHERE mt.tenant_id = $1
          AND mt.status = 'succeeded'
      `,
      [tenantId],
    );

    expect(overallLedgerVsMpesa.mpesa_total_minor).toBe(
      overallLedgerVsMpesa.linked_ledger_total_minor,
    );

    expect(cumulativeSummary.direct_successful_post_count).toBeGreaterThan(0);
    expect(cumulativeSummary.direct_failed_post_count).toBeGreaterThan(0);
    expect(cumulativeSummary.mpesa_successful_payment_count).toBe(
      RECONCILIATION_CYCLES * MPESA_PAYMENTS_PER_DAY,
    );
  });

  const registerTenantId = (prefix: string): string => {
    const tenantId = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    tenantIds.add(tenantId);
    return tenantId;
  };

  const runInTenantContext = async <T>(
    tenantId: string,
    method: string,
    path: string,
    callback: () => Promise<T>,
    requestId = `financial-truth:${randomUUID()}`,
  ): Promise<T> =>
    requestContext.run(
      {
        request_id: requestId,
        tenant_id: tenantId,
        user_id: AUTH_ANONYMOUS_USER_ID,
        role: 'owner',
        session_id: null,
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: '127.0.0.1',
        user_agent: 'financial-truth-tests',
        method,
        path,
        started_at: new Date().toISOString(),
      },
      callback,
    );

  const ensureTenantAccounts = async (tenantId: string): Promise<TenantAccountsFixture> => {
    const cashAccountId = randomUUID();
    const revenueAccountId = randomUUID();
    const mpesaDebitAccountId = randomUUID();
    const mpesaCreditAccountId = randomUUID();

    await runInTenantContext(
      tenantId,
      'POST',
      '/internal/financial-truth/accounts',
      async () => {
        await databaseService.query(
          `
            INSERT INTO accounts (
              id,
              tenant_id,
              code,
              name,
              category,
              normal_balance,
              currency_code,
              allow_manual_entries,
              is_active,
              metadata
            )
            VALUES
              ($1::uuid, $5, '1000-CASH', 'Cash Control', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
              ($2::uuid, $5, '4000-TUITION', 'Tuition Revenue', 'revenue', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb),
              ($3::uuid, $5, '1100-MPESA-CLEARING', 'MPESA Clearing', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
              ($4::uuid, $5, '2100-CUSTOMER-DEPOSITS', 'Customer Deposits', 'liability', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
            ON CONFLICT (tenant_id, code)
            DO NOTHING
          `,
          [cashAccountId, revenueAccountId, mpesaDebitAccountId, mpesaCreditAccountId, tenantId],
        );
      },
    );

    return {
      tenant_id: tenantId,
      cash_account_id: cashAccountId,
      revenue_account_id: revenueAccountId,
    };
  };

  const postLedgerTransaction = async (
    fixture: TenantAccountsFixture,
    input: {
      idempotency_key: string;
      reference: string;
      description: string;
      amount_minor: string;
      effective_at: string;
      posted_at: string;
    },
  ) =>
    runInTenantContext(
      fixture.tenant_id,
      'POST',
      '/finance/transactions',
      async () =>
        transactionService.postTransaction({
          idempotency_key: input.idempotency_key,
          reference: input.reference,
          description: input.description,
          effective_at: input.effective_at,
          posted_at: input.posted_at,
          metadata: {
            source: 'financial-truth-tests',
          },
          entries: [
            {
              account_id: fixture.cash_account_id,
              direction: 'debit',
              amount_minor: input.amount_minor,
              currency_code: 'KES',
              description: 'Truth test cash debit',
            },
            {
              account_id: fixture.revenue_account_id,
              direction: 'credit',
              amount_minor: input.amount_minor,
              currency_code: 'KES',
              description: 'Truth test revenue credit',
            },
          ],
        }),
    );

  const createAndSettleMpesaPayment = async (input: {
    tenant_id: string;
    amount_minor: string;
    phone_number: string;
    account_reference: string;
    external_reference: string;
    callback_duplicate_count: number;
    inject_settlement_failure: boolean;
  }): Promise<SettledMpesaPayment> => {
    mockServer.reset();
    queueService.clear();
    replayProtectionService.reset();

    const merchantRequestId = `merchant-${input.tenant_id}-${randomUUID().slice(0, 8)}`;
    const checkoutRequestId = `checkout-${input.tenant_id}-${randomUUID().slice(0, 8)}`;

    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: input.tenant_id,
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
      callbacks: Array.from({ length: input.callback_duplicate_count }, (_, index) => ({
        delivery_id: `${checkoutRequestId}:delivery:${index + 1}`,
        delay_ms: 75 + index * 40,
      })),
    });

    const paymentIntent = await runInTenantContext(
      input.tenant_id,
      'POST',
      '/payments/mpesa/payment-intents',
      async () =>
        mpesaService.createPaymentIntent({
          idempotency_key: `truth:mpesa:${input.tenant_id}:${randomUUID()}`,
          amount_minor: input.amount_minor,
          phone_number: input.phone_number,
          account_reference: input.account_reference,
          transaction_desc: 'Financial truth MPESA payment',
          external_reference: input.external_reference,
          metadata: {
            source: 'financial-truth-tests',
          },
        }),
    );

    await mockServer.waitForCallbacks(input.callback_duplicate_count, 6000);
    await queueService.waitForJobs(input.callback_duplicate_count, 6000);

    if (input.inject_settlement_failure) {
      flakyLedgerEntriesRepository.failNextInsert(1, 'Injected MPESA settlement failure');
    }

    const queueErrors = await queueService.drain<ProcessMpesaCallbackJobPayload>(async (job) => {
      await mpesaCallbackProcessor.process(job.payload);
    });

    if (input.inject_settlement_failure) {
      expect(queueErrors).toHaveLength(1);
      expect(queueErrors[0]?.message).toMatch(/Injected MPESA settlement failure/);
    } else {
      expect(queueErrors).toHaveLength(0);
    }

    const settledPayment = await queryRow<{
      payment_intent_id: string;
      status: string;
      checkout_request_id: string;
      ledger_transaction_id: string;
      amount_minor: string;
    }>(
      input.tenant_id,
      `
        SELECT
          pi.id AS payment_intent_id,
          pi.status,
          mt.checkout_request_id,
          mt.ledger_transaction_id,
          mt.amount_minor::text AS amount_minor
        FROM payment_intents pi
        JOIN mpesa_transactions mt
          ON mt.tenant_id = pi.tenant_id
         AND mt.payment_intent_id = pi.id
        WHERE pi.tenant_id = $1
          AND pi.id = $2::uuid
        LIMIT 1
      `,
      [input.tenant_id, paymentIntent.payment_intent_id],
    );

    expect(settledPayment.status).toBe('completed');
    expect(settledPayment.checkout_request_id).toBe(checkoutRequestId);
    expect(settledPayment.ledger_transaction_id).toBeTruthy();

    return settledPayment;
  };

  const generateReport = async (
    tenantId: string,
    input: GenerateMpesaReconciliationReportInput,
  ): Promise<MpesaReconciliationReport> =>
    runInTenantContext(
      tenantId,
      'GET',
      '/internal/payments/mpesa/reconciliation',
      async () => reconciliationService.generateDailyReport(input),
    );

  const assertLedgerTruth = async (tenantId: string): Promise<void> => {
    const transactionViolations = await queryRows<{
      transaction_id: string;
      debit_total_minor: string;
      credit_total_minor: string;
    }>(
      tenantId,
      `
        SELECT
          t.id AS transaction_id,
          COALESCE(
            SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END),
            0
          )::text AS debit_total_minor,
          COALESCE(
            SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END),
            0
          )::text AS credit_total_minor
        FROM transactions t
        LEFT JOIN ledger_entries le
          ON le.tenant_id = t.tenant_id
         AND le.transaction_id = t.id
        WHERE t.tenant_id = $1
        GROUP BY t.id, t.entry_count
        HAVING COUNT(le.id) <> t.entry_count
           OR COALESCE(
                SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END),
                0
              ) <> COALESCE(
                SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END),
                0
              )
           OR COUNT(DISTINCT le.currency_code) <> 1
      `,
      [tenantId],
    );
    const globalTotals = await queryRow<{
      debit_total_minor: string;
      credit_total_minor: string;
    }>(
      tenantId,
      `
        SELECT
          COALESCE(
            SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE 0 END),
            0
          )::text AS debit_total_minor,
          COALESCE(
            SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE 0 END),
            0
          )::text AS credit_total_minor
        FROM ledger_entries
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

    expect(transactionViolations).toHaveLength(0);
    expect(globalTotals.debit_total_minor).toBe(globalTotals.credit_total_minor);
  };

  const assertNoOpenPaymentIntents = async (tenantId: string): Promise<void> => {
    const openIntentCount = await queryScalar<number>(
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM payment_intents
        WHERE tenant_id = $1
          AND status IN ('pending', 'stk_requested', 'callback_received', 'processing')
      `,
      [tenantId],
    );

    expect(openIntentCount).toBe(0);
  };

  const countTransactionsByReference = async (
    tenantId: string,
    reference: string,
  ): Promise<number> =>
    queryScalar<number>(
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM transactions
        WHERE tenant_id = $1
          AND reference = $2
      `,
      [tenantId, reference],
    );

  const countMpesaTransactionsByCheckoutRequest = async (
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<number> =>
    queryScalar<number>(
      tenantId,
      `
        SELECT COUNT(*)::int AS value
        FROM mpesa_transactions
        WHERE tenant_id = $1
          AND checkout_request_id = $2
          AND status = 'succeeded'
      `,
      [tenantId, checkoutRequestId],
    );

  const queryRows = async <TRow extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    text: string,
    values: unknown[] = [],
  ): Promise<TRow[]> =>
    runInTenantContext(tenantId, 'GET', '/internal/financial-truth/query', async () => {
      const result = await databaseService.query<TRow>(text, values);
      return result.rows;
    });

  const queryRow = async <TRow extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    text: string,
    values: unknown[] = [],
  ): Promise<TRow> => {
    const rows = await queryRows<TRow>(tenantId, text, values);

    if (!rows[0]) {
      throw new Error('Expected a row but query returned none');
    }

    return rows[0];
  };

  const queryScalar = async <TValue>(
    tenantId: string,
    text: string,
    values: unknown[] = [],
  ): Promise<TValue> => {
    const row = await queryRow<{ value: TValue }>(tenantId, text, values);
    return row.value;
  };
});

const createDeterministicRandom = (seed: number) => {
  let state = seed >>> 0;

  return {
    next(): number {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
  };
};

const randomInteger = (
  rng: ReturnType<typeof createDeterministicRandom>,
  minimum: number,
  maximum: number,
): number => Math.floor(rng.next() * (maximum - minimum + 1)) + minimum;

const randomAmountMinor = (
  rng: ReturnType<typeof createDeterministicRandom>,
  minimum: number,
  maximum: number,
): string => randomInteger(rng, minimum, maximum).toString();

const randomStkAmountMinor = (
  rng: ReturnType<typeof createDeterministicRandom>,
  minimum: number,
  maximum: number,
): string => {
  const wholeKesMinimum = Math.ceil(minimum / 100);
  const wholeKesMaximum = Math.floor(maximum / 100);

  return (randomInteger(rng, wholeKesMinimum, wholeKesMaximum) * 100).toString();
};

const buildPhoneNumber = (rng: ReturnType<typeof createDeterministicRandom>): string =>
  `2547${randomInteger(rng, 10000000, 99999999)}`;

const buildDayTimestamp = (reportDate: string, minuteOfDay: number): string => {
  const hours = Math.floor(minuteOfDay / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (minuteOfDay % 60).toString().padStart(2, '0');

  return new Date(`${reportDate}T${hours}:${minutes}:00+03:00`).toISOString();
};

const currentNairobiDate = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
};

const ensureIntegrationEnv = (callbackPort: number, mpesaBaseUrl: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.MPESA_CALLBACK_SECRET = 'mpesa-test-secret';
  process.env.MPESA_BASE_URL = mpesaBaseUrl;
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORT_CODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_REQUEST_TIMEOUT_MS = '200';
  process.env.MPESA_CALLBACK_URL = `http://127.0.0.1:${callbackPort}/payments/mpesa/callback`;
  process.env.APP_BASE_DOMAIN = 'localhost';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for financial truth integration tests');
  }
};

const reservePort = async (): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve callback port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
  await testingModule.get(SyncSchemaService).onModuleInit();
};
