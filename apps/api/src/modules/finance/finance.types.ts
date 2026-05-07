export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type EntryDirection = 'debit' | 'credit';
export type IdempotencyStatus = 'in_progress' | 'completed' | 'failed' | 'expired';

export interface CreateLedgerEntryInput {
  account_id: string;
  debit?: string | number | bigint | null;
  credit?: string | number | bigint | null;
  currency_code?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateLedgerTransactionInput {
  reference: string;
  description: string;
  effective_at?: string;
  posted_at?: string;
  metadata?: Record<string, unknown>;
  entries: CreateLedgerEntryInput[];
}

export interface LedgerPostingEntryInput {
  account_id: string;
  direction: EntryDirection;
  amount_minor: string;
  currency_code?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PostFinancialTransactionInput {
  idempotency_key: string;
  reference: string;
  description: string;
  effective_at?: string;
  posted_at?: string;
  metadata?: Record<string, unknown>;
  entries: LedgerPostingEntryInput[];
}

export interface ValidatedLedgerEntry extends LedgerPostingEntryInput {
  line_number: number;
  amount_minor: string;
  currency_code: string;
}

export interface LedgerPostingPlan {
  currency_code: string;
  entry_count: number;
  total_amount_minor: string;
  entries: ValidatedLedgerEntry[];
}

export interface AccountBalanceSnapshot {
  account_id: string;
  account_code: string;
  currency_code: string;
  normal_balance: EntryDirection;
  debit_total_minor: string;
  credit_total_minor: string;
  balance_minor: string;
}

export interface PostedLedgerEntry {
  entry_id: string;
  line_number: number;
  account_id: string;
  account_code: string;
  account_name: string;
  direction: EntryDirection;
  amount_minor: string;
  currency_code: string;
  description: string | null;
}

export interface PostedFinancialTransaction {
  transaction_id: string;
  tenant_id: string;
  idempotency_key: string;
  reference: string;
  description: string;
  currency_code: string;
  total_amount_minor: string;
  entry_count: number;
  posted_at: string;
  effective_at: string;
  entries: PostedLedgerEntry[];
  balances: AccountBalanceSnapshot[];
}

export interface IdempotencyRequestLock {
  tenant_id: string;
  user_id: string | null;
  scope: string;
  idempotency_key: string;
  request_hash: string;
  request_method: string;
  request_path: string;
  ttl_seconds: number;
}

export interface IdempotencyKeyRecord {
  id: string;
  tenant_id: string;
  user_id: string | null;
  scope: string;
  idempotency_key: string;
  request_method: string;
  request_path: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_status_code: number | null;
  response_body: PostedFinancialTransaction | null;
  locked_at: string | null;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}
