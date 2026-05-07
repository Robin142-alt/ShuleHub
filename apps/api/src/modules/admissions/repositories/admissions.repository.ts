import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';

export interface AdmissionApplicationRecord {
  id: string;
  tenant_id: string;
  application_number: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  birth_certificate_number: string;
  nationality: string;
  previous_school: string | null;
  kcpe_results: string | null;
  cbc_level: string | null;
  class_applying: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string | null;
  parent_occupation: string | null;
  relationship: string;
  allergies: string | null;
  conditions: string | null;
  emergency_contact: string | null;
  status: string;
  interview_date: string | null;
  review_notes: string | null;
  approved_at: string | null;
  admitted_student_id: string | null;
  created_at?: Date;
  updated_at?: Date;
}

@Injectable()
export class AdmissionsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async buildSummary(tenantId: string) {
    const [newApplications, approvedStudents, pendingReview, totalRegistered, recentApplications, pendingApprovals, missingDocuments] = await Promise.all([
      this.countByStatus(tenantId, ['pending', 'interview']),
      this.countByStatus(tenantId, ['approved']),
      this.countByStatus(tenantId, ['pending']),
      this.countByStatus(tenantId, ['registered']),
      this.databaseService.query(
        `
          SELECT application_number, full_name, class_applying, status, parent_phone, created_at
          FROM admission_applications
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT 6
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT application_number, full_name, status
          FROM admission_applications
          WHERE tenant_id = $1
            AND status IN ('pending', 'interview')
          ORDER BY created_at DESC
          LIMIT 6
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT
            application.application_number,
            application.full_name,
            COUNT(document.id)::int AS uploaded_documents
          FROM admission_applications application
          LEFT JOIN admission_documents document
            ON document.tenant_id = application.tenant_id
           AND document.application_id = application.id
          WHERE application.tenant_id = $1
          GROUP BY application.id
          HAVING COUNT(document.id) < 3
          ORDER BY application.created_at DESC
          LIMIT 6
        `,
        [tenantId],
      ),
    ]);

    return {
      new_applications: newApplications,
      approved_students: approvedStudents,
      pending_review: pendingReview,
      total_registered: totalRegistered,
      recent_applications: recentApplications.rows,
      pending_approvals: pendingApprovals.rows,
      missing_documents: missingDocuments.rows,
    };
  }

  private async countByStatus(tenantId: string, statuses: string[]) {
    const result = await this.databaseService.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM admission_applications
        WHERE tenant_id = $1
          AND status = ANY($2::text[])
      `,
      [tenantId, statuses],
    );

    return Number(result.rows[0]?.total ?? '0');
  }

  async listApplications(
    tenantId: string,
    options: { search?: string; status?: string; limit: number },
  ): Promise<AdmissionApplicationRecord[]> {
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.search) {
      conditions.push(
        `(full_name ILIKE $${parameterIndex} OR application_number ILIKE $${parameterIndex} OR parent_phone ILIKE $${parameterIndex})`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    if (options.status) {
      conditions.push(`status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    values.push(options.limit);

    const result = await this.databaseService.query<AdmissionApplicationRecord>(
      `
        SELECT
          id,
          tenant_id,
          application_number,
          full_name,
          date_of_birth::text,
          gender,
          birth_certificate_number,
          nationality,
          previous_school,
          kcpe_results,
          cbc_level,
          class_applying,
          parent_name,
          parent_phone,
          parent_email,
          parent_occupation,
          relationship,
          allergies,
          conditions,
          emergency_contact,
          status,
          interview_date::text,
          review_notes,
          approved_at::text,
          admitted_student_id::text,
          created_at,
          updated_at
        FROM admission_applications
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${parameterIndex}
      `,
      values,
    );

    return result.rows;
  }

  async createApplication(input: Omit<AdmissionApplicationRecord, 'id' | 'created_at' | 'updated_at' | 'approved_at' | 'admitted_student_id'>) {
    const result = await this.databaseService.query<AdmissionApplicationRecord>(
      `
        INSERT INTO admission_applications (
          tenant_id,
          application_number,
          full_name,
          date_of_birth,
          gender,
          birth_certificate_number,
          nationality,
          previous_school,
          kcpe_results,
          cbc_level,
          class_applying,
          parent_name,
          parent_phone,
          parent_email,
          parent_occupation,
          relationship,
          allergies,
          conditions,
          emergency_contact,
          status,
          interview_date,
          review_notes
        )
        VALUES (
          $1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::date, $22
        )
        RETURNING
          id,
          tenant_id,
          application_number,
          full_name,
          date_of_birth::text,
          gender,
          birth_certificate_number,
          nationality,
          previous_school,
          kcpe_results,
          cbc_level,
          class_applying,
          parent_name,
          parent_phone,
          parent_email,
          parent_occupation,
          relationship,
          allergies,
          conditions,
          emergency_contact,
          status,
          interview_date::text,
          review_notes,
          approved_at::text,
          admitted_student_id::text,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.application_number,
        input.full_name,
        input.date_of_birth,
        input.gender,
        input.birth_certificate_number,
        input.nationality,
        input.previous_school,
        input.kcpe_results,
        input.cbc_level,
        input.class_applying,
        input.parent_name,
        input.parent_phone,
        input.parent_email,
        input.parent_occupation,
        input.relationship,
        input.allergies,
        input.conditions,
        input.emergency_contact,
        input.status,
        input.interview_date,
        input.review_notes,
      ],
    );

    return result.rows[0];
  }

  async findApplicationById(tenantId: string, applicationId: string): Promise<AdmissionApplicationRecord | null> {
    const result = await this.databaseService.query<AdmissionApplicationRecord>(
      `
        SELECT
          id,
          tenant_id,
          application_number,
          full_name,
          date_of_birth::text,
          gender,
          birth_certificate_number,
          nationality,
          previous_school,
          kcpe_results,
          cbc_level,
          class_applying,
          parent_name,
          parent_phone,
          parent_email,
          parent_occupation,
          relationship,
          allergies,
          conditions,
          emergency_contact,
          status,
          interview_date::text,
          review_notes,
          approved_at::text,
          admitted_student_id::text,
          created_at,
          updated_at
        FROM admission_applications
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, applicationId],
    );

    return result.rows[0] ?? null;
  }

  async updateApplication(
    tenantId: string,
    applicationId: string,
    input: Partial<Pick<AdmissionApplicationRecord, 'status' | 'review_notes' | 'interview_date'>>,
  ) {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, applicationId];
    let parameterIndex = 3;

    if (input.status !== undefined) {
      assignments.push(`status = $${parameterIndex}`);
      values.push(input.status);
      parameterIndex += 1;
      if (input.status === 'approved') {
        assignments.push(`approved_at = NOW()`);
      }
    }

    if (input.review_notes !== undefined) {
      assignments.push(`review_notes = $${parameterIndex}`);
      values.push(input.review_notes);
      parameterIndex += 1;
    }

    if (input.interview_date !== undefined) {
      assignments.push(`interview_date = $${parameterIndex}::date`);
      values.push(input.interview_date);
      parameterIndex += 1;
    }

    if (assignments.length === 0) {
      return this.findApplicationById(tenantId, applicationId);
    }

    assignments.push('updated_at = NOW()');

    const result = await this.databaseService.query<AdmissionApplicationRecord>(
      `
        UPDATE admission_applications
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          application_number,
          full_name,
          date_of_birth::text,
          gender,
          birth_certificate_number,
          nationality,
          previous_school,
          kcpe_results,
          cbc_level,
          class_applying,
          parent_name,
          parent_phone,
          parent_email,
          parent_occupation,
          relationship,
          allergies,
          conditions,
          emergency_contact,
          status,
          interview_date::text,
          review_notes,
          approved_at::text,
          admitted_student_id::text,
          created_at,
          updated_at
      `,
      values,
    );

    return result.rows[0] ?? null;
  }

  async markApplicationRegistered(tenantId: string, applicationId: string, studentId: string) {
    const result = await this.databaseService.query(
      `
        UPDATE admission_applications
        SET status = 'registered',
            admitted_student_id = $3::uuid,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, status
      `,
      [tenantId, applicationId, studentId],
    );

    return result.rows[0] ?? null;
  }

  async saveDocumentRecord(input: {
    tenant_id: string;
    application_id?: string | null;
    student_id?: string | null;
    document_type: string;
    original_file_name: string;
    stored_path: string;
    mime_type: string;
    size_bytes: number;
    verification_status: string;
    uploaded_by_user_id?: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO admission_documents (
          tenant_id,
          application_id,
          student_id,
          document_type,
          original_file_name,
          stored_path,
          mime_type,
          size_bytes,
          verification_status,
          uploaded_by_user_id
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::uuid)
        RETURNING id, document_type, original_file_name, verification_status
      `,
      [
        input.tenant_id,
        input.application_id ?? null,
        input.student_id ?? null,
        input.document_type,
        input.original_file_name,
        input.stored_path,
        input.mime_type,
        input.size_bytes,
        input.verification_status,
        input.uploaded_by_user_id ?? null,
      ],
    );

    return result.rows[0];
  }

  async listDocuments(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          document.id,
          document.document_type,
          document.original_file_name,
          document.verification_status,
          document.created_at,
          application.full_name AS applicant_name,
          student.admission_number
        FROM admission_documents document
        LEFT JOIN admission_applications application
          ON application.tenant_id = document.tenant_id
         AND application.id = document.application_id
        LEFT JOIN students student
          ON student.tenant_id = document.tenant_id
         AND student.id = document.student_id
        WHERE document.tenant_id = $1
        ORDER BY document.created_at DESC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async updateDocumentVerificationStatus(
    tenantId: string,
    documentId: string,
    verificationStatus: string,
  ) {
    const result = await this.databaseService.query(
      `
        UPDATE admission_documents
        SET verification_status = $3,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, document_type, original_file_name, verification_status, created_at
      `,
      [tenantId, documentId, verificationStatus],
    );

    return result.rows[0] ?? null;
  }

  async createAllocation(input: {
    tenant_id: string;
    student_id: string;
    class_name: string;
    stream_name: string;
    dormitory_name?: string | null;
    transport_route?: string | null;
    effective_from: string;
    notes?: string | null;
  }) {
    await this.databaseService.query(
      `
        UPDATE student_allocations
        SET is_current = FALSE,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND student_id = $2::uuid
          AND is_current = TRUE
      `,
      [input.tenant_id, input.student_id],
    );

    const result = await this.databaseService.query(
      `
        INSERT INTO student_allocations (
          tenant_id,
          student_id,
          class_name,
          stream_name,
          dormitory_name,
          transport_route,
          effective_from,
          is_current,
          notes
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::date, TRUE, $8)
        RETURNING id, class_name, stream_name, dormitory_name, transport_route
      `,
      [
        input.tenant_id,
        input.student_id,
        input.class_name,
        input.stream_name,
        input.dormitory_name ?? null,
        input.transport_route ?? null,
        input.effective_from,
        input.notes ?? null,
      ],
    );

    return result.rows[0];
  }

  async listAllocations(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          allocation.id,
          student.id AS student_id,
          student.admission_number,
          student.first_name,
          student.last_name,
          allocation.class_name,
          allocation.stream_name,
          allocation.dormitory_name,
          allocation.transport_route,
          allocation.effective_from
        FROM student_allocations allocation
        JOIN students student
          ON student.tenant_id = allocation.tenant_id
         AND student.id = allocation.student_id
        WHERE allocation.tenant_id = $1
          AND allocation.is_current = TRUE
        ORDER BY allocation.effective_from DESC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async listStudentDirectory(
    tenantId: string,
    options: { search?: string; limit: number },
  ) {
    const conditions = ['student.tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.search) {
      conditions.push(
        `(
          CONCAT(student.first_name, ' ', student.last_name) ILIKE $${parameterIndex}
          OR student.admission_number ILIKE $${parameterIndex}
          OR COALESCE(student.primary_guardian_phone, '') ILIKE $${parameterIndex}
        )`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    values.push(options.limit);

    const result = await this.databaseService.query(
      `
        SELECT
          student.id,
          student.admission_number,
          student.first_name,
          student.last_name,
          student.primary_guardian_name,
          student.primary_guardian_phone,
          student.metadata,
          allocation.class_name,
          allocation.stream_name,
          allocation.dormitory_name,
          allocation.transport_route
        FROM students student
        LEFT JOIN student_allocations allocation
          ON allocation.tenant_id = student.tenant_id
         AND allocation.student_id = student.id
         AND allocation.is_current = TRUE
        WHERE ${conditions.join(' AND ')}
        ORDER BY student.created_at DESC
        LIMIT $${parameterIndex}
      `,
      values,
    );

    return result.rows;
  }

  async getStudentProfile(tenantId: string, studentId: string) {
    const [studentResult, documentsResult, allocationResult, attendanceResult] = await Promise.all([
      this.databaseService.query(
        `
          SELECT
            id,
            admission_number,
            first_name,
            last_name,
            date_of_birth::text,
            gender,
            primary_guardian_name,
            primary_guardian_phone,
            metadata
          FROM students
          WHERE tenant_id = $1
            AND id = $2::uuid
          LIMIT 1
        `,
        [tenantId, studentId],
      ),
      this.databaseService.query(
        `
          SELECT id, document_type, original_file_name, verification_status, created_at
          FROM admission_documents
          WHERE tenant_id = $1
            AND student_id = $2::uuid
          ORDER BY created_at DESC
        `,
        [tenantId, studentId],
      ),
      this.databaseService.query(
        `
          SELECT class_name, stream_name, dormitory_name, transport_route, effective_from
          FROM student_allocations
          WHERE tenant_id = $1
            AND student_id = $2::uuid
            AND is_current = TRUE
          ORDER BY effective_from DESC
          LIMIT 1
        `,
        [tenantId, studentId],
      ),
      this.databaseService.query(
        `
          SELECT attendance_date::text, status, notes
          FROM attendance_records
          WHERE tenant_id = $1
            AND student_id = $2::uuid
          ORDER BY attendance_date DESC
          LIMIT 10
        `,
        [tenantId, studentId],
      ),
    ]);

    if (!studentResult.rows[0]) {
      return null;
    }

    return {
      student: studentResult.rows[0],
      allocation: allocationResult.rows[0] ?? null,
      documents: documentsResult.rows,
      attendance: attendanceResult.rows,
    };
  }

  async listParents(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          COALESCE(primary_guardian_name, parent_name) AS parent_name,
          COALESCE(primary_guardian_phone, parent_phone) AS parent_phone,
          parent_email,
          parent_occupation,
          relationship
        FROM (
          SELECT
            student.primary_guardian_name,
            student.primary_guardian_phone,
            NULL::text AS parent_name,
            NULL::text AS parent_phone,
            NULL::text AS parent_email,
            NULL::text AS parent_occupation,
            NULL::text AS relationship
          FROM students student
          WHERE student.tenant_id = $1

          UNION ALL

          SELECT
            NULL::text AS primary_guardian_name,
            NULL::text AS primary_guardian_phone,
            application.parent_name,
            application.parent_phone,
            application.parent_email,
            application.parent_occupation,
            application.relationship
          FROM admission_applications application
          WHERE application.tenant_id = $1
        ) parents
        WHERE COALESCE(primary_guardian_name, parent_name) IS NOT NULL
        ORDER BY COALESCE(primary_guardian_name, parent_name) ASC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async createTransferRecord(input: {
    tenant_id: string;
    student_id?: string | null;
    application_id?: string | null;
    transfer_type: string;
    school_name: string;
    reason: string;
    requested_on: string;
    status: string;
    notes?: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO student_transfer_records (
          tenant_id,
          student_id,
          application_id,
          transfer_type,
          school_name,
          reason,
          requested_on,
          status,
          notes
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::date, $8, $9)
        RETURNING id, transfer_type, school_name, status
      `,
      [
        input.tenant_id,
        input.student_id ?? null,
        input.application_id ?? null,
        input.transfer_type,
        input.school_name,
        input.reason,
        input.requested_on,
        input.status,
        input.notes ?? null,
      ],
    );

    return result.rows[0];
  }

  async listTransfers(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT id, student_id, application_id, transfer_type, school_name, reason, requested_on, status, notes
        FROM student_transfer_records
        WHERE tenant_id = $1
        ORDER BY requested_on DESC, created_at DESC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async buildReports(tenantId: string) {
    const [statusBreakdown, allocationBreakdown, documentVerification] = await Promise.all([
      this.databaseService.query(
        `
          SELECT status, COUNT(*)::int AS total
          FROM admission_applications
          WHERE tenant_id = $1
          GROUP BY status
          ORDER BY total DESC, status ASC
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT class_name, COUNT(*)::int AS total
          FROM student_allocations
          WHERE tenant_id = $1
            AND is_current = TRUE
          GROUP BY class_name
          ORDER BY total DESC, class_name ASC
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT verification_status, COUNT(*)::int AS total
          FROM admission_documents
          WHERE tenant_id = $1
          GROUP BY verification_status
          ORDER BY total DESC, verification_status ASC
        `,
        [tenantId],
      ),
    ]);

    return {
      application_status_breakdown: statusBreakdown.rows,
      class_allocation_breakdown: allocationBreakdown.rows,
      document_verification_breakdown: documentVerification.rows,
    };
  }
}
