import { StudentFeeBalanceResponseDto } from './student-fee-balance-response.dto';

export type StudentFeeStatementEntryKind = 'invoice' | 'receipt';

export class StudentFeeStatementEntryResponseDto {
  id!: string;
  kind!: StudentFeeStatementEntryKind;
  source_id!: string;
  invoice_id!: string | null;
  reference!: string;
  description!: string;
  status!: string;
  method!: string;
  debit_amount_minor!: string;
  credit_amount_minor!: string;
  balance_after_minor!: string;
  occurred_at!: string;
  ledger_transaction_id!: string | null;
}

export class StudentFeeStatementResponseDto {
  summary!: StudentFeeBalanceResponseDto;
  entries!: StudentFeeStatementEntryResponseDto[];
}
