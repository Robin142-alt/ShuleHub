import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListLibraryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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

export class CreateLibraryMemberDto {
  @IsString()
  member_type!: 'student' | 'teacher' | 'staff';

  @IsString()
  admission_or_staff_no!: string;

  @IsString()
  full_name!: string;

  @IsString()
  class_or_department!: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class IssueLibraryBookDto {
  @IsUUID()
  member_id!: string;

  @IsUUID()
  book_id!: string;

  @IsDateString()
  due_date!: string;

  @IsOptional()
  @IsString()
  submission_id?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReturnLibraryBookDto {
  @IsUUID()
  borrowing_id!: string;

  @IsString()
  condition!: 'good' | 'damaged' | 'lost';

  @IsOptional()
  @IsDateString()
  returned_at?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fine_per_overdue_day?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateLibraryFineDto {
  @IsString()
  status!: 'pending' | 'paid' | 'waived';

  @IsOptional()
  @IsString()
  notes?: string;
}
