import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const INVITABLE_ROLES = [
  'principal',
  'bursar',
  'teacher',
  'storekeeper',
  'librarian',
  'parent',
  'admin',
] as const;

export class CreateInvitationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  display_name!: string;

  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];

  @IsOptional()
  @IsString()
  base_url?: string;
}
