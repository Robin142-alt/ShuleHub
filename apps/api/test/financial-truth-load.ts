import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
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

interface AuditLogServiceStub {
  shouldFail: boolean;
  recordFinanceTransactionPosted(): Promise<void>;
}

interface TruthLoadConfig {
  duration_ms: number;
  max_cycles: number | null;
  tenant_count: number;
  direct_posts_per_cycle: number;
  mpesa_payments_per_cycle: number;
  duplicate_callbacks_per_payment: number;
  inject_ledger_failure_every: number;
  inject_audit_failure_every: number;
  inject_mpesa_failure_every: number;
  report_path: string | null;
  checkpoint_path: string | null;
  checkpoint_every_cycles: number;
}

interface TenantFixture {
  tenant_id: string;
  cash_account_id: string;
  revenue_account_id: string;
}

interface CycleSummary {
  cycle_index: number;
  tenant_id: string;
  started_at: string;
  ended_at: string;
  direct_successful_post_count: number;
  direct_failed_post_count: number;
  mpesa_successful_payment_count: number;
  mpesa_expected_processor_errors: number;
  mpesa_amount_minor: string;
  reconciliation: {
    report_date: string;
    discrepancy_count: number;
    successful_mpesa_transaction_count: number;
    successful_mpesa_amount_minor: string;
    linked_ledger_amount_minor: string;
    matched_amount_minor: string;
    is_balanced: boolean;
  };
}

interface TruthLoadReport {
  started_at: string;
  ended_at: string;
  status: 'passed' | 'failed';
  tenant_ids: string[];
  config: TruthLoadConfig;
  summary: {
    completed_cycles: number;
    direct_successful_post_count: number;
    direct_failed_post_count: number;
    mpesa_successful_payment_count: number;
    mpesa_expected_processor_errors: number;
    mpesa_amount_minor: string;
    final_reconciliation_discrepancy_count: number;
  };
  cycles: CycleSummary[];
  failure: null | {
    message: string;
    cycle_index: number | null;
  };
}

const main = async (): Promise<void> => {
  const config = parseConfig();
  const runtime = await createRuntime();
  const startedAt = new Date();
  const reportDate = currentNairobiDate();
  const rng = createDeterministicRandom(20260427);
  const fixtures = await Promise.all(
    Array.from({ length: config.tenant_count }, async (_, tenantIndex) =>
      runtime.ensureTenantAccounts(
        registerTenantId(`financial-truth-load-${tenantIndex + 1}`),
      ),
    ),
  );
  const cycles: CycleSummary[] = [];
  const deadline = Date.now() + config.duration_ms;
  let cycleIndex = 0;
  let directAttemptIndex = 0;
  let mpesaAttemptIndex = 0;
  let report: TruthLoadReport | null = null;

  try {
    while (
      Date.now() < deadline &&
      (config.max_cycles == null || cycleIndex < config.max_cycles)
    ) {
      const fixture = fixtures[cycleIndex % fixtures.length];
      const cycleStartedAt = new Date();
      const cycleSummary: CycleSummary = {
        cycle_index: cycleIndex + 1,
        tenant_id: fixture.tenant_id,
        started_at: cycleStartedAt.toISOString(),
        ended_at: cycleStartedAt.toISOString(),
        direct_successful_post_count: 0,
        direct_failed_post_count: 0,
        mpesa_successful_payment_count: 0,
        mpesa_expected_processor_errors: 0,
        mpesa_amount_minor: '0',
        reconciliation: {
          report_date: reportDate,
          discrepancy_count: 0,
          successful_mpesa_transaction_count: 0,
          successful_mpesa_amount_minor: '0',
          linked_ledger_amount_minor: '0',
          matched_amount_minor: '0',
          is_balanced: true,
        },
      };
      let cycleMpesaAmountMinor = 0n;

      for (let directIndex = 0; directIndex < config.direct_posts_per_cycle; directIndex += 1) {
        directAttemptIndex += 1;
        const amountMinor = randomAmountMinor(rng, 900, 42500);
        const timestamp = buildDayTimestamp(reportDate, 8 * 60 + cycleIndex * 30 + directIndex * 7);
        const reference = `TRUTH-LOAD-LEDGER-${cycleIndex + 1}-${directIndex + 1}-${randomUUID().slice(0, 8)}`;
        const injectLedgerFailure =
          config.inject_ledger_failure_every > 0 &&
          directAttemptIndex % config.inject_ledger_failure_every === 0;
        const injectAuditFailure =
          config.inject_audit_failure_every > 0 &&
          directAttemptIndex % config.inject_audit_failure_every === 0;

        if (injectLedgerFailure) {
          runtime.flakyLedgerEntriesRepository.failNextInsert(
            1,
            'Injected ledger insert failure',
          );

          await expectRejected(
            runtime.postLedgerTransaction(fixture, {
              idempotency_key: `truth-load:ledger-fail:${fixture.tenant_id}:${directAttemptIndex}`,
              reference,
              description: 'Injected ledger insert failure',
              amount_minor: amountMinor,
              effective_at: timestamp,
              posted_at: timestamp,
            }),
            /Injected ledger insert failure/,
          );
          assert(
            (await runtime.countTransactionsByReference(fixture.tenant_id, reference)) === 0,
            'Ledger failure left a persisted transaction behind',
          );
          cycleSummary.direct_failed_post_count += 1;
        } else if (injectAuditFailure) {
          runtime.auditLogServiceStub.shouldFail = true;

          await expectRejected(
            runtime.postLedgerTransaction(fixture, {
              idempotency_key: `truth-load:audit-fail:${fixture.tenant_id}:${directAttemptIndex}`,
              reference,
              description: 'Injected audit failure',
              amount_minor: amountMinor,
              effective_at: timestamp,
              posted_at: timestamp,
            }),
            /Injected audit log failure/,
          );
          runtime.auditLogServiceStub.shouldFail = false;
          assert(
            (await runtime.countTransactionsByReference(fixture.tenant_id, reference)) === 0,
            'Audit failure left a persisted transaction behind',
          );
          cycleSummary.direct_failed_post_count += 1;
        } else {
          const posted = await runtime.postLedgerTransaction(fixture, {
            idempotency_key: `truth-load:ledger:${fixture.tenant_id}:${directAttemptIndex}`,
            reference,
            description: `Truth load posting ${directAttemptIndex}`,
            amount_minor: amountMinor,
            effective_at: timestamp,
            posted_at: timestamp,
          });

          assert(posted.reference === reference, 'Unexpected posted reference returned');
          cycleSummary.direct_successful_post_count += 1;
        }

        await runtime.assertLedgerTruth(fixture.tenant_id);
      }

      for (let paymentIndex = 0; paymentIndex < config.mpesa_payments_per_cycle; paymentIndex += 1) {
        mpesaAttemptIndex += 1;
        const amountMinor = randomStkAmountMinor(rng, 1500, 28000);
        const injectSettlementFailure =
          config.inject_mpesa_failure_every > 0 &&
          mpesaAttemptIndex % config.inject_mpesa_failure_every === 0;
        const payment = await runtime.createAndSettleMpesaPayment({
          tenant_id: fixture.tenant_id,
          amount_minor: amountMinor,
          phone_number: buildPhoneNumber(rng),
          account_reference: `ACC-${fixture.tenant_id}-${cycleIndex + 1}-${paymentIndex + 1}`,
          external_reference: `EXT-${fixture.tenant_id}-${cycleIndex + 1}-${paymentIndex + 1}`,
          callback_duplicate_count: injectSettlementFailure
            ? Math.max(config.duplicate_callbacks_per_payment, 2)
            : config.duplicate_callbacks_per_payment,
          inject_settlement_failure: injectSettlementFailure,
        });

        cycleSummary.mpesa_successful_payment_count += 1;
        cycleSummary.mpesa_expected_processor_errors += payment.expected_processor_errors;
        cycleMpesaAmountMinor += BigInt(payment.amount_minor);

        assert(
          (await runtime.countMpesaTransactionsByCheckoutRequest(
            fixture.tenant_id,
            payment.checkout_request_id,
          )) === 1,
          'Duplicate MPESA transaction rows were recorded',
        );
        assert(
          (await runtime.countTransactionsByReference(
            fixture.tenant_id,
            `MPESA-${payment.checkout_request_id}`,
          )) === 1,
          'Duplicate ledger transactions were recorded for an MPESA settlement',
        );
        await runtime.assertLedgerTruth(fixture.tenant_id);
        await runtime.assertNoOpenPaymentIntents(fixture.tenant_id);
      }

      const reconciliation = await runtime.generateReport(fixture.tenant_id, {
        report_date: reportDate,
        missing_callback_grace_minutes: 0,
      });

      assert(reconciliation.is_balanced, 'Reconciliation reported a mismatch');
      assert(
        reconciliation.summary.discrepancy_count === 0,
        'Reconciliation detected discrepancies',
      );

      cycleSummary.mpesa_amount_minor = cycleMpesaAmountMinor.toString();
      cycleSummary.ended_at = new Date().toISOString();
      cycleSummary.reconciliation = {
        report_date: reportDate,
        discrepancy_count: reconciliation.summary.discrepancy_count,
        successful_mpesa_transaction_count: reconciliation.summary.successful_mpesa_transaction_count,
        successful_mpesa_amount_minor: reconciliation.summary.successful_mpesa_amount_minor,
        linked_ledger_amount_minor: reconciliation.summary.linked_ledger_amount_minor,
        matched_amount_minor: reconciliation.summary.matched_amount_minor,
        is_balanced: reconciliation.is_balanced,
      };
      cycles.push(cycleSummary);
      cycleIndex += 1;

      if (
        config.checkpoint_path &&
        config.checkpoint_every_cycles > 0 &&
        cycles.length % config.checkpoint_every_cycles === 0
      ) {
        await writeJsonArtifact(
          config.checkpoint_path,
          buildReport('passed', startedAt, new Date(), fixtures, config, cycles, {
            message: null,
            cycle_index: null,
          }),
        );
      }
    }

    for (const fixture of fixtures) {
      const reconciliation = await runtime.generateReport(fixture.tenant_id, {
        report_date: reportDate,
        missing_callback_grace_minutes: 0,
      });
      assert(
        reconciliation.summary.discrepancy_count === 0,
        `Final reconciliation detected discrepancies for tenant ${fixture.tenant_id}`,
      );
    }

    report = buildReport('passed', startedAt, new Date(), fixtures, config, cycles, {
      message: null,
      cycle_index: null,
    });
  } catch (error) {
    report = buildReport('failed', startedAt, new Date(), fixtures, config, cycles, {
      message: error instanceof Error ? error.message : String(error),
      cycle_index: cycles.length === 0 ? null : cycles[cycles.length - 1].cycle_index,
    });
    process.exitCode = 1;
  } finally {
    if (config.report_path && report) {
      await writeJsonArtifact(config.report_path, report);
    }

    if (report) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }

    await runtime.close();
  }
};

const parseConfig = (): TruthLoadConfig => ({
  duration_ms: Math.round(
    parsePositiveNumber(process.env.FINANCIAL_TRUTH_DURATION_MINUTES, 30) * 60_000,
  ),
  max_cycles: parseOptionalInteger(process.env.FINANCIAL_TRUTH_MAX_CYCLES, 1, 100000),
  tenant_count: parseInteger(process.env.FINANCIAL_TRUTH_TENANTS, 1, 1, 1000),
  direct_posts_per_cycle: parseInteger(
    process.env.FINANCIAL_TRUTH_DIRECT_POSTS_PER_CYCLE,
    6,
    1,
    500,
  ),
  mpesa_payments_per_cycle: parseInteger(
    process.env.FINANCIAL_TRUTH_MPESA_PAYMENTS_PER_CYCLE,
    3,
    1,
    500,
  ),
  duplicate_callbacks_per_payment: parseInteger(
    process.env.FINANCIAL_TRUTH_DUPLICATE_CALLBACKS_PER_PAYMENT,
    2,
    1,
    5,
  ),
  inject_ledger_failure_every: parseInteger(
    process.env.FINANCIAL_TRUTH_INJECT_LEDGER_FAILURE_EVERY,
    5,
    0,
    100000,
  ),
  inject_audit_failure_every: parseInteger(
    process.env.FINANCIAL_TRUTH_INJECT_AUDIT_FAILURE_EVERY,
    9,
    0,
    100000,
  ),
  inject_mpesa_failure_every: parseInteger(
    process.env.FINANCIAL_TRUTH_INJECT_MPESA_FAILURE_EVERY,
    4,
    0,
    100000,
  ),
  report_path:
    process.env.FINANCIAL_TRUTH_REPORT_PATH?.trim() ||
    'artifacts/financial-truth-load-report.json',
  checkpoint_path:
    process.env.FINANCIAL_TRUTH_CHECKPOINT_PATH?.trim() ||
    'artifacts/financial-truth-load-checkpoint.json',
  checkpoint_every_cycles: parseInteger(
    process.env.FINANCIAL_TRUTH_CHECKPOINT_EVERY_CYCLES,
    1,
    1,
    100000,
  ),
});

const createRuntime = async (): Promise<{
  app: INestApplication;
  testingModule: TestingModule;
  requestContext: RequestContextService;
  databaseService: DatabaseService;
  transactionService: TransactionService;
  mpesaService: MpesaService;
  mpesaCallbackProcessor: MpesaCallbackProcessorService;
  reconciliationService: MpesaReconciliationService;
  queueService: CapturingQueueService;
  replayProtectionService: InMemoryMpesaReplayProtectionService;
  flakyLedgerEntriesRepository: FlakyLedgerEntriesRepository;
  auditLogServiceStub: AuditLogServiceStub;
  mockServer: MpesaMockServer;
  close(): Promise<void>;
  ensureTenantAccounts(tenantId: string): Promise<TenantFixture>;
  postLedgerTransaction(
    fixture: TenantFixture,
    input: {
      idempotency_key: string;
      reference: string;
      description: string;
      amount_minor: string;
      effective_at: string;
      posted_at: string;
    },
  ): ReturnType<TransactionService['postTransaction']>;
  createAndSettleMpesaPayment(input: {
    tenant_id: string;
    amount_minor: string;
    phone_number: string;
    account_reference: string;
    external_reference: string;
    callback_duplicate_count: number;
    inject_settlement_failure: boolean;
  }): Promise<{
    checkout_request_id: string;
    amount_minor: string;
    expected_processor_errors: number;
  }>;
  generateReport(
    tenantId: string,
    input: GenerateMpesaReconciliationReportInput,
  ): Promise<MpesaReconciliationReport>;
  assertLedgerTruth(tenantId: string): Promise<void>;
  assertNoOpenPaymentIntents(tenantId: string): Promise<void>;
  countTransactionsByReference(tenantId: string, reference: string): Promise<number>;
  countMpesaTransactionsByCheckoutRequest(
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<number>;
}> => {
  const callbackPort = await reservePort();
  const mockServer = new MpesaMockServer('mpesa-test-secret');
  await mockServer.start();
  ensureIntegrationEnv(callbackPort, mockServer.baseUrl);

  const schemaBootstrapModule = await Test.createTestingModule({
    imports: [FinanceIntegrityTestModule],
  }).compile();
  await initializeIntegrationModule(schemaBootstrapModule);
  await schemaBootstrapModule.close();

  const auditLogServiceStub: AuditLogServiceStub = {
    shouldFail: false,
    async recordFinanceTransactionPosted(): Promise<void> {
      if (this.shouldFail) {
        throw new Error('Injected audit log failure');
      }
    },
  };

  const testingModule = await Test.createTestingModule({
    imports: [MpesaAdversarialTestModule],
  })
    .overrideProvider(LedgerEntriesRepository)
    .useClass(FlakyLedgerEntriesRepository)
    .overrideProvider(AuditLogService)
    .useValue(auditLogServiceStub)
    .compile();

  const app = testingModule.createNestApplication({
    rawBody: true,
  });
  await app.init();
  await app.listen(callbackPort, '127.0.0.1');

  const requestContext = testingModule.get(RequestContextService);
  const databaseService = testingModule.get(DatabaseService);
  const transactionService = testingModule.get(TransactionService);
  const mpesaService = testingModule.get(MpesaService);
  const mpesaCallbackProcessor = testingModule.get(MpesaCallbackProcessorService);
  const reconciliationService = testingModule.get(MpesaReconciliationService);
  const queueService = testingModule.get(CapturingQueueService);
  const replayProtectionService = testingModule.get(InMemoryMpesaReplayProtectionService);
  const flakyLedgerEntriesRepository = testingModule.get(
    LedgerEntriesRepository,
  ) as FlakyLedgerEntriesRepository;

  const runInTenantContext = async <T>(
    tenantId: string,
    method: string,
    path: string,
    callback: () => Promise<T>,
    requestId = `financial-truth-load:${randomUUID()}`,
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
        user_agent: 'financial-truth-load',
        method,
        path,
        started_at: new Date().toISOString(),
      },
      callback,
    );

  const queryRows = async <TRow extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    text: string,
    values: unknown[] = [],
  ): Promise<TRow[]> =>
    runInTenantContext(tenantId, 'GET', '/internal/financial-truth-load/query', async () => {
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

  return {
    app,
    testingModule,
    requestContext,
    databaseService,
    transactionService,
    mpesaService,
    mpesaCallbackProcessor,
    reconciliationService,
    queueService,
    replayProtectionService,
    flakyLedgerEntriesRepository,
    auditLogServiceStub,
    mockServer,
    async close(): Promise<void> {
      await app.close();
      await mockServer.stop();
    },
    async ensureTenantAccounts(tenantId: string): Promise<TenantFixture> {
      const cashAccountId = randomUUID();
      const revenueAccountId = randomUUID();
      const mpesaDebitAccountId = randomUUID();
      const mpesaCreditAccountId = randomUUID();

      await runInTenantContext(
        tenantId,
        'POST',
        '/internal/financial-truth-load/accounts',
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
            [
              cashAccountId,
              revenueAccountId,
              mpesaDebitAccountId,
              mpesaCreditAccountId,
              tenantId,
            ],
          );
        },
      );

      return {
        tenant_id: tenantId,
        cash_account_id: cashAccountId,
        revenue_account_id: revenueAccountId,
      };
    },
    postLedgerTransaction: async (
      fixture: TenantFixture,
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
              source: 'financial-truth-load',
            },
            entries: [
              {
                account_id: fixture.cash_account_id,
                direction: 'debit',
                amount_minor: input.amount_minor,
                currency_code: 'KES',
                description: 'Truth load cash debit',
              },
              {
                account_id: fixture.revenue_account_id,
                direction: 'credit',
                amount_minor: input.amount_minor,
                currency_code: 'KES',
                description: 'Truth load revenue credit',
              },
            ],
          }),
      ),
    async createAndSettleMpesaPayment(input: {
      tenant_id: string;
      amount_minor: string;
      phone_number: string;
      account_reference: string;
      external_reference: string;
      callback_duplicate_count: number;
      inject_settlement_failure: boolean;
    }): Promise<{
      checkout_request_id: string;
      amount_minor: string;
      expected_processor_errors: number;
    }> {
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
            idempotency_key: `truth-load:mpesa:${input.tenant_id}:${randomUUID()}`,
            amount_minor: input.amount_minor,
            phone_number: input.phone_number,
            account_reference: input.account_reference,
            transaction_desc: 'Financial truth load MPESA payment',
            external_reference: input.external_reference,
            metadata: {
              source: 'financial-truth-load',
            },
          }),
      );

      await mockServer.waitForCallbacks(input.callback_duplicate_count, 6000);
      await queueService.waitForJobs(input.callback_duplicate_count, 6000);

      if (input.inject_settlement_failure) {
        flakyLedgerEntriesRepository.failNextInsert(1, 'Injected MPESA settlement failure');
      }

      const queueErrors = await queueService.drain<ProcessMpesaCallbackJobPayload>(
        async (job) => {
          await mpesaCallbackProcessor.process(job.payload);
        },
      );

      if (input.inject_settlement_failure) {
        assert(
          queueErrors.length === 1,
          `Expected exactly one injected MPESA processor error, saw ${queueErrors.length}`,
        );
        assert(
          /Injected MPESA settlement failure/.test(queueErrors[0]?.message ?? ''),
          'Unexpected MPESA processor error after injected settlement failure',
        );
      } else {
        assert(queueErrors.length === 0, 'Unexpected MPESA processor error');
      }

      const settledPayment = await queryRow<{
        checkout_request_id: string;
        amount_minor: string;
        status: string;
      }>(
        input.tenant_id,
        `
          SELECT
            mt.checkout_request_id,
            mt.amount_minor::text AS amount_minor,
            pi.status
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

      assert(
        settledPayment.status === 'completed',
        `Payment intent did not complete after queue processing; status=${settledPayment.status}`,
      );

      return {
        checkout_request_id: settledPayment.checkout_request_id,
        amount_minor: settledPayment.amount_minor,
        expected_processor_errors: input.inject_settlement_failure ? 1 : 0,
      };
    },
    generateReport: async (
      tenantId: string,
      input: GenerateMpesaReconciliationReportInput,
    ): Promise<MpesaReconciliationReport> =>
      runInTenantContext(
        tenantId,
        'GET',
        '/internal/payments/mpesa/reconciliation',
        async () => reconciliationService.generateDailyReport(input),
      ),
    async assertLedgerTruth(tenantId: string): Promise<void> {
      const transactionViolations = await queryRows<{
        transaction_id: string;
      }>(
        tenantId,
        `
          SELECT
            t.id AS transaction_id
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

      assert(
        transactionViolations.length === 0,
        'Detected a per-transaction ledger imbalance',
      );
      assert(
        globalTotals.debit_total_minor === globalTotals.credit_total_minor,
        'Detected a global ledger debit/credit mismatch',
      );
    },
    async assertNoOpenPaymentIntents(tenantId: string): Promise<void> {
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

      assert(
        openIntentCount === 0,
        `Detected ${openIntentCount} MPESA payment intents still stuck in a non-terminal state`,
      );
    },
    countTransactionsByReference: async (tenantId: string, reference: string): Promise<number> =>
      queryScalar<number>(
        tenantId,
        `
          SELECT COUNT(*)::int AS value
          FROM transactions
          WHERE tenant_id = $1
            AND reference = $2
        `,
        [tenantId, reference],
      ),
    countMpesaTransactionsByCheckoutRequest: async (
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
      ),
  };
};

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
  const normalizedMinuteOfDay = ((minuteOfDay % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalizedMinuteOfDay / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (normalizedMinuteOfDay % 60).toString().padStart(2, '0');

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

const registerTenantId = (prefix: string): string =>
  `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const buildReport = (
  status: 'passed' | 'failed',
  startedAt: Date,
  endedAt: Date,
  fixtures: TenantFixture[],
  config: TruthLoadConfig,
  cycles: CycleSummary[],
  failure: {
    message: string | null;
    cycle_index: number | null;
  },
): TruthLoadReport => ({
  started_at: startedAt.toISOString(),
  ended_at: endedAt.toISOString(),
  status,
  tenant_ids: fixtures.map((fixture) => fixture.tenant_id),
  config,
  summary: {
    completed_cycles: cycles.length,
    direct_successful_post_count: cycles.reduce(
      (total, cycle) => total + cycle.direct_successful_post_count,
      0,
    ),
    direct_failed_post_count: cycles.reduce(
      (total, cycle) => total + cycle.direct_failed_post_count,
      0,
    ),
    mpesa_successful_payment_count: cycles.reduce(
      (total, cycle) => total + cycle.mpesa_successful_payment_count,
      0,
    ),
    mpesa_expected_processor_errors: cycles.reduce(
      (total, cycle) => total + cycle.mpesa_expected_processor_errors,
      0,
    ),
    mpesa_amount_minor: cycles
      .reduce((total, cycle) => total + BigInt(cycle.mpesa_amount_minor), 0n)
      .toString(),
    final_reconciliation_discrepancy_count:
      cycles.length === 0
        ? status === 'failed'
          ? -1
          : 0
        : cycles[cycles.length - 1].reconciliation.discrepancy_count,
  },
  cycles,
  failure: failure.message
    ? {
        message: failure.message,
        cycle_index: failure.cycle_index,
      }
    : null,
});

const writeJsonArtifact = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    throw new Error('DATABASE_URL is required for financial truth load testing');
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

const parseInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received "${value}"`);
  }

  return parsed;
};

const parseOptionalInteger = (
  value: string | undefined,
  min: number,
  max: number,
): number | null => {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return parseInteger(value, min, min, max);
};

const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received "${value}"`);
  }

  return parsed;
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectRejected = async (
  promise: Promise<unknown>,
  messagePattern: RegExp,
): Promise<void> => {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!messagePattern.test(message)) {
      throw error;
    }
  }
};

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
