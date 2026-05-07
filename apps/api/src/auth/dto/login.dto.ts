import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
