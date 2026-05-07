import { BaseEntity } from '../../../database/entities/base.entity';
import { AccountCategory, EntryDirection } from '../finance.types';

export class AccountEntity extends BaseEntity {
  code!: string;
  name!: string;
  category!: AccountCategory;
  normal_balance!: EntryDirection;
  currency_code!: string;
  allow_manual_entries!: boolean;
  is_active!: boolean;
  metadata!: Record<string, unknown>;
}

