import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { FeeStructureStatus } from '../entities/fee-structure.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class FeeStructureLineItemDto {
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  code!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  label!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  amount_minor!: string;
}

export class CreateFeeStructureDto {
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(24)
  academic_year!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  term!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(80)
  grade_level!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  class_name?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: FeeStructureStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  due_days?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureLineItemDto)
  line_items!: FeeStructureLineItemDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
