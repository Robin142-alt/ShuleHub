import { IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterApplicationDto {
  @IsString()
  admission_number!: string;

  @IsString()
  class_name!: string;

  @IsString()
  stream_name!: string;

  @IsOptional()
  @IsString()
  dormitory_name?: string;

  @IsOptional()
  @IsString()
  transport_route?: string;
}

export class UploadApplicationDocumentDto {
  @IsString()
  document_type!: string;

  @IsOptional()
  @IsString()
  uploaded_by_user_id?: string;
}

export class UpdateDocumentVerificationDto {
  @IsString()
  @IsIn(['pending', 'verified', 'rejected'])
  verification_status!: string;
}

export class CreateAllocationDto {
  @IsString()
  class_name!: string;

  @IsString()
  stream_name!: string;

  @IsOptional()
  @IsString()
  dormitory_name?: string;

  @IsOptional()
  @IsString()
  transport_route?: string;

  @IsOptional()
  @IsString()
  effective_from?: string;
}

export class CreateTransferRecordDto {
  @IsOptional()
  @IsString()
  student_id?: string;

  @IsOptional()
  @IsString()
  application_id?: string;

  @IsString()
  transfer_type!: string;

  @IsString()
  school_name!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  requested_on?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
