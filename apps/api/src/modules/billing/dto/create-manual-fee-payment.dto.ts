import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ManualFeePaymentMethod } from '../entities/manual-fee-payment.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const paymentMethods: ManualFeePaymentMethod[] = ['cash', 'cheque', 'bank_deposit', 'eft'];

export class CreateManualFeePaymentDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotency_key!: string;

  @Transform(trim)
  @IsString()
  @IsIn(paymentMethods)
  payment_method!: ManualFeePaymentMethod;

  @Transform(trim)
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  amount_minor!: string;

  @Transform(trim)
  @IsOptional()
  @IsUUID()
  student_id?: string;

  @Transform(trim)
  @IsOptional()
  @IsUUID()
  invoice_id?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(96)
  payer_name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T.+Z$/)
  received_at?: string;

  @Transform(trim)
  @ValidateIf((value: CreateManualFeePaymentDto) => value.payment_method === 'cheque')
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  cheque_number?: string;

  @Transform(trim)
  @ValidateIf((value: CreateManualFeePaymentDto) => value.payment_method === 'cheque')
  @IsString()
  @MinLength(2)
  @MaxLength(96)
  drawer_bank?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(96)
  deposit_reference?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(96)
  external_reference?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(48)
  asset_account_code?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(48)
  fee_control_account_code?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
