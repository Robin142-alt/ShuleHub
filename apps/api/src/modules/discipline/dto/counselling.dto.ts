import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const COUNSELLING_REFERRAL_STATUSES = [
  'open',
  'accepted',
  'declined',
  'closed',
] as const;
export const COUNSELLING_SESSION_STATUSES = [
  'scheduled',
  'completed',
  'missed',
  'cancelled',
] as const;
export const COUNSELLING_NOTE_VISIBILITIES = [
  'internal_only',
  'discipline_office',
  'parent_visible',
] as const;

export type CounsellingNoteVisibility = (typeof COUNSELLING_NOTE_VISIBILITIES)[number];

export class ListCounsellingQueryDto {
  @IsOptional()
  @IsUUID()
  student_id?: string;

  @IsOptional()
  @IsUUID()
  counsellor_user_id?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateCounsellingReferralDto {
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

  @IsOptional()
  @IsUUID()
  incident_id?: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
}

export class CreateCounsellingSessionDto {
  @IsUUID()
  referral_id!: string;

  @IsUUID()
  student_id!: string;

  @IsISO8601()
  scheduled_for!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  agenda?: string;
}

export class UpdateCounsellingSessionDto {
  @IsOptional()
  @IsISO8601()
  scheduled_for?: string;

  @IsOptional()
  @IsIn(COUNSELLING_SESSION_STATUSES)
  status?: (typeof COUNSELLING_SESSION_STATUSES)[number];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  outcome_summary?: string;
}

export class CreateCounsellingNoteDto {
  @IsIn(COUNSELLING_NOTE_VISIBILITIES)
  visibility!: CounsellingNoteVisibility;

  @IsString()
  note!: string;

  @IsOptional()
  @IsString()
  safe_summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risk_indicators?: string[];
}

export class CreateImprovementPlanDto {
  @IsUUID()
  student_id!: string;

  @IsOptional()
  @IsUUID()
  referral_id?: string;

  @IsOptional()
  @IsUUID()
  session_id?: string;

  @IsString()
  title!: string;

  @IsString()
  goal!: string;

  @IsISO8601()
  review_date!: string;

  @IsOptional()
  @IsString()
  parent_involvement_plan?: string;

  @IsOptional()
  @IsArray()
  steps?: Array<{
    title: string;
    due_at?: string;
  }>;
}

export class UpdateImprovementStepProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent!: number;

  @IsOptional()
  @IsString()
  observation?: string;
}
