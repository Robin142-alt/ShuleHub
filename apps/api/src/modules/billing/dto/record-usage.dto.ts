import { Transform } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RecordUsageDto {
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  feature_key!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  quantity!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(128)
  idempotency_key!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T.+Z$/)
  recorded_at?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
