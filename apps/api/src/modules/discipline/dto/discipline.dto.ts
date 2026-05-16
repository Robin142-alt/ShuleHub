import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export const DISCIPLINE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const DISCIPLINE_STATUSES = [
  'reported',
  'under_review',
  'pending_action',
  'awaiting_parent_response',
  'counselling_assigned',
  'escalated',
  'suspended',
  'resolved',
  'closed',
] as const;
export const DISCIPLINE_ACTION_TYPES = [
  'verbal_warning',
  'written_warning',
  'detention',
  'manual_work',
  'counselling',
  'suspension',
  'expulsion',
  'parent_meeting',
  'behavior_contract',
] as const;

export type DisciplineSeverity = (typeof DISCIPLINE_SEVERITIES)[number];
export type DisciplineStatus = (typeof DISCIPLINE_STATUSES)[number];
export type DisciplineActionType = (typeof DISCIPLINE_ACTION_TYPES)[number];

export class ListDisciplineIncidentsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(DISCIPLINE_STATUSES)
  status?: DisciplineStatus;

  @IsOptional()
  @IsIn(DISCIPLINE_SEVERITIES)
  severity?: DisciplineSeverity;

  @IsOptional()
  @IsUUID()
  student_id?: string;

  @IsOptional()
  @IsUUID()
  class_id?: string;

  @IsOptional()
  @IsUUID()
  offense_category_id?: string;

  @IsOptional()
  @IsUUID()
  academic_term_id?: string;

  @IsOptional()
  @IsUUID()
  academic_year_id?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateDisciplineIncidentDto {
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @IsUUID()
  student_id!: string;

  @IsUUID()
  class_id!: string;

  @IsUUID()
  academic_term_id!: string;

  @IsUUID()
  academic_year_id!: string;

  @IsUUID()
  offense_category_id!: string;

  @IsOptional()
  @IsUUID()
  reporting_staff_id?: string;

  @IsString()
  title!: string;

  @IsIn(DISCIPLINE_SEVERITIES)
  severity!: DisciplineSeverity;

  @IsISO8601()
  occurred_at!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  witnesses?: Array<Record<string, unknown>>;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  action_taken?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsBoolean()
  save_as_draft?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateDisciplineIncidentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(DISCIPLINE_SEVERITIES)
  severity?: DisciplineSeverity;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  action_taken?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateDisciplineStatusDto {
  @IsIn(DISCIPLINE_STATUSES)
  status!: DisciplineStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignDisciplineIncidentDto {
  @IsUUID()
  assigned_staff_id!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateDisciplineActionDto {
  @IsIn(DISCIPLINE_ACTION_TYPES)
  action_type!: DisciplineActionType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigned_staff_id?: string;

  @IsOptional()
  @IsISO8601()
  due_at?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CompleteDisciplineActionDto {
  @IsOptional()
  @IsString()
  completion_notes?: string;
}

export class CreateDisciplineCommentDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsIn(['public', 'internal'])
  visibility?: 'public' | 'internal';
}

export class CreateOffenseCategoryDto {
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(DISCIPLINE_SEVERITIES)
  default_severity!: DisciplineSeverity;

  @IsInt()
  default_points!: number;

  @IsOptional()
  @IsIn(DISCIPLINE_ACTION_TYPES)
  default_action_type?: DisciplineActionType;

  @IsOptional()
  @IsBoolean()
  notify_parent_by_default?: boolean;

  @IsOptional()
  @IsBoolean()
  is_positive?: boolean;
}

export class CreateCommendationDto {
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @IsUUID()
  student_id!: string;

  @IsUUID()
  class_id!: string;

  @IsUUID()
  academic_term_id!: string;

  @IsUUID()
  academic_year_id!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsInt()
  points_delta!: number;
}

export class AcknowledgeDisciplineIncidentDto {
  @IsOptional()
  @IsString()
  acknowledgement_note?: string;
}

export class ExportDisciplineReportDto {
  @IsIn(['incidents', 'behavior_summary', 'commendations', 'counselling_effectiveness'])
  report_type!: 'incidents' | 'behavior_summary' | 'commendations' | 'counselling_effectiveness';

  @IsIn(['pdf', 'csv', 'xlsx'])
  format!: 'pdf' | 'csv' | 'xlsx';

  @IsOptional()
  filters?: Record<string, unknown>;
}

export class GenerateDisciplineDocumentDto {
  @IsIn([
    'warning_letter',
    'suspension_letter',
    'expulsion_notice',
    'counselling_referral',
    'parent_summons',
    'behavior_report',
    'commendation_certificate',
  ])
  document_type!:
    | 'warning_letter'
    | 'suspension_letter'
    | 'expulsion_notice'
    | 'counselling_referral'
    | 'parent_summons'
    | 'behavior_report'
    | 'commendation_certificate';

  @IsOptional()
  @IsUUID()
  action_id?: string;
}

export class UploadDisciplineAttachmentDto {
  @IsOptional()
  @IsUUID()
  action_id?: string;

  @IsOptional()
  @IsString()
  visibility?: 'internal' | 'parent_visible';
}
