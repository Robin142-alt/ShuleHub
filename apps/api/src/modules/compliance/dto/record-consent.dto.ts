import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RecordConsentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  consent_type!: string;

  @IsString()
  @IsIn(['granted', 'revoked', 'withdrawn'])
  status!: 'granted' | 'revoked' | 'withdrawn';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  policy_version!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
