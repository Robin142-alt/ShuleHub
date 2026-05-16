import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SMS_PROVIDER_CODES = ['textsms_kenya', 'africas_talking', 'twilio'] as const;
const DARAJA_ENVIRONMENTS = ['sandbox', 'production'] as const;

export class CreatePlatformSmsProviderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider_name!: string;

  @IsIn(SMS_PROVIDER_CODES)
  provider_code!: 'textsms_kenya' | 'africas_talking' | 'twilio';

  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  username?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  sender_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  base_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdatePlatformSmsProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  sender_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  base_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class AdjustSchoolSmsWalletDto {
  @IsInt()
  quantity!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class SendSmsDto {
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  recipient!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  message_type?: string;
}

export class CreateSmsPurchaseRequestDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SaveDarajaIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  paybill_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  till_number?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  shortcode!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(512)
  consumer_key!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(512)
  consumer_secret!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(1024)
  passkey!: string;

  @IsIn(DARAJA_ENVIRONMENTS)
  environment!: 'sandbox' | 'production';

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class RequestParentOtpDto {
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  identifier!: string;
}

export class VerifyParentOtpDto {
  @IsString()
  @MinLength(12)
  @MaxLength(80)
  challenge_id!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  otp_code!: string;
}
