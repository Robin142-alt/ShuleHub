import { IsString, MinLength } from 'class-validator';

export class TrustedDeviceTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;
}
