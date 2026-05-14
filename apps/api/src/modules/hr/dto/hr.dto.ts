import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ApproveStaffContractDto {
  @IsString()
  staff_profile_id!: string;

  @IsString()
  role_title!: string;

  @IsString()
  employment_type!: string;

  @IsString()
  workload!: string;

  @IsString()
  starts_on!: string;

  @IsOptional()
  @IsString()
  ends_on?: string;

  @IsIn(['draft', 'approved'])
  approval_state!: 'draft' | 'approved';
}

export class ApproveLeaveRequestDto {
  @IsString()
  staff_profile_id!: string;

  @IsString()
  leave_type!: string;

  @IsNumber()
  @Min(0.5)
  requested_days!: number;

  @IsOptional()
  @IsString()
  override_reason?: string;
}

export class ChangeStaffStatusDto {
  @IsString()
  staff_profile_id!: string;

  @IsIn(['active', 'on_leave', 'suspended', 'exited'])
  status!: 'active' | 'on_leave' | 'suspended' | 'exited';

  @IsString()
  reason!: string;
}
