import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertTenantMpesaConfigDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[0-9]{5,8}$/)
  shortcode!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{5,8}$/)
  paybill_number?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{5,8}$/)
  till_number?: string;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  consumer_key!: string;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  consumer_secret!: string;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  passkey!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  initiator_name?: string;

  @Transform(trim)
  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';

  @Transform(trim)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  callback_url!: string;

  @Transform(trim)
  @IsOptional()
  @IsIn(['draft', 'active', 'inactive', 'revoked'])
  status?: 'draft' | 'active' | 'inactive' | 'revoked';

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mpesa_clearing_account_code?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fee_control_account_code?: string;
}
