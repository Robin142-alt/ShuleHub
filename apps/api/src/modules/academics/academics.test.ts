import assert from 'node:assert/strict';
import test from 'node:test';

import { AcademicsSchemaService } from './academics-schema.service';
import { AcademicsService } from './academics.service';

test('AcademicsSchemaService creates academic lifecycle tables with tenant RLS', async () => {
  let schemaSql = '';
  const service = new AcademicsSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS academic_years/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS academic_terms/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS teacher_subject_assignments/);
  assert.match(schemaSql, /ALTER TABLE teacher_subject_assignments FORCE ROW LEVEL SECURITY/);
  assert.match(schemaSql, /uq_teacher_subject_assignments_scope/);
  assert.doesNotMatch(schemaSql, /attendance/i);
});

test('AcademicsService assigns teachers to deterministic subject class term scopes', async () => {
  const calls: string[] = [];
  const service = new AcademicsService(
    { getStore: () => ({ tenant_id: 'tenant-a', user_id: 'user-1' }) } as never,
    {
      createTeacherAssignment: async (input: Record<string, unknown>) => {
        calls.push('assign');
        return { id: 'assignment-1', ...input };
      },
      appendAuditLog: async () => {
        calls.push('audit');
      },
    } as never,
  );

  const assignment = await service.assignTeacher({
    academic_term_id: 'term-1',
    class_section_id: 'class-1',
    subject_id: 'subject-1',
    teacher_user_id: 'teacher-1',
  });

  assert.equal(assignment.id, 'assignment-1');
  assert.deepEqual(calls, ['assign', 'audit']);
});
