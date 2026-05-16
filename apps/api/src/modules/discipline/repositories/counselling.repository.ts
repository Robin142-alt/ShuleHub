import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import type {
  CreateCounsellingNoteDto,
  CreateCounsellingReferralDto,
  CreateCounsellingSessionDto,
  CreateImprovementPlanDto,
  ListCounsellingQueryDto,
  UpdateCounsellingSessionDto,
} from '../dto/counselling.dto';
import type {
  CounsellingNoteEntity,
  CounsellingSessionEntity,
} from '../entities/discipline.entity';
import type { EncryptedCounsellingNotePayload } from '../counselling-note-encryption.service';

@Injectable()
export class CounsellingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getCounsellingDashboard(tenantId: string) {
    const result = await this.databaseService.query<{
      active_referrals: string;
      upcoming_sessions: string;
      improvement_cases: string;
      repeat_referrals: string;
      high_risk_students: string;
      followups_due: string;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)::text
            FROM counselling_referrals
            WHERE tenant_id = $1
              AND status IN ('pending', 'accepted')
          ) AS active_referrals,
          (
            SELECT COUNT(*)::text
            FROM counselling_sessions
            WHERE tenant_id = $1
              AND status = 'scheduled'
              AND scheduled_for >= NOW()
              AND scheduled_for < NOW() + INTERVAL '14 days'
          ) AS upcoming_sessions,
          (
            SELECT COUNT(*)::text
            FROM behavior_improvement_plans
            WHERE tenant_id = $1
              AND status = 'active'
          ) AS improvement_cases,
          (
            SELECT COUNT(*)::text
            FROM (
              SELECT student_id
              FROM counselling_referrals
              WHERE tenant_id = $1
                AND created_at >= NOW() - INTERVAL '180 days'
              GROUP BY student_id
              HAVING COUNT(*) >= 2
            ) repeated
          ) AS repeat_referrals,
          (
            SELECT COUNT(DISTINCT student_id)::text
            FROM counselling_referrals
            WHERE tenant_id = $1
              AND risk_level = 'high'
              AND status IN ('pending', 'accepted')
          ) AS high_risk_students,
          (
            SELECT COUNT(*)::text
            FROM behavior_improvement_plans
            WHERE tenant_id = $1
              AND status = 'active'
              AND review_date <= CURRENT_DATE + INTERVAL '7 days'
          ) AS followups_due
      `,
      [tenantId],
    );
    const row = result.rows[0];

    return {
      active_referrals: Number(row?.active_referrals ?? 0),
      upcoming_sessions: Number(row?.upcoming_sessions ?? 0),
      improvement_cases: Number(row?.improvement_cases ?? 0),
      repeat_referrals: Number(row?.repeat_referrals ?? 0),
      high_risk_students: Number(row?.high_risk_students ?? 0),
      followups_due: Number(row?.followups_due ?? 0),
    };
  }

  async createReferral(input: CreateCounsellingReferralDto & {
    tenant_id: string;
    school_id: string;
    referred_by_user_id: string;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO counselling_referrals (
          tenant_id,
          school_id,
          student_id,
          class_id,
          academic_term_id,
          academic_year_id,
          incident_id,
          referred_by_user_id,
          reason,
          risk_level
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9, $10)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.school_id,
        input.student_id,
        input.class_id,
        input.academic_term_id,
        input.academic_year_id,
        input.incident_id ?? null,
        input.referred_by_user_id,
        input.reason,
        input.risk_level ?? 'medium',
      ],
    );

    return result.rows[0];
  }

  async listReferrals(input: {
    tenant_id: string;
    query: ListCounsellingQueryDto;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT *
        FROM counselling_referrals
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR student_id = $2::uuid)
          AND ($3::uuid IS NULL OR counsellor_user_id = $3::uuid)
          AND ($4::text IS NULL OR status = $4)
        ORDER BY created_at DESC
        LIMIT $5
        OFFSET $6
      `,
      [
        input.tenant_id,
        input.query.student_id ?? null,
        input.query.counsellor_user_id ?? null,
        input.query.status ?? null,
        Math.min(input.query.limit ?? 50, 100),
        input.query.offset ?? 0,
      ],
    );

    return result.rows;
  }

  async updateReferralStatus(input: {
    tenant_id: string;
    referral_id: string;
    status: 'accepted' | 'declined' | 'closed';
    counsellor_user_id: string;
    response_note?: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        UPDATE counselling_referrals
        SET status = $3,
            counsellor_user_id = $4::uuid,
            response_note = $5,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING *
      `,
      [
        input.tenant_id,
        input.referral_id,
        input.status,
        input.counsellor_user_id,
        input.response_note ?? null,
      ],
    );

    return result.rows[0] ?? null;
  }

  async createSession(input: CreateCounsellingSessionDto & {
    tenant_id: string;
    school_id: string;
    counsellor_user_id: string;
  }): Promise<CounsellingSessionEntity> {
    const result = await this.databaseService.query<CounsellingSessionEntity>(
      `
        INSERT INTO counselling_sessions (
          tenant_id,
          school_id,
          student_id,
          referral_id,
          counsellor_user_id,
          scheduled_for,
          location,
          agenda
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7, $8)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.school_id,
        input.student_id,
        input.referral_id,
        input.counsellor_user_id,
        input.scheduled_for,
        input.location ?? null,
        input.agenda ?? null,
      ],
    );

    return result.rows[0]!;
  }

  async listSessions(input: {
    tenant_id: string;
    query: ListCounsellingQueryDto;
    can_read_all: boolean;
    actor_user_id: string;
  }): Promise<CounsellingSessionEntity[]> {
    const result = await this.databaseService.query<CounsellingSessionEntity>(
      `
        SELECT *
        FROM counselling_sessions
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR student_id = $2::uuid)
          AND ($3::uuid IS NULL OR counsellor_user_id = $3::uuid)
          AND ($4::text IS NULL OR status = $4)
          AND ($5::boolean OR counsellor_user_id = $6::uuid)
        ORDER BY scheduled_for ASC
        LIMIT $7
        OFFSET $8
      `,
      [
        input.tenant_id,
        input.query.student_id ?? null,
        input.query.counsellor_user_id ?? null,
        input.query.status ?? null,
        input.can_read_all,
        input.actor_user_id,
        Math.min(input.query.limit ?? 50, 100),
        input.query.offset ?? 0,
      ],
    );

    return result.rows;
  }

  async findSessionById(
    tenantId: string,
    sessionId: string,
  ): Promise<CounsellingSessionEntity | null> {
    const result = await this.databaseService.query<CounsellingSessionEntity>(
      `
        SELECT *
        FROM counselling_sessions
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, sessionId],
    );

    return result.rows[0] ?? null;
  }

  async updateSession(input: UpdateCounsellingSessionDto & {
    tenant_id: string;
    session_id: string;
  }): Promise<CounsellingSessionEntity | null> {
    const result = await this.databaseService.query<CounsellingSessionEntity>(
      `
        UPDATE counselling_sessions
        SET scheduled_for = COALESCE($3::timestamptz, scheduled_for),
            status = COALESCE($4, status),
            location = COALESCE($5, location),
            outcome_summary = COALESCE($6, outcome_summary),
            completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE completed_at END,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING *
      `,
      [
        input.tenant_id,
        input.session_id,
        input.scheduled_for ?? null,
        input.status ?? null,
        input.location ?? null,
        input.outcome_summary ?? null,
      ],
    );

    return result.rows[0] ?? null;
  }

  async createNote(input: CreateCounsellingNoteDto & {
    tenant_id: string;
    school_id: string;
    student_id: string;
    counselling_session_id: string;
    counsellor_user_id: string;
    encrypted: EncryptedCounsellingNotePayload;
  }): Promise<CounsellingNoteEntity> {
    const result = await this.databaseService.query<CounsellingNoteEntity>(
      `
        INSERT INTO counselling_notes (
          tenant_id,
          school_id,
          student_id,
          counselling_session_id,
          counsellor_user_id,
          visibility,
          encrypted_note,
          note_nonce,
          note_auth_tag,
          safe_summary,
          risk_indicators
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11::jsonb)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.school_id,
        input.student_id,
        input.counselling_session_id,
        input.counsellor_user_id,
        input.visibility,
        input.encrypted.encrypted_note,
        input.encrypted.note_nonce,
        input.encrypted.note_auth_tag,
        input.safe_summary ?? null,
        JSON.stringify(input.risk_indicators ?? []),
      ],
    );

    return result.rows[0]!;
  }

  async listNotes(input: {
    tenant_id: string;
    session_id: string;
  }): Promise<CounsellingNoteEntity[]> {
    const result = await this.databaseService.query<CounsellingNoteEntity>(
      `
        SELECT *
        FROM counselling_notes
        WHERE tenant_id = $1
          AND counselling_session_id = $2::uuid
        ORDER BY created_at ASC
      `,
      [input.tenant_id, input.session_id],
    );

    return result.rows;
  }

  async createImprovementPlan(input: CreateImprovementPlanDto & {
    tenant_id: string;
    school_id: string;
    counsellor_user_id: string;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO behavior_improvement_plans (
          tenant_id,
          school_id,
          student_id,
          referral_id,
          session_id,
          counsellor_user_id,
          title,
          goal,
          parent_involvement_plan,
          review_date
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9, $10::date)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.school_id,
        input.student_id,
        input.referral_id ?? null,
        input.session_id ?? null,
        input.counsellor_user_id,
        input.title,
        input.goal,
        input.parent_involvement_plan ?? null,
        input.review_date,
      ],
    );
    const plan = result.rows[0];

    for (const step of input.steps ?? []) {
      await this.databaseService.query(
        `
          INSERT INTO behavior_improvement_plan_steps (
            tenant_id,
            school_id,
            plan_id,
            title,
            due_at
          )
          VALUES ($1, $2::uuid, $3::uuid, $4, $5::timestamptz)
        `,
        [input.tenant_id, input.school_id, plan.id, step.title, step.due_at ?? null],
      );
    }

    return plan;
  }
}
