import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class VerifyMfaChallengeDto {
  @IsString()
  @Length(6, 12)
  code!: string;

  @IsOptional()
  @IsBoolean()
  trust_device?: boolean;
}
