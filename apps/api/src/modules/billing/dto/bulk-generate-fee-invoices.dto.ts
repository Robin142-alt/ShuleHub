import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class BulkFeeInvoiceStudentDto {
  @Transform(trim)
  @IsUUID()
  student_id!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(160)
  student_name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  admission_number?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  class_name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  guardian_phone?: string;
}

export class BulkGenerateFeeInvoicesDto {
  @Transform(trim)
  @IsOptional()
  @IsUUID()
  fee_structure_id?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  idempotency_key!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T.+Z$/)
  due_at?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkFeeInvoiceStudentDto)
  target_students!: BulkFeeInvoiceStudentDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
