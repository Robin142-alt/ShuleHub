import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import type {
  CreateDisciplineActionDto,
  CreateDisciplineCommentDto,
  DisciplineSeverity,
  DisciplineStatus,
  ListDisciplineIncidentsQueryDto,
} from '../dto/discipline.dto';
import type {
  DisciplineActionEntity,
  DisciplineIncidentEntity,
  OffenseCategoryEntity,
} from '../entities/discipline.entity';

export interface CreateIncidentInput {
  tenant_id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  academic_term_id: string;
  academic_year_id: string;
  offense_category_id: string;
  reporting_staff_id: string;
  assigned_staff_id: string | null;
  incident_number: string;
  title: string;
  severity: string;
  status: DisciplineStatus;
  occurred_at: string;
  location: string | null;
  witnesses: Array<Record<string, unknown>>;
  description: string;
  action_taken: string | null;
  recommendations: string | null;
  behavior_points_delta: number;
  parent_notification_status: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class DisciplineRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findTenantSchoolId(tenantId: string): Promise<string | null> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        SELECT id::text
        FROM tenants
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId],
    );

    return result.rows[0]?.id ?? null;
  }

  async generateIncidentNumber(): Promise<string> {
    const result = await this.databaseService.query<{ value: string }>(
      `SELECT nextval('discipline_incident_number_seq')::text AS value`,
    );
    const year = new Date().getUTCFullYear();
    const value = String(result.rows[0]?.value ?? '1').padStart(6, '0');

    return `DIS-${year}-${value}`;
  }

  async ensureDefaultOffenseCategories(input: {
    tenant_id: string;
    school_id: string;
    actor_user_id: string | null;
  }): Promise<void> {
    const defaults: Array<{
      code: string;
      name: string;
      default_severity: string;
      default_points: number;
      default_action_type?: string;
      notify_parent_by_default?: boolean;
      is_positive?: boolean;
    }> = [
      { code: 'lateness', name: 'Lateness', default_severity: 'low', default_points: -2 },
      { code: 'bullying', name: 'Bullying', default_severity: 'critical', default_points: -20, notify_parent_by_default: true },
      { code: 'fighting', name: 'Fighting', default_severity: 'high', default_points: -15, default_action_type: 'parent_meeting', notify_parent_by_default: true },
      { code: 'cheating', name: 'Exam Misconduct', default_severity: 'high', default_points: -15, notify_parent_by_default: true },
      { code: 'absenteeism', name: 'Absenteeism', default_severity: 'medium', default_points: -8, notify_parent_by_default: true },
      { code: 'vandalism', name: 'Vandalism', default_severity: 'high', default_points: -15, notify_parent_by_default: true },
      { code: 'phone-possession', name: 'Phone Possession', default_severity: 'medium', default_points: -5 },
      { code: 'disrespect', name: 'Disrespect', default_severity: 'medium', default_points: -8 },
      { code: 'leadership-award', name: 'Leadership Recognition', default_severity: 'low', default_points: 10, is_positive: true },
      { code: 'discipline-improvement', name: 'Discipline Improvement', default_severity: 'low', default_points: 5, is_positive: true },
    ];

    for (const category of defaults) {
      await this.databaseService.query(
        `
          INSERT INTO offense_categories (
            tenant_id,
            school_id,
            code,
            name,
            description,
            default_severity,
            default_points,
            default_action_type,
            notify_parent_by_default,
            is_positive,
            created_by_user_id
          )
          VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            default_severity = EXCLUDED.default_severity,
            default_points = EXCLUDED.default_points,
            default_action_type = EXCLUDED.default_action_type,
            notify_parent_by_default = EXCLUDED.notify_parent_by_default,
            is_positive = EXCLUDED.is_positive,
            updated_at = NOW()
        `,
        [
          input.tenant_id,
          input.school_id,
          category.code,
          category.name,
          `${category.name} behavior category.`,
          category.default_severity,
          category.default_points,
          category.default_action_type ?? null,
          category.notify_parent_by_default ?? false,
          category.is_positive ?? false,
          input.actor_user_id,
        ],
      );
    }
  }

  async listOffenseCategories(tenantId: string): Promise<OffenseCategoryEntity[]> {
    const result = await this.databaseService.query<OffenseCategoryEntity>(
      `
        SELECT *
        FROM offense_categories
        WHERE tenant_id = $1
          AND is_active = TRUE
        ORDER BY is_positive ASC, name ASC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async findOffenseCategoryById(
    tenantId: string,
    offenseCategoryId: string,
  ): Promise<OffenseCategoryEntity | null> {
    const result = await this.databaseService.query<OffenseCategoryEntity>(
      `
        SELECT *
        FROM offense_categories
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND is_active = TRUE
        LIMIT 1
      `,
      [tenantId, offenseCategoryId],
    );

    return result.rows[0] ?? null;
  }

  async upsertOffenseCategory(input: Partial<OffenseCategoryEntity> & {
    tenant_id: string;
    school_id: string;
    code: string;
    name: string;
    default_severity: string;
    default_points: number;
  }): Promise<OffenseCategoryEntity> {
    const result = await this.databaseService.query<OffenseCategoryEntity>(
      `
        INSERT INTO offense_categories (
          tenant_id,
          school_id,
          code,
          name,
          description,
          default_severity,
          default_points,
          default_action_type,
          notify_parent_by_default,
          is_positive,
          created_by_user_id
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid)
        ON CONFLICT (tenant_id, code)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          default_severity = EXCLUDED.default_severity,
          default_points = EXCLUDED.default_points,
          default_action_type = EXCLUDED.default_action_type,
          notify_parent_by_default = EXCLUDED.notify_parent_by_default,
          is_positive = EXCLUDED.is_positive,
          is_active = TRUE,
          updated_at = NOW()
        RETURNING *
      `,
      [
        input.tenant_id,
        input.school_id,
        input.code,
        input.name,
        input.description ?? null,
        input.default_severity,
        input.default_points,
        input.default_action_type ?? null,
        input.notify_parent_by_default ?? false,
        input.is_positive ?? false,
        input.created_by_user_id ?? null,
      ],
    );

    return result.rows[0]!;
  }

  async createIncident(input: CreateIncidentInput): Promise<DisciplineIncidentEntity> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        INSERT INTO discipline_incidents (
          tenant_id,
          school_id,
          student_id,
          class_id,
          academic_term_id,
          academic_year_id,
          offense_category_id,
          reporting_staff_id,
          assigned_staff_id,
          incident_number,
          title,
          severity,
          status,
          occurred_at,
          location,
          witnesses,
          description,
          action_taken,
          recommendations,
          behavior_points_delta,
          parent_notification_status,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::uuid,
          $7::uuid,
          $8::uuid,
          $9::uuid,
          $10,
          $11,
          $12,
          $13,
          $14::timestamptz,
          $15,
          $16::jsonb,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22::jsonb
        )
        RETURNING
          id::text,
          tenant_id,
          school_id::text,
          student_id::text,
          class_id::text,
          academic_term_id::text,
          academic_year_id::text,
          offense_category_id::text,
          reporting_staff_id::text,
          assigned_staff_id::text,
          incident_number,
          title,
          severity,
          status,
          occurred_at::text,
          reported_at::text,
          location,
          witnesses,
          description,
          action_taken,
          recommendations,
          linked_counselling_referral_id::text,
          behavior_points_delta,
          parent_notification_status,
          metadata,
          deleted_at::text,
          created_at::text,
          updated_at::text
      `,
      [
        input.tenant_id,
        input.school_id,
        input.student_id,
        input.class_id,
        input.academic_term_id,
        input.academic_year_id,
        input.offense_category_id,
        input.reporting_staff_id,
        input.assigned_staff_id,
        input.incident_number,
        input.title,
        input.severity,
        input.status,
        input.occurred_at,
        input.location,
        JSON.stringify(input.witnesses),
        input.description,
        input.action_taken,
        input.recommendations,
        input.behavior_points_delta,
        input.parent_notification_status,
        JSON.stringify(input.metadata),
      ],
    );

    return result.rows[0]!;
  }

  async listIncidents(input: {
    tenant_id: string;
    query: ListDisciplineIncidentsQueryDto;
    actor_user_id: string;
    can_read_all: boolean;
  }): Promise<DisciplineIncidentEntity[]> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        SELECT
          id::text,
          tenant_id,
          school_id::text,
          student_id::text,
          class_id::text,
          academic_term_id::text,
          academic_year_id::text,
          offense_category_id::text,
          reporting_staff_id::text,
          assigned_staff_id::text,
          incident_number,
          title,
          severity,
          status,
          occurred_at::text,
          reported_at::text,
          location,
          witnesses,
          description,
          action_taken,
          recommendations,
          linked_counselling_referral_id::text,
          behavior_points_delta,
          parent_notification_status,
          metadata,
          deleted_at::text,
          created_at::text,
          updated_at::text
        FROM discipline_incidents
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR severity = $3)
          AND ($4::uuid IS NULL OR student_id = $4::uuid)
          AND ($5::uuid IS NULL OR class_id = $5::uuid)
          AND ($6::uuid IS NULL OR offense_category_id = $6::uuid)
          AND ($7::uuid IS NULL OR academic_term_id = $7::uuid)
          AND ($8::uuid IS NULL OR academic_year_id = $8::uuid)
          AND ($9::timestamptz IS NULL OR occurred_at >= $9::timestamptz)
          AND ($10::timestamptz IS NULL OR occurred_at <= $10::timestamptz)
          AND (
            $11::text IS NULL
            OR incident_number ILIKE '%' || $11 || '%'
            OR title ILIKE '%' || $11 || '%'
            OR description ILIKE '%' || $11 || '%'
          )
          AND (
            $12::boolean
            OR reporting_staff_id = $13::uuid
            OR assigned_staff_id = $13::uuid
          )
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT $14
        OFFSET $15
      `,
      [
        input.tenant_id,
        input.query.status ?? null,
        input.query.severity ?? null,
        input.query.student_id ?? null,
        input.query.class_id ?? null,
        input.query.offense_category_id ?? null,
        input.query.academic_term_id ?? null,
        input.query.academic_year_id ?? null,
        input.query.from ?? null,
        input.query.to ?? null,
        input.query.q?.trim() || null,
        input.can_read_all,
        input.actor_user_id,
        Math.min(input.query.limit ?? 50, 100),
        input.query.offset ?? 0,
      ],
    );

    return result.rows;
  }

  async listParentIncidents(input: {
    tenant_id: string;
    parent_user_id: string;
    limit?: number;
    offset?: number;
  }): Promise<DisciplineIncidentEntity[]> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        SELECT
          di.id::text,
          di.tenant_id,
          di.school_id::text,
          di.student_id::text,
          di.class_id::text,
          di.academic_term_id::text,
          di.academic_year_id::text,
          di.offense_category_id::text,
          di.reporting_staff_id::text,
          di.assigned_staff_id::text,
          di.incident_number,
          di.title,
          di.severity,
          di.status,
          di.occurred_at::text,
          di.reported_at::text,
          di.location,
          di.witnesses,
          di.description,
          di.action_taken,
          di.recommendations,
          di.linked_counselling_referral_id::text,
          di.behavior_points_delta,
          di.parent_notification_status,
          di.metadata,
          di.deleted_at::text,
          di.created_at::text,
          di.updated_at::text
        FROM discipline_incidents di
        INNER JOIN student_guardians sg
          ON sg.tenant_id = di.tenant_id
         AND sg.student_id = di.student_id
         AND sg.user_id = $2::uuid
         AND sg.status = 'active'
        WHERE di.tenant_id = $1
          AND di.deleted_at IS NULL
          AND di.parent_notification_status IN ('queued', 'sent', 'acknowledged')
        ORDER BY di.occurred_at DESC, di.created_at DESC
        LIMIT $3
        OFFSET $4
      `,
      [
        input.tenant_id,
        input.parent_user_id,
        Math.min(input.limit ?? 50, 100),
        input.offset ?? 0,
      ],
    );

    return result.rows;
  }

  async findIncidentById(
    tenantId: string,
    incidentId: string,
  ): Promise<DisciplineIncidentEntity | null> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        SELECT
          id::text,
          tenant_id,
          school_id::text,
          student_id::text,
          class_id::text,
          academic_term_id::text,
          academic_year_id::text,
          offense_category_id::text,
          reporting_staff_id::text,
          assigned_staff_id::text,
          incident_number,
          title,
          severity,
          status,
          occurred_at::text,
          reported_at::text,
          location,
          witnesses,
          description,
          action_taken,
          recommendations,
          linked_counselling_referral_id::text,
          behavior_points_delta,
          parent_notification_status,
          metadata,
          deleted_at::text,
          created_at::text,
          updated_at::text
        FROM discipline_incidents
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId, incidentId],
    );

    return result.rows[0] ?? null;
  }

  async updateIncident(input: {
    tenant_id: string;
    incident_id: string;
    title?: string;
    severity?: DisciplineSeverity;
    location?: string | null;
    description?: string;
    action_taken?: string | null;
    recommendations?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<DisciplineIncidentEntity | null> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        UPDATE discipline_incidents
        SET
          title = COALESCE($3, title),
          severity = COALESCE($4, severity),
          location = COALESCE($5, location),
          description = COALESCE($6, description),
          action_taken = COALESCE($7, action_taken),
          recommendations = COALESCE($8, recommendations),
          metadata = COALESCE($9::jsonb, metadata),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
        RETURNING
          id::text,
          tenant_id,
          school_id::text,
          student_id::text,
          class_id::text,
          academic_term_id::text,
          academic_year_id::text,
          offense_category_id::text,
          reporting_staff_id::text,
          assigned_staff_id::text,
          incident_number,
          title,
          severity,
          status,
          occurred_at::text,
          reported_at::text,
          location,
          witnesses,
          description,
          action_taken,
          recommendations,
          linked_counselling_referral_id::text,
          behavior_points_delta,
          parent_notification_status,
          metadata,
          deleted_at::text,
          created_at::text,
          updated_at::text
      `,
      [
        input.tenant_id,
        input.incident_id,
        input.title ?? null,
        input.severity ?? null,
        input.location ?? null,
        input.description ?? null,
        input.action_taken ?? null,
        input.recommendations ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );

    return result.rows[0] ?? null;
  }

  async updateIncidentStatus(input: {
    tenant_id: string;
    incident_id: string;
    status: DisciplineStatus;
  }): Promise<DisciplineIncidentEntity | null> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        UPDATE discipline_incidents
        SET status = $3,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
        RETURNING *
      `,
      [input.tenant_id, input.incident_id, input.status],
    );

    return result.rows[0] ?? null;
  }

  async assignIncident(input: {
    tenant_id: string;
    incident_id: string;
    assigned_staff_id: string;
  }): Promise<DisciplineIncidentEntity | null> {
    const result = await this.databaseService.query<DisciplineIncidentEntity>(
      `
        UPDATE discipline_incidents
        SET assigned_staff_id = $3::uuid,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND deleted_at IS NULL
        RETURNING *
      `,
      [input.tenant_id, input.incident_id, input.assigned_staff_id],
    );

    return result.rows[0] ?? null;
  }

  async createAction(input: CreateDisciplineActionDto & {
    tenant_id: string;
    school_id: string;
    incident_id: string;
    student_id: string;
    created_by_user_id: string | null;
    requires_approval: boolean;
  }): Promise<DisciplineActionEntity> {
    const result = await this.databaseService.query<DisciplineActionEntity>(
      `
        INSERT INTO discipline_actions (
          tenant_id,
          school_id,
          incident_id,
          student_id,
          action_type,
          status,
          title,
          description,
          assigned_staff_id,
          due_at,
          remarks,
          metadata,
          created_by_user_id
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9::uuid, $10::timestamptz, $11, $12::jsonb, $13::uuid)
        RETURNING *
      `,
      [
        input.tenant_id,
        input.school_id,
        input.incident_id,
        input.student_id,
        input.action_type,
        input.requires_approval ? 'pending_approval' : 'assigned',
        input.title,
        input.description ?? null,
        input.assigned_staff_id ?? null,
        input.due_at ?? null,
        input.remarks ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.created_by_user_id,
      ],
    );

    return result.rows[0]!;
  }

  async listActions(tenantId: string, incidentId: string): Promise<DisciplineActionEntity[]> {
    const result = await this.databaseService.query<DisciplineActionEntity>(
      `
        SELECT *
        FROM discipline_actions
        WHERE tenant_id = $1
          AND incident_id = $2::uuid
        ORDER BY created_at ASC
      `,
      [tenantId, incidentId],
    );

    return result.rows;
  }

  async completeAction(input: {
    tenant_id: string;
    action_id: string;
    completion_notes: string | null;
  }): Promise<DisciplineActionEntity | null> {
    const result = await this.databaseService.query<DisciplineActionEntity>(
      `
        UPDATE discipline_actions
        SET status = 'completed',
            completed_at = NOW(),
            completion_notes = $3,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING *
      `,
      [input.tenant_id, input.action_id, input.completion_notes],
    );

    return result.rows[0] ?? null;
  }

  async approveAction(input: {
    tenant_id: string;
    action_id: string;
    approved_by_user_id: string;
  }): Promise<DisciplineActionEntity | null> {
    const result = await this.databaseService.query<DisciplineActionEntity>(
      `
        UPDATE discipline_actions
        SET status = 'approved',
            approved_by_user_id = $3::uuid,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING *
      `,
      [input.tenant_id, input.action_id, input.approved_by_user_id],
    );

    return result.rows[0] ?? null;
  }

  async createComment(input: CreateDisciplineCommentDto & {
    tenant_id: string;
    school_id: string;
    incident_id: string;
    author_user_id: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO discipline_comments (
          tenant_id,
          school_id,
          incident_id,
          author_user_id,
          visibility,
          body
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6)
        RETURNING id::text, tenant_id, incident_id::text, author_user_id::text, visibility, body, created_at::text
      `,
      [
        input.tenant_id,
        input.school_id,
        input.incident_id,
        input.author_user_id,
        input.visibility ?? 'public',
        input.body,
      ],
    );

    return result.rows[0];
  }

  async createAttachment(input: {
    tenant_id: string;
    school_id: string;
    incident_id: string;
    action_id?: string | null;
    uploaded_by_user_id: string | null;
    file_object_id?: string | null;
    file_name: string;
    mime_type: string;
    file_size: number;
    storage_path: string;
    visibility: 'internal' | 'parent_visible';
    scan_status?: string;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO discipline_attachments (
          tenant_id,
          school_id,
          incident_id,
          action_id,
          uploaded_by_user_id,
          file_object_id,
          file_name,
          mime_type,
          file_size,
          storage_path,
          visibility,
          scan_status
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9, $10, $11, $12)
        RETURNING id::text, file_name, mime_type, file_size, storage_path, visibility, scan_status, created_at::text
      `,
      [
        input.tenant_id,
        input.school_id,
        input.incident_id,
        input.action_id ?? null,
        input.uploaded_by_user_id,
        input.file_object_id ?? null,
        input.file_name,
        input.mime_type,
        input.file_size,
        input.storage_path,
        input.visibility,
        input.scan_status ?? 'not_scanned',
      ],
    );

    return result.rows[0];
  }

  async listComments(input: {
    tenant_id: string;
    incident_id: string;
    include_internal: boolean;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT id::text, tenant_id, incident_id::text, author_user_id::text, visibility, body, created_at::text
        FROM discipline_comments
        WHERE tenant_id = $1
          AND incident_id = $2::uuid
          AND ($3::boolean OR visibility = 'public')
        ORDER BY created_at ASC
      `,
      [input.tenant_id, input.incident_id, input.include_internal],
    );

    return result.rows;
  }

  async createBehaviorPoint(input: {
    tenant_id: string;
    school_id: string;
    student_id: string;
    class_id: string;
    academic_term_id: string;
    academic_year_id: string;
    source_type: 'incident' | 'commendation' | 'correction';
    source_id: string;
    points_delta: number;
    reason: string;
    awarded_by_user_id: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO behavior_points (
          tenant_id,
          school_id,
          student_id,
          class_id,
          academic_term_id,
          academic_year_id,
          source_type,
          source_id,
          points_delta,
          reason,
          awarded_by_user_id,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8::uuid, $9, $10, $11::uuid, $12::jsonb)
        RETURNING id::text, points_delta
      `,
      [
        input.tenant_id,
        input.school_id,
        input.student_id,
        input.class_id,
        input.academic_term_id,
        input.academic_year_id,
        input.source_type,
        input.source_id,
        input.points_delta,
        input.reason,
        input.awarded_by_user_id,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0];
  }

  async getBehaviorScore(input: {
    tenant_id: string;
    student_id: string;
    academic_term_id?: string;
    academic_year_id?: string;
  }) {
    const result = await this.databaseService.query<{
      total_points: string;
      incident_count: string;
      commendation_count: string;
    }>(
      `
        SELECT
          COALESCE(SUM(points_delta), 0)::text AS total_points,
          COUNT(*) FILTER (WHERE source_type = 'incident')::text AS incident_count,
          COUNT(*) FILTER (WHERE source_type = 'commendation')::text AS commendation_count
        FROM behavior_points
        WHERE tenant_id = $1
          AND student_id = $2::uuid
          AND ($3::uuid IS NULL OR academic_term_id = $3::uuid)
          AND ($4::uuid IS NULL OR academic_year_id = $4::uuid)
      `,
      [
        input.tenant_id,
        input.student_id,
        input.academic_term_id ?? null,
        input.academic_year_id ?? null,
      ],
    );

    const row = result.rows[0];

    return {
      total_points: Number(row?.total_points ?? 0),
      incident_count: Number(row?.incident_count ?? 0),
      commendation_count: Number(row?.commendation_count ?? 0),
    };
  }

  async createNotification(input: {
    tenant_id: string;
    school_id: string;
    incident_id?: string | null;
    student_id?: string | null;
    recipient_user_id?: string | null;
    notification_type: string;
    channel: 'in_app' | 'email' | 'sms';
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO discipline_notifications (
          tenant_id,
          school_id,
          incident_id,
          student_id,
          recipient_user_id,
          notification_type,
          channel,
          title,
          body,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10::jsonb)
        RETURNING id::text, status
      `,
      [
        input.tenant_id,
        input.school_id,
        input.incident_id ?? null,
        input.student_id ?? null,
        input.recipient_user_id ?? null,
        input.notification_type,
        input.channel,
        input.title,
        input.body,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0];
  }

  async getDisciplineAnalytics(tenantId: string) {
    const [
      summary,
      topOffenses,
      bySeverity,
      byStatus,
      repeatStudents,
    ] = await Promise.all([
      this.databaseService.query<{
        open_cases: string;
        severe_incidents: string;
        pending_approvals: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::text AS open_cases,
            COUNT(*) FILTER (WHERE severity IN ('high', 'critical') AND status NOT IN ('resolved', 'closed'))::text AS severe_incidents,
            (
              SELECT COUNT(*)::text
              FROM discipline_actions
              WHERE tenant_id = $1
                AND status = 'pending_approval'
            ) AS pending_approvals
          FROM discipline_incidents
          WHERE tenant_id = $1
            AND deleted_at IS NULL
        `,
        [tenantId],
      ),
      this.databaseService.query<{ offense: string; count: string }>(
        `
          SELECT oc.name AS offense, COUNT(*)::text AS count
          FROM discipline_incidents di
          JOIN offense_categories oc
            ON oc.tenant_id = di.tenant_id
           AND oc.id = di.offense_category_id
          WHERE di.tenant_id = $1
            AND di.deleted_at IS NULL
          GROUP BY oc.name
          ORDER BY COUNT(*) DESC, oc.name ASC
          LIMIT 8
        `,
        [tenantId],
      ),
      this.databaseService.query<{ severity: string; count: string }>(
        `
          SELECT severity, COUNT(*)::text AS count
          FROM discipline_incidents
          WHERE tenant_id = $1
            AND deleted_at IS NULL
          GROUP BY severity
          ORDER BY severity ASC
        `,
        [tenantId],
      ),
      this.databaseService.query<{ status: string; count: string }>(
        `
          SELECT status, COUNT(*)::text AS count
          FROM discipline_incidents
          WHERE tenant_id = $1
            AND deleted_at IS NULL
          GROUP BY status
          ORDER BY status ASC
        `,
        [tenantId],
      ),
      this.databaseService.query<{ repeat_offender_alerts: string }>(
        `
          SELECT COUNT(*)::text AS repeat_offender_alerts
          FROM (
            SELECT student_id
            FROM discipline_incidents
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND occurred_at >= NOW() - INTERVAL '90 days'
            GROUP BY student_id
            HAVING COUNT(*) >= 3
          ) repeat_students
        `,
        [tenantId],
      ),
    ]);

    const summaryRow = summary.rows[0];

    return {
      open_cases: Number(summaryRow?.open_cases ?? 0),
      severe_incidents: Number(summaryRow?.severe_incidents ?? 0),
      pending_approvals: Number(summaryRow?.pending_approvals ?? 0),
      repeat_offender_alerts: Number(repeatStudents.rows[0]?.repeat_offender_alerts ?? 0),
      top_offenses: topOffenses.rows.map((row) => ({
        offense: row.offense,
        count: Number(row.count),
      })),
      incidents_by_severity: bySeverity.rows.map((row) => ({
        severity: row.severity,
        count: Number(row.count),
      })),
      incidents_by_status: byStatus.rows.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
    };
  }

  async isParentLinkedToStudent(input: {
    tenant_id: string;
    parent_user_id: string;
    student_id: string;
  }): Promise<boolean> {
    const result = await this.databaseService.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM student_guardians
          WHERE tenant_id = $1
            AND user_id = $2::uuid
            AND student_id = $3::uuid
            AND status = 'active'
        ) AS exists
      `,
      [input.tenant_id, input.parent_user_id, input.student_id],
    );

    return result.rows[0]?.exists ?? false;
  }

  async createParentAcknowledgement(input: {
    tenant_id: string;
    school_id: string;
    incident_id: string;
    student_id: string;
    parent_user_id: string;
    acknowledgement_note?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO parent_acknowledgements (
          tenant_id,
          school_id,
          incident_id,
          student_id,
          parent_user_id,
          acknowledgement_note,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9::jsonb)
        ON CONFLICT (tenant_id, incident_id, parent_user_id)
        DO UPDATE SET
          acknowledgement_note = EXCLUDED.acknowledgement_note,
          ip_address = EXCLUDED.ip_address,
          user_agent = EXCLUDED.user_agent,
          acknowledged_at = NOW(),
          metadata = EXCLUDED.metadata
        RETURNING id::text, acknowledged_at::text
      `,
      [
        input.tenant_id,
        input.school_id,
        input.incident_id,
        input.student_id,
        input.parent_user_id,
        input.acknowledgement_note ?? null,
        input.ip_address ?? null,
        input.user_agent ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    await this.databaseService.query(
      `
        UPDATE discipline_incidents
        SET parent_notification_status = 'acknowledged',
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [input.tenant_id, input.incident_id],
    );

    return result.rows[0];
  }

  async createAuditLog(input: {
    tenant_id: string;
    school_id: string;
    actor_user_id: string | null;
    actor_role: string | null;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    await this.databaseService.query(
      `
        INSERT INTO discipline_audit_logs (
          tenant_id,
          school_id,
          actor_user_id,
          actor_role,
          action,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid, $8, $9, $10::jsonb)
      `,
      [
        input.tenant_id,
        input.school_id,
        input.actor_user_id,
        input.actor_role,
        input.action,
        input.entity_type,
        input.entity_id ?? null,
        input.ip_address ?? null,
        input.user_agent ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
