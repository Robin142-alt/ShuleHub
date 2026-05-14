import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import type { CreateTimetableSlotDto, PublishTimetableVersionDto } from '../dto/timetable.dto';

export interface TimetableConflict {
  type: 'teacher' | 'class' | 'room';
  slot_id: string;
}

export interface TimetableVersionRecord {
  id: string;
  tenant_id: string;
  academic_year: string;
  term_name: string;
  status: string;
  immutable: boolean;
}

@Injectable()
export class TimetableRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findSlotConflicts(
    tenantId: string,
    input: CreateTimetableSlotDto,
  ): Promise<TimetableConflict[]> {
    const result = await this.databaseService.query<TimetableConflict>(
      `
        SELECT 'teacher' AS type, id::text AS slot_id
        FROM timetable_slots
        WHERE tenant_id = $1
          AND academic_year = $2
          AND term_name = $3
          AND day_of_week = $4
          AND teacher_id = $5
          AND status <> 'cancelled'
          AND starts_at < $7::time
          AND ends_at > $6::time
        UNION ALL
        SELECT 'class' AS type, id::text AS slot_id
        FROM timetable_slots
        WHERE tenant_id = $1
          AND academic_year = $2
          AND term_name = $3
          AND day_of_week = $4
          AND class_section_id = $8
          AND status <> 'cancelled'
          AND starts_at < $7::time
          AND ends_at > $6::time
        UNION ALL
        SELECT 'room' AS type, id::text AS slot_id
        FROM timetable_slots
        WHERE tenant_id = $1
          AND academic_year = $2
          AND term_name = $3
          AND day_of_week = $4
          AND room_id IS NOT NULL
          AND room_id = $9
          AND status <> 'cancelled'
          AND starts_at < $7::time
          AND ends_at > $6::time
      `,
      [
        tenantId,
        input.academic_year,
        input.term_name,
        input.day_of_week,
        input.teacher_id,
        input.starts_at,
        input.ends_at,
        input.class_section_id,
        input.room_id ?? null,
      ],
    );

    return result.rows;
  }

  async findVersionConflicts(tenantId: string, input: PublishTimetableVersionDto) {
    const result = await this.databaseService.query<{ conflict_count: number }>(
      `
        SELECT COUNT(*)::int AS conflict_count
        FROM timetable_slots left_slot
        JOIN timetable_slots right_slot
          ON right_slot.tenant_id = left_slot.tenant_id
         AND right_slot.id <> left_slot.id
         AND right_slot.academic_year = left_slot.academic_year
         AND right_slot.term_name = left_slot.term_name
         AND right_slot.day_of_week = left_slot.day_of_week
         AND right_slot.starts_at < left_slot.ends_at
         AND right_slot.ends_at > left_slot.starts_at
         AND (
           right_slot.teacher_id = left_slot.teacher_id
           OR right_slot.class_section_id = left_slot.class_section_id
           OR (right_slot.room_id IS NOT NULL AND right_slot.room_id = left_slot.room_id)
         )
        WHERE left_slot.tenant_id = $1
          AND left_slot.academic_year = $2
          AND left_slot.term_name = $3
          AND left_slot.status <> 'cancelled'
      `,
      [tenantId, input.academic_year, input.term_name],
    );

    return Number(result.rows[0]?.conflict_count ?? 0) > 0
      ? [{ type: 'version', slot_id: 'conflict' }]
      : [];
  }

  async createSlot(input: CreateTimetableSlotDto & {
    tenant_id: string;
    created_by_user_id: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO timetable_slots (
          tenant_id,
          academic_year,
          term_name,
          class_section_id,
          subject_id,
          teacher_id,
          room_id,
          day_of_week,
          starts_at,
          ends_at,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::time, $10::time, $11)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.academic_year,
        input.term_name,
        input.class_section_id,
        input.subject_id,
        input.teacher_id,
        input.room_id ?? null,
        input.day_of_week,
        input.starts_at,
        input.ends_at,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async publishVersion(input: PublishTimetableVersionDto & {
    tenant_id: string;
    published_by_user_id: string | null;
  }): Promise<TimetableVersionRecord> {
    const result = await this.databaseService.query<TimetableVersionRecord>(
      `
        INSERT INTO timetable_versions (
          tenant_id,
          academic_year,
          term_name,
          status,
          immutable,
          notes,
          published_by_user_id,
          published_at
        )
        VALUES ($1, $2, $3, 'published', TRUE, $4, $5, NOW())
        ON CONFLICT (tenant_id, academic_year, term_name, status)
        DO UPDATE SET
          immutable = TRUE,
          notes = EXCLUDED.notes,
          published_by_user_id = EXCLUDED.published_by_user_id,
          published_at = NOW(),
          updated_at = NOW()
        RETURNING id::text, tenant_id, academic_year, term_name, status, immutable
      `,
      [
        input.tenant_id,
        input.academic_year,
        input.term_name,
        input.notes ?? null,
        input.published_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async listPublishedSchedules(input: {
    tenant_id: string;
    academic_year?: string;
    term_name?: string;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT
          version.id::text AS version_id,
          version.academic_year,
          version.term_name,
          version.published_at::text,
          slot.id::text AS slot_id,
          slot.class_section_id,
          slot.subject_id,
          slot.teacher_id,
          slot.room_id,
          slot.day_of_week,
          slot.starts_at::text,
          slot.ends_at::text,
          slot.status
        FROM timetable_versions version
        JOIN timetable_slots slot
          ON slot.tenant_id = version.tenant_id
         AND slot.academic_year = version.academic_year
         AND slot.term_name = version.term_name
         AND slot.status <> 'cancelled'
        WHERE version.tenant_id = $1
          AND version.status = 'published'
          AND ($2::text IS NULL OR version.academic_year = $2)
          AND ($3::text IS NULL OR version.term_name = $3)
        ORDER BY version.published_at DESC NULLS LAST, slot.day_of_week, slot.starts_at, slot.class_section_id
        LIMIT 500
      `,
      [input.tenant_id, input.academic_year ?? null, input.term_name ?? null],
    );

    return result.rows;
  }

  async appendAuditLog(input: {
    tenant_id: string;
    version_id?: string | null;
    slot_id?: string | null;
    actor_user_id?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO timetable_audit_logs (
          tenant_id,
          version_id,
          slot_id,
          actor_user_id,
          action,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        input.tenant_id,
        input.version_id ?? null,
        input.slot_id ?? null,
        input.actor_user_id ?? null,
        input.action,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
