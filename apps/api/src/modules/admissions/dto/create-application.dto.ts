import { IsOptional, IsString, Matches } from 'class-validator';

const NON_BLANK_TEXT = /\S/;

export class CreateApplicationDto {
  @IsString()
  @Matches(NON_BLANK_TEXT)
  full_name!: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
  date_of_birth!: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
  gender!: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
  birth_certificate_number!: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
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
  @Matches(NON_BLANK_TEXT)
  class_applying!: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
  parent_name!: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
  parent_phone!: string;

  @IsOptional()
  @IsString()
  parent_email?: string;

  @IsOptional()
  @IsString()
  parent_occupation?: string;

  @IsString()
  @Matches(NON_BLANK_TEXT)
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
