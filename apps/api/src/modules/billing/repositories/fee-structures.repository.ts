import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import {
  FeeStructureEntity,
  FeeStructureLineItem,
  FeeStructureStatus,
} from '../entities/fee-structure.entity';

interface FeeStructureRow {
  id: string;
  tenant_id: string;
  name: string;
  academic_year: string;
  term: string;
  grade_level: string;
  class_name: string | null;
  currency_code: string;
  status: FeeStructureStatus;
  due_days: number;
  line_items: FeeStructureLineItem[] | null;
  total_amount_minor: string;
  metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFeeStructureInput {
  tenant_id: string;
  name: string;
  academic_year: string;
  term: string;
  grade_level: string;
  class_name: string | null;
  currency_code: string;
  status: FeeStructureStatus;
  due_days: number;
  line_items: FeeStructureLineItem[];
  total_amount_minor: string;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
}

export interface FeeStructureBillableStudentScope {
  grade_level: string;
  class_name: string | null;
}

export interface FeeStructureBillableStudentRow {
  student_id: string;
  student_name: string;
  admission_number: string;
  grade_level: string;
  class_name: string | null;
  guardian_phone: string | null;
}

@Injectable()
export class FeeStructuresRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(input: CreateFeeStructureInput): Promise<FeeStructureEntity> {
    const result = await this.databaseService.query<FeeStructureRow>(
      `
        INSERT INTO fee_structures (
          tenant_id,
          name,
          academic_year,
          term,
          grade_level,
          class_name,
          currency_code,
          status,
          due_days,
          line_items,
          total_amount_minor,
          metadata,
          created_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11::bigint,
          $12::jsonb,
          $13::uuid
        )
        RETURNING
          id,
          tenant_id,
          name,
          academic_year,
          term,
          grade_level,
          class_name,
          currency_code,
          status,
          due_days,
          line_items,
          total_amount_minor::text,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.name,
        input.academic_year,
        input.term,
        input.grade_level,
        input.class_name,
        input.currency_code,
        input.status,
        input.due_days,
        JSON.stringify(input.line_items),
        input.total_amount_minor,
        JSON.stringify(input.metadata ?? {}),
        input.created_by_user_id,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async list(tenantId: string): Promise<FeeStructureEntity[]> {
    const result = await this.databaseService.query<FeeStructureRow>(
      `
        SELECT
          id,
          tenant_id,
          name,
          academic_year,
          term,
          grade_level,
          class_name,
          currency_code,
          status,
          due_days,
          line_items,
          total_amount_minor::text,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        FROM fee_structures
        WHERE tenant_id = $1
        ORDER BY academic_year DESC, term ASC, grade_level ASC, class_name ASC NULLS FIRST, created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(
    tenantId: string,
    feeStructureId: string,
  ): Promise<FeeStructureEntity | null> {
    const result = await this.databaseService.query<FeeStructureRow>(
      `
        SELECT
          id,
          tenant_id,
          name,
          academic_year,
          term,
          grade_level,
          class_name,
          currency_code,
          status,
          due_days,
          line_items,
          total_amount_minor::text,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        FROM fee_structures
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, feeStructureId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async archive(
    tenantId: string,
    feeStructureId: string,
  ): Promise<FeeStructureEntity | null> {
    const result = await this.databaseService.query<FeeStructureRow>(
      `
        UPDATE fee_structures
        SET
          status = 'archived',
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          name,
          academic_year,
          term,
          grade_level,
          class_name,
          currency_code,
          status,
          due_days,
          line_items,
          total_amount_minor::text,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [tenantId, feeStructureId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listBillableStudentsForFeeStructure(
    tenantId: string,
    scope: FeeStructureBillableStudentScope,
  ): Promise<FeeStructureBillableStudentRow[]> {
    const values: unknown[] = [tenantId, scope.grade_level];
    const classCondition = scope.class_name
      ? 'AND lower(allocation.stream_name) = lower($3)'
      : '';

    if (scope.class_name) {
      values.push(scope.class_name);
    }

    const result = await this.databaseService.query<FeeStructureBillableStudentRow>(
      `
        SELECT
          student.id::text AS student_id,
          CONCAT(student.first_name, ' ', student.last_name) AS student_name,
          student.admission_number,
          allocation.class_name AS grade_level,
          allocation.stream_name AS class_name,
          NULLIF(student.primary_guardian_phone, '') AS guardian_phone
        FROM students student
        JOIN student_allocations allocation
          ON allocation.tenant_id = student.tenant_id
         AND allocation.student_id = student.id
         AND allocation.is_current = TRUE
        WHERE student.tenant_id = $1
          AND student.status = 'active'
          AND lower(allocation.class_name) = lower($2)
          ${classCondition}
        ORDER BY student.last_name ASC, student.first_name ASC, student.admission_number ASC
      `,
      values,
    );

    return result.rows;
  }

  private mapRow(row: FeeStructureRow): FeeStructureEntity {
    return Object.assign(new FeeStructureEntity(), {
      ...row,
      line_items: row.line_items ?? [],
      metadata: row.metadata ?? {},
    });
  }
}
