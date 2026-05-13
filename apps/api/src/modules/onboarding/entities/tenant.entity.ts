export class TenantEntity {
  id!: string;
  tenant_id!: string;
  school_name!: string;
  slug!: string;
  primary_domain!: string;
  contact_email!: string;
  phone!: string;
  address!: string;
  county!: string;
  plan_code!: string;
  student_limit!: number;
  status!: 'provisioning' | 'active' | 'past_due' | 'suspended' | 'archived';
  onboarding_status!: 'created' | 'admin_invited' | 'admin_activated' | 'setup_in_progress' | 'complete';
  branding!: Record<string, unknown>;
  metadata!: Record<string, unknown>;
  created_at!: Date;
  updated_at!: Date;
}
