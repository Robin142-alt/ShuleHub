import type {
  DisciplineActionType,
  DisciplineSeverity,
  DisciplineStatus,
} from '../dto/discipline.dto';
import type { CounsellingNoteVisibility } from '../dto/counselling.dto';

export interface DisciplineIncidentEntity {
  id: string;
  tenant_id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  academic_term_id: string;
  academic_year_id: string;
  offense_category_id: string;
  reporting_staff_id: string;
  assigned_staff_id: string | null;
  incident_number: string;
  title: string;
  severity: DisciplineSeverity;
  status: DisciplineStatus;
  occurred_at: string;
  reported_at: string;
  location: string | null;
  witnesses: Array<Record<string, unknown>>;
  description: string;
  action_taken: string | null;
  recommendations: string | null;
  linked_counselling_referral_id: string | null;
  behavior_points_delta: number;
  parent_notification_status: string;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OffenseCategoryEntity {
  id: string;
  tenant_id: string;
  school_id: string;
  code: string;
  name: string;
  description: string | null;
  default_severity: DisciplineSeverity;
  default_points: number;
  default_action_type: DisciplineActionType | null;
  notify_parent_by_default: boolean;
  escalation_rules: Record<string, unknown>;
  is_positive: boolean;
  is_active: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisciplineActionEntity {
  id: string;
  tenant_id: string;
  incident_id: string;
  action_type: DisciplineActionType;
  status: string;
  title: string;
  description: string | null;
  assigned_staff_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  remarks: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CounsellingSessionEntity {
  id: string;
  tenant_id: string;
  school_id: string;
  student_id: string;
  referral_id: string | null;
  counsellor_user_id: string;
  status: string;
  scheduled_for: string;
  completed_at: string | null;
  location: string | null;
  agenda: string | null;
  outcome_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounsellingNoteEntity {
  id: string;
  tenant_id: string;
  school_id: string;
  student_id: string;
  counselling_session_id: string;
  counsellor_user_id: string;
  visibility: CounsellingNoteVisibility;
  encrypted_note: string;
  note_nonce: string;
  note_auth_tag: string;
  safe_summary: string | null;
  risk_indicators: string[];
  created_at: string;
  updated_at: string;
}
