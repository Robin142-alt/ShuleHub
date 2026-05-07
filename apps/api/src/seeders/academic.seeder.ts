import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { SeedRuntimeContext } from '../modules/seeder/seeder.types';

interface TermSeed {
  code: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: 'active' | 'planned' | 'closed';
}

@Injectable()
export class AcademicSeeder {
  constructor(private readonly databaseService: DatabaseService) {}

  async seed(context: SeedRuntimeContext): Promise<void> {
    await this.databaseService.withRequestTransaction(async () => {
      const academicYearId = await this.upsertAcademicYear(context);
      const termIds = await this.upsertTerms(context, academicYearId);
      await this.upsertClassesAndStreams(context);
      await this.upsertSubjects(context);
      await this.upsertAssignments(context, academicYearId, termIds);
      await this.upsertTimetable(context, termIds.active);

      context.registries.academic_year_id = academicYearId;
      context.registries.active_term_id = termIds.active;
      context.registries.active_term_code = 'T1';
      context.summary.counts.academic_years = 1;
      context.summary.counts.academic_terms = 3;
      context.summary.counts.school_classes = context.registries.class_ids.size;
      context.summary.counts.streams = context.registries.stream_ids.size;
      context.summary.counts.subjects = context.registries.subject_ids.size;
      context.summary.counts.class_subject_assignments = context.registries.assignment_ids.size;
      context.summary.counts.timetable_lessons = await this.countRows(
        'timetable_lessons',
        context.options.tenant,
      );
    });
  }

  private async upsertAcademicYear(context: SeedRuntimeContext): Promise<string> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO academic_years (
          tenant_id,
          code,
          name,
          starts_on,
          ends_on,
          status,
          metadata
        )
        VALUES ($1, '2026', 'Academic Year 2026', '2026-01-06', '2026-11-20', 'active', $2::jsonb)
        ON CONFLICT (tenant_id, code)
        DO UPDATE SET
          name = EXCLUDED.name,
          starts_on = EXCLUDED.starts_on,
          ends_on = EXCLUDED.ends_on,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `,
      [
        context.options.tenant,
        JSON.stringify({
          seed_key: `${context.seed_key}:academic-year:2026`,
        }),
      ],
    );

    return result.rows[0].id;
  }

  private async upsertTerms(
    context: SeedRuntimeContext,
    academicYearId: string,
  ): Promise<{ active: string; all: string[] }> {
    const terms: TermSeed[] = [
      {
        code: 'T1',
        name: 'Term 1',
        starts_on: '2026-01-06',
        ends_on: '2026-04-30',
        status: 'active',
      },
      {
        code: 'T2',
        name: 'Term 2',
        starts_on: '2026-05-11',
        ends_on: '2026-08-07',
        status: 'planned',
      },
      {
        code: 'T3',
        name: 'Term 3',
        starts_on: '2026-09-01',
        ends_on: '2026-11-20',
        status: 'planned',
      },
    ];

    const ids: string[] = [];
    let activeId = '';

    for (const term of terms) {
      const result = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO academic_terms (
            tenant_id,
            academic_year_id,
            code,
            name,
            starts_on,
            ends_on,
            status,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8::jsonb)
          ON CONFLICT (tenant_id, academic_year_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            starts_on = EXCLUDED.starts_on,
            ends_on = EXCLUDED.ends_on,
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          academicYearId,
          term.code,
          term.name,
          term.starts_on,
          term.ends_on,
          term.status,
          JSON.stringify({
            seed_key: `${context.seed_key}:term:${term.code}`,
          }),
        ],
      );

      ids.push(result.rows[0].id);

      if (term.status === 'active') {
        activeId = result.rows[0].id;
      }
    }

    return { active: activeId, all: ids };
  }

  private async upsertClassesAndStreams(context: SeedRuntimeContext): Promise<void> {
    const streamLabels = ['AMANI', 'UMOJA'] as const;
    const teacherIds = Array.from(context.registries.staff_member_ids.entries())
      .filter(([employeeNumber]) => employeeNumber.startsWith('TCH-'))
      .map(([, id]) => id);

    for (let grade = 1; grade <= 9; grade += 1) {
      const classCode = `G${grade}`;
      const level =
        grade <= 3 ? 'cbc-lower-primary' : grade <= 6 ? 'cbc-upper-primary' : 'junior-school';
      const classResult = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO school_classes (
            tenant_id,
            code,
            name,
            grade_order,
            level,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            grade_order = EXCLUDED.grade_order,
            level = EXCLUDED.level,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          classCode,
          `Grade ${grade}`,
          grade,
          level,
          JSON.stringify({
            seed_key: `${context.seed_key}:class:${classCode}`,
          }),
        ],
      );

      const classId = classResult.rows[0].id;
      context.registries.class_ids.set(classCode, classId);

      for (let streamIndex = 0; streamIndex < streamLabels.length; streamIndex += 1) {
        const streamLabel = streamLabels[streamIndex];
        const streamCode = `${classCode}-${streamLabel}`;
        const homeroomStaffId = teacherIds[(grade + streamIndex) % teacherIds.length] ?? null;
        const streamResult = await this.databaseService.query<{ id: string }>(
          `
            INSERT INTO streams (
              tenant_id,
              school_class_id,
              code,
              name,
              homeroom_staff_id,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            ON CONFLICT (tenant_id, school_class_id, code)
            DO UPDATE SET
              name = EXCLUDED.name,
              homeroom_staff_id = EXCLUDED.homeroom_staff_id,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            RETURNING id
          `,
          [
            context.options.tenant,
            classId,
            streamCode,
            streamLabel,
            homeroomStaffId,
            JSON.stringify({
              seed_key: `${context.seed_key}:stream:${streamCode}`,
            }),
          ],
        );

        context.registries.stream_ids.set(streamCode, streamResult.rows[0].id);
        context.registries.stream_class_codes.set(streamCode, classCode);
      }
    }
  }

  private async upsertSubjects(context: SeedRuntimeContext): Promise<void> {
    const subjects = [
      { code: 'ENG', name: 'English', category: 'core' },
      { code: 'KIS', name: 'Kiswahili', category: 'core' },
      { code: 'MAT', name: 'Mathematics', category: 'core' },
      { code: 'SCI', name: 'Integrated Science', category: 'core' },
      { code: 'SST', name: 'Social Studies', category: 'core' },
      { code: 'CRE', name: 'Christian Religious Education', category: 'core' },
      { code: 'AGR', name: 'Agriculture and Nutrition', category: 'core' },
      { code: 'ART', name: 'Creative Arts', category: 'core' },
      { code: 'PE', name: 'Physical and Health Education', category: 'core' },
      { code: 'PRETECH', name: 'Pre-Technical Studies', category: 'optional' },
      { code: 'BUS', name: 'Business Studies', category: 'optional' },
      { code: 'COMP', name: 'Computer Studies', category: 'optional' },
    ] as const;

    for (const subject of subjects) {
      const result = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO subjects (tenant_id, code, name, category, metadata)
          VALUES ($1, $2, $3, $4, $5::jsonb)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          subject.code,
          subject.name,
          subject.category,
          JSON.stringify({
            seed_key: `${context.seed_key}:subject:${subject.code}`,
          }),
        ],
      );

      context.registries.subject_ids.set(subject.code, result.rows[0].id);
    }
  }

  private async upsertAssignments(
    context: SeedRuntimeContext,
    academicYearId: string,
    termIds: { active: string },
  ): Promise<void> {
    const teacherNumbers = Array.from(context.registries.staff_member_ids.keys())
      .filter((employeeNumber) => employeeNumber.startsWith('TCH-'))
      .sort((left, right) => left.localeCompare(right));

    const teacherForSubject = (subjectCode: string): string | null => {
      const exactTeacher = teacherNumbers.find((employeeNumber) =>
        (context.registries.staff_subject_codes.get(employeeNumber) ?? []).includes(subjectCode),
      );
      const employeeNumber =
        exactTeacher
        ?? teacherNumbers[
          Math.abs(subjectCode.split('').reduce((total, letter) => total + letter.charCodeAt(0), 0))
            % teacherNumbers.length
        ];
      return employeeNumber ? context.registries.staff_member_ids.get(employeeNumber) ?? null : null;
    };

    const subjectCodes = Array.from(context.registries.subject_ids.keys()).sort((left, right) =>
      left.localeCompare(right),
    );

    for (const [streamCode, streamId] of context.registries.stream_ids.entries()) {
      const classCode = context.registries.stream_class_codes.get(streamCode);

      if (!classCode) {
        continue;
      }

      const classId = context.registries.class_ids.get(classCode);

      if (!classId) {
        continue;
      }

      for (const subjectCode of subjectCodes) {
        const subjectId = context.registries.subject_ids.get(subjectCode);

        if (!subjectId) {
          continue;
        }

        const assignmentResult = await this.databaseService.query<{ id: string }>(
          `
            INSERT INTO class_subject_assignments (
              tenant_id,
              academic_year_id,
              academic_term_id,
              school_class_id,
              stream_id,
              subject_id,
              staff_member_id,
              lessons_per_week,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
            ON CONFLICT (tenant_id, academic_term_id, stream_id, subject_id)
            DO UPDATE SET
              staff_member_id = EXCLUDED.staff_member_id,
              lessons_per_week = EXCLUDED.lessons_per_week,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            RETURNING id
          `,
          [
            context.options.tenant,
            academicYearId,
            termIds.active,
            classId,
            streamId,
            subjectId,
            teacherForSubject(subjectCode),
            this.lessonsPerWeekForSubject(subjectCode),
            JSON.stringify({
              seed_key: `${context.seed_key}:assignment:${streamCode}:${subjectCode}`,
            }),
          ],
        );

        context.registries.assignment_ids.set(`${streamCode}:${subjectCode}`, assignmentResult.rows[0].id);
      }
    }
  }

  private async upsertTimetable(context: SeedRuntimeContext, activeTermId: string): Promise<void> {
    const periods = [
      { period_number: 1, starts_at: '08:00:00', ends_at: '08:40:00' },
      { period_number: 2, starts_at: '08:45:00', ends_at: '09:25:00' },
      { period_number: 3, starts_at: '09:40:00', ends_at: '10:20:00' },
      { period_number: 4, starts_at: '10:25:00', ends_at: '11:05:00' },
      { period_number: 5, starts_at: '11:20:00', ends_at: '12:00:00' },
      { period_number: 6, starts_at: '14:00:00', ends_at: '14:40:00' },
    ] as const;

    for (const [streamCode, streamId] of context.registries.stream_ids.entries()) {
      const assignmentIds = Array.from(context.registries.assignment_ids.entries())
        .filter(([assignmentKey]) => assignmentKey.startsWith(`${streamCode}:`))
        .map(([, assignmentId]) => assignmentId);

      for (let weekday = 1; weekday <= 5; weekday += 1) {
        for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
          const period = periods[periodIndex];
          const assignmentId = assignmentIds[(weekday + periodIndex) % assignmentIds.length];

          await this.databaseService.query(
            `
              INSERT INTO timetable_lessons (
                tenant_id,
                academic_term_id,
                stream_id,
                class_subject_assignment_id,
                weekday,
                period_number,
                starts_at,
                ends_at,
                room_label,
                metadata
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7::time, $8::time, $9, $10::jsonb)
              ON CONFLICT (tenant_id, academic_term_id, stream_id, weekday, period_number)
              DO UPDATE SET
                class_subject_assignment_id = EXCLUDED.class_subject_assignment_id,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                room_label = EXCLUDED.room_label,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            `,
            [
              context.options.tenant,
              activeTermId,
              streamId,
              assignmentId,
              weekday,
              period.period_number,
              period.starts_at,
              period.ends_at,
              `Room ${period.period_number}`,
              JSON.stringify({
                seed_key: `${context.seed_key}:timetable:${streamCode}:${weekday}:${period.period_number}`,
              }),
            ],
          );
        }
      }
    }
  }

  private lessonsPerWeekForSubject(subjectCode: string): number {
    if (['ENG', 'KIS', 'MAT'].includes(subjectCode)) {
      return 6;
    }

    if (['SCI', 'SST'].includes(subjectCode)) {
      return 5;
    }

    return 3;
  }

  private async countRows(tableName: string, tenantId: string): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${tableName} WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(result.rows[0]?.total ?? '0');
  }
}
