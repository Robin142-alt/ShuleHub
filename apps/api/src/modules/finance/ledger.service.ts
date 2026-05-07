import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { AUTH_ANONYMOUS_USER_ID } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { AuditLogService } from '../observability/audit-log.service';
import { SyncOperationLogService } from '../sync/sync-operation-log.service';
import { AccountEntity } from './entities/account.entity';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import { FinancialTransactionEntity } from './entities/transaction.entity';
import { FINANCE_IDEMPOTENCY_SCOPE, FINANCE_REQUEST_METHOD, FINANCE_REQUEST_PATH } from './finance.constants';
import {
  AccountBalanceSnapshot,
  CreateLedgerEntryInput,
  CreateLedgerTransactionInput,
  IdempotencyKeyRecord,
  LedgerPostingEntryInput,
  LedgerPostingPlan,
  PostFinancialTransactionInput,
  PostedFinancialTransaction,
  PostedLedgerEntry,
  ValidatedLedgerEntry,
} from './finance.types';
import { AccountsRepository } from './repositories/accounts.repository';
import { IdempotencyKeysRepository } from './repositories/idempotency-keys.repository';
import { LedgerEntriesRepository } from './repositories/ledger-entries.repository';
import { TransactionsRepository } from './repositories/transactions.repository';

@Injectable()
export class LedgerService {
  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly requestContext?: RequestContextService,
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional() private readonly accountsRepository?: AccountsRepository,
    @Optional() private readonly transactionsRepository?: TransactionsRepository,
    @Optional() private readonly ledgerEntriesRepository?: LedgerEntriesRepository,
    @Optional() private readonly idempotencyKeysRepository?: IdempotencyKeysRepository,
    @Optional() private readonly auditLogService?: AuditLogService,
    @Optional() private readonly syncOperationLogService?: SyncOperationLogService,
  ) {}

  async createTransaction(
    input: CreateLedgerTransactionInput,
  ): Promise<PostedFinancialTransaction> {
    const reference = this.requireNonEmptyText(input.reference, 'reference');

    return this.postTransaction({
      idempotency_key: reference,
      reference,
      description: this.requireNonEmptyText(input.description, 'description'),
      effective_at: input.effective_at,
      posted_at: input.posted_at,
      metadata: input.metadata ?? {},
      entries: input.entries.map((entry) => this.mapCreateEntry(entry)),
    });
  }

  async postTransaction(
    input: PostFinancialTransactionInput,
  ): Promise<PostedFinancialTransaction> {
    const databaseService = this.requireRuntimeDependency(
      this.databaseService,
      'DatabaseService',
    );

    return databaseService.withRequestTransaction(async () => {
      const requestContext = this.requireRuntimeDependency(
        this.requestContext,
        'RequestContextService',
      ).requireStore();
      const tenantId = this.requireTenantId();
      const accountsRepository = this.requireRuntimeDependency(
        this.accountsRepository,
        'AccountsRepository',
      );
      const transactionsRepository = this.requireRuntimeDependency(
        this.transactionsRepository,
        'TransactionsRepository',
      );
      const ledgerEntriesRepository = this.requireRuntimeDependency(
        this.ledgerEntriesRepository,
        'LedgerEntriesRepository',
      );
      const idempotencyKeysRepository = this.requireRuntimeDependency(
        this.idempotencyKeysRepository,
        'IdempotencyKeysRepository',
      );
      const reference = this.requireNonEmptyText(input.reference, 'reference');
      const description = this.requireNonEmptyText(input.description, 'description');

      await transactionsRepository.acquireReferenceLock(tenantId, reference);

      const idempotencyRecord = await this.lockIdempotencyKey(input);

      if (idempotencyRecord.status === 'completed' && idempotencyRecord.response_body) {
        return idempotencyRecord.response_body;
      }

      const accountIds = Array.from(new Set(input.entries.map((entry) => entry.account_id))).sort();
      const accounts = await accountsRepository.lockAccountsByIds(tenantId, accountIds);
      const postingPlan = this.buildPostingPlan(input, accounts);

      if (accounts.length !== accountIds.length) {
        throw new BadRequestException('One or more accounts could not be locked for the transaction');
      }

      const existingTransaction = await transactionsRepository.findByReference(tenantId, reference);

      if (existingTransaction) {
        const existingResponse = await this.hydratePostedTransaction(
          tenantId,
          input.idempotency_key,
          existingTransaction,
        );
        this.assertReferenceReuseCompatible(description, postingPlan, existingResponse);
        await idempotencyKeysRepository.markCompleted(
          tenantId,
          idempotencyRecord.id,
          200,
          existingResponse,
        );
        return existingResponse;
      }

      let transaction: FinancialTransactionEntity;

      try {
        transaction = await transactionsRepository.createTransaction({
          tenant_id: tenantId,
          idempotency_key_id: idempotencyRecord.id,
          reference,
          description,
          currency_code: postingPlan.currency_code,
          total_amount_minor: postingPlan.total_amount_minor,
          entry_count: postingPlan.entry_count,
          effective_at: this.resolveTimestamp(input.effective_at),
          posted_at: this.resolveTimestamp(input.posted_at),
          created_by_user_id:
            requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
              ? requestContext.user_id
              : null,
          request_id: requestContext.request_id,
          metadata: input.metadata ?? {},
        });
      } catch (error) {
        if (this.isReferenceUniquenessViolation(error)) {
          const conflictTransaction = await transactionsRepository.findByReference(tenantId, reference);

          if (!conflictTransaction) {
            throw error;
          }

          const existingResponse = await this.hydratePostedTransaction(
            tenantId,
            input.idempotency_key,
            conflictTransaction,
          );
          this.assertReferenceReuseCompatible(description, postingPlan, existingResponse);
          await idempotencyKeysRepository.markCompleted(
            tenantId,
            idempotencyRecord.id,
            200,
            existingResponse,
          );
          return existingResponse;
        }

        throw error;
      }

      const ledgerEntries = await ledgerEntriesRepository.insertEntries(
        tenantId,
        transaction.id,
        postingPlan.entries,
      );
      const balanceMap = await ledgerEntriesRepository.calculateBalances(tenantId, accountIds);
      const response = this.buildPostedTransaction(
        tenantId,
        input.idempotency_key,
        transaction,
        accounts,
        ledgerEntries,
        balanceMap,
      );

      await idempotencyKeysRepository.markCompleted(tenantId, idempotencyRecord.id, 201, response);
      await this.requireRuntimeDependency(
        this.auditLogService,
        'AuditLogService',
      ).recordFinanceTransactionPosted({
        transaction: response,
        metadata: {
          source: 'ledger',
          request_metadata: {
            request_id: requestContext.request_id,
            user_id:
              requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
                ? requestContext.user_id
                : null,
          },
        },
      });
      await this.requireRuntimeDependency(
        this.syncOperationLogService,
        'SyncOperationLogService',
      ).recordServerOperation('finance', {
        action: 'posted',
        transaction_id: response.transaction_id,
        reference: response.reference,
        description: response.description,
        total_amount_minor: response.total_amount_minor,
        currency_code: response.currency_code,
        entry_count: response.entry_count,
        posted_at: response.posted_at,
        source: 'server',
        metadata: input.metadata ?? {},
      });

      return response;
    });
  }

  async getAccountBalance(accountId: string): Promise<AccountBalanceSnapshot> {
    const tenantId = this.requireTenantId();
    const account = await this.requireRuntimeDependency(
      this.accountsRepository,
      'AccountsRepository',
    ).findById(tenantId, accountId);

    if (!account) {
      throw new BadRequestException(`Account "${accountId}" was not found in this tenant`);
    }

    const balances = await this.requireRuntimeDependency(
      this.ledgerEntriesRepository,
      'LedgerEntriesRepository',
    ).calculateBalances(tenantId, [accountId]);

    return this.calculateBalanceSnapshot(account, balances.get(accountId));
  }

  buildPostingPlan(
    input: PostFinancialTransactionInput,
    accounts: AccountEntity[],
  ): LedgerPostingPlan {
    if (input.entries.length < 2) {
      throw new BadRequestException('A financial transaction requires at least two ledger entries');
    }

    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const validatedEntries: ValidatedLedgerEntry[] = input.entries.map((entry, index) => {
      const account = accountById.get(entry.account_id);

      if (!account) {
        throw new NotFoundException(`Account "${entry.account_id}" does not exist in this tenant`);
      }

      if (!account.is_active) {
        throw new BadRequestException(`Account "${account.code}" is inactive`);
      }

      if (!account.allow_manual_entries) {
        throw new BadRequestException(`Account "${account.code}" does not allow manual ledger postings`);
      }

      const currencyCode = (entry.currency_code ?? account.currency_code).trim().toUpperCase();

      if (currencyCode !== account.currency_code.toUpperCase()) {
        throw new BadRequestException(
          `Entry currency "${currencyCode}" does not match account "${account.code}" currency "${account.currency_code}"`,
        );
      }

      return {
        ...entry,
        line_number: index + 1,
        amount_minor: this.normalizeMinorAmount(entry.amount_minor),
        currency_code: currencyCode,
      };
    });

    const distinctCurrencies = Array.from(new Set(validatedEntries.map((entry) => entry.currency_code)));

    if (distinctCurrencies.length !== 1) {
      throw new BadRequestException('All ledger entries in a transaction must use the same currency');
    }

    let debitTotal = 0n;
    let creditTotal = 0n;

    for (const entry of validatedEntries) {
      const amount = BigInt(entry.amount_minor);

      if (entry.direction === 'debit') {
        debitTotal += amount;
        continue;
      }

      if (entry.direction === 'credit') {
        creditTotal += amount;
        continue;
      }

      throw new BadRequestException(`Unsupported entry direction "${String(entry.direction)}"`);
    }

    if (debitTotal !== creditTotal) {
      throw new BadRequestException('Double-entry validation failed: total debits must equal total credits');
    }

    return {
      currency_code: distinctCurrencies[0],
      entry_count: validatedEntries.length,
      total_amount_minor: debitTotal.toString(),
      entries: validatedEntries,
    };
  }

  buildIdempotencyHash(input: PostFinancialTransactionInput): string {
    const stablePayload = this.stableSerialize({
      idempotency_key: input.idempotency_key,
      reference: input.reference,
      description: input.description,
      effective_at: input.effective_at ?? null,
      posted_at: input.posted_at ?? null,
      metadata: input.metadata ?? {},
      entries: input.entries.map((entry) => ({
        account_id: entry.account_id,
        direction: entry.direction,
        amount_minor: this.normalizeMinorAmount(entry.amount_minor),
        currency_code: entry.currency_code?.trim().toUpperCase() ?? null,
        description: entry.description ?? null,
        metadata: entry.metadata ?? {},
      })),
    });

    return createHash('sha256').update(stablePayload).digest('hex');
  }

  calculateBalanceSnapshot(
    account: Pick<AccountEntity, 'id' | 'code' | 'currency_code' | 'normal_balance'>,
    totals?: Pick<AccountBalanceSnapshot, 'debit_total_minor' | 'credit_total_minor'>,
  ): AccountBalanceSnapshot {
    const debitTotal = BigInt(totals?.debit_total_minor ?? '0');
    const creditTotal = BigInt(totals?.credit_total_minor ?? '0');
    const balanceMinor =
      account.normal_balance === 'debit' ? debitTotal - creditTotal : creditTotal - debitTotal;

    return {
      account_id: account.id,
      account_code: account.code,
      currency_code: account.currency_code,
      normal_balance: account.normal_balance,
      debit_total_minor: debitTotal.toString(),
      credit_total_minor: creditTotal.toString(),
      balance_minor: balanceMinor.toString(),
    };
  }

  buildPostedTransaction(
    tenantId: string,
    idempotencyKey: string,
    transaction: FinancialTransactionEntity,
    accounts: AccountEntity[],
    ledgerEntries: LedgerEntryEntity[],
    balances: Map<string, AccountBalanceSnapshot>,
  ): PostedFinancialTransaction {
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const entries: PostedLedgerEntry[] = ledgerEntries
      .slice()
      .sort((left, right) => left.line_number - right.line_number)
      .map((entry) => {
        const account = accountById.get(entry.account_id);

        if (!account) {
          throw new NotFoundException(`Account "${entry.account_id}" is missing for response rendering`);
        }

        return {
          entry_id: entry.id,
          line_number: entry.line_number,
          account_id: entry.account_id,
          account_code: account.code,
          account_name: account.name,
          direction: entry.direction,
          amount_minor: entry.amount_minor,
          currency_code: entry.currency_code,
          description: entry.description,
        };
      });

    const accountBalances = accounts
      .map((account) => this.calculateBalanceSnapshot(account, balances.get(account.id)))
      .sort((left, right) => left.account_code.localeCompare(right.account_code));

    return {
      transaction_id: transaction.id,
      tenant_id: tenantId,
      idempotency_key: idempotencyKey,
      reference: transaction.reference,
      description: transaction.description,
      currency_code: transaction.currency_code,
      total_amount_minor: transaction.total_amount_minor,
      entry_count: transaction.entry_count,
      posted_at: transaction.posted_at.toISOString(),
      effective_at: transaction.effective_at.toISOString(),
      entries,
      balances: accountBalances,
    };
  }

  private async hydratePostedTransaction(
    tenantId: string,
    idempotencyKey: string,
    transaction: FinancialTransactionEntity,
  ): Promise<PostedFinancialTransaction> {
    const ledgerEntriesRepository = this.requireRuntimeDependency(
      this.ledgerEntriesRepository,
      'LedgerEntriesRepository',
    );
    const accountsRepository = this.requireRuntimeDependency(
      this.accountsRepository,
      'AccountsRepository',
    );
    const ledgerEntries = await ledgerEntriesRepository.findByTransactionId(tenantId, transaction.id);
    const accountIds = Array.from(new Set(ledgerEntries.map((entry) => entry.account_id))).sort();
    const accounts = await accountsRepository.findByIds(tenantId, accountIds);

    if (accounts.length !== accountIds.length) {
      throw new NotFoundException(
        `Unable to hydrate transaction "${transaction.reference}" because one or more accounts are missing`,
      );
    }

    const balanceMap = await ledgerEntriesRepository.calculateBalances(tenantId, accountIds);

    return this.buildPostedTransaction(
      tenantId,
      idempotencyKey,
      transaction,
      accounts,
      ledgerEntries,
      balanceMap,
    );
  }

  private assertReferenceReuseCompatible(
    description: string,
    postingPlan: LedgerPostingPlan,
    existingTransaction: PostedFinancialTransaction,
  ): void {
    if (existingTransaction.description !== description) {
      throw new ConflictException(
        `Financial reference "${existingTransaction.reference}" is already posted with a different description`,
      );
    }

    if (existingTransaction.currency_code !== postingPlan.currency_code) {
      throw new ConflictException(
        `Financial reference "${existingTransaction.reference}" is already posted in a different currency`,
      );
    }

    if (existingTransaction.total_amount_minor !== postingPlan.total_amount_minor) {
      throw new ConflictException(
        `Financial reference "${existingTransaction.reference}" is already posted with a different amount`,
      );
    }

    if (existingTransaction.entries.length !== postingPlan.entries.length) {
      throw new ConflictException(
        `Financial reference "${existingTransaction.reference}" is already posted with a different entry count`,
      );
    }

    for (const [index, existingEntry] of existingTransaction.entries.entries()) {
      const requestedEntry = postingPlan.entries[index];

      if (!requestedEntry) {
        throw new ConflictException(
          `Financial reference "${existingTransaction.reference}" is already posted with a different ledger shape`,
        );
      }

      if (
        existingEntry.account_id !== requestedEntry.account_id ||
        existingEntry.direction !== requestedEntry.direction ||
        existingEntry.amount_minor !== requestedEntry.amount_minor ||
        existingEntry.currency_code !== requestedEntry.currency_code ||
        (existingEntry.description ?? null) !== (requestedEntry.description ?? null)
      ) {
        throw new ConflictException(
          `Financial reference "${existingTransaction.reference}" is already posted with a different ledger shape`,
        );
      }
    }
  }

  private mapCreateEntry(entry: CreateLedgerEntryInput): LedgerPostingEntryInput {
    const debit = this.normalizeOptionalMinorAmount(entry.debit, 'debit');
    const credit = this.normalizeOptionalMinorAmount(entry.credit, 'credit');

    if (debit !== '0' && credit !== '0') {
      throw new BadRequestException(
        `Ledger entry for account "${entry.account_id}" cannot contain both debit and credit amounts`,
      );
    }

    if (debit === '0' && credit === '0') {
      throw new BadRequestException(
        `Ledger entry for account "${entry.account_id}" must contain a positive debit or credit amount`,
      );
    }

    return {
      account_id: entry.account_id,
      direction: debit !== '0' ? 'debit' : 'credit',
      amount_minor: debit !== '0' ? debit : credit,
      currency_code: entry.currency_code?.trim().toUpperCase(),
      description: entry.description ?? null,
      metadata: entry.metadata ?? {},
    };
  }

  private async lockIdempotencyKey(
    input: PostFinancialTransactionInput,
  ): Promise<IdempotencyKeyRecord> {
    const requestContext = this.requireRuntimeDependency(
      this.requestContext,
      'RequestContextService',
    ).requireStore();

    return this.requireRuntimeDependency(
      this.idempotencyKeysRepository,
      'IdempotencyKeysRepository',
    ).lockRequest({
      tenant_id: this.requireTenantId(),
      user_id:
        requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
          ? requestContext.user_id
          : null,
      scope: FINANCE_IDEMPOTENCY_SCOPE,
      idempotency_key: this.requireNonEmptyText(input.idempotency_key, 'idempotency_key'),
      request_hash: this.buildIdempotencyHash(input),
      request_method: FINANCE_REQUEST_METHOD,
      request_path: FINANCE_REQUEST_PATH,
      ttl_seconds: Number(
        this.requireRuntimeDependency(this.configService, 'ConfigService').get<number>(
          'finance.idempotencyTtlSeconds',
        ) ?? 86400,
      ),
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requireRuntimeDependency(
      this.requestContext,
      'RequestContextService',
    ).requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for financial transactions');
    }

    return tenantId;
  }

  private resolveTimestamp(value?: string): string {
    if (!value) {
      return new Date().toISOString();
    }

    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new BadRequestException(`Invalid timestamp "${value}"`);
    }

    return parsedValue.toISOString();
  }

  private requireNonEmptyText(value: string, fieldName: string): string {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new BadRequestException(`Financial transaction ${fieldName} is required`);
    }

    return normalizedValue;
  }

  private normalizeMinorAmount(amountMinor: string): string {
    const normalizedValue = amountMinor.trim();

    if (!/^[1-9][0-9]*$/.test(normalizedValue)) {
      throw new BadRequestException('Ledger entry amounts must be positive integer minor units');
    }

    return normalizedValue;
  }

  private normalizeOptionalMinorAmount(
    value: string | number | bigint | null | undefined,
    fieldName: string,
  ): string {
    if (value === null || value === undefined) {
      return '0';
    }

    if (typeof value === 'bigint') {
      if (value < 0n) {
        throw new BadRequestException(`Ledger entry ${fieldName} amounts cannot be negative`);
      }

      return value.toString();
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new BadRequestException(`Ledger entry ${fieldName} amounts must be non-negative integers`);
      }

      return String(value);
    }

    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      return '0';
    }

    if (!/^[0-9]+$/.test(normalizedValue)) {
      throw new BadRequestException(`Ledger entry ${fieldName} amounts must be non-negative integers`);
    }

    return normalizedValue;
  }

  private isReferenceUniquenessViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505' &&
      'constraint' in error &&
      (error as { constraint?: string }).constraint === 'uq_transactions_tenant_reference'
    );
  }

  private requireRuntimeDependency<T>(dependency: T | undefined, dependencyName: string): T {
    if (!dependency) {
      throw new Error(`${dependencyName} is required for runtime ledger operations`);
    }

    return dependency;
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;
      const keys = Object.keys(objectValue).sort();
      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${this.stableSerialize(objectValue[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }
}
