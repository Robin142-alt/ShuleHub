import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  display_name?: string;
}

export class InvitationAcceptanceResponseDto {
  success!: true;
  message!: string;
  tenant_id!: string;
  email!: string;
  display_name!: string;
  role!: string;
}
