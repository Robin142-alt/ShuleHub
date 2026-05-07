import { BaseEntity } from '../../../database/entities/base.entity';
import { AttendanceSyncPayload } from '../sync.types';

export class AttendanceRecordEntity extends BaseEntity {
  student_id!: string;
  attendance_date!: string;
  status!: AttendanceSyncPayload['status'];
  notes!: string | null;
  metadata!: Record<string, unknown>;
  source_device_id!: string | null;
  last_modified_at!: Date;
  last_operation_id!: string | null;
  sync_version!: string | null;
}
