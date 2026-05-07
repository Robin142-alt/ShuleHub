import { randomUUID } from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';
import { QueryResultRow } from 'pg';

import { AUTH_ANONYMOUS_USER_ID } from '../src/auth/auth.constants';
import { RequestContextService } from '../src/common/request-context/request-context.service';
import { DatabaseSecurityService } from '../src/database/database-security.service';
import { DatabaseService } from '../src/database/database.service';
import { AuditLogService } from '../src/modules/observability/audit-log.service';
import { PostedFinancialTransaction } from '../src/modules/finance/finance.types';
import { TransactionService } from '../src/modules/finance/transaction.service';
import { MpesaCallbackProcessorService } from '../src/modules/payments/mpesa-callback-processor.service';
import { CallbackLogsRepository } from '../src/modules/payments/repositories/callback-logs.repository';
import { PaymentIntentsRepository } from '../src/modules/payments/repositories/payment-intents.repository';
import { AuthSchemaService } from '../src/auth/auth-schema.service';
import { FinanceSchemaService } from '../src/modules/finance/finance-schema.service';
import { PaymentsSchemaService } from '../src/modules/payments/payments-schema.service';
import { SyncSchemaService } from '../src/modules/sync/sync-schema.service';
import { FinanceIntegrityTestModule } from './support/finance-integrity-test.module';

jest.setTimeout(180000);

interface TenantLedgerFixture {
  tenant_id: string;
  debit_account_id: string;
  credit_account_id: string;
  debit_account_code: string;
  credit_account_code: string;
}

interface AuditLogServiceStub {
  shouldFail: boolean;
  recordFinanceTransactionPosted(): Promise<void>;
}

const MPESA_DEBIT_ACCOUNT_CODE = '1100-MPESA-CLEARING';
const MPESA_CREDIT_ACCOUNT_CODE = '2100-CUSTOMER-DEPOSITS';

describe('Financial correctness integration', () => {
  let testingModule: TestingModule;
  let requestContext: RequestContextService;
  let databaseService: DatabaseService;
  let transactionService: TransactionService;
  let paymentIntentsRepository: PaymentIntentsRepository;
  let callbackLogsRepository: CallbackLogsRepository;
  let mpesaCallbackProcessor: MpesaCallbackProcessorService;
  let auditLogServiceStub: AuditLogServiceStub;

  beforeAll(async () => {
    ensureIntegrationEnv();

    testingModule = await Test.createTestingModule({
      imports: [FinanceIntegrityTestModule],
    }).compile();

    await initializeIntegrationModule(testingModule);

    requestContext = testingModule.get(RequestContextService);
    databaseService = testingModule.get(DatabaseService);
    transactionService = testingModule.get(TransactionService);
    paymentIntentsRepository = testingModule.get(PaymentIntentsRepository);
    callbackLogsRepository = testingModule.get(CallbackLogsRepository);
    mpesaCallbackProcessor = testingModule.get(MpesaCallbackProcessorService);
    auditLogServiceStub = testingModule.get(AuditLogService) as unknown as AuditLogServiceStub;
  });

  afterAll(async () => {
    await testingModule?.close();
  });

  test('same request submitted twice concurrently creates exactly one balanced transaction', async () => {
    const fixture = await createLedgerFixture('idem');
    const idempotencyKey = `idem:${fixture.tenant_id}:same-request`;
    const reference = `REF-IDEM-${fixture.tenant_id}`;

    const [first, second] = await Promise.all([
      postLedgerTransaction(fixture, {
        idempotency_key: idempotencyKey,
        reference,
        description: 'Concurrent idempotent school fee payment',
        amount_minor: '12500',
      }),
      postLedgerTransaction(fixture, {
        idempotency_key: idempotencyKey,
        reference,
        description: 'Concurrent idempotent school fee payment',
        amount_minor: '12500',
      }),
    ]);

    expect(first.transaction_id).toBe(second.transaction_id);

    const transactionCount = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM transactions
        WHERE tenant_id = $1
          AND reference = $2
      `,
      [fixture.tenant_id, reference],
    );
    const ledgerEntryCount = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM ledger_entries
        WHERE tenant_id = $1
          AND transaction_id = $2::uuid
      `,
      [fixture.tenant_id, first.transaction_id],
    );

    expect(transactionCount).toBe(1);
    expect(ledgerEntryCount).toBe(2);
    await assertNoLedgerImbalances(fixture.tenant_id);
  });

  test('ledger entries are append-only and reject updates or deletes', async () => {
    const fixture = await createLedgerFixture('append');
    const posted = await postLedgerTransaction(fixture, {
      idempotency_key: `append:${fixture.tenant_id}`,
      reference: `REF-APPEND-${fixture.tenant_id}`,
      description: 'Append only check',
      amount_minor: '3300',
    });
    const targetEntryId = posted.entries[0].entry_id;

    await expect(
      runInTenantContext(fixture.tenant_id, () =>
        databaseService.query(
          `
            UPDATE ledger_entries
            SET amount_minor = 999999
            WHERE tenant_id = $1
              AND id = $2::uuid
          `,
          [fixture.tenant_id, targetEntryId],
        ),
      ),
    ).rejects.toThrow(/append-only table "ledger_entries" cannot be update/i);

    await expect(
      runInTenantContext(fixture.tenant_id, () =>
        databaseService.query(
          `
            DELETE FROM ledger_entries
            WHERE tenant_id = $1
              AND id = $2::uuid
          `,
          [fixture.tenant_id, targetEntryId],
        ),
      ),
    ).rejects.toThrow(/append-only table "ledger_entries" cannot be delete/i);

    const persistedAmount = await queryScalar<string>(
      fixture.tenant_id,
      `
        SELECT amount_minor::text AS value
        FROM ledger_entries
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [fixture.tenant_id, targetEntryId],
    );

    expect(persistedAmount).toBe('3300');
    await assertNoLedgerImbalances(fixture.tenant_id);
  });

  test('partial failure rolls back the posting completely and a retry succeeds', async () => {
    const fixture = await createLedgerFixture('retry');
    const idempotencyKey = `retry:${fixture.tenant_id}`;
    const reference = `REF-RETRY-${fixture.tenant_id}`;

    auditLogServiceStub.shouldFail = true;

    await expect(
      postLedgerTransaction(fixture, {
        idempotency_key: idempotencyKey,
        reference,
        description: 'Rollback on audit failure',
        amount_minor: '9100',
      }),
    ).rejects.toThrow(/Injected audit log failure/);

    auditLogServiceStub.shouldFail = false;

    const transactionCountAfterFailure = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM transactions
        WHERE tenant_id = $1
          AND reference = $2
      `,
      [fixture.tenant_id, reference],
    );
    const ledgerEntriesAfterFailure = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM ledger_entries
        WHERE tenant_id = $1
      `,
      [fixture.tenant_id],
    );
    const idempotencyCompletedAfterFailure = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM idempotency_keys
        WHERE tenant_id = $1
          AND scope = 'finance:ledger:post'
          AND idempotency_key = $2
          AND status = 'completed'
      `,
      [fixture.tenant_id, idempotencyKey],
    );

    expect(transactionCountAfterFailure).toBe(0);
    expect(ledgerEntriesAfterFailure).toBe(0);
    expect(idempotencyCompletedAfterFailure).toBe(0);

    const retried = await postLedgerTransaction(fixture, {
      idempotency_key: idempotencyKey,
      reference,
      description: 'Rollback on audit failure',
      amount_minor: '9100',
    });

    expect(retried.entries).toHaveLength(2);
    await assertNoLedgerImbalances(fixture.tenant_id);
  });

  test('simultaneous payments preserve balances and invariants under load', async () => {
    const fixture = await createLedgerFixture('load');
    const paymentCount = 25;
    const amountMinor = 1000n;

    const results = await Promise.all(
      Array.from({ length: paymentCount }, async (_, index) =>
        postLedgerTransaction(fixture, {
          idempotency_key: `load:${fixture.tenant_id}:${index}`,
          reference: `REF-LOAD-${fixture.tenant_id}-${index}`,
          description: `Concurrent payment ${index + 1}`,
          amount_minor: amountMinor.toString(),
        }),
      ),
    );

    expect(new Set(results.map((result) => result.transaction_id)).size).toBe(paymentCount);

    const totalExpectedMinor = (amountMinor * BigInt(paymentCount)).toString();
    const debitBalance = await getAccountBalance(fixture.tenant_id, fixture.debit_account_id);
    const creditBalance = await getAccountBalance(fixture.tenant_id, fixture.credit_account_id);
    const transactionCount = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM transactions
        WHERE tenant_id = $1
      `,
      [fixture.tenant_id],
    );
    const ledgerEntryCount = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM ledger_entries
        WHERE tenant_id = $1
      `,
      [fixture.tenant_id],
    );

    expect(transactionCount).toBe(paymentCount);
    expect(ledgerEntryCount).toBe(paymentCount * 2);
    expect(debitBalance.balance_minor).toBe(totalExpectedMinor);
    expect(debitBalance.debit_total_minor).toBe(totalExpectedMinor);
    expect(creditBalance.balance_minor).toBe(totalExpectedMinor);
    expect(creditBalance.credit_total_minor).toBe(totalExpectedMinor);
    await assertNoLedgerImbalances(fixture.tenant_id);
  });

  test('duplicate MPESA callbacks processed concurrently create one ledger transaction only', async () => {
    const fixture = await createLedgerFixture('mpesa', {
      debit_account_code: MPESA_DEBIT_ACCOUNT_CODE,
      credit_account_code: MPESA_CREDIT_ACCOUNT_CODE,
    });
    const checkoutRequestId = `checkout-${fixture.tenant_id}`;
    const merchantRequestId = `merchant-${fixture.tenant_id}`;
    const paymentIntent = await createPendingMpesaIntent(fixture.tenant_id, {
      account_reference: `ACC-${fixture.tenant_id}`,
      external_reference: `EXT-${fixture.tenant_id}`,
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
      amount_minor: '15000',
      phone_number: '254700000099',
    });
    const firstCallbackLog = await createCallbackLog(fixture.tenant_id, {
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
      amount_major: '150',
      mpesa_receipt_number: `REC-${fixture.tenant_id}-1`,
      phone_number: '254700000099',
      delivery_id: `delivery-${fixture.tenant_id}-1`,
      fingerprint: `fingerprint-${fixture.tenant_id}-1`,
    });
    const secondCallbackLog = await createCallbackLog(fixture.tenant_id, {
      merchant_request_id: merchantRequestId,
      checkout_request_id: checkoutRequestId,
      amount_major: '150',
      mpesa_receipt_number: `REC-${fixture.tenant_id}-2`,
      phone_number: '254700000099',
      delivery_id: `delivery-${fixture.tenant_id}-2`,
      fingerprint: `fingerprint-${fixture.tenant_id}-2`,
    });

    await Promise.all([
      mpesaCallbackProcessor.process({
        tenant_id: fixture.tenant_id,
        callback_log_id: firstCallbackLog.id,
        request_id: `mpesa-job:${fixture.tenant_id}:1`,
      }),
      mpesaCallbackProcessor.process({
        tenant_id: fixture.tenant_id,
        callback_log_id: secondCallbackLog.id,
        request_id: `mpesa-job:${fixture.tenant_id}:2`,
      }),
    ]);

    const mpesaTransactionCount = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM mpesa_transactions
        WHERE tenant_id = $1
          AND checkout_request_id = $2
      `,
      [fixture.tenant_id, checkoutRequestId],
    );
    const ledgerTransaction = await queryRow<{
      id: string;
      reference: string;
    }>(
      fixture.tenant_id,
      `
        SELECT id, reference
        FROM transactions
        WHERE tenant_id = $1
          AND reference = $2
        LIMIT 1
      `,
      [fixture.tenant_id, `MPESA-${checkoutRequestId}`],
    );
    const ledgerEntryCount = await queryScalar<number>(
      fixture.tenant_id,
      `
        SELECT COUNT(*)::int AS value
        FROM ledger_entries
        WHERE tenant_id = $1
          AND transaction_id = $2::uuid
      `,
      [fixture.tenant_id, ledgerTransaction.id],
    );
    const paymentIntentState = await queryRow<{
      status: string;
      ledger_transaction_id: string | null;
    }>(
      fixture.tenant_id,
      `
        SELECT status, ledger_transaction_id
        FROM payment_intents
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [fixture.tenant_id, paymentIntent.id],
    );

    expect(mpesaTransactionCount).toBe(1);
    expect(ledgerEntryCount).toBe(2);
    expect(paymentIntentState.status).toBe('completed');
    expect(paymentIntentState.ledger_transaction_id).toBe(ledgerTransaction.id);
    await assertNoLedgerImbalances(fixture.tenant_id);
  });

  const runInTenantContext = async <T>(
    tenantId: string,
    callback: () => Promise<T>,
    requestId = `finance-itest:${randomUUID()}`,
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
        user_agent: 'finance-integrity-tests',
        method: 'TEST',
        path: '/integration/finance',
        started_at: new Date().toISOString(),
      },
      callback,
    );

  const createLedgerFixture = async (
    prefix: string,
    overrides: Partial<Pick<TenantLedgerFixture, 'debit_account_code' | 'credit_account_code'>> = {},
  ): Promise<TenantLedgerFixture> => {
    const tenantId = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const debitAccountId = randomUUID();
    const creditAccountId = randomUUID();
    const debitAccountCode = overrides.debit_account_code ?? '1000-CASH';
    const creditAccountCode = overrides.credit_account_code ?? '4000-TUITION';

    await runInTenantContext(tenantId, async () => {
      await databaseService.withRequestTransaction(async () => {
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
              ($1::uuid, $2, $3, 'Cash Control', 'asset', 'debit', 'KES', TRUE, TRUE, '{}'::jsonb),
              ($4::uuid, $2, $5, 'Revenue Control', 'revenue', 'credit', 'KES', TRUE, TRUE, '{}'::jsonb)
          `,
          [debitAccountId, tenantId, debitAccountCode, creditAccountId, creditAccountCode],
        );
      });
    });

    return {
      tenant_id: tenantId,
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId,
      debit_account_code: debitAccountCode,
      credit_account_code: creditAccountCode,
    };
  };

  const postLedgerTransaction = async (
    fixture: TenantLedgerFixture,
    input: {
      idempotency_key: string;
      reference: string;
      description: string;
      amount_minor: string;
    },
  ): Promise<PostedFinancialTransaction> =>
    runInTenantContext(fixture.tenant_id, () =>
      transactionService.postTransaction({
        idempotency_key: input.idempotency_key,
        reference: input.reference,
        description: input.description,
        entries: [
          {
            account_id: fixture.debit_account_id,
            direction: 'debit',
            amount_minor: input.amount_minor,
          },
          {
            account_id: fixture.credit_account_id,
            direction: 'credit',
            amount_minor: input.amount_minor,
          },
        ],
      }),
    );

  const getAccountBalance = async (tenantId: string, accountId: string) =>
    runInTenantContext(tenantId, () => transactionService.getAccountBalance(accountId));

  const createPendingMpesaIntent = async (
    tenantId: string,
    input: {
      account_reference: string;
      external_reference: string;
      merchant_request_id: string;
      checkout_request_id: string;
      amount_minor: string;
      phone_number: string;
    },
  ) =>
    runInTenantContext(tenantId, async () => {
      const idempotencyKeyId = await insertPaymentIdempotencyKey(tenantId);
      const paymentIntent = await paymentIntentsRepository.createPending({
        tenant_id: tenantId,
        idempotency_key_id: idempotencyKeyId,
        user_id: null,
        request_id: `payment-intent:${randomUUID()}`,
        external_reference: input.external_reference,
        account_reference: input.account_reference,
        transaction_desc: 'School fee collection',
        phone_number: input.phone_number,
        amount_minor: input.amount_minor,
        currency_code: 'KES',
        metadata: {
          source: 'integration-test',
        },
      });

      return paymentIntentsRepository.markStkRequested(tenantId, paymentIntent.id, {
        merchant_request_id: input.merchant_request_id,
        checkout_request_id: input.checkout_request_id,
        response_code: '0',
        response_description: 'Accepted',
        customer_message: 'Accepted',
      }, 1800);
    });

  const insertPaymentIdempotencyKey = async (tenantId: string): Promise<string> => {
    const result = await databaseService.query<{ id: string }>(
      `
        INSERT INTO idempotency_keys (
          tenant_id,
          user_id,
          scope,
          idempotency_key,
          request_method,
          request_path,
          request_hash,
          status,
          locked_at,
          expires_at
        )
        VALUES (
          $1,
          NULL,
          'payments:mpesa:payment-intents:create',
          $2,
          'POST',
          '/payments/mpesa/payment-intents',
          $3,
          'in_progress',
          NOW(),
          NOW() + INTERVAL '1 day'
        )
        RETURNING id
      `,
      [tenantId, `seed:${randomUUID()}`, randomUUID().replace(/-/g, '')],
    );

    return result.rows[0].id;
  };

  const createCallbackLog = async (
    tenantId: string,
    input: {
      merchant_request_id: string;
      checkout_request_id: string;
      amount_major: string;
      mpesa_receipt_number: string;
      phone_number: string;
      delivery_id: string;
      fingerprint: string;
    },
  ) =>
    runInTenantContext(tenantId, async () => {
      const payload = {
        Body: {
          stkCallback: {
            MerchantRequestID: input.merchant_request_id,
            CheckoutRequestID: input.checkout_request_id,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: Number(input.amount_major) },
                { Name: 'MpesaReceiptNumber', Value: input.mpesa_receipt_number },
                { Name: 'TransactionDate', Value: 20260426123045 },
                { Name: 'PhoneNumber', Value: Number(input.phone_number) },
              ],
            },
          },
        },
      };

      return callbackLogsRepository.createLog({
        tenant_id: tenantId,
        merchant_request_id: input.merchant_request_id,
        checkout_request_id: input.checkout_request_id,
        delivery_id: input.delivery_id,
        request_fingerprint: input.fingerprint,
        event_timestamp: new Date().toISOString(),
        signature: 'integration-signature',
        signature_verified: true,
        headers: {
          'content-type': 'application/json',
        },
        raw_body: JSON.stringify(payload),
        raw_payload: payload,
        source_ip: '127.0.0.1',
      });
    });

  const assertNoLedgerImbalances = async (tenantId: string): Promise<void> => {
    const violations = await queryRows<{
      transaction_id: string;
      expected_entry_count: number;
      actual_entry_count: number;
      debit_total_minor: string;
      credit_total_minor: string;
      currency_count: number;
    }>(
      tenantId,
      `
        SELECT
          t.id AS transaction_id,
          t.entry_count AS expected_entry_count,
          COUNT(le.id)::int AS actual_entry_count,
          COALESCE(
            SUM(CASE WHEN le.direction = 'debit' THEN le.amount_minor ELSE 0 END),
            0
          )::text AS debit_total_minor,
          COALESCE(
            SUM(CASE WHEN le.direction = 'credit' THEN le.amount_minor ELSE 0 END),
            0
          )::text AS credit_total_minor,
          COUNT(DISTINCT le.currency_code)::int AS currency_count
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

    expect(violations).toHaveLength(0);
  };

  const queryRows = async <TRow extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    text: string,
    values: unknown[] = [],
  ): Promise<TRow[]> =>
    runInTenantContext(tenantId, async () => {
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

const ensureIntegrationEnv = (): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DATABASE_RUNTIME_ROLE = process.env.DATABASE_RUNTIME_ROLE ?? 'shule_hub_runtime';
  process.env.DATABASE_STATEMENT_TIMEOUT_MS =
    process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '20000';
  process.env.SECURITY_PII_ENCRYPTION_KEY =
    process.env.SECURITY_PII_ENCRYPTION_KEY ??
    'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  process.env.MPESA_LEDGER_DEBIT_ACCOUNT_CODE =
    process.env.MPESA_LEDGER_DEBIT_ACCOUNT_CODE ?? MPESA_DEBIT_ACCOUNT_CODE;
  process.env.MPESA_LEDGER_CREDIT_ACCOUNT_CODE =
    process.env.MPESA_LEDGER_CREDIT_ACCOUNT_CODE ?? MPESA_CREDIT_ACCOUNT_CODE;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for finance integrity integration tests');
  }
};

const initializeIntegrationModule = async (testingModule: TestingModule): Promise<void> => {
  await testingModule.get(DatabaseSecurityService).onModuleInit();
  await testingModule.get(DatabaseSecurityService).onApplicationBootstrap();
  await testingModule.get(DatabaseService).onModuleInit();
  await testingModule.get(AuthSchemaService).onModuleInit();
  await testingModule.get(FinanceSchemaService).onModuleInit();
  await testingModule.get(PaymentsSchemaService).onModuleInit();
  await testingModule.get(SyncSchemaService).onModuleInit();
};
