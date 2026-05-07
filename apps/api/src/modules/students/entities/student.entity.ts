import { BaseEntity } from '../../../database/entities/base.entity';

export class StudentEntity extends BaseEntity {
  admission_number!: string;
  first_name!: string;
  last_name!: string;
  middle_name!: string | null;
  status!: 'active' | 'inactive' | 'graduated' | 'transferred';
  date_of_birth!: string | null;
  gender!: 'male' | 'female' | 'other' | 'undisclosed' | null;
  primary_guardian_name!: string | null;
  primary_guardian_phone!: string | null;
  metadata!: Record<string, unknown>;
  created_by_user_id!: string | null;
}
