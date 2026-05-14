import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  school_name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  tenant_id!: string;

  @IsEmail()
  admin_email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  admin_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  county?: string;
}

export type PlatformSchoolResponseDto = {
  tenant_id: string;
  school_name: string;
  subdomain: string;
  status: 'active' | 'inactive';
  invitation_sent: boolean;
  admin_email: string;
  created_at: string;
};
