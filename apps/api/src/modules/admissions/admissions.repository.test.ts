import assert from 'node:assert/strict';
import test from 'node:test';

import { AdmissionsSchemaService } from './admissions-schema.service';
import { AdmissionsRepository } from './repositories/admissions.repository';

test('AdmissionsRepository summary treats three uploads as the complete admissions document set', async () => {
  const queries: string[] = [];
  const repository = new AdmissionsRepository({
    query: async (sql: string) => {
      queries.push(sql);

      if (sql.includes('COUNT(*)::text AS total')) {
        return { rows: [{ total: '0' }] };
      }

      return { rows: [] };
    },
  } as never);

  await repository.buildSummary('tenant-a');

  const missingDocumentsQuery = queries.find((sql) => sql.includes('COUNT(document.id)::int AS uploaded_documents'));
  assert.ok(missingDocumentsQuery);
  assert.match(missingDocumentsQuery, /HAVING COUNT\(document\.id\) < 3/);
});

test('AdmissionsSchemaService creates tenant-scoped student fee assignment and invoice tables', async () => {
  let bootstrapSql = '';
  const service = new AdmissionsSchemaService(
    {
      runSchemaBootstrap: async (sql: string) => {
        bootstrapSql = sql;
      },
    } as never,
    {
      onModuleInit: async () => undefined,
    } as never,
  );

  await service.onModuleInit();

  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_fee_structures/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_fee_assignments/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_fee_invoices/);
  assert.match(bootstrapSql, /ALTER TABLE student_fee_invoices FORCE ROW LEVEL SECURITY/);
  assert.match(bootstrapSql, /CREATE POLICY student_fee_assignments_rls_policy/);
  assert.match(bootstrapSql, /CREATE TRIGGER trg_student_fee_invoices_set_updated_at/);
});

test('AdmissionsSchemaService creates academic enrollment and capacity tables', async () => {
  let bootstrapSql = '';
  const service = new AdmissionsSchemaService(
    {
      runSchemaBootstrap: async (sql: string) => {
        bootstrapSql = sql;
      },
    } as never,
    {
      onModuleInit: async () => undefined,
    } as never,
  );

  await service.onModuleInit();

  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS academic_class_sections/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_academic_enrollments/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_academic_lifecycle_events/);
  assert.match(bootstrapSql, /ALTER TABLE student_academic_enrollments FORCE ROW LEVEL SECURITY/);
  assert.match(bootstrapSql, /ALTER TABLE student_academic_lifecycle_events FORCE ROW LEVEL SECURITY/);
  assert.match(bootstrapSql, /CREATE POLICY student_academic_enrollments_rls_policy/);
  assert.match(bootstrapSql, /CREATE POLICY student_academic_lifecycle_events_rls_policy/);
  assert.match(bootstrapSql, /CREATE TRIGGER trg_student_academic_enrollments_set_updated_at/);
});

test('AdmissionsSchemaService creates subject and timetable enrollment tables', async () => {
  let bootstrapSql = '';
  const service = new AdmissionsSchemaService(
    {
      runSchemaBootstrap: async (sql: string) => {
        bootstrapSql = sql;
      },
    } as never,
    {
      onModuleInit: async () => undefined,
    } as never,
  );

  await service.onModuleInit();

  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS academic_subject_offerings/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_subject_enrollments/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS academic_timetable_slots/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS student_timetable_enrollments/);
  assert.match(bootstrapSql, /ALTER TABLE student_subject_enrollments FORCE ROW LEVEL SECURITY/);
  assert.match(bootstrapSql, /ALTER TABLE student_timetable_enrollments FORCE ROW LEVEL SECURITY/);
  assert.match(bootstrapSql, /CREATE POLICY academic_subject_offerings_rls_policy/);
  assert.match(bootstrapSql, /CREATE POLICY academic_timetable_slots_rls_policy/);
  assert.match(bootstrapSql, /CREATE TRIGGER trg_student_subject_enrollments_set_updated_at/);
  assert.match(bootstrapSql, /CREATE TRIGGER trg_student_timetable_enrollments_set_updated_at/);
});

test('AdmissionsRepository student profile includes academic downstream status records', async () => {
  const queries: string[] = [];
  const repository = new AdmissionsRepository({
    query: async (sql: string) => {
      queries.push(sql);

      if (sql.includes('FROM students')) {
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000801',
              admission_number: 'ADM-G8-801',
              first_name: 'Lifecycle',
              last_name: 'Ready',
              metadata: {},
            },
          ],
        };
      }

      if (sql.includes('FROM student_academic_enrollments')) {
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000802',
              class_name: 'Grade 8',
              stream_name: 'South',
              academic_year: '2026',
              status: 'active',
            },
          ],
        };
      }

      if (sql.includes('FROM student_subject_enrollments')) {
        return {
          rows: [{ id: 'sub-1', subject_name: 'Mathematics', status: 'active' }],
        };
      }

      if (sql.includes('FROM student_timetable_enrollments')) {
        return {
          rows: [{ id: 'slot-1', day_of_week: 'Monday', starts_at: '08:00', status: 'active' }],
        };
      }

      if (sql.includes('FROM student_academic_lifecycle_events')) {
        return {
          rows: [{ id: 'evt-1', event_type: 'promotion', to_class_name: 'Grade 8' }],
        };
      }

      if (sql.includes('FROM student_guardians')) {
        return {
          rows: [
            {
              id: 'guardian-1',
              display_name: 'Parent Ready',
              email: 'parent@example.test',
              status: 'active',
              user_id: '00000000-0000-0000-0000-000000000803',
            },
          ],
        };
      }

      if (sql.includes('FROM student_fee_assignments assignment')) {
        return {
          rows: [
            {
              id: 'assignment-1',
              status: 'assigned',
              amount_minor: '250000',
              currency_code: 'KES',
            },
          ],
        };
      }

      if (sql.includes('FROM student_fee_invoices invoice')) {
        return {
          rows: [
            {
              id: 'invoice-1',
              invoice_number: 'SF-20260513-001',
              status: 'open',
              amount_due_minor: '250000',
              amount_paid_minor: '0',
              currency_code: 'KES',
              due_date: '2026-05-27',
            },
          ],
        };
      }

      return { rows: [] };
    },
  } as never);

  const profile = await repository.getStudentProfile(
    'tenant-a',
    '00000000-0000-0000-0000-000000000801',
  );

  assert.ok(queries.some((sql) => sql.includes('FROM student_academic_enrollments')));
  assert.ok(queries.some((sql) => sql.includes('FROM student_subject_enrollments')));
  assert.ok(queries.some((sql) => sql.includes('FROM student_timetable_enrollments')));
  assert.ok(queries.some((sql) => sql.includes('FROM student_academic_lifecycle_events')));
  assert.ok(queries.some((sql) => sql.includes('FROM student_guardians')));
  assert.ok(queries.some((sql) => sql.includes('FROM student_fee_assignments assignment')));
  assert.ok(queries.some((sql) => sql.includes('FROM student_fee_invoices invoice')));
  assert.equal(profile?.academic_enrollment.status, 'active');
  assert.equal(profile?.subject_enrollments.length, 1);
  assert.equal(profile?.timetable_enrollments.length, 1);
  assert.equal(profile?.lifecycle_events.length, 1);
  assert.equal(profile?.guardian_links.length, 1);
  assert.equal(profile?.fee_assignment.status, 'assigned');
  assert.equal(profile?.fee_invoice.status, 'open');
});
