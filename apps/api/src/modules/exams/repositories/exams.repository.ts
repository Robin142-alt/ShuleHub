import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class ExamsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createSeries(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO exam_series (
          tenant_id,
          academic_term_id,
          name,
          starts_on,
          ends_on,
          created_by_user_id
        )
        VALUES ($1, $2::uuid, $3, $4::date, $5::date, $6::uuid)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.academic_term_id,
        input.name,
        input.starts_on,
        input.ends_on,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async createAssessment(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO exam_assessments (
          tenant_id,
          exam_series_id,
          subject_id,
          name,
          max_score,
          weight,
          created_by_user_id
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5::numeric, $6::numeric, $7::uuid)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.exam_series_id,
        input.subject_id,
        input.name,
        input.max_score,
        input.weight,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async findTeacherAssignment(input: {
    tenant_id: string;
    teacher_user_id: string;
    academic_term_id: string;
    class_section_id: string;
    subject_id: string;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM teacher_subject_assignments
        WHERE tenant_id = $1
          AND teacher_user_id = $2::uuid
          AND academic_term_id = $3::uuid
          AND class_section_id = $4::uuid
          AND subject_id = $5::uuid
          AND status = 'active'
        LIMIT 1
      `,
      [
        input.tenant_id,
        input.teacher_user_id,
        input.academic_term_id,
        input.class_section_id,
        input.subject_id,
      ],
    );

    return result.rows[0] ?? null;
  }

  async findSeriesState(input: { tenant_id: string; exam_series_id: string }) {
    const result = await this.databaseService.query(
      `
        SELECT id, status, locked_at::text, published_at::text
        FROM exam_series
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [input.tenant_id, input.exam_series_id],
    );

    return result.rows[0] ?? null;
  }

  async upsertMark(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO exam_marks (
          tenant_id,
          exam_series_id,
          assessment_id,
          academic_term_id,
          class_section_id,
          subject_id,
          student_id,
          score,
          remarks,
          entered_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::uuid,
          $7::uuid,
          $8::numeric,
          $9,
          $10::uuid,
          $10::uuid
        )
        ON CONFLICT (tenant_id, assessment_id, student_id)
        DO UPDATE SET
          score = EXCLUDED.score,
          remarks = EXCLUDED.remarks,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
        RETURNING *
      `,
      [
        input.tenant_id,
        input.exam_series_id,
        input.assessment_id,
        input.academic_term_id,
        input.class_section_id,
        input.subject_id,
        input.student_id,
        input.score,
        input.remarks ?? null,
        input.actor_user_id,
      ],
    );

    return result.rows[0];
  }

  async findExistingMark(input: { tenant_id: string; mark_id: string }) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM exam_marks
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [input.tenant_id, input.mark_id],
    );

    return result.rows[0] ?? null;
  }

  async correctLockedMark(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        UPDATE exam_marks
        SET score = $3::numeric,
            remarks = COALESCE($4, remarks),
            updated_by_user_id = $5::uuid,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING *
      `,
      [
        input.tenant_id,
        input.mark_id,
        input.score,
        input.remarks ?? null,
        input.actor_user_id,
      ],
    );

    return result.rows[0];
  }

  async createReportCardSnapshot(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO student_report_cards (
          tenant_id,
          exam_series_id,
          student_id,
          report_snapshot_id,
          status,
          published_by_user_id,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, 'published', $5::uuid, $6::jsonb)
        ON CONFLICT (tenant_id, exam_series_id, student_id)
        DO UPDATE SET
          report_snapshot_id = EXCLUDED.report_snapshot_id,
          status = 'published',
          published_by_user_id = EXCLUDED.published_by_user_id,
          published_at = NOW(),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING *
      `,
      [
        input.tenant_id,
        input.exam_series_id,
        input.student_id,
        input.report_snapshot_id,
        input.actor_user_id,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0];
  }

  async listReportCards(input: { tenant_id: string; student_id?: string }) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM student_report_cards
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR student_id = $2::uuid)
        ORDER BY published_at DESC
      `,
      [input.tenant_id, input.student_id ?? null],
    );

    return result.rows;
  }

  async listMarkSheets(input: {
    tenant_id: string;
    teacher_user_id?: string;
    exam_series_id?: string;
    class_section_id?: string;
    subject_id?: string;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT
          window.id::text,
          window.exam_series_id::text,
          window.subject_id::text,
          window.class_section_id::text,
          window.opens_at::text,
          window.closes_at::text,
          window.status,
          COUNT(mark.id)::int AS mark_count,
          MAX(mark.updated_at)::text AS last_marked_at
        FROM exam_mark_entry_windows window
        LEFT JOIN exam_marks mark
          ON mark.tenant_id = window.tenant_id
         AND mark.exam_series_id = window.exam_series_id
         AND mark.subject_id = window.subject_id
         AND mark.class_section_id = window.class_section_id
        WHERE window.tenant_id = $1
          AND ($2::uuid IS NULL OR window.exam_series_id = $2::uuid)
          AND ($3::uuid IS NULL OR window.class_section_id = $3::uuid)
          AND ($4::uuid IS NULL OR window.subject_id = $4::uuid)
          AND (
            $5::uuid IS NULL
            OR EXISTS (
              SELECT 1
              FROM exam_series series
              JOIN teacher_subject_assignments assignment
                ON assignment.tenant_id = series.tenant_id
               AND assignment.academic_term_id = series.academic_term_id
               AND assignment.class_section_id = window.class_section_id
               AND assignment.subject_id = window.subject_id
               AND assignment.teacher_user_id = $5::uuid
               AND assignment.status = 'active'
              WHERE series.tenant_id = window.tenant_id
                AND series.id = window.exam_series_id
            )
          )
        GROUP BY window.id
        ORDER BY window.closes_at DESC, window.opens_at DESC
        LIMIT 100
      `,
      [
        input.tenant_id,
        input.exam_series_id ?? null,
        input.class_section_id ?? null,
        input.subject_id ?? null,
        input.teacher_user_id ?? null,
      ],
    );

    return result.rows;
  }

  async appendMarkAuditLog(input: Record<string, unknown>) {
    await this.databaseService.query(
      `
        INSERT INTO exam_mark_audit_logs (
          tenant_id,
          mark_id,
          exam_series_id,
          assessment_id,
          student_id,
          action,
          actor_user_id,
          previous_score,
          new_score,
          reason,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::uuid, $8::numeric, $9::numeric, $10, $11::jsonb)
      `,
      [
        input.tenant_id,
        input.mark_id ?? null,
        input.exam_series_id ?? null,
        input.assessment_id ?? null,
        input.student_id ?? null,
        input.action,
        input.actor_user_id ?? null,
        input.previous_score ?? null,
        input.new_score ?? null,
        input.reason ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async appendReportCardAuditLog(input: Record<string, unknown>) {
    await this.databaseService.query(
      `
        INSERT INTO student_report_card_audit_logs (
          tenant_id,
          report_card_id,
          exam_series_id,
          student_id,
          action,
          actor_user_id,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::jsonb)
      `,
      [
        input.tenant_id,
        input.report_card_id ?? null,
        input.exam_series_id ?? null,
        input.student_id ?? null,
        input.action,
        input.actor_user_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
