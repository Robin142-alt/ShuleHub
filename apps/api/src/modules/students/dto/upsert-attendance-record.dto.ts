import { Transform } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertAttendanceRecordDto {
  @Transform(trim)
  @IsString()
  @IsIn(['present', 'absent', 'late', 'excused'])
  status!: 'present' | 'absent' | 'late' | 'excused';

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T.+Z$/)
  last_modified_at?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
