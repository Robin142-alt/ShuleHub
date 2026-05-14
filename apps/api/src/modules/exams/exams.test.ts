import assert from 'node:assert/strict';
import test from 'node:test';

import { PATH_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../auth/auth.constants';
import { ExamsController } from './exams.controller';
import { ExamsSchemaService } from './exams-schema.service';
import { ExamsService } from './exams.service';

test('ExamsSchemaService creates exam and report-card tables with tenant RLS', async () => {
  let schemaSql = '';
  const service = new ExamsSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS exam_series/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS exam_marks/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS student_report_cards/);
  assert.match(schemaSql, /ALTER TABLE exam_marks FORCE ROW LEVEL SECURITY/);
  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_exam_marks_subject_scope/);
  assert.doesNotMatch(schemaSql, /attendance/i);
});

test('ExamsService allows an assigned teacher to enter subject-scoped marks with audit', async () => {
  const calls: string[] = [];
  const service = new ExamsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'teacher-1', role: 'teacher', permissions: ['exams:enter-marks'] }) } as never,
    {
      findTeacherAssignment: async () => ({ id: 'assignment-1' }),
      findSeriesState: async () => ({ status: 'draft', locked_at: null, published_at: null }),
      upsertMark: async (input: Record<string, unknown>) => {
        calls.push('mark');
        return { id: 'mark-1', score: input.score };
      },
      appendMarkAuditLog: async () => {
        calls.push('audit');
      },
    } as never,
  );

  const mark = await service.enterMark({
    exam_series_id: 'series-1',
    assessment_id: 'assessment-1',
    academic_term_id: 'term-1',
    class_section_id: 'class-1',
    subject_id: 'subject-1',
    student_id: 'student-1',
    score: 84,
  });

  assert.equal(mark.score, 84);
  assert.deepEqual(calls, ['mark', 'audit']);
});

test('ExamsService rejects teacher mark entry outside assigned subject scope', async () => {
  const service = new ExamsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'teacher-1', role: 'teacher', permissions: ['exams:enter-marks'] }) } as never,
    {
      findTeacherAssignment: async () => null,
      upsertMark: async () => {
        throw new Error('unassigned marks must not be saved');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      service.enterMark({
        exam_series_id: 'series-1',
        assessment_id: 'assessment-1',
        academic_term_id: 'term-1',
        class_section_id: 'class-1',
        subject_id: 'subject-2',
        student_id: 'student-1',
        score: 84,
      }),
    ForbiddenException,
  );
});

test('ExamsService blocks regular mark mutation after lock and allows audited officer correction', async () => {
  const teacherService = new ExamsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'teacher-1', role: 'teacher', permissions: ['exams:enter-marks'] }) } as never,
    {
      findTeacherAssignment: async () => ({ id: 'assignment-1' }),
      findSeriesState: async () => ({ status: 'locked', locked_at: '2026-05-14T08:00:00.000Z', published_at: null }),
    } as never,
  );

  await assert.rejects(
    () =>
      teacherService.enterMark({
        exam_series_id: 'series-1',
        assessment_id: 'assessment-1',
        academic_term_id: 'term-1',
        class_section_id: 'class-1',
        subject_id: 'subject-1',
        student_id: 'student-1',
        score: 86,
      }),
    /locked/,
  );

  const calls: string[] = [];
  const officerService = new ExamsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'officer-1', role: 'admin', permissions: ['exams:approve'] }) } as never,
    {
      findExistingMark: async () => ({ id: 'mark-1', score: 84 }),
      correctLockedMark: async () => {
        calls.push('correct');
        return { id: 'mark-1', score: 86 };
      },
      appendMarkAuditLog: async () => {
        calls.push('audit');
      },
    } as never,
  );

  const corrected = await officerService.correctLockedMark({
    mark_id: 'mark-1',
    score: 86,
    reason: 'HOD-approved correction',
  });

  assert.equal(corrected.score, 86);
  assert.deepEqual(calls, ['correct', 'audit']);
});

test('ExamsService publishes report cards with snapshot linkage and audit', async () => {
  const calls: string[] = [];
  const service = new ExamsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'officer-1', role: 'admin', permissions: ['exams:approve'] }) } as never,
    {
      createReportCardSnapshot: async () => {
        calls.push('report-card');
        return {
          id: 'report-card-1',
          report_snapshot_id: 'report-snapshot:tenant-a:exams:term-2',
          status: 'published',
        };
      },
      appendReportCardAuditLog: async () => {
        calls.push('audit');
      },
    } as never,
  );

  const reportCard = await service.publishReportCard({
    exam_series_id: 'series-1',
    student_id: 'student-1',
    report_snapshot_id: 'report-snapshot:tenant-a:exams:term-2',
  });

  assert.equal(reportCard.status, 'published');
  assert.equal(reportCard.report_snapshot_id, 'report-snapshot:tenant-a:exams:term-2');
  assert.deepEqual(calls, ['report-card', 'audit']);
});

test('ExamsController exposes teacher mark sheets as a read endpoint', () => {
  const handler = ExamsController.prototype.listMarkSheets as unknown as Function;

  assert.equal(typeof handler, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'mark-sheets');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), ['exams:read']);
});

test('ExamsService lists tenant mark sheets with teacher and series filters', async () => {
  let capturedInput: Record<string, unknown> | null = null;
  const service = new ExamsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'teacher-1', role: 'teacher', permissions: ['exams:read'] }) } as never,
    {
      listMarkSheets: async (input: Record<string, unknown>) => {
        capturedInput = input;
        return [
          {
            exam_series_id: 'series-1',
            subject_id: 'subject-1',
            class_section_id: 'class-1',
            mark_count: 18,
          },
        ];
      },
    } as never,
  );

  const rows = await (service as unknown as {
    listMarkSheets: (query: Record<string, string | undefined>) => Promise<Array<Record<string, unknown>>>;
  }).listMarkSheets({
    teacher_user_id: ' teacher-1 ',
    exam_series_id: 'series-1',
    subject_id: '',
  });

  assert.deepEqual(capturedInput, {
    tenant_id: 'tenant-a',
    teacher_user_id: 'teacher-1',
    exam_series_id: 'series-1',
  });
  assert.equal(rows[0]?.mark_count, 18);
});
