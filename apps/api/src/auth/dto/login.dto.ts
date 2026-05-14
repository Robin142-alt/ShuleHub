import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const AUTH_AUDIENCES = ['superadmin', 'school', 'portal'] as const;

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsIn(AUTH_AUDIENCES)
  audience?: 'superadmin' | 'school' | 'portal';

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  mfa_code?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  trusted_device_token?: string;

  @IsOptional()
  @IsBoolean()
  trust_device?: boolean;
}
