export class DeviceRegistrationResponseDto {
  id!: string;
  tenant_id!: string;
  device_id!: string;
  platform!: string;
  app_version!: string | null;
  metadata!: Record<string, unknown>;
  last_seen_at!: string;
  last_push_at!: string | null;
  last_pull_at!: string | null;
  created_at!: string;
  updated_at!: string;
}
