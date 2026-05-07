import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBillingPaymentIntentDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotency_key!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone_number?: string;
}
