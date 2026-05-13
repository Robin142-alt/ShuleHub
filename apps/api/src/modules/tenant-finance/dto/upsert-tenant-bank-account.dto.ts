import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertTenantBankAccountDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  bank_name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  branch_name?: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  account_name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  account_number!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Transform(trim)
  @IsOptional()
  @IsIn(['draft', 'active', 'inactive', 'revoked'])
  status?: 'draft' | 'active' | 'inactive' | 'revoked';
}
