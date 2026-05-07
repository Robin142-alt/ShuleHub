import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { AttendanceRecordEntity } from '../entities/attendance-record.entity';

interface AttendanceRecordRow {
  id: string;
  tenant_id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceRecordEntity['status'];
  notes: string | null;
  metadata: Record<string, unknown> | null;
  source_device_id: string | null;
  last_modified_at: Date;
  last_operation_id: string | null;
  sync_version: string | null;
  created_at: Date;
  updated_at: Date;
}

interface UpsertAttendanceRecordInput {
  id: string;
  tenant_id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceRecordEntity['status'];
  notes: string | null;
  metadata: Record<string, unknown>;
  source_device_id: string | null;
  last_modified_at: string;
  last_operation_id: string;
  sync_version: string;
}

@Injectable()
export class AttendanceRecordsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async lockById(
    tenantId: string,
    recordId: string,
  ): Promise<AttendanceRecordEntity | null> {
    const result = await this.databaseService.query<AttendanceRecordRow>(
      `
        SELECT
          id,
          tenant_id,
          student_id,
          attendance_date::text,
          status,
          notes,
          metadata,
          source_device_id,
          last_modified_at,
          last_operation_id,
          sync_version::text,
          created_at,
          updated_at
        FROM attendance_records
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, recordId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async lockByStudentAndDate(
    tenantId: string,
    studentId: string,
    attendanceDate: string,
  ): Promise<AttendanceRecordEntity | null> {
    const result = await this.databaseService.query<AttendanceRecordRow>(
      `
        SELECT
          id,
          tenant_id,
          student_id,
          attendance_date::text,
          status,
          notes,
          metadata,
          source_device_id,
          last_modified_at,
          last_operation_id,
          sync_version::text,
          created_at,
          updated_at
        FROM attendance_records
        WHERE tenant_id = $1
          AND student_id = $2::uuid
          AND attendance_date = $3::date
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, studentId, attendanceDate],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async upsertRecord(input: UpsertAttendanceRecordInput): Promise<AttendanceRecordEntity> {
    const result = await this.databaseService.query<AttendanceRecordRow>(
      `
        INSERT INTO attendance_records (
          id,
          tenant_id,
          student_id,
          attendance_date,
          status,
          notes,
          metadata,
          source_device_id,
          last_modified_at,
          last_operation_id,
          sync_version
        )
        VALUES (
          $1::uuid,
          $2,
          $3::uuid,
          $4::date,
          $5,
          $6,
          $7::jsonb,
          $8,
          $9::timestamptz,
          $10::uuid,
          $11::bigint
        )
        ON CONFLICT (tenant_id, student_id, attendance_date)
        DO UPDATE SET
          student_id = EXCLUDED.student_id,
          attendance_date = EXCLUDED.attendance_date,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          metadata = EXCLUDED.metadata,
          source_device_id = EXCLUDED.source_device_id,
          last_modified_at = EXCLUDED.last_modified_at,
          last_operation_id = EXCLUDED.last_operation_id,
          sync_version = EXCLUDED.sync_version,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          student_id,
          attendance_date::text,
          status,
          notes,
          metadata,
          source_device_id,
          last_modified_at,
          last_operation_id,
          sync_version::text,
          created_at,
          updated_at
      `,
      [
        input.id,
        input.tenant_id,
        input.student_id,
        input.attendance_date,
        input.status,
        input.notes,
        JSON.stringify(input.metadata ?? {}),
        input.source_device_id,
        input.last_modified_at,
        input.last_operation_id,
        input.sync_version,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async listByStudentAndDateRange(
    tenantId: string,
    studentId: string,
    dateFrom?: string,
    dateTo?: string,
    limit = 100,
  ): Promise<AttendanceRecordEntity[]> {
    const conditions = ['tenant_id = $1', 'student_id = $2::uuid'];
    const values: unknown[] = [tenantId, studentId];
    let parameterIndex = values.length + 1;

    if (dateFrom) {
      conditions.push(`attendance_date >= $${parameterIndex}::date`);
      values.push(dateFrom);
      parameterIndex += 1;
    }

    if (dateTo) {
      conditions.push(`attendance_date <= $${parameterIndex}::date`);
      values.push(dateTo);
      parameterIndex += 1;
    }

    values.push(limit);
    const query = `
      SELECT
        id,
        tenant_id,
        student_id,
        attendance_date::text,
        status,
        notes,
        metadata,
        source_device_id,
        last_modified_at,
        last_operation_id,
        sync_version::text,
        created_at,
        updated_at
      FROM attendance_records
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY attendance_date DESC, updated_at DESC
      LIMIT $${parameterIndex}
    `;
    const result = await this.databaseService.query<AttendanceRecordRow>(query, values);

    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: AttendanceRecordRow): AttendanceRecordEntity {
    return Object.assign(new AttendanceRecordEntity(), {
      ...row,
      attendance_date: row.attendance_date,
      metadata: row.metadata ?? {},
      sync_version: row.sync_version,
    });
  }
}
