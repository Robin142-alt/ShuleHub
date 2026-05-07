export class ConsentRecordResponseDto {
  id!: string;
  tenant_id!: string;
  consent_type!: string;
  status!: 'granted' | 'revoked' | 'withdrawn';
  policy_version!: string;
  metadata!: Record<string, unknown>;
  captured_at!: string;
  created_at!: string;
  updated_at!: string;
}
