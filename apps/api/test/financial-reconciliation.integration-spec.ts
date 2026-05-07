import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AUTH_ANONYMOUS_USER_ID } from '../src/auth/auth.constants';
import { AuthSchemaService } from '../src/auth/auth-schema.service';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseSecurityService } from '../src/database/database-security.service';
import { DatabaseService } from '../src/database/database.service';
import { FinanceSchemaService } from '../src/modules/finance/finance-schema.service';
import { TransactionService } from '../src/modules/finance/transaction.service';
import {
  GenerateMpesaReconciliationReportInput,
  MpesaReconciliationReport,
} from '../src/modules/payments/payments.types';
import { MpesaCallbackProcessorService } from '../src/modules/payments/mpesa-callback-processor.service';
import { MpesaReconciliationService } from '../src/modules/payments/mpesa-reconciliation.service';
import { PaymentsSchemaService } from '../src/modules/payments/payments-schema.service';
import { MpesaService } from '../src/modules/payments/mpesa.service';
import { PaymentIntentEntity } from '../src/modules/payments/entities/payment-intent.entity';
import { ProcessMpesaCallbackJobPayload } from '../src/modules/payments/payments.types';
import { SyncSchemaService } from '../src/modules/sync/sync-schema.service';
import { FinanceIntegrityTestModule } from './support/finance-integrity-test.module';
import { CapturingQueueService } from './support/capturing-queue.service';
import { InMemoryMpesaReplayProtectionService } from './support/in-memory-mpesa-replay-protection.service';
import { MpesaAdversarialTestModule } from './support/mpesa-adversarial-test.module';
import { MpesaMockServer } from './support/mpesa-mock-server';

jest.setTimeout(240000);

const RECONCILIATION_REPORT_DATE = '2026-04-26';

describe('Financial reconciliation integration', () => {
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

    testingModule = await Test.createTestingModule({
      imports: [MpesaAdversarialTestModule],
    }).compile();

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
  });

  afterEach(async () => {
    await mockServer.waitForCallbacks(undefined, 6000).catch(() => undefined);
    mockServer.reset();
    replayProtectionService.reset();
    queueService.clear();
  });

  afterAll(async () => {
    await cleanupTenants();
    await app?.close();
    await mockServer?.stop();
  });

  test('daily report is accurate for a fully reconciled MPESA payment', async () => {
    const tenantId = registerTenantId('recon-ok');
    const payment = await createAndProcessSuccessfulPayment(tenantId, {
      amount_minor: '10000',
      phone_number: '254700001201',
    });

    const report = await generateReport(tenantId, {
      report_date: RECONCILIATION_REPORT_DATE,
    });

    expect(report.is_balanced).toBe(true);
    expect(report.summary.successful_mpesa_transaction_count).toBe(1);
    expect(report.summary.successful_mpesa_amount_minor).toBe('10000');
    expect(report.summary.linked_ledger_transaction_count).toBe(1);
    expect(report.summary.linked_ledger_amount_minor).toBe('10000');
    expect(report.summary.matched_transaction_count).toBe(1);
    expect(report.summary.matched_amount_minor).toBe('10000');
    expect(report.summary.discrepancy_count).toBe(0);
    expect(report.discrepancies).toHaveLength(0);
    expect(payment.mpesa_receipt_number).toBeTruthy();
  });

  test('missing callbacks are detected and never stay silent in the report', async () => {
    const tenantId = registerTenantId('recon-missing');
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}`,
      checkout_request_id: `checkout-${tenantId}`,
      callbacks: [],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}`,
      external_reference: `EXT-${tenantId}`,
      amount_minor: '11000',
      phone_number: '254700001202',
    });
    const staleObservedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await databaseService.query(
      `
        UPDATE payment_intents
        SET
          stk_requested_at = $3::timestamptz,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, paymentIntent.id, staleObservedAt.toISOString()],
    );

    const report = await generateReport(tenantId, {
      report_date: toNairobiDate(staleObservedAt),
      missing_callback_grace_minutes: 5,
    });

    expect(report.is_balanced).toBe(false);
    expect(report.summary.missing_callback_count).toBe(1);
    expect(report.summary.discrepancy_count).toBe(1);
    expect(report.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missing_callback',
          payment_intent_id: paymentIntent.id,
          checkout_request_id: `checkout-${tenantId}`,
          expected_amount_minor: '11000',
        }),
      ]),
    );
  });

  test('duplicate MPESA receipts and manual ledger adjustments are surfaced as discrepancies', async () => {
    const tenantId = registerTenantId('recon-dup');
    const firstPayment = await createAndProcessSuccessfulPayment(tenantId, {
      amount_minor: '12000',
      phone_number: '254700001203',
    });
    const secondPayment = await createAndProcessSuccessfulPayment(tenantId, {
      amount_minor: '15000',
      phone_number: '254700001204',
    });

    await databaseService.query(
      `
        UPDATE mpesa_transactions
        SET
          mpesa_receipt_number = $3,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND checkout_request_id = $2
      `,
      [tenantId, secondPayment.checkout_request_id, firstPayment.mpesa_receipt_number],
    );

    await createManualAdjustment(tenantId, '7000', '2026-04-26T11:45:00.000Z');

    const report = await generateReport(tenantId, {
      report_date: RECONCILIATION_REPORT_DATE,
    });
    const discrepancyTypes = report.discrepancies.map((discrepancy) => discrepancy.type);

    expect(report.is_balanced).toBe(false);
    expect(report.summary.successful_mpesa_transaction_count).toBe(2);
    expect(report.summary.successful_mpesa_amount_minor).toBe('27000');
    expect(report.summary.duplicate_receipt_group_count).toBe(1);
    expect(report.summary.unmatched_ledger_transaction_count).toBe(1);
    expect(discrepancyTypes).toContain('duplicate_mpesa_receipt');
    expect(discrepancyTypes).toContain('unmatched_ledger_transaction');
  });

  test('amount mismatches between MPESA and the ledger are detected', async () => {
    const tenantId = registerTenantId('recon-mismatch');
    const payment = await createAndProcessSuccessfulPayment(tenantId, {
      amount_minor: '9000',
      phone_number: '254700001205',
    });

    await databaseService.query(
      `
        UPDATE mpesa_transactions
        SET
          amount_minor = $3::bigint,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND checkout_request_id = $2
      `,
      [tenantId, payment.checkout_request_id, '9100'],
    );

    const report = await generateReport(tenantId, {
      report_date: RECONCILIATION_REPORT_DATE,
    });

    expect(report.is_balanced).toBe(false);
    expect(report.summary.amount_mismatch_count).toBe(1);
    expect(report.summary.matched_transaction_count).toBe(0);
    expect(report.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'amount_mismatch',
          checkout_request_id: payment.checkout_request_id,
          expected_amount_minor: '9100',
          actual_amount_minor: '9000',
        }),
      ]),
    );
  });

  const registerTenantId = (prefix: string): string => {
    const tenantId = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    tenantIds.add(tenantId);
    return tenantId;
  };

  const createAndProcessSuccessfulPayment = async (
    tenantId: string,
    overrides: {
      amount_minor: string;
      phone_number: string;
    },
  ): Promise<{
    payment_intent_id: string;
    checkout_request_id: string;
    mpesa_receipt_number: string | null;
    ledger_transaction_id: string | null;
  }> => {
    mockServer.enqueueScenario({
      type: 'accepted',
      tenant_id: tenantId,
      merchant_request_id: `merchant-${tenantId}-${randomUUID().slice(0, 8)}`,
      checkout_request_id: `checkout-${tenantId}-${randomUUID().slice(0, 8)}`,
      callbacks: [
        {
          delivery_id: `delivery-${tenantId}-${Date.now()}`,
        },
      ],
    });

    const paymentIntent = await createPaymentIntent(tenantId, {
      account_reference: `ACC-${tenantId}-${randomUUID().slice(0, 8)}`,
      external_reference: `EXT-${tenantId}-${randomUUID().slice(0, 8)}`,
      amount_minor: overrides.amount_minor,
      phone_number: overrides.phone_number,
    });

    await mockServer.waitForCallbacks(1, 6000);
    await queueService.waitForJobs(1, 6000);
    const queueErrors = await drainCallbackQueue();

    expect(queueErrors).toHaveLength(0);

    const row = await queryRow<{
      checkout_request_id: string;
      mpesa_receipt_number: string | null;
      ledger_transaction_id: string | null;
    }>(
      `
        SELECT
          checkout_request_id,
          mpesa_receipt_number,
          ledger_transaction_id
        FROM mpesa_transactions
        WHERE tenant_id = $1
          AND payment_intent_id = $2::uuid
        LIMIT 1
      `,
      [tenantId, paymentIntent.id],
    );

    return {
      payment_intent_id: paymentIntent.id,
      checkout_request_id: row.checkout_request_id,
      mpesa_receipt_number: row.mpesa_receipt_number,
      ledger_transaction_id: row.ledger_transaction_id,
    };
  };

  const createPaymentIntent = async (
    tenantId: string,
    overrides: {
      account_reference: string;
      external_reference: string;
      amount_minor: string;
      phone_number: string;
    },
  ): Promise<PaymentIntentEntity> =>
    requestContext.run(
      buildRequestContext(tenantId, 'POST', '/payments/mpesa/payment-intents'),
      async () => {
        await ensureMpesaLedgerAccounts(tenantId);

        const response = await mpesaService.createPaymentIntent({
          idempotency_key: `itest:${tenantId}:${randomUUID()}`,
          amount_minor: overrides.amount_minor,
          phone_number: overrides.phone_number,
          account_reference: overrides.account_reference,
          transaction_desc: 'Financial reconciliation test payment',
          external_reference: overrides.external_reference,
          metadata: {
            source: 'financial-reconciliation-tests',
          },
        });

        return queryRow<PaymentIntentEntity>(
          `
            SELECT *
            FROM payment_intents
            WHERE tenant_id = $1
              AND id = $2::uuid
            LIMIT 1
          `,
          [tenantId, response.payment_intent_id],
        );
      },
    );

  const createManualAdjustment = async (
    tenantId: string,
    amountMinor: string,
    postedAt: string,
  ): Promise<void> => {
    await requestContext.run(
      buildRequestContext(tenantId, 'POST', '/finance/manual-adjustments'),
      async () => {
        await ensureMpesaLedgerAccounts(tenantId);

        const accounts = await queryRows<{
          id: string;
          code: string;
        }>(
          `
            SELECT id, code
            FROM accounts
            WHERE tenant_id = $1
              AND code IN ('1100-MPESA-CLEARING', '2100-CUSTOMER-DEPOSITS')
          `,
          [tenantId],
        );
        const debitAccount = accounts.find((account) => account.code === '1100-MPESA-CLEARING');
        const creditAccount = accounts.find(
          (account) => account.code === '2100-CUSTOMER-DEPOSITS',
        );

        if (!debitAccount || !creditAccount) {
          throw new Error('Expected MPESA ledger accounts to exist before manual adjustment');
        }

        await transactionService.postTransaction({
          idempotency_key: `manual-adjustment:${tenantId}:${randomUUID()}`,
          reference: `ADJ-${tenantId}-${randomUUID().slice(0, 8)}`,
          description: 'Manual MPESA clearing adjustment',
          effective_at: postedAt,
          posted_at: postedAt,
          metadata: {
            source: 'manual-adjustment',
            initiated_by: 'financial-reconciliation-tests',
          },
          entries: [
            {
              account_id: debitAccount.id,
              direction: 'debit',
              amount_minor: amountMinor,
              currency_code: 'KES',
              description: 'Manual debit adjustment',
            },
            {
              account_id: creditAccount.id,
              direction: 'credit',
              amount_minor: amountMinor,
              currency_code: 'KES',
              description: 'Manual credit adjustment',
            },
          ],
        });
      },
    );
  };

  const ensureMpesaLedgerAccounts = async (tenantId: string): Promise<void> => {
    const debitAccountId = randomUUID();
    const creditAccountId = randomUUID();

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
          ($1::uuid, $2, '1100-MPESA-CLEARING', 'MPESA Clearing', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
          ($3::uuid, $2, '2100-CUSTOMER-DEPOSITS', 'Customer Deposits', 'liability', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
        ON CONFLICT (tenant_id, code)
        DO NOTHING
      `,
      [debitAccountId, tenantId, creditAccountId],
    );
  };

  const drainCallbackQueue = async (): Promise<Error[]> =>
    queueService.drain<ProcessMpesaCallbackJobPayload>(async (job) => {
      await mpesaCallbackProcessor.process(job.payload);
    });

  const generateReport = async (
    tenantId: string,
    input: GenerateMpesaReconciliationReportInput,
  ): Promise<MpesaReconciliationReport> =>
    requestContext.run(
      buildRequestContext(tenantId, 'GET', '/internal/reconciliation/mpesa'),
      async () => reconciliationService.generateDailyReport(input),
    );

  const queryRows = async <TRow = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<TRow[]> => {
    const result = await databaseService.query<TRow & Record<string, unknown>>(text, values);
    return result.rows as TRow[];
  };

  const queryRow = async <TRow = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<TRow> => {
    const rows = await queryRows<TRow>(text, values);

    if (!rows[0]) {
      throw new Error('Expected a row but query returned none');
    }

    return rows[0];
  };

  const cleanupTenants = async (): Promise<void> => {
    const values = [...tenantIds];

    if (values.length === 0) {
      return;
    }

    await databaseService.withClient(async (client) => {
      await client.query('BEGIN');

      try {
        await client.query(`DELETE FROM mpesa_transactions WHERE tenant_id = ANY($1::text[])`, [values]);
        await client.query(`DELETE FROM callback_logs WHERE tenant_id = ANY($1::text[])`, [values]);
        await client.query(`DELETE FROM payment_intents WHERE tenant_id = ANY($1::text[])`, [values]);

        const immutableTenantsResult = await client.query<{ tenant_id: string }>(
          `
            SELECT DISTINCT tenant_id
            FROM transactions
            WHERE tenant_id = ANY($1::text[])
          `,
          [values],
        );
        const immutableTenants = new Set(immutableTenantsResult.rows.map((row) => row.tenant_id));
        const mutableOnlyTenants = values.filter((tenantId) => !immutableTenants.has(tenantId));

        if (mutableOnlyTenants.length > 0) {
          await client.query(`DELETE FROM accounts WHERE tenant_id = ANY($1::text[])`, [
            mutableOnlyTenants,
          ]);
          await client.query(`DELETE FROM idempotency_keys WHERE tenant_id = ANY($1::text[])`, [
            mutableOnlyTenants,
          ]);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  };
});

const buildRequestContext = (tenantId: string, method: string, path: string) => ({
  request_id: `financial-reconciliation:${randomUUID()}`,
  tenant_id: tenantId,
  user_id: AUTH_ANONYMOUS_USER_ID,
  role: 'owner',
  session_id: null,
  permissions: ['*:*'],
  is_authenticated: true,
  client_ip: '127.0.0.1',
  user_agent: 'financial-reconciliation-tests',
  method,
  path,
  started_at: new Date().toISOString(),
});

const toNairobiDate = (value: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
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
    throw new Error('DATABASE_URL is required for financial reconciliation integration tests');
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
