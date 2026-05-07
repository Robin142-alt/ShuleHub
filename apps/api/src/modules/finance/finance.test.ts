import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { AccountEntity } from './entities/account.entity';
import { FinancialTransactionEntity } from './entities/transaction.entity';
import {
  AccountBalanceSnapshot,
  IdempotencyKeyRecord,
  PostedFinancialTransaction,
} from './finance.types';
import { LedgerService } from './ledger.service';

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const makeAccount = (overrides: Partial<AccountEntity> = {}): AccountEntity =>
  Object.assign(new AccountEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    code: overrides.code ?? '1000',
    name: overrides.name ?? 'Cash',
    category: overrides.category ?? 'asset',
    normal_balance: overrides.normal_balance ?? 'debit',
    currency_code: overrides.currency_code ?? 'KES',
    allow_manual_entries: overrides.allow_manual_entries ?? true,
    is_active: overrides.is_active ?? true,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
  });

const makeIdempotencyRecord = (
  overrides: Partial<IdempotencyKeyRecord> = {},
): IdempotencyKeyRecord => ({
  id: overrides.id ?? 'idem-record',
  tenant_id: overrides.tenant_id ?? 'tenant-a',
  user_id: overrides.user_id ?? '00000000-0000-0000-0000-000000000010',
  scope: overrides.scope ?? 'finance:ledger:post',
  idempotency_key: overrides.idempotency_key ?? 'idem-1',
  request_method: overrides.request_method ?? 'POST',
  request_path: overrides.request_path ?? '/internal/finance/transactions',
  request_hash: overrides.request_hash ?? 'hash-1',
  status: overrides.status ?? 'in_progress',
  response_status_code: overrides.response_status_code ?? null,
  response_body: overrides.response_body ?? null,
  locked_at: overrides.locked_at ?? null,
  completed_at: overrides.completed_at ?? null,
  expires_at: overrides.expires_at ?? new Date('2027-01-01T00:00:00.000Z').toISOString(),
  created_at: overrides.created_at ?? new Date('2026-01-01T00:00:00.000Z').toISOString(),
  updated_at: overrides.updated_at ?? new Date('2026-01-01T00:00:00.000Z').toISOString(),
});

const makeTransactionEntity = (
  overrides: Partial<FinancialTransactionEntity> = {},
): FinancialTransactionEntity =>
  Object.assign(new FinancialTransactionEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000099',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    idempotency_key_id: overrides.idempotency_key_id ?? 'idem-record',
    reference: overrides.reference ?? 'TXN-100',
    description: overrides.description ?? 'School fee payment',
    currency_code: overrides.currency_code ?? 'KES',
    total_amount_minor: overrides.total_amount_minor ?? '10000',
    entry_count: overrides.entry_count ?? 2,
    effective_at: overrides.effective_at ?? new Date('2026-04-26T08:00:00.000Z'),
    posted_at: overrides.posted_at ?? new Date('2026-04-26T08:00:00.000Z'),
    created_by_user_id:
      overrides.created_by_user_id ?? '00000000-0000-0000-0000-000000000010',
    request_id: overrides.request_id ?? 'req-1',
    metadata: overrides.metadata ?? { source: 'mpesa' },
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
  });

test('LedgerService enforces balanced double-entry postings', () => {
  const service = new LedgerService();
  const debitAccount = makeAccount({ id: '00000000-0000-0000-0000-000000000001', code: '1000' });
  const creditAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000002',
    code: '2000',
    category: 'liability',
    normal_balance: 'credit',
  });

  assert.throws(
    () =>
      service.buildPostingPlan(
        {
          idempotency_key: 'idem-1',
          reference: 'TXN-1',
          description: 'Unbalanced test',
          entries: [
            {
              account_id: debitAccount.id,
              direction: 'debit',
              amount_minor: '100',
            },
            {
              account_id: creditAccount.id,
              direction: 'credit',
              amount_minor: '90',
            },
          ],
        },
        [debitAccount, creditAccount],
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message.includes('total debits must equal total credits'),
  );
});

test('LedgerService calculates normal-balance-aware account balances', () => {
  const service = new LedgerService();
  const revenueAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000003',
    code: '4000',
    name: 'Sales',
    category: 'revenue',
    normal_balance: 'credit',
  });

  const balance = service.calculateBalanceSnapshot(revenueAccount, {
    debit_total_minor: '25',
    credit_total_minor: '100',
  });

  assert.deepEqual(balance, {
    account_id: revenueAccount.id,
    account_code: revenueAccount.code,
    currency_code: revenueAccount.currency_code,
    normal_balance: 'credit',
    debit_total_minor: '25',
    credit_total_minor: '100',
    balance_minor: '75',
  });
});

test('LedgerService creates a balanced append-only transaction from debit/credit input', async () => {
  const requestContext = new RequestContextService();
  const debitAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000011',
    code: '1100',
    name: 'Cash',
  });
  const creditAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000012',
    code: '4100',
    name: 'Student Fees',
    category: 'revenue',
    normal_balance: 'credit',
  });
  let insertEntriesCallCount = 0;
  let completedResponse: PostedFinancialTransaction | null = null;

  const service = new LedgerService(
    {
      get: (key: string): number | undefined =>
        key === 'finance.idempotencyTtlSeconds' ? 86400 : undefined,
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      lockAccountsByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
      findById: async (): Promise<AccountEntity | null> => null,
      findByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
    } as never,
    {
      acquireReferenceLock: async (): Promise<void> => undefined,
      findByReference: async (): Promise<FinancialTransactionEntity | null> => null,
      createTransaction: async () =>
        makeTransactionEntity({
          reference: 'MPESA-100',
          description: 'M-PESA school fee payment',
        }),
    } as never,
    {
      insertEntries: async (
        tenantId: string,
        transactionId: string,
        entries: Array<{
          account_id: string;
          line_number: number;
          direction: 'debit' | 'credit';
          amount_minor: string;
          currency_code: string;
          description?: string | null;
          metadata?: Record<string, unknown>;
        }>,
      ) => {
        insertEntriesCallCount += 1;
        return entries.map((entry, index) =>
          Object.assign(new (require('./entities/ledger-entry.entity').LedgerEntryEntity)(), {
            id: `00000000-0000-0000-0000-00000000020${index + 1}`,
            tenant_id: tenantId,
            transaction_id: transactionId,
            account_id: entry.account_id,
            line_number: entry.line_number,
            direction: entry.direction,
            amount_minor: entry.amount_minor,
            currency_code: entry.currency_code,
            description: entry.description ?? null,
            metadata: entry.metadata ?? {},
            created_at: new Date(),
            updated_at: new Date(),
          }),
        );
      },
      calculateBalances: async (): Promise<Map<string, AccountBalanceSnapshot>> =>
        new Map([
          [
            debitAccount.id,
            {
              account_id: debitAccount.id,
              account_code: debitAccount.code,
              currency_code: debitAccount.currency_code,
              normal_balance: debitAccount.normal_balance,
              debit_total_minor: '10000',
              credit_total_minor: '0',
              balance_minor: '0',
            },
          ],
          [
            creditAccount.id,
            {
              account_id: creditAccount.id,
              account_code: creditAccount.code,
              currency_code: creditAccount.currency_code,
              normal_balance: creditAccount.normal_balance,
              debit_total_minor: '0',
              credit_total_minor: '10000',
              balance_minor: '0',
            },
          ],
        ]),
      findByTransactionId: async () => [],
    } as never,
    {
      lockRequest: async () => makeIdempotencyRecord({ idempotency_key: 'MPESA-100' }),
      markCompleted: async (
        _tenantId: string,
        _idempotencyKeyId: string,
        _statusCode: number,
        responseBody: PostedFinancialTransaction,
      ) => {
        completedResponse = responseBody;
      },
    } as never,
    {
      recordFinanceTransactionPosted: async (): Promise<void> => undefined,
    } as never,
    {
      recordServerOperation: async (): Promise<void> => undefined,
    } as never,
  );

  const result = await requestContext.run(
    {
      request_id: 'req-create',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'owner',
      session_id: 'session-create',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/finance/ledger',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.createTransaction({
        reference: 'MPESA-100',
        description: 'M-PESA school fee payment',
        entries: [
          {
            account_id: debitAccount.id,
            debit: '10000',
            description: 'Cash received',
          },
          {
            account_id: creditAccount.id,
            credit: '10000',
            description: 'Fee income',
          },
        ],
      }),
  );

  assert.equal(result.reference, 'MPESA-100');
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0]?.direction, 'debit');
  assert.equal(result.entries[1]?.direction, 'credit');
  assert.equal(insertEntriesCallCount, 1);
  assert.ok(completedResponse);
});

test('LedgerService rejects unbalanced debit/credit createTransaction input', async () => {
  const requestContext = new RequestContextService();
  const debitAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000021',
    code: '1100',
  });
  const creditAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000022',
    code: '4100',
    category: 'revenue',
    normal_balance: 'credit',
  });

  const service = new LedgerService(
    {
      get: (): number => 86400,
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      lockAccountsByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
      findById: async (): Promise<AccountEntity | null> => null,
      findByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
    } as never,
    {
      acquireReferenceLock: async (): Promise<void> => undefined,
      findByReference: async (): Promise<FinancialTransactionEntity | null> => null,
      createTransaction: async (): Promise<FinancialTransactionEntity> => {
        throw new Error('unbalanced input must fail before transaction insert');
      },
    } as never,
    {
      insertEntries: async (): Promise<never> => {
        throw new Error('unbalanced input must fail before ledger entry insert');
      },
      calculateBalances: async (): Promise<Map<string, AccountBalanceSnapshot>> => new Map(),
      findByTransactionId: async () => [],
    } as never,
    {
      lockRequest: async () => makeIdempotencyRecord({ idempotency_key: 'TXN-UNBALANCED' }),
      markCompleted: async (): Promise<void> => undefined,
    } as never,
    {
      recordFinanceTransactionPosted: async (): Promise<void> => undefined,
    } as never,
    {
      recordServerOperation: async (): Promise<void> => undefined,
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-unbalanced',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000010',
          role: 'owner',
          session_id: 'session-unbalanced',
          permissions: ['*:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/finance/ledger',
          started_at: '2026-04-26T00:00:00.000Z',
        },
        () =>
          service.createTransaction({
            reference: 'TXN-UNBALANCED',
            description: 'Invalid payment',
            entries: [
              {
                account_id: debitAccount.id,
                debit: '10000',
              },
              {
                account_id: creditAccount.id,
                credit: '9000',
              },
            ],
          }),
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message.includes('total debits must equal total credits'),
  );
});

test('LedgerService returns the existing transaction when a reference already exists', async () => {
  const requestContext = new RequestContextService();
  const debitAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000031',
    code: '1100',
  });
  const creditAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000032',
    code: '4100',
    category: 'revenue',
    normal_balance: 'credit',
  });
  const existingTransaction = makeTransactionEntity({
    id: '00000000-0000-0000-0000-000000000130',
    reference: 'TXN-DUP',
    description: 'Existing payment',
  });
  let createTransactionCalled = false;

  const service = new LedgerService(
    {
      get: (): number => 86400,
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      lockAccountsByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
      findById: async (): Promise<AccountEntity | null> => null,
      findByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
    } as never,
    {
      acquireReferenceLock: async (): Promise<void> => undefined,
      findByReference: async (): Promise<FinancialTransactionEntity | null> => existingTransaction,
      createTransaction: async (): Promise<FinancialTransactionEntity> => {
        createTransactionCalled = true;
        return existingTransaction;
      },
    } as never,
    {
      insertEntries: async (): Promise<never> => {
        throw new Error('existing reference must not insert ledger entries');
      },
      calculateBalances: async (): Promise<Map<string, AccountBalanceSnapshot>> =>
        new Map([
          [
            debitAccount.id,
            {
              account_id: debitAccount.id,
              account_code: debitAccount.code,
              currency_code: debitAccount.currency_code,
              normal_balance: debitAccount.normal_balance,
              debit_total_minor: '10000',
              credit_total_minor: '0',
              balance_minor: '0',
            },
          ],
          [
            creditAccount.id,
            {
              account_id: creditAccount.id,
              account_code: creditAccount.code,
              currency_code: creditAccount.currency_code,
              normal_balance: creditAccount.normal_balance,
              debit_total_minor: '0',
              credit_total_minor: '10000',
              balance_minor: '0',
            },
          ],
        ]),
      findByTransactionId: async (tenantId: string, transactionId: string) => [
        Object.assign(new (require('./entities/ledger-entry.entity').LedgerEntryEntity)(), {
          id: '00000000-0000-0000-0000-000000000231',
          tenant_id: tenantId,
          transaction_id: transactionId,
          account_id: debitAccount.id,
          line_number: 1,
          direction: 'debit',
          amount_minor: '10000',
          currency_code: 'KES',
          description: 'Cash received',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }),
        Object.assign(new (require('./entities/ledger-entry.entity').LedgerEntryEntity)(), {
          id: '00000000-0000-0000-0000-000000000232',
          tenant_id: tenantId,
          transaction_id: transactionId,
          account_id: creditAccount.id,
          line_number: 2,
          direction: 'credit',
          amount_minor: '10000',
          currency_code: 'KES',
          description: 'Fee income',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ],
    } as never,
    {
      lockRequest: async () => makeIdempotencyRecord({ idempotency_key: 'another-idem-key' }),
      markCompleted: async (): Promise<void> => undefined,
    } as never,
    {
      recordFinanceTransactionPosted: async (): Promise<void> => undefined,
    } as never,
    {
      recordServerOperation: async (): Promise<void> => undefined,
    } as never,
  );

  const result = await requestContext.run(
    {
      request_id: 'req-duplicate',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'owner',
      session_id: 'session-duplicate',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/finance/ledger',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.postTransaction({
        idempotency_key: 'another-idem-key',
        reference: 'TXN-DUP',
        description: 'Existing payment',
        entries: [
          {
            account_id: debitAccount.id,
            direction: 'debit',
            amount_minor: '10000',
            description: 'Cash received',
          },
          {
            account_id: creditAccount.id,
            direction: 'credit',
            amount_minor: '10000',
            description: 'Fee income',
          },
        ],
      }),
  );

  assert.equal(result.transaction_id, existingTransaction.id);
  assert.equal(createTransactionCalled, false);
});

test('LedgerService handles concurrent duplicate references without duplicate ledger writes', async () => {
  const requestContext = new RequestContextService();
  const debitAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000041',
    code: '1100',
  });
  const creditAccount = makeAccount({
    id: '00000000-0000-0000-0000-000000000042',
    code: '4100',
    category: 'revenue',
    normal_balance: 'credit',
  });
  const createdTransaction = makeTransactionEntity({
    id: '00000000-0000-0000-0000-000000000140',
    reference: 'TXN-CONCURRENT',
    description: 'Concurrent payment',
  });
  let persistedTransaction: FinancialTransactionEntity | null = null;
  let createTransactionCalls = 0;
  let insertEntriesCalls = 0;
  let idempotencySequence = 0;

  const service = new LedgerService(
    {
      get: (): number => 86400,
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      lockAccountsByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
      findById: async (): Promise<AccountEntity | null> => null,
      findByIds: async (): Promise<AccountEntity[]> => [debitAccount, creditAccount],
    } as never,
    {
      acquireReferenceLock: async (): Promise<void> => undefined,
      findByReference: async (): Promise<FinancialTransactionEntity | null> => persistedTransaction,
      createTransaction: async (): Promise<FinancialTransactionEntity> => {
        createTransactionCalls += 1;

        if (createTransactionCalls === 1) {
          await sleep(25);
          persistedTransaction = createdTransaction;
          return createdTransaction;
        }

        await sleep(50);
        throw {
          code: '23505',
          constraint: 'uq_transactions_tenant_reference',
        };
      },
    } as never,
    {
      insertEntries: async (
        tenantId: string,
        transactionId: string,
        entries: Array<{
          account_id: string;
          line_number: number;
          direction: 'debit' | 'credit';
          amount_minor: string;
          currency_code: string;
          description?: string | null;
          metadata?: Record<string, unknown>;
        }>,
      ) => {
        insertEntriesCalls += 1;
        return entries.map((entry, index) =>
          Object.assign(new (require('./entities/ledger-entry.entity').LedgerEntryEntity)(), {
            id: `00000000-0000-0000-0000-00000000024${index + 1}`,
            tenant_id: tenantId,
            transaction_id: transactionId,
            account_id: entry.account_id,
            line_number: entry.line_number,
            direction: entry.direction,
            amount_minor: entry.amount_minor,
            currency_code: entry.currency_code,
            description: entry.description ?? null,
            metadata: entry.metadata ?? {},
            created_at: new Date(),
            updated_at: new Date(),
          }),
        );
      },
      calculateBalances: async (): Promise<Map<string, AccountBalanceSnapshot>> =>
        new Map([
          [
            debitAccount.id,
            {
              account_id: debitAccount.id,
              account_code: debitAccount.code,
              currency_code: debitAccount.currency_code,
              normal_balance: debitAccount.normal_balance,
              debit_total_minor: '10000',
              credit_total_minor: '0',
              balance_minor: '0',
            },
          ],
          [
            creditAccount.id,
            {
              account_id: creditAccount.id,
              account_code: creditAccount.code,
              currency_code: creditAccount.currency_code,
              normal_balance: creditAccount.normal_balance,
              debit_total_minor: '0',
              credit_total_minor: '10000',
              balance_minor: '0',
            },
          ],
        ]),
      findByTransactionId: async (tenantId: string, transactionId: string) => [
        Object.assign(new (require('./entities/ledger-entry.entity').LedgerEntryEntity)(), {
          id: '00000000-0000-0000-0000-000000000241',
          tenant_id: tenantId,
          transaction_id: transactionId,
          account_id: debitAccount.id,
          line_number: 1,
          direction: 'debit',
          amount_minor: '10000',
          currency_code: 'KES',
          description: 'Cash received',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }),
        Object.assign(new (require('./entities/ledger-entry.entity').LedgerEntryEntity)(), {
          id: '00000000-0000-0000-0000-000000000242',
          tenant_id: tenantId,
          transaction_id: transactionId,
          account_id: creditAccount.id,
          line_number: 2,
          direction: 'credit',
          amount_minor: '10000',
          currency_code: 'KES',
          description: 'Fee income',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ],
    } as never,
    {
      lockRequest: async () => {
        idempotencySequence += 1;
        return makeIdempotencyRecord({
          id: `idem-record-${idempotencySequence}`,
          idempotency_key: `idem-${idempotencySequence}`,
        });
      },
      markCompleted: async (): Promise<void> => undefined,
    } as never,
    {
      recordFinanceTransactionPosted: async (): Promise<void> => undefined,
    } as never,
    {
      recordServerOperation: async (): Promise<void> => undefined,
    } as never,
  );

  const [firstResult, secondResult] = await Promise.all([
    requestContext.run(
      {
        request_id: 'req-concurrent-1',
        tenant_id: 'tenant-a',
        user_id: '00000000-0000-0000-0000-000000000010',
        role: 'owner',
        session_id: 'session-concurrent-1',
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: '127.0.0.1',
        user_agent: 'test-suite',
        method: 'POST',
        path: '/finance/transactions',
        started_at: '2026-04-26T00:00:00.000Z',
      },
      () =>
        service.postTransaction({
          idempotency_key: 'idem-concurrent-1',
          reference: 'TXN-CONCURRENT',
          description: 'Concurrent payment',
          entries: [
            {
              account_id: debitAccount.id,
              direction: 'debit',
              amount_minor: '10000',
              description: 'Cash received',
            },
            {
              account_id: creditAccount.id,
              direction: 'credit',
              amount_minor: '10000',
              description: 'Fee income',
            },
          ],
        }),
    ),
    requestContext.run(
      {
        request_id: 'req-concurrent-2',
        tenant_id: 'tenant-a',
        user_id: '00000000-0000-0000-0000-000000000010',
        role: 'owner',
        session_id: 'session-concurrent-2',
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: '127.0.0.1',
        user_agent: 'test-suite',
        method: 'POST',
        path: '/finance/transactions',
        started_at: '2026-04-26T00:00:00.000Z',
      },
      () =>
        service.postTransaction({
          idempotency_key: 'idem-concurrent-2',
          reference: 'TXN-CONCURRENT',
          description: 'Concurrent payment',
          entries: [
            {
              account_id: debitAccount.id,
              direction: 'debit',
              amount_minor: '10000',
              description: 'Cash received',
            },
            {
              account_id: creditAccount.id,
              direction: 'credit',
              amount_minor: '10000',
              description: 'Fee income',
            },
          ],
        }),
    ),
  ]);

  assert.equal(firstResult.transaction_id, createdTransaction.id);
  assert.equal(secondResult.transaction_id, createdTransaction.id);
  assert.equal(insertEntriesCalls, 1);
});
