import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import type {
  ApproveLeaveRequestDto,
  ApproveStaffContractDto,
  ChangeStaffStatusDto,
} from '../dto/hr.dto';

@Injectable()
export class HrRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findOverlappingActiveContract(tenantId: string, input: ApproveStaffContractDto) {
    const result = await this.databaseService.query(
      `
        SELECT id::text
        FROM staff_contracts
        WHERE tenant_id = $1
          AND staff_profile_id = $2::uuid
          AND approval_state = 'approved'
          AND daterange(starts_on, COALESCE(ends_on, 'infinity'::date), '[]')
              && daterange($3::date, COALESCE($4::date, 'infinity'::date), '[]')
        LIMIT 1
      `,
      [tenantId, input.staff_profile_id, input.starts_on, input.ends_on ?? null],
    );

    return result.rows[0] ?? null;
  }

  async approveContract(input: ApproveStaffContractDto & {
    tenant_id: string;
    approved_by_user_id: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO staff_contracts (
          tenant_id,
          staff_profile_id,
          role_title,
          starts_on,
          ends_on,
          employment_type,
          workload,
          approval_state,
          approved_by_user_id,
          approved_at
        )
        VALUES ($1, $2::uuid, $3, $4::date, $5::date, $6, $7, 'approved', $8, NOW())
        RETURNING *
      `,
      [
        input.tenant_id,
        input.staff_profile_id,
        input.role_title,
        input.starts_on,
        input.ends_on ?? null,
        input.employment_type,
        input.workload,
        input.approved_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async findLeaveBalance(tenantId: string, staffProfileId: string, leaveType: string) {
    const result = await this.databaseService.query<{ available_days: string | number }>(
      `
        SELECT available_days
        FROM staff_leave_balances
        WHERE tenant_id = $1
          AND staff_profile_id = $2::uuid
          AND leave_type = $3
        LIMIT 1
      `,
      [tenantId, staffProfileId, leaveType],
    );

    return result.rows[0] ?? { available_days: 0 };
  }

  async approveLeaveRequest(input: ApproveLeaveRequestDto & {
    tenant_id: string;
    approved_by_user_id: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO staff_leave_requests (
          tenant_id,
          staff_profile_id,
          leave_type,
          requested_days,
          status,
          override_reason,
          approved_by_user_id,
          approved_at
        )
        VALUES ($1, $2::uuid, $3, $4, 'approved', $5, $6, NOW())
        RETURNING *
      `,
      [
        input.tenant_id,
        input.staff_profile_id,
        input.leave_type,
        input.requested_days,
        input.override_reason ?? null,
        input.approved_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async changeStaffStatus(input: ChangeStaffStatusDto & {
    tenant_id: string;
  }) {
    const result = await this.databaseService.query(
      `
        UPDATE staff_profiles
        SET status = $3,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id::text, status
      `,
      [input.tenant_id, input.staff_profile_id, input.status],
    );

    return result.rows[0] ?? null;
  }

  async listStaffDirectory(input: {
    tenant_id: string;
    search?: string;
    status?: string;
  }) {
    const result = await this.databaseService.query(
      `
        SELECT
          profile.id::text,
          profile.staff_number,
          profile.display_name,
          profile.display_name AS full_name,
          profile.status,
          department.name AS department_name,
          job_title.title AS job_title,
          profile.created_at::text,
          profile.updated_at::text
        FROM staff_profiles profile
        LEFT JOIN staff_departments department
          ON department.tenant_id = profile.tenant_id
         AND department.id = profile.department_id
        LEFT JOIN staff_job_titles job_title
          ON job_title.tenant_id = profile.tenant_id
         AND job_title.id = profile.job_title_id
        WHERE profile.tenant_id = $1
          AND (
            $2::text IS NULL
            OR profile.display_name ILIKE '%' || $2 || '%'
            OR profile.staff_number ILIKE '%' || $2 || '%'
          )
          AND ($3::text IS NULL OR profile.status = $3)
        ORDER BY profile.display_name, profile.staff_number
        LIMIT 500
      `,
      [input.tenant_id, input.search ?? null, input.status ?? null],
    );

    return result.rows;
  }

  async appendAuditLog(input: {
    tenant_id: string;
    staff_profile_id?: string | null;
    actor_user_id?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.databaseService.query(
      `
        INSERT INTO staff_audit_logs (
          tenant_id,
          staff_profile_id,
          actor_user_id,
          action,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        input.tenant_id,
        input.staff_profile_id ?? null,
        input.actor_user_id ?? null,
        input.action,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
