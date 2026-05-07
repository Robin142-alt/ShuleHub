import { BadRequestException, Injectable } from '@nestjs/common';

import { AttendanceRecordsRepository } from '../repositories/attendance-records.repository';
import { SyncOperationLogsRepository } from '../repositories/sync-operation-logs.repository';
import {
  AttendanceRecordState,
  AttendanceSyncPayload,
  SyncPushOperationInput,
  SyncPushOperationResult,
} from '../sync.types';

@Injectable()
export class AttendanceSyncConflictResolverService {
  constructor(
    private readonly attendanceRecordsRepository: AttendanceRecordsRepository,
    private readonly syncOperationLogsRepository: SyncOperationLogsRepository,
  ) {}

  async applyOperation(
    tenantId: string,
    deviceId: string,
    operation: SyncPushOperationInput<'attendance'>,
  ): Promise<SyncPushOperationResult<'attendance'>> {
    try {
      const payload = this.normalizePayload(operation.payload, operation.version);
      const existingRecord = await this.attendanceRecordsRepository.lockByStudentAndDate(
        tenantId,
        payload.student_id,
        payload.attendance_date,
      );

      if (
        existingRecord &&
        !this.shouldReplaceExistingRecord(existingRecord, payload, operation.op_id)
      ) {
        return {
          op_id: operation.op_id,
          entity: operation.entity,
          status: 'rejected',
          client_version: operation.version,
          server_version: existingRecord.sync_version,
          reason: 'Attendance record has a newer server state',
          conflict_policy: 'last-write-wins',
          server_state: this.toAttendanceRecordState(existingRecord),
        };
      }

      const syncOperation = await this.syncOperationLogsRepository.createOperation({
        op_id: operation.op_id,
        tenant_id: tenantId,
        device_id: deviceId,
        entity: 'attendance',
        payload: {
          ...payload,
          client_version: operation.version,
          source: 'device',
        },
      });
      const updatedRecord = await this.attendanceRecordsRepository.upsertRecord({
        id: payload.record_id,
        tenant_id: tenantId,
        student_id: payload.student_id,
        attendance_date: payload.attendance_date,
        status: payload.status,
        notes: payload.notes ?? null,
        metadata: payload.metadata ?? {},
        source_device_id: deviceId,
        last_modified_at: payload.last_modified_at,
        last_operation_id: operation.op_id,
        sync_version: syncOperation.version,
      });

      return {
        op_id: operation.op_id,
        entity: operation.entity,
        status: 'applied',
        client_version: operation.version,
        server_version: syncOperation.version,
        reason: null,
        conflict_policy: 'last-write-wins',
        server_state: this.toAttendanceRecordState(updatedRecord),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid attendance sync payload';

      return {
        op_id: operation.op_id,
        entity: operation.entity,
        status: 'rejected',
        client_version: operation.version,
        server_version: null,
        reason: message,
        conflict_policy: 'last-write-wins',
        server_state: null,
      };
    }
  }

  private normalizePayload(
    payload: Record<string, unknown>,
    clientVersion: number,
  ): AttendanceSyncPayload {
    const recordId = this.requireUuid(payload.record_id, 'record_id');
    const studentId = this.requireUuid(payload.student_id, 'student_id');
    const attendanceDate = this.requireIsoDate(payload.attendance_date, 'attendance_date');
    const status = this.requireAttendanceStatus(payload.status, 'status');
    const lastModifiedAt = this.requireTimestamp(
      payload.last_modified_at,
      'last_modified_at',
    );
    const notes = this.optionalText(payload.notes);
    const metadata = this.optionalObject(payload.metadata);

    return {
      action: 'upsert',
      record_id: recordId,
      student_id: studentId,
      attendance_date: attendanceDate,
      status,
      last_modified_at: lastModifiedAt,
      notes,
      metadata,
      client_version: clientVersion,
      source: 'device',
    };
  }

  private shouldReplaceExistingRecord(
    existingRecord: AttendanceRecordState | {
      last_modified_at: Date;
      last_operation_id: string | null;
    },
    incomingPayload: AttendanceSyncPayload,
    incomingOpId: string,
  ): boolean {
    const existingTimestamp = new Date(existingRecord.last_modified_at).getTime();
    const incomingTimestamp = new Date(incomingPayload.last_modified_at).getTime();

    if (incomingTimestamp > existingTimestamp) {
      return true;
    }

    if (incomingTimestamp < existingTimestamp) {
      return false;
    }

    return incomingOpId.localeCompare(existingRecord.last_operation_id ?? '') >= 0;
  }

  private toAttendanceRecordState(
    record: {
      id: string;
      student_id: string;
      attendance_date: string;
      status: AttendanceSyncPayload['status'];
      last_modified_at: Date;
      notes: string | null;
      metadata: Record<string, unknown>;
      source_device_id: string | null;
      last_operation_id: string | null;
      sync_version: string | null;
    },
  ): AttendanceRecordState {
    return {
      record_id: record.id,
      student_id: record.student_id,
      attendance_date: record.attendance_date,
      status: record.status,
      last_modified_at: record.last_modified_at.toISOString(),
      notes: record.notes,
      metadata: record.metadata,
      source_device_id: record.source_device_id,
      last_operation_id: record.last_operation_id,
      sync_version: record.sync_version,
    };
  }

  private requireUuid(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(value.trim())) {
      throw new BadRequestException(`Attendance payload ${fieldName} must be a UUID`);
    }

    return value.trim();
  }

  private requireIsoDate(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      throw new BadRequestException(`Attendance payload ${fieldName} must be an ISO date`);
    }

    return value.trim();
  }

  private requireAttendanceStatus(
    value: unknown,
    fieldName: string,
  ): AttendanceSyncPayload['status'] {
    if (
      value !== 'present' &&
      value !== 'absent' &&
      value !== 'late' &&
      value !== 'excused'
    ) {
      throw new BadRequestException(
        `Attendance payload ${fieldName} must be one of present, absent, late, or excused`,
      );
    }

    return value;
  }

  private requireTimestamp(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`Attendance payload ${fieldName} must be a timestamp`);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Attendance payload ${fieldName} must be a valid timestamp`);
    }

    return parsed.toISOString();
  }

  private optionalText(value: unknown): string | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Attendance payload notes must be a string');
    }

    const normalizedValue = value.trim();
    return normalizedValue.length === 0 ? null : normalizedValue;
  }

  private optionalObject(value: unknown): Record<string, unknown> {
    if (value == null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Attendance payload metadata must be an object');
    }

    return value as Record<string, unknown>;
  }
}
