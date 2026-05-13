import { randomUUID, createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { PiiEncryptionService } from '../modules/security/pii-encryption.service';
import { SeedRuntimeContext, StudentGuardianSeedRecord, StudentSeedRecord } from '../modules/seeder/seeder.types';
import { StudentFactory } from './factories/student.factory';

@Injectable()
export class StudentSeeder {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly piiEncryptionService: PiiEncryptionService,
    private readonly studentFactory: StudentFactory,
  ) {}

  async seed(context: SeedRuntimeContext): Promise<void> {
    await this.databaseService.withRequestTransaction(async () => {
      const streamCodes = Array.from(context.registries.stream_ids.keys());
      const studentSeeds = this.studentFactory.buildStudents({
        tenant: context.options.tenant,
        stream_codes: streamCodes,
        stream_class_codes: context.registries.stream_class_codes,
        student_count_per_stream: context.options.student_count_per_stream,
      });

      for (const studentSeed of studentSeeds) {
        const studentId = await this.upsertStudent(context, studentSeed);
        context.registries.student_ids.set(studentSeed.admission_number, studentId);
        context.registries.student_stream_codes.set(studentSeed.admission_number, studentSeed.stream_code);
        context.registries.student_primary_guardian_phones.set(
          studentSeed.admission_number,
          (studentSeed.guardians.find((guardian) => guardian.is_primary) ?? studentSeed.guardians[0]).phone_number,
        );

        for (const guardian of studentSeed.guardians) {
          const guardianId = await this.upsertGuardian(context, guardian);
          context.registries.guardian_ids.set(guardian.seed_key, guardianId);
          await this.upsertStudentGuardian(context, studentId, guardianId, guardian);
        }

        await this.upsertEnrollment(context, studentId, studentSeed);
      }

      context.summary.counts.students = context.registries.student_ids.size;
      context.summary.counts.guardians = await this.countRows('guardians', context.options.tenant);
      context.summary.counts.student_guardians = await this.countRows('student_guardians', context.options.tenant);
      context.summary.counts.student_enrollments = await this.countRows('student_enrollments', context.options.tenant);
    });
  }

  private async upsertStudent(
    context: SeedRuntimeContext,
    seed: StudentSeedRecord,
  ): Promise<string> {
    const primaryGuardian = seed.guardians.find((guardian) => guardian.is_primary) ?? seed.guardians[0];
    const result = await this.databaseService.query<{ id: string }>(
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
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::date,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::uuid
        )
        ON CONFLICT (tenant_id, admission_number)
        DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          middle_name = EXCLUDED.middle_name,
          status = EXCLUDED.status,
          date_of_birth = EXCLUDED.date_of_birth,
          gender = EXCLUDED.gender,
          primary_guardian_name = EXCLUDED.primary_guardian_name,
          primary_guardian_phone = EXCLUDED.primary_guardian_phone,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `,
      [
        context.options.tenant,
        seed.admission_number,
        seed.first_name,
        seed.last_name,
        seed.middle_name,
        seed.status,
        seed.date_of_birth,
        seed.gender,
        this.piiEncryptionService.encryptNullable(
          primaryGuardian?.full_name ?? null,
          this.studentGuardianNameAad(context.options.tenant),
        ),
        this.piiEncryptionService.encryptNullable(
          primaryGuardian?.phone_number ?? null,
          this.studentGuardianPhoneAad(context.options.tenant),
        ),
        JSON.stringify({
          seed_key: seed.seed_key,
          class_code: seed.class_code,
          stream_code: seed.stream_code,
        }),
        context.registries.owner_user_id ?? null,
      ],
    );

    return result.rows[0].id;
  }

  private async upsertGuardian(
    context: SeedRuntimeContext,
    seed: StudentGuardianSeedRecord,
  ): Promise<string> {
    const phoneLookupKey = this.lookupKey(seed.phone_number);
    const emailLookupKey = seed.email ? this.lookupKey(seed.email) : null;
    const result = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO guardians (
          tenant_id,
          full_name,
          phone_number,
          phone_lookup_key,
          email,
          email_lookup_key,
          occupation,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (tenant_id, phone_lookup_key)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          email_lookup_key = EXCLUDED.email_lookup_key,
          occupation = EXCLUDED.occupation,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `,
      [
        context.options.tenant,
        seed.full_name,
        this.piiEncryptionService.encrypt(seed.phone_number, this.guardianPhoneAad(context.options.tenant)),
        phoneLookupKey,
        this.piiEncryptionService.encryptNullable(seed.email, this.guardianEmailAad(context.options.tenant)),
        emailLookupKey,
        seed.occupation,
        JSON.stringify({
          seed_key: seed.seed_key,
          relationship: seed.relationship,
        }),
      ],
    );

    return result.rows[0].id;
  }

  private async upsertStudentGuardian(
    context: SeedRuntimeContext,
    studentId: string,
    guardianId: string,
    guardian: StudentGuardianSeedRecord,
  ): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO student_guardians (
          tenant_id,
          student_id,
          guardian_id,
          relationship,
          is_primary,
          can_receive_sms,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6::jsonb)
        ON CONFLICT (tenant_id, student_id, guardian_id, relationship)
        DO UPDATE SET
          is_primary = EXCLUDED.is_primary,
          can_receive_sms = EXCLUDED.can_receive_sms,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `,
      [
        context.options.tenant,
        studentId,
        guardianId,
        guardian.relationship,
        guardian.is_primary,
        JSON.stringify({
          seed_key: guardian.seed_key,
        }),
      ],
    );
  }

  private async upsertEnrollment(
    context: SeedRuntimeContext,
    studentId: string,
    seed: StudentSeedRecord,
  ): Promise<void> {
    const classId = context.registries.class_ids.get(seed.class_code);
    const streamId = context.registries.stream_ids.get(seed.stream_code);

    if (!classId || !streamId || !context.registries.academic_year_id || !context.registries.active_term_id) {
      throw new Error(`Academic structure missing while enrolling ${seed.admission_number}`);
    }

    await this.databaseService.query(
      `
        INSERT INTO student_enrollments (
          tenant_id,
          student_id,
          academic_year_id,
          academic_term_id,
          school_class_id,
          stream_id,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb)
        ON CONFLICT (tenant_id, academic_term_id, student_id)
        DO UPDATE SET
          academic_year_id = EXCLUDED.academic_year_id,
          school_class_id = EXCLUDED.school_class_id,
          stream_id = EXCLUDED.stream_id,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `,
      [
        context.options.tenant,
        studentId,
        context.registries.academic_year_id,
        context.registries.active_term_id,
        classId,
        streamId,
        JSON.stringify({
          seed_key: `${seed.seed_key}:enrollment`,
        }),
      ],
    );
  }


  private async countRows(tableName: string, tenantId: string): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${tableName} WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  private lookupKey(value: string): string {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  private studentGuardianNameAad(tenantId: string): string {
    return `students:${tenantId}:primary_guardian_name`;
  }

  private studentGuardianPhoneAad(tenantId: string): string {
    return `students:${tenantId}:primary_guardian_phone`;
  }

  private guardianPhoneAad(tenantId: string): string {
    return `guardians:${tenantId}:phone_number`;
  }

  private guardianEmailAad(tenantId: string): string {
    return `guardians:${tenantId}:email`;
  }
}
