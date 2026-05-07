export class StudentResponseDto {
  id!: string;
  tenant_id!: string;
  admission_number!: string;
  first_name!: string;
  last_name!: string;
  middle_name!: string | null;
  status!: string;
  date_of_birth!: string | null;
  gender!: string | null;
  primary_guardian_name!: string | null;
  primary_guardian_phone!: string | null;
  metadata!: Record<string, unknown>;
  created_by_user_id!: string | null;
  created_at!: string;
  updated_at!: string;
}
