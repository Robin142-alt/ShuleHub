export type SeederModuleName = 'tenant' | 'user' | 'academic' | 'student' | 'finance';

export interface SeedRunOptions {
  tenant: string;
  school_name?: string;
  owner_password?: string;
  plan_code?: 'trial' | 'starter' | 'growth' | 'enterprise';
  student_count_per_stream?: number;
}

export interface SeedSummary {
  tenant: string;
  school_name: string;
  executed_modules: SeederModuleName[];
  started_at: string;
  completed_at?: string;
  counts: Record<string, number>;
  validations: string[];
}

export interface SeedRegistries {
  tenant_record_id?: string;
  owner_user_id?: string;
  subscription_id?: string;
  academic_year_id?: string;
  active_term_id?: string;
  active_term_code?: string;
  class_ids: Map<string, string>;
  stream_ids: Map<string, string>;
  stream_class_codes: Map<string, string>;
  staff_user_ids: Map<string, string>;
  staff_member_ids: Map<string, string>;
  staff_subject_codes: Map<string, string[]>;
  subject_ids: Map<string, string>;
  assignment_ids: Map<string, string>;
  student_ids: Map<string, string>;
  student_stream_codes: Map<string, string>;
  student_primary_guardian_phones: Map<string, string>;
  guardian_ids: Map<string, string>;
  fee_structure_ids: Map<string, string>;
  account_ids: Map<string, string>;
  invoice_ids: Map<string, string>;
}

export interface SeedRuntimeContext {
  options: Required<SeedRunOptions>;
  request_id: string;
  seed_key: string;
  now: Date;
  summary: SeedSummary;
  registries: SeedRegistries;
}

export interface UserSeedRecord {
  seed_key: string;
  display_name: string;
  email: string;
  role_code: string;
  staff_type: 'teacher' | 'admin' | 'finance';
  employee_number: string;
  phone_number: string;
  tsc_number?: string | null;
  subject_codes?: string[];
}

export interface StudentGuardianSeedRecord {
  seed_key: string;
  full_name: string;
  relationship: 'mother' | 'father' | 'guardian' | 'sponsor';
  phone_number: string;
  email: string | null;
  occupation: string | null;
  is_primary: boolean;
}

export interface StudentSeedRecord {
  seed_key: string;
  admission_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: 'male' | 'female';
  date_of_birth: string;
  class_code: string;
  stream_code: string;
  status: 'active' | 'inactive';
  guardians: StudentGuardianSeedRecord[];
}

export interface PaymentScenario {
  invoice_number: string;
  total_amount_minor: string;
  paid_amount_minor: string;
  status: 'paid' | 'open' | 'pending_payment';
  payment_reference: string | null;
  payment_description: string | null;
  paid_at: string | null;
  receipt_reference: string | null;
}
