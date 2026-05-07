import { Transform } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePaymentIntentDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotency_key!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  amount_minor!: string;

  @Transform(trim)
  @IsString()
  @MinLength(9)
  @MaxLength(16)
  phone_number!: string;

  @Transform(trim)
  @IsOptional()
  @IsUUID()
  student_id?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  account_reference!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  transaction_desc!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  external_reference?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
