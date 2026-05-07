import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDeviceDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  device_id!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  platform!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  app_version?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
