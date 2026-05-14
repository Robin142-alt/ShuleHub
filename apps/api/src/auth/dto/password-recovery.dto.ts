import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const AUTH_RECOVERY_AUDIENCES = ['superadmin', 'school', 'portal'] as const;

export class RequestPasswordRecoveryDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(AUTH_RECOVERY_AUDIENCES)
  audience?: 'superadmin' | 'school' | 'portal';
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class AuthActionResponseDto {
  success!: true;
  message!: string;
}
