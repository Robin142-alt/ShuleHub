import { IsOptional, IsString } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  full_name!: string;

  @IsString()
  date_of_birth!: string;

  @IsString()
  gender!: string;

  @IsString()
  birth_certificate_number!: string;

  @IsString()
  nationality!: string;

  @IsOptional()
  @IsString()
  previous_school?: string;

  @IsOptional()
  @IsString()
  kcpe_results?: string;

  @IsOptional()
  @IsString()
  cbc_level?: string;

  @IsString()
  class_applying!: string;

  @IsString()
  parent_name!: string;

  @IsString()
  parent_phone!: string;

  @IsOptional()
  @IsString()
  parent_email?: string;

  @IsOptional()
  @IsString()
  parent_occupation?: string;

  @IsString()
  relationship!: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  conditions?: string;

  @IsOptional()
  @IsString()
  emergency_contact?: string;
}

export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  review_notes?: string;

  @IsOptional()
  @IsString()
  interview_date?: string;
}
