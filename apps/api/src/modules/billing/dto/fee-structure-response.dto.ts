import {
  FeeStructureLineItem,
  FeeStructureStatus,
} from '../entities/fee-structure.entity';

export class FeeStructureResponseDto {
  id!: string;
  tenant_id!: string;
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
  created_at!: string;
  updated_at!: string;
}
