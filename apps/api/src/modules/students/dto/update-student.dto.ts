import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateStudentDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  admission_number?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  first_name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  last_name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  middle_name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_of_birth?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsIn(['male', 'female', 'other', 'undisclosed'])
  gender?: 'male' | 'female' | 'other' | 'undisclosed';

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'graduated', 'transferred'])
  status?: 'active' | 'inactive' | 'graduated' | 'transferred';

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  primary_guardian_name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  primary_guardian_phone?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
