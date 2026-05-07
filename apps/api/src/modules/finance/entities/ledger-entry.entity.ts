import { BaseEntity } from '../../../database/entities/base.entity';
import { EntryDirection } from '../finance.types';

export class LedgerEntryEntity extends BaseEntity {
  transaction_id!: string;
  account_id!: string;
  line_number!: number;
  direction!: EntryDirection;
  amount_minor!: string;
  currency_code!: string;
  description!: string | null;
  metadata!: Record<string, unknown>;
}

