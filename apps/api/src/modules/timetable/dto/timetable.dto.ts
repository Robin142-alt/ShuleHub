import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateTimetableSlotDto {
  @IsString()
  academic_year!: string;

  @IsString()
  term_name!: string;

  @IsString()
  class_section_id!: string;

  @IsString()
  subject_id!: string;

  @IsString()
  teacher_id!: string;

  @IsOptional()
  @IsString()
  room_id?: string;

  @IsInt()
  @Min(1)
  @Max(7)
  day_of_week!: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  starts_at!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  ends_at!: string;
}

export class PublishTimetableVersionDto {
  @IsString()
  academic_year!: string;

  @IsString()
  term_name!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
