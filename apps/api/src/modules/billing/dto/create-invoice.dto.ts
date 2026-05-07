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

export class CreateInvoiceDto {
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  description!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  total_amount_minor!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T.+Z$/)
  due_at?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  billing_phone_number?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
