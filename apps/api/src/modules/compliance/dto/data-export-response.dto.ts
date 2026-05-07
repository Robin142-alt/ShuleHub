import { ConsentRecordResponseDto } from './consent-record-response.dto';

export class ExportedUserDto {
  user_id!: string;
  email!: string;
  display_name!: string;
  status!: string;
  created_at!: string;
  updated_at!: string;
}

export class ExportedMembershipDto {
  tenant_id!: string;
  role_code!: string;
  role_name!: string;
  status!: string;
  created_at!: string;
  updated_at!: string;
}

export class DataExportResponseDto {
  generated_at!: string;
  user!: ExportedUserDto;
  membership!: ExportedMembershipDto;
  consents!: ConsentRecordResponseDto[];
}
