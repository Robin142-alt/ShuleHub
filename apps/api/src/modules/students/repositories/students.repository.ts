import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { PiiEncryptionService } from '../../security/pii-encryption.service';
import { StudentEntity } from '../entities/student.entity';

interface StudentRow {
  id: string;
  tenant_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  status: StudentEntity['status'];
  date_of_birth: string | null;
  gender: StudentEntity['gender'];
  primary_guardian_name: string | null;
  primary_guardian_phone: string | null;
  metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateStudentInput {
  tenant_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  status: StudentEntity['status'];
  date_of_birth: string | null;
  gender: StudentEntity['gender'];
  primary_guardian_name: string | null;
  primary_guardian_phone: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
}

type UpdateStudentInput = Partial<Omit<CreateStudentInput, 'tenant_id' | 'created_by_user_id'>> & {
  metadata?: Record<string, unknown>;
};

@Injectable()
export class StudentsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
  ) {}

  async createStudent(input: CreateStudentInput): Promise<StudentEntity> {
    const result = await this.databaseService.query<StudentRow>(
      `
        INSERT INTO students (
          tenant_id,
          admission_number,
          first_name,
          last_name,
          middle_name,
          status,
          date_of_birth,
          gender,
          primary_guardian_name,
          primary_guardian_phone,
          metadata,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11::jsonb, $12::uuid)
        RETURNING
          id,
          tenant_id,
          admission_number,
          first_name,
          last_name,
          middle_name,
          status,
          date_of_birth::text,
          gender,
          primary_guardian_name,
          primary_guardian_phone,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.admission_number,
        input.first_name,
        input.last_name,
        input.middle_name,
        input.status,
        input.date_of_birth,
        input.gender,
        this.piiEncryptionService.encryptNullable(
          input.primary_guardian_name,
          this.guardianNameAad(input.tenant_id),
        ),
        this.piiEncryptionService.encryptNullable(
          input.primary_guardian_phone,
          this.guardianPhoneAad(input.tenant_id),
        ),
        JSON.stringify(input.metadata ?? {}),
        input.created_by_user_id,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(tenantId: string, studentId: string): Promise<StudentEntity | null> {
    const result = await this.databaseService.query<StudentRow>(
      `
        SELECT
          id,
          tenant_id,
          admission_number,
          first_name,
          last_name,
          middle_name,
          status,
          date_of_birth::text,
          gender,
          primary_guardian_name,
          primary_guardian_phone,
          metadata,
          created_by_user_id,
          created_at,
          updated_at
        FROM students
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, studentId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listStudents(
    tenantId: string,
    options: {
      search?: string;
      status?: StudentEntity['status'];
      limit: number;
    },
  ): Promise<StudentEntity[]> {
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = values.length + 1;

    if (options.status) {
      conditions.push(`status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    if (options.search) {
      conditions.push(
        `(
          admission_number ILIKE $${parameterIndex}
          OR first_name ILIKE $${parameterIndex}
          OR last_name ILIKE $${parameterIndex}
          OR COALESCE(middle_name, '') ILIKE $${parameterIndex}
        )`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    values.push(options.limit);
    const query = `
      SELECT
        id,
        tenant_id,
        admission_number,
        first_name,
        last_name,
        middle_name,
        status,
        date_of_birth::text,
        gender,
        primary_guardian_name,
        primary_guardian_phone,
        metadata,
        created_by_user_id,
        created_at,
        updated_at
      FROM students
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY created_at DESC, admission_number ASC
      LIMIT $${parameterIndex}
    `;
    const result = await this.databaseService.query<StudentRow>(query, values);

    return result.rows.map((row) => this.mapRow(row));
  }

  async countStudentsByStatus(
    tenantId: string,
    status: StudentEntity['status'],
  ): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM students
        WHERE tenant_id = $1
          AND status = $2
      `,
      [tenantId, status],
    );

    return Number(result.rows[0]?.total ?? '0');
  }

  async updateStudent(
    tenantId: string,
    studentId: string,
    input: UpdateStudentInput,
  ): Promise<StudentEntity | null> {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, studentId];
    let parameterIndex = values.length + 1;

    const setField = (column: string, value: unknown, cast?: string): void => {
      assignments.push(`${column} = $${parameterIndex}${cast ? `::${cast}` : ''}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.admission_number !== undefined) {
      setField('admission_number', input.admission_number);
    }

    if (input.first_name !== undefined) {
      setField('first_name', input.first_name);
    }

    if (input.last_name !== undefined) {
      setField('last_name', input.last_name);
    }

    if (input.middle_name !== undefined) {
      setField('middle_name', input.middle_name);
    }

    if (input.status !== undefined) {
      setField('status', input.status);
    }

    if (input.date_of_birth !== undefined) {
      setField('date_of_birth', input.date_of_birth, 'date');
    }

    if (input.gender !== undefined) {
      setField('gender', input.gender);
    }

    if (input.primary_guardian_name !== undefined) {
      setField(
        'primary_guardian_name',
        this.piiEncryptionService.encryptNullable(
          input.primary_guardian_name,
          this.guardianNameAad(tenantId),
        ),
      );
    }

    if (input.primary_guardian_phone !== undefined) {
      setField(
        'primary_guardian_phone',
        this.piiEncryptionService.encryptNullable(
          input.primary_guardian_phone,
          this.guardianPhoneAad(tenantId),
        ),
      );
    }

    if (input.metadata !== undefined) {
      setField('metadata', JSON.stringify(input.metadata ?? {}), 'jsonb');
    }

    if (assignments.length === 0) {
      return this.findById(tenantId, studentId);
    }

    assignments.push('updated_at = NOW()');
    const query = `
      UPDATE students
      SET
        ${assignments.join(',\n        ')}
      WHERE tenant_id = $1
        AND id = $2::uuid
      RETURNING
        id,
        tenant_id,
        admission_number,
        first_name,
        last_name,
        middle_name,
        status,
        date_of_birth::text,
        gender,
        primary_guardian_name,
        primary_guardian_phone,
        metadata,
        created_by_user_id,
        created_at,
        updated_at
    `;
    const result = await this.databaseService.query<StudentRow>(query, values);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: StudentRow): StudentEntity {
    return Object.assign(new StudentEntity(), {
      ...row,
      primary_guardian_name: this.piiEncryptionService.decryptNullable(
        row.primary_guardian_name,
        this.guardianNameAad(row.tenant_id),
      ),
      primary_guardian_phone: this.piiEncryptionService.decryptNullable(
        row.primary_guardian_phone,
        this.guardianPhoneAad(row.tenant_id),
      ),
      metadata: row.metadata ?? {},
    });
  }

  private guardianNameAad(tenantId: string): string {
    return `students:${tenantId}:primary_guardian_name`;
  }

  private guardianPhoneAad(tenantId: string): string {
    return `students:${tenantId}:primary_guardian_phone`;
  }
}
