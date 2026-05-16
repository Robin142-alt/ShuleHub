import { BaseEntity } from '../../../database/entities/base.entity';

export type FeeStructureStatus = 'draft' | 'active' | 'archived';

export interface FeeStructureLineItem {
  code: string;
  label: string;
  amount_minor: string;
}

export class FeeStructureEntity extends BaseEntity {
  name!: string;
  academic_year!: string;
  term!: string;
  grade_level!: string;
  class_name!: string | null;
  currency_code!: string;
  status!: FeeStructureStatus;
  due_days!: number;
  line_items!: FeeStructureLineItem[];
  total_amount_minor!: string;
  metadata!: Record<string, unknown>;
  created_by_user_id!: string | null;
}
