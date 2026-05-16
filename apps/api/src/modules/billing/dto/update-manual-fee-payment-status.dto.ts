import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateManualFeePaymentStatusDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T.+Z$/)
  occurred_at?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(96)
  deposit_reference?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
