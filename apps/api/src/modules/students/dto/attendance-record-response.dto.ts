export class AttendanceRecordResponseDto {
  id!: string;
  tenant_id!: string;
  student_id!: string;
  attendance_date!: string;
  status!: string;
  notes!: string | null;
  metadata!: Record<string, unknown>;
  source_device_id!: string | null;
  last_modified_at!: string;
  last_operation_id!: string | null;
  sync_version!: string | null;
  created_at!: string;
  updated_at!: string;
}
