import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { UsageMeterService } from '../billing/usage-meter.service';
import { SyncOperationLogService } from '../sync/sync-operation-log.service';
import { AttendanceRecordsRepository } from '../sync/repositories/attendance-records.repository';
import { AttendanceRecordResponseDto } from './dto/attendance-record-response.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { UpsertAttendanceRecordDto } from './dto/upsert-attendance-record.dto';
import { StudentsRepository } from './repositories/students.repository';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly studentsRepository: StudentsRepository,
    private readonly attendanceRecordsRepository: AttendanceRecordsRepository,
    private readonly syncOperationLogService: SyncOperationLogService,
    private readonly usageMeterService: UsageMeterService,
  ) {}

  async upsertStudentAttendance(
    studentId: string,
    attendanceDate: string,
    dto: UpsertAttendanceRecordDto,
  ): Promise<AttendanceRecordResponseDto> {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      await this.requireStudent(tenantId, studentId);

      const normalizedDate = this.requireIsoDate(attendanceDate, 'attendanceDate');
      const lastModifiedAt = this.resolveTimestamp(dto.last_modified_at);
      const existingRecord = await this.attendanceRecordsRepository.lockByStudentAndDate(
        tenantId,
        studentId,
        normalizedDate,
      );
      const operationId = randomUUID();

      if (
        existingRecord &&
        !this.shouldReplaceExistingRecord(existingRecord, lastModifiedAt, operationId)
      ) {
        return this.mapAttendanceRecord(existingRecord);
      }

      const recordId = existingRecord?.id ?? randomUUID();
      const payload = {
        action: 'upsert' as const,
        record_id: recordId,
        student_id: studentId,
        attendance_date: normalizedDate,
        status: dto.status,
        last_modified_at: lastModifiedAt,
        notes: dto.notes?.trim() || null,
        metadata: dto.metadata ?? {},
        source: 'server' as const,
      };
      const operation = await this.syncOperationLogService.recordServerOperation(
        'attendance',
        payload,
        tenantId,
        operationId,
      );
      const record = await this.attendanceRecordsRepository.upsertRecord({
        id: recordId,
        tenant_id: tenantId,
        student_id: studentId,
        attendance_date: normalizedDate,
        status: dto.status,
        notes: payload.notes,
        metadata: payload.metadata,
        source_device_id: 'server',
        last_modified_at: lastModifiedAt,
        last_operation_id: operation.op_id,
        sync_version: operation.version,
      });
      await this.usageMeterService.recordUsage({
        feature_key: 'attendance.upserts',
        quantity: '1',
        idempotency_key: `attendance:upsert:${operation.op_id}`,
        metadata: {
          student_id: studentId,
          attendance_date: normalizedDate,
          attendance_record_id: record.id,
        },
      });

      return this.mapAttendanceRecord(record);
    });
  }

  async listStudentAttendance(
    studentId: string,
    query: ListAttendanceQueryDto,
  ): Promise<AttendanceRecordResponseDto[]> {
    const tenantId = this.requireTenantId();
    await this.requireStudent(tenantId, studentId);

    const records = await this.attendanceRecordsRepository.listByStudentAndDateRange(
      tenantId,
      studentId,
      query.from,
      query.to,
      query.limit ?? 90,
    );

    return records.map((record) => this.mapAttendanceRecord(record));
  }

  private async requireStudent(tenantId: string, studentId: string): Promise<void> {
    const student = await this.studentsRepository.findById(tenantId, studentId);

    if (!student) {
      throw new NotFoundException(`Student "${studentId}" was not found`);
    }
  }

  private mapAttendanceRecord(record: {
    id: string;
    tenant_id: string;
    student_id: string;
    attendance_date: string;
    status: string;
    notes: string | null;
    metadata: Record<string, unknown>;
    source_device_id: string | null;
    last_modified_at: Date;
    last_operation_id: string | null;
    sync_version: string | null;
    created_at: Date;
    updated_at: Date;
  }): AttendanceRecordResponseDto {
    return Object.assign(new AttendanceRecordResponseDto(), {
      id: record.id,
      tenant_id: record.tenant_id,
      student_id: record.student_id,
      attendance_date: record.attendance_date,
      status: record.status,
      notes: record.notes,
      metadata: record.metadata,
      source_device_id: record.source_device_id,
      last_modified_at: record.last_modified_at.toISOString(),
      last_operation_id: record.last_operation_id,
      sync_version: record.sync_version,
      created_at: record.created_at.toISOString(),
      updated_at: record.updated_at.toISOString(),
    });
  }

  private resolveTimestamp(value?: string): string {
    if (!value) {
      return new Date().toISOString();
    }

    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new BadRequestException(`Invalid attendance timestamp "${value}"`);
    }

    return parsedValue.toISOString();
  }

  private requireIsoDate(value: string, fieldName: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`Invalid ${fieldName} "${value}"`);
    }

    return value;
  }

  private shouldReplaceExistingRecord(
    existingRecord: {
      last_modified_at: Date;
      last_operation_id: string | null;
    },
    incomingLastModifiedAt: string,
    incomingOperationId: string,
  ): boolean {
    const existingTimestamp = existingRecord.last_modified_at.getTime();
    const incomingTimestamp = new Date(incomingLastModifiedAt).getTime();

    if (incomingTimestamp > existingTimestamp) {
      return true;
    }

    if (incomingTimestamp < existingTimestamp) {
      return false;
    }

    return incomingOperationId.localeCompare(existingRecord.last_operation_id ?? '') >= 0;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for attendance operations');
    }

    return tenantId;
  }
}
