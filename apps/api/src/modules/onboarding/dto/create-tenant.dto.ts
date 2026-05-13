import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  school_name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(48)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
  subdomain!: string;

  @IsEmail()
  contact_email!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(240)
  address!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  county!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  plan!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  student_limit!: number;

  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  base_url?: string;
}
