import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class AcademicsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createAcademicYear(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO academic_years (
          tenant_id, name, starts_on, ends_on, created_by_user_id
        )
        VALUES ($1, $2, $3::date, $4::date, $5::uuid)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.name,
        input.starts_on,
        input.ends_on,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async createAcademicTerm(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO academic_terms (
          tenant_id, academic_year_id, name, starts_on, ends_on, created_by_user_id
        )
        VALUES ($1, $2::uuid, $3, $4::date, $5::date, $6::uuid)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.academic_year_id,
        input.name,
        input.starts_on,
        input.ends_on,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async createClassSection(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO class_sections (
          tenant_id, academic_year_id, name, grade_level, stream, created_by_user_id
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.academic_year_id,
        input.name,
        input.grade_level,
        input.stream ?? null,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async createSubject(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO subjects (tenant_id, code, name, created_by_user_id)
        VALUES ($1, $2, $3, $4::uuid)
        ON CONFLICT (tenant_id, code)
        DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
        RETURNING *
      `,
      [input.tenant_id, input.code, input.name, input.created_by_user_id],
    );

    return result.rows[0];
  }

  async createTeacherAssignment(input: Record<string, unknown>) {
    const result = await this.databaseService.query(
      `
        INSERT INTO teacher_subject_assignments (
          tenant_id,
          academic_term_id,
          class_section_id,
          subject_id,
          teacher_user_id,
          created_by_user_id
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid)
        ON CONFLICT (tenant_id, academic_term_id, class_section_id, subject_id, teacher_user_id)
        DO UPDATE SET status = 'active', updated_at = NOW()
        RETURNING *
      `,
      [
        input.tenant_id,
        input.academic_term_id,
        input.class_section_id,
        input.subject_id,
        input.teacher_user_id,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async listTeacherAssignments(input: { tenantId: string; teacherUserId?: string }) {
    const values: unknown[] = [input.tenantId, input.teacherUserId ?? null];
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM teacher_subject_assignments
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR teacher_user_id = $2::uuid)
          AND status = 'active'
        ORDER BY created_at DESC
      `,
      values,
    );

    return result.rows;
  }

  async appendAuditLog(input: Record<string, unknown>) {
    await this.databaseService.query(
      `
        INSERT INTO academic_audit_logs (
          tenant_id, entity_type, entity_id, action, actor_user_id, metadata
        )
        VALUES ($1, $2, $3::uuid, $4, $5::uuid, $6::jsonb)
      `,
      [
        input.tenant_id,
        input.entity_type,
        input.entity_id ?? null,
        input.action,
        input.actor_user_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
