import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export const SUPPORT_CATEGORIES = [
  'Finance',
  'MPESA',
  'Exams',
  'Timetable',
  'Inventory',
  'Library',
  'Login Issues',
  'Subscription',
  'Reports',
  'Performance',
  'Bug Report',
  'Feature Request',
] as const;

export const SUPPORT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const SUPPORT_STATUSES = [
  'Open',
  'In Progress',
  'Waiting for School',
  'Escalated',
  'Resolved',
  'Closed',
] as const;

export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export class ListSupportTicketsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tenant_id?: string;

  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: SupportPriority;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateSupportTicketDto {
  @IsString()
  subject!: string;

  @IsString()
  category!: string;

  @IsIn(SUPPORT_PRIORITIES)
  priority!: SupportPriority;

  @IsString()
  module_affected!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  browser?: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  current_page_url?: string;

  @IsOptional()
  @IsString()
  app_version?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  error_logs?: string[];
}

export class CreateSupportMessageDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  next_status?: SupportStatus;
}

export class CreateInternalNoteDto {
  @IsString()
  note!: string;
}

export class UpdateTicketStatusDto {
  @IsIn(SUPPORT_STATUSES)
  status!: SupportStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignTicketDto {
  @IsUUID()
  assigned_agent_id!: string;
}

export class MergeTicketsDto {
  @IsUUID()
  target_ticket_id!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UploadTicketAttachmentDto {
  @IsOptional()
  @IsString()
  message_id?: string;

  @IsOptional()
  @IsString()
  internal_note_id?: string;
}

export class KnowledgeBaseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
