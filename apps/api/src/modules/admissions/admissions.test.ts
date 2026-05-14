import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validate } from 'class-validator';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { AdmissionsSchemaService } from './admissions-schema.service';
import { AdmissionsService } from './admissions.service';

test('CreateApplicationDto rejects blank required admissions fields', async () => {
  const dto = Object.assign(new CreateApplicationDto(), {
    full_name: '   ',
    date_of_birth: '2017-01-02',
    gender: 'Female',
    birth_certificate_number: 'BC-REAL-001',
    nationality: '   ',
    class_applying: 'Grade 4',
    parent_name: 'Guardian One',
    parent_phone: '+254700000001',
    relationship: 'Guardian',
  });

  const errors = await validate(dto);
  const properties = errors.map((error) => error.property);

  assert.ok(properties.includes('full_name'));
  assert.ok(properties.includes('nationality'));
});

test('AdmissionsSchemaService adds a full-text index for application search', async () => {
  let schemaSql = '';
  const service = new AdmissionsSchemaService(
    {
      runSchemaBootstrap: async (sql: string) => {
        schemaSql += sql;
      },
    } as never,
    {
      onModuleInit: async () => undefined,
    } as never,
  );

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_admission_applications_search_vector/);
  assert.match(schemaSql, /ON admission_applications\s+USING GIN/);
  assert.match(schemaSql, /application_number/);
  assert.match(schemaSql, /parent_phone/);
  assert.match(schemaSql, /class_applying/);
  assert.doesNotMatch(schemaSql, /attendance/i);
});

test('AdmissionsService registers an approved application into the student directory', async () => {
  const requestContext = new RequestContextService();
  let applicationRegistered = false;

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000701',
        tenant_id: 'tenant-a',
        full_name: 'Brenda Atieno',
        date_of_birth: '2014-02-19',
        gender: 'female',
        birth_certificate_number: 'BC-448211',
        nationality: 'Kenyan',
        class_applying: 'Grade 7',
        status: 'approved',
        parent_name: 'Janet Atieno',
        parent_phone: '254712300401',
      }),
      markApplicationRegistered: async () => {
        applicationRegistered = true;
        return {
          id: '00000000-0000-0000-0000-000000000701',
          status: 'registered',
        };
      },
      attachApplicationDocumentsToStudent: async () => [],
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000703',
        class_name: 'Grade 7',
        stream_name: 'Hope',
      }),
      findAcademicClassSectionForUpdate: async () => null,
      createStudentAcademicEnrollment: async () => null,
      enrollStudentSubjectsAndTimetable: async () => ({
        subject_enrollments: [],
        timetable_enrollments: [],
      }),
      findActiveFeeStructureForClass: async () => null,
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000702',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G7-118',
        first_name: 'Brenda',
        last_name: 'Atieno',
        middle_name: null,
        status: 'active',
        date_of_birth: '2014-02-19',
        gender: 'female',
        primary_guardian_name: 'Janet Atieno',
        primary_guardian_phone: '254712300401',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-05-04T10:00:00.000Z'),
        updated_at: new Date('2026-05-04T10:00:00.000Z'),
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-register-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*', 'documents:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000701/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000701', {
        admission_number: 'ADM-G7-118',
        class_name: 'Grade 7',
        stream_name: 'Hope',
        dormitory_name: 'Mara House',
        transport_route: 'Eastern Bypass',
      }),
  );

  assert.equal(response.student.admission_number, 'ADM-G7-118');
  assert.equal(response.application_status, 'registered');
  assert.equal(applicationRegistered, true);
});

test('AdmissionsService exports applications as a server-side CSV artifact with checksum', async () => {
  const requestContext = new RequestContextService();
  let tenantUsed: string | null = null;
  let listOptions: { search?: string; status?: string; limit: number } | null = null;

  const service = new AdmissionsService(
    requestContext,
    {} as never,
    {
      listApplications: async (
        tenantId: string,
        options: { search?: string; status?: string; limit: number },
      ) => {
        tenantUsed = tenantId;
        listOptions = options;
        return [
          {
            application_number: 'APP-20260514-001',
            full_name: 'Achieng, Otieno',
            class_applying: 'Grade 4',
            parent_phone: '+254700000001',
            status: 'approved',
          },
        ];
      },
    } as never,
    {} as never,
    {} as never,
  );

  const artifact = await requestContext.run(
    {
      request_id: 'req-admissions-report-export',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/admissions/reports/applications/export',
      started_at: '2026-05-14T00:00:00.000Z',
    },
    () => service.exportReportCsv('applications'),
  );

  assert.equal(tenantUsed, 'tenant-a');
  assert.deepEqual(listOptions, { limit: 5000 });
  assert.equal(artifact.report_id, 'applications');
  assert.equal(artifact.filename, 'admissions-applications.csv');
  assert.equal(artifact.content_type, 'text/csv; charset=utf-8');
  assert.equal(artifact.row_count, 1);
  assert.equal(
    artifact.csv,
    'Applicant,Application No,Class,Parent Phone,Status\r\n"Achieng, Otieno",APP-20260514-001,Grade 4,+254700000001,Approved\r\n',
  );
  assert.equal(
    artifact.checksum_sha256,
    createHash('sha256').update(artifact.csv).digest('hex'),
  );
});

test('AdmissionsService rejects unknown server-side report exports', async () => {
  const requestContext = new RequestContextService();
  const service = new AdmissionsService(
    requestContext,
    {} as never,
    {
      listApplications: async () => {
        throw new Error('applications should not be loaded for an unknown export');
      },
    } as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-admissions-report-export-missing',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'admissions',
          session_id: 'session-1',
          permissions: ['admissions:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'GET',
          path: '/admissions/reports/unknown/export',
          started_at: '2026-05-14T00:00:00.000Z',
        },
        () => service.exportReportCsv('unknown'),
      ),
    /Unknown admissions report export/,
  );
});

test('AdmissionsService invites the parent portal user when registration has a parent email', async () => {
  const requestContext = new RequestContextService();
  const parentInvites: Array<{ email: string; display_name: string; role_code: string }> = [];
  const guardianLinks: Array<{
    tenant_id: string;
    student_id: string;
    invitation_id: string | null;
    display_name: string;
    email: string;
    phone: string;
    relationship: string;
  }> = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000711',
        tenant_id: 'tenant-a',
        full_name: 'Brian Odhiambo',
        date_of_birth: '2015-08-10',
        gender: 'male',
        birth_certificate_number: 'BC-448299',
        nationality: 'Kenyan',
        class_applying: 'Grade 5',
        status: 'approved',
        parent_name: 'Miriam Odhiambo',
        parent_phone: '254712300499',
        parent_email: ' Miriam.Parent@Example.test ',
        parent_occupation: 'Engineer',
        relationship: 'Mother',
      }),
      markApplicationRegistered: async () => ({
        id: '00000000-0000-0000-0000-000000000711',
        status: 'registered',
      }),
      attachApplicationDocumentsToStudent: async () => [],
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000713',
        class_name: 'Grade 5',
        stream_name: 'East',
      }),
      findAcademicClassSectionForUpdate: async () => null,
      createStudentAcademicEnrollment: async () => null,
      enrollStudentSubjectsAndTimetable: async () => ({
        subject_enrollments: [],
        timetable_enrollments: [],
      }),
      findActiveFeeStructureForClass: async () => null,
      upsertStudentGuardianLink: async (input: {
        tenant_id: string;
        student_id: string;
        invitation_id: string | null;
        display_name: string;
        email: string;
        phone: string;
        relationship: string;
      }) => {
        guardianLinks.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000714',
          student_id: input.student_id,
          invitation_id: input.invitation_id,
          display_name: input.display_name,
          email: input.email,
          relationship: input.relationship,
          status: 'invited',
        };
      },
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000712',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G5-044',
        first_name: 'Brian',
        last_name: 'Odhiambo',
        middle_name: null,
        status: 'active',
        date_of_birth: '2015-08-10',
        gender: 'male',
        primary_guardian_name: 'Miriam Odhiambo',
        primary_guardian_phone: '254712300499',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-05-04T10:00:00.000Z'),
        updated_at: new Date('2026-05-04T10:00:00.000Z'),
      }),
    } as never,
    {
      inviteTenantUser: async (input: { email: string; display_name: string; role_code: string }) => {
        parentInvites.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000715',
          tenant_id: 'tenant-a',
          email: input.email,
          display_name: input.display_name,
          role_code: 'parent',
          invitation_sent: true,
          expires_at: new Date('2026-05-20T10:00:00.000Z').toISOString(),
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-register-parent-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*', 'users:write', 'tenant_memberships:write'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000711/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000711', {
        admission_number: 'ADM-G5-044',
        class_name: 'Grade 5',
        stream_name: 'East',
      }),
  );

  assert.deepEqual(parentInvites, [
    {
      email: 'miriam.parent@example.test',
      display_name: 'Miriam Odhiambo',
      role_code: 'parent',
    },
  ]);
  assert.deepEqual(guardianLinks, [
    {
      tenant_id: 'tenant-a',
      student_id: '00000000-0000-0000-0000-000000000712',
      invitation_id: '00000000-0000-0000-0000-000000000715',
      display_name: 'Miriam Odhiambo',
      email: 'miriam.parent@example.test',
      phone: '254712300499',
      relationship: 'Mother',
    },
  ]);
  assert.equal(response.parent_invitation?.invitation_sent, true);
  assert.equal(
    (response.guardian_link as unknown as { status?: string } | null)?.status,
    'invited',
  );
});

test('AdmissionsService assigns fees and creates a student fee invoice during registration', async () => {
  const requestContext = new RequestContextService();
  const feeAssignments: Array<{
    tenant_id: string;
    student_id: string;
    application_id: string;
    fee_structure_id: string;
    invoice_number: string;
    description: string;
    currency_code: string;
    amount_minor: string;
    due_date: string;
  }> = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000731',
        tenant_id: 'tenant-a',
        full_name: 'Fee Ready Student',
        date_of_birth: '2015-08-10',
        gender: 'female',
        birth_certificate_number: 'BC-448301',
        nationality: 'Kenyan',
        class_applying: 'Grade 6',
        status: 'approved',
        parent_name: 'Fee Parent',
        parent_phone: '254712300501',
        parent_email: null,
        parent_occupation: 'Nurse',
        relationship: 'Guardian',
      }),
      markApplicationRegistered: async () => ({
        id: '00000000-0000-0000-0000-000000000731',
        status: 'registered',
      }),
      attachApplicationDocumentsToStudent: async () => [],
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000733',
        class_name: 'Grade 6',
        stream_name: 'North',
      }),
      findAcademicClassSectionForUpdate: async () => null,
      createStudentAcademicEnrollment: async () => null,
      enrollStudentSubjectsAndTimetable: async () => ({
        subject_enrollments: [],
        timetable_enrollments: [],
      }),
      findActiveFeeStructureForClass: async (_tenantId: string, className: string) => ({
        id: '00000000-0000-0000-0000-000000000734',
        class_name: className,
        academic_year: '2026',
        term_name: 'Term 2',
        description: 'Grade 6 Term 2 fees',
        currency_code: 'KES',
        amount_minor: '4500000',
        due_days_after_registration: 14,
      }),
      createStudentFeeAssignmentInvoice: async (input: {
        tenant_id: string;
        student_id: string;
        application_id: string;
        fee_structure_id: string;
        invoice_number: string;
        description: string;
        currency_code: string;
        amount_minor: string;
        due_date: string;
      }) => {
        feeAssignments.push(input);
        return {
          assignment: {
            id: '00000000-0000-0000-0000-000000000735',
            fee_structure_id: input.fee_structure_id,
            student_id: input.student_id,
            status: 'assigned',
          },
          invoice: {
            id: '00000000-0000-0000-0000-000000000736',
            invoice_number: input.invoice_number,
            status: 'open',
            amount_due_minor: input.amount_minor,
            currency_code: input.currency_code,
            due_date: input.due_date,
          },
        };
      },
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000732',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G6-020',
        first_name: 'Fee',
        last_name: 'Student',
        middle_name: 'Ready',
        status: 'active',
        date_of_birth: '2015-08-10',
        gender: 'female',
        primary_guardian_name: 'Fee Parent',
        primary_guardian_phone: '254712300501',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-05-04T10:00:00.000Z'),
        updated_at: new Date('2026-05-04T10:00:00.000Z'),
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-register-fees-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*', 'finance:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000731/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000731', {
        admission_number: 'ADM-G6-020',
        class_name: 'Grade 6',
        stream_name: 'North',
      }),
  );

  assert.equal(feeAssignments.length, 1);
  assert.equal(feeAssignments[0]?.student_id, '00000000-0000-0000-0000-000000000732');
  assert.equal(feeAssignments[0]?.application_id, '00000000-0000-0000-0000-000000000731');
  assert.equal(feeAssignments[0]?.fee_structure_id, '00000000-0000-0000-0000-000000000734');
  assert.match(feeAssignments[0]?.invoice_number ?? '', /^SF-\d{8}-[A-Z0-9]{8}$/);
  assert.equal(feeAssignments[0]?.description, 'Grade 6 Term 2 fees');
  assert.equal(feeAssignments[0]?.currency_code, 'KES');
  assert.equal(feeAssignments[0]?.amount_minor, '4500000');
  assert.match(feeAssignments[0]?.due_date ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    (response as unknown as { fee_assignment?: { status?: string } }).fee_assignment?.status,
    'assigned',
  );
  assert.equal(
    (response as unknown as { fee_invoice?: { status?: string } }).fee_invoice?.status,
    'open',
  );
});

test('AdmissionsService creates an academic enrollment when class capacity is available', async () => {
  const requestContext = new RequestContextService();
  const enrollments: Array<{
    tenant_id: string;
    student_id: string;
    application_id: string;
    class_section_id: string | null;
    class_name: string;
    stream_name: string;
    academic_year: string;
  }> = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000741',
        tenant_id: 'tenant-a',
        full_name: 'Enrolled Student',
        date_of_birth: '2015-08-10',
        gender: 'male',
        birth_certificate_number: 'BC-448302',
        nationality: 'Kenyan',
        class_applying: 'Grade 4',
        status: 'approved',
        parent_name: 'Enrollment Parent',
        parent_phone: '254712300502',
        parent_email: null,
        relationship: 'Father',
      }),
      findAcademicClassSectionForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000744',
        class_name: 'Grade 4',
        stream_name: 'West',
        academic_year: '2026',
        capacity: 40,
        current_enrollments: 17,
      }),
      markApplicationRegistered: async () => ({
        id: '00000000-0000-0000-0000-000000000741',
        status: 'registered',
      }),
      attachApplicationDocumentsToStudent: async () => [],
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000743',
        class_name: 'Grade 4',
        stream_name: 'West',
      }),
      createStudentAcademicEnrollment: async (input: {
        tenant_id: string;
        student_id: string;
        application_id: string;
        class_section_id: string | null;
        class_name: string;
        stream_name: string;
        academic_year: string;
      }) => {
        enrollments.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000745',
          student_id: input.student_id,
          class_name: input.class_name,
          stream_name: input.stream_name,
          academic_year: input.academic_year,
          status: 'active',
        };
      },
      enrollStudentSubjectsAndTimetable: async () => ({
        subject_enrollments: [],
        timetable_enrollments: [],
      }),
      findActiveFeeStructureForClass: async () => null,
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000742',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G4-021',
        first_name: 'Enrolled',
        last_name: 'Student',
        middle_name: null,
        status: 'active',
        date_of_birth: '2015-08-10',
        gender: 'male',
        primary_guardian_name: 'Enrollment Parent',
        primary_guardian_phone: '254712300502',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-05-04T10:00:00.000Z'),
        updated_at: new Date('2026-05-04T10:00:00.000Z'),
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-register-enrollment-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000741/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000741', {
        admission_number: 'ADM-G4-021',
        class_name: 'Grade 4',
        stream_name: 'West',
      }),
  );

  assert.deepEqual(enrollments, [
    {
      tenant_id: 'tenant-a',
      student_id: '00000000-0000-0000-0000-000000000742',
      application_id: '00000000-0000-0000-0000-000000000741',
      class_section_id: '00000000-0000-0000-0000-000000000744',
      class_name: 'Grade 4',
      stream_name: 'West',
      academic_year: '2026',
    },
  ]);
  assert.equal(
    (response as unknown as { academic_enrollment?: { status?: string } }).academic_enrollment?.status,
    'active',
  );
});

test('AdmissionsService enrolls registered students into configured subjects and timetable slots', async () => {
  const requestContext = new RequestContextService();
  const academicEnrollmentId = '00000000-0000-0000-0000-000000000765';
  const subjectTimetableCalls: Array<{
    tenant_id: string;
    student_id: string;
    academic_enrollment_id: string;
    class_section_id: string | null;
  }> = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000761',
        tenant_id: 'tenant-a',
        full_name: 'Subject Ready',
        date_of_birth: '2015-08-10',
        gender: 'female',
        birth_certificate_number: 'BC-448304',
        nationality: 'Kenyan',
        class_applying: 'Grade 8',
        status: 'approved',
        parent_name: 'Subject Parent',
        parent_phone: '254712300504',
        parent_email: null,
        relationship: 'Guardian',
      }),
      findAcademicClassSectionForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000764',
        class_name: 'Grade 8',
        stream_name: 'South',
        academic_year: '2026',
        capacity: 35,
        current_enrollments: 12,
      }),
      markApplicationRegistered: async () => ({
        id: '00000000-0000-0000-0000-000000000761',
        status: 'registered',
      }),
      attachApplicationDocumentsToStudent: async () => [],
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000763',
        class_name: 'Grade 8',
        stream_name: 'South',
      }),
      createStudentAcademicEnrollment: async () => ({
        id: academicEnrollmentId,
        student_id: '00000000-0000-0000-0000-000000000762',
        class_name: 'Grade 8',
        stream_name: 'South',
        academic_year: '2026',
        status: 'active',
      }),
      enrollStudentSubjectsAndTimetable: async (input: {
        tenant_id: string;
        student_id: string;
        academic_enrollment_id: string;
        class_section_id: string | null;
      }) => {
        subjectTimetableCalls.push(input);
        return {
          subject_enrollments: [
            {
              id: '00000000-0000-0000-0000-000000000766',
              subject_code: 'MATH',
              subject_name: 'Mathematics',
              status: 'active',
            },
            {
              id: '00000000-0000-0000-0000-000000000767',
              subject_code: 'ENG',
              subject_name: 'English',
              status: 'active',
            },
          ],
          timetable_enrollments: [
            {
              id: '00000000-0000-0000-0000-000000000768',
              day_of_week: 'Monday',
              starts_at: '08:00',
              ends_at: '08:40',
              status: 'active',
            },
          ],
        };
      },
      findActiveFeeStructureForClass: async () => null,
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000762',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G8-023',
        first_name: 'Subject',
        last_name: 'Ready',
        middle_name: null,
        status: 'active',
        date_of_birth: '2015-08-10',
        gender: 'female',
        primary_guardian_name: 'Subject Parent',
        primary_guardian_phone: '254712300504',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-05-04T10:00:00.000Z'),
        updated_at: new Date('2026-05-04T10:00:00.000Z'),
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-register-subjects-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000761/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000761', {
        admission_number: 'ADM-G8-023',
        class_name: 'Grade 8',
        stream_name: 'South',
      }),
  );

  assert.deepEqual(subjectTimetableCalls, [
    {
      tenant_id: 'tenant-a',
      student_id: '00000000-0000-0000-0000-000000000762',
      academic_enrollment_id: academicEnrollmentId,
      class_section_id: '00000000-0000-0000-0000-000000000764',
    },
  ]);
  assert.equal(
    (response as unknown as { subject_enrollments?: unknown[] }).subject_enrollments?.length,
    2,
  );
  assert.equal(
    (response as unknown as { timetable_enrollments?: unknown[] }).timetable_enrollments?.length,
    1,
  );
});

test('AdmissionsService publishes academic enrollment hooks during registration', async () => {
  const requestContext = new RequestContextService();
  const publishedEvents: Array<{
    event_name: string;
    aggregate_id: string;
    payload: Record<string, unknown>;
  }> = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000791',
        tenant_id: 'tenant-a',
        full_name: 'Hook Ready',
        date_of_birth: '2015-09-11',
        gender: 'female',
        birth_certificate_number: 'BC-448309',
        nationality: 'Kenyan',
        class_applying: 'Grade 8',
        status: 'approved',
        parent_name: 'Hook Parent',
        parent_phone: '254712300509',
        parent_email: null,
        relationship: 'Guardian',
      }),
      findAcademicClassSectionForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000794',
        class_name: 'Grade 8',
        stream_name: 'South',
        academic_year: '2026',
        capacity: 35,
        current_enrollments: 12,
      }),
      markApplicationRegistered: async () => ({
        id: '00000000-0000-0000-0000-000000000791',
        status: 'registered',
      }),
      attachApplicationDocumentsToStudent: async () => [],
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000793',
        class_name: 'Grade 8',
        stream_name: 'South',
      }),
      createStudentAcademicEnrollment: async () => ({
        id: '00000000-0000-0000-0000-000000000795',
        student_id: '00000000-0000-0000-0000-000000000792',
        application_id: '00000000-0000-0000-0000-000000000791',
        class_section_id: '00000000-0000-0000-0000-000000000794',
        class_name: 'Grade 8',
        stream_name: 'South',
        academic_year: '2026',
        status: 'active',
      }),
      enrollStudentSubjectsAndTimetable: async () => ({
        subject_enrollments: [],
        timetable_enrollments: [],
      }),
      findActiveFeeStructureForClass: async () => null,
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000792',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G8-029',
        first_name: 'Hook',
        last_name: 'Ready',
        middle_name: null,
        status: 'active',
        date_of_birth: '2015-09-11',
        gender: 'female',
        primary_guardian_name: 'Hook Parent',
        primary_guardian_phone: '254712300509',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date('2026-05-04T10:00:00.000Z'),
        updated_at: new Date('2026-05-04T10:00:00.000Z'),
      }),
    } as never,
    undefined,
    {
      publish: async (input: {
        event_name: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
      }) => {
        publishedEvents.push(input);
        return input;
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-admissions-register-hooks-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000791/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000791', {
        admission_number: 'ADM-G8-029',
        class_name: 'Grade 8',
        stream_name: 'South',
      }),
  );

  assert.equal(publishedEvents.length, 1);
  assert.equal(publishedEvents[0]?.event_name, 'student.academic_enrollment.created');
  assert.equal(publishedEvents[0]?.aggregate_id, '00000000-0000-0000-0000-000000000795');
  assert.equal(
    publishedEvents[0]?.payload.academic_enrollment_id,
    '00000000-0000-0000-0000-000000000795',
  );
});

test('AdmissionsService promotes an active student into the next configured class section', async () => {
  const requestContext = new RequestContextService();
  const completedEnrollments: Array<{ tenantId: string; enrollmentId: string; status: string }> = [];
  const lifecycleEvents: unknown[] = [];
  const publishedEvents: Array<{ event_name: string; aggregate_id: string; payload: Record<string, unknown> }> = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveAcademicEnrollmentForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000771',
        student_id: '00000000-0000-0000-0000-000000000770',
        application_id: '00000000-0000-0000-0000-000000000769',
        class_section_id: '00000000-0000-0000-0000-000000000772',
        class_name: 'Grade 8',
        stream_name: 'South',
        academic_year: '2026',
        status: 'active',
      }),
      findAcademicClassSectionForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000773',
        class_name: 'Grade 9',
        stream_name: 'North',
        academic_year: '2027',
        capacity: 40,
        current_enrollments: 18,
      }),
      completeStudentAcademicEnrollment: async (tenantId: string, enrollmentId: string, status: string) => {
        completedEnrollments.push({ tenantId, enrollmentId, status });
        return { id: enrollmentId, status };
      },
      createStudentAcademicEnrollment: async () => ({
        id: '00000000-0000-0000-0000-000000000774',
        student_id: '00000000-0000-0000-0000-000000000770',
        application_id: '00000000-0000-0000-0000-000000000769',
        class_section_id: '00000000-0000-0000-0000-000000000773',
        class_name: 'Grade 9',
        stream_name: 'North',
        academic_year: '2027',
        status: 'active',
      }),
      enrollStudentSubjectsAndTimetable: async () => ({
        subject_enrollments: [{ subject_code: 'MATH', status: 'active' }],
        timetable_enrollments: [{ day_of_week: 'Tuesday', status: 'active' }],
      }),
      createAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000775',
        class_name: 'Grade 9',
        stream_name: 'North',
      }),
      createStudentAcademicLifecycleEvent: async (input: unknown) => {
        lifecycleEvents.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000776',
          event_type: 'promotion',
          to_class_name: 'Grade 9',
        };
      },
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      updateStudent: async () => {
        throw new Error('promotion should not change student status');
      },
    } as never,
    undefined,
    {
      publish: async (input: {
        event_name: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
      }) => {
        publishedEvents.push(input);
        return input;
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-promote-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/students/00000000-0000-0000-0000-000000000770/academic-lifecycle',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      (
        service as unknown as {
          advanceStudentAcademicLifecycle: (studentId: string, dto: Record<string, string>) => Promise<{
            lifecycle_event: { event_type: string };
            academic_enrollment: { class_name: string };
            subject_enrollments: unknown[];
            timetable_enrollments: unknown[];
          }>;
        }
      ).advanceStudentAcademicLifecycle('00000000-0000-0000-0000-000000000770', {
        action: 'promotion',
        class_name: 'Grade 9',
        stream_name: 'North',
        reason: 'End-year promotion',
      }),
  );

  assert.deepEqual(completedEnrollments, [
    {
      tenantId: 'tenant-a',
      enrollmentId: '00000000-0000-0000-0000-000000000771',
      status: 'completed',
    },
  ]);
  assert.equal(lifecycleEvents.length, 1);
  assert.equal(response.lifecycle_event.event_type, 'promotion');
  assert.equal(response.academic_enrollment.class_name, 'Grade 9');
  assert.equal(response.subject_enrollments.length, 1);
  assert.equal(response.timetable_enrollments.length, 1);
  assert.deepEqual(publishedEvents.map((event) => event.event_name), [
    'student.academic_enrollment.created',
    'student.academic_lifecycle.changed',
  ]);
  assert.equal(publishedEvents[1]?.aggregate_id, '00000000-0000-0000-0000-000000000776');
  assert.equal(publishedEvents[1]?.payload.event_type, 'promotion');
});

test('AdmissionsService graduates an active student and records an academic lifecycle event', async () => {
  const requestContext = new RequestContextService();
  const statusUpdates: string[] = [];

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveAcademicEnrollmentForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000781',
        student_id: '00000000-0000-0000-0000-000000000780',
        application_id: '00000000-0000-0000-0000-000000000779',
        class_section_id: '00000000-0000-0000-0000-000000000782',
        class_name: 'Grade 12',
        stream_name: 'East',
        academic_year: '2026',
        status: 'active',
      }),
      completeStudentAcademicEnrollment: async () => ({ id: '00000000-0000-0000-0000-000000000781', status: 'completed' }),
      createStudentAcademicLifecycleEvent: async () => ({
        id: '00000000-0000-0000-0000-000000000783',
        event_type: 'graduation',
      }),
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      updateStudent: async (_studentId: string, dto: { status?: string }) => {
        statusUpdates.push(dto.status ?? '');
        return { id: '00000000-0000-0000-0000-000000000780', status: dto.status };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-graduate-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/students/00000000-0000-0000-0000-000000000780/academic-lifecycle',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      (
        service as unknown as {
          advanceStudentAcademicLifecycle: (studentId: string, dto: Record<string, string>) => Promise<{
            lifecycle_event: { event_type: string };
            student_status: string;
          }>;
        }
      ).advanceStudentAcademicLifecycle('00000000-0000-0000-0000-000000000780', {
        action: 'graduation',
        reason: 'Completed final class',
      }),
  );

  assert.deepEqual(statusUpdates, ['graduated']);
  assert.equal(response.lifecycle_event.event_type, 'graduation');
  assert.equal(response.student_status, 'graduated');
});

test('AdmissionsService rejects lifecycle changes without an active academic enrollment', async () => {
  const requestContext = new RequestContextService();

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveAcademicEnrollmentForUpdate: async () => null,
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      updateStudent: async () => {
        throw new Error('should not update a student without an active enrollment');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-admissions-lifecycle-missing-1',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'admissions',
          session_id: 'session-1',
          permissions: ['admissions:*', 'students:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/admissions/students/00000000-0000-0000-0000-000000000790/academic-lifecycle',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () =>
          (
            service as unknown as {
              advanceStudentAcademicLifecycle: (studentId: string, dto: Record<string, string>) => Promise<unknown>;
            }
          ).advanceStudentAcademicLifecycle('00000000-0000-0000-0000-000000000790', {
            action: 'archive',
            reason: 'Left school',
          }),
      ),
    /No active academic enrollment/,
  );
});

test('AdmissionsService blocks registration when configured class capacity is full', async () => {
  const requestContext = new RequestContextService();
  let createStudentCalls = 0;

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000751',
        tenant_id: 'tenant-a',
        full_name: 'Blocked Student',
        date_of_birth: '2015-08-10',
        gender: 'female',
        birth_certificate_number: 'BC-448303',
        nationality: 'Kenyan',
        class_applying: 'Grade 4',
        status: 'approved',
        parent_name: 'Blocked Parent',
        parent_phone: '254712300503',
        parent_email: null,
        relationship: 'Mother',
      }),
      findAcademicClassSectionForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000754',
        class_name: 'Grade 4',
        stream_name: 'Full',
        academic_year: '2026',
        capacity: 30,
        current_enrollments: 30,
      }),
      createStudentAcademicEnrollment: async () => {
        throw new Error('academic enrollment should not be created');
      },
      findActiveFeeStructureForClass: async () => {
        throw new Error('fees should not be assigned');
      },
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => {
        createStudentCalls += 1;
        throw new Error('student should not be created');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-admissions-register-capacity-1',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'admissions',
          session_id: 'session-1',
          permissions: ['admissions:*', 'students:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/admissions/applications/00000000-0000-0000-0000-000000000751/register',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () =>
          service.registerApprovedApplication('00000000-0000-0000-0000-000000000751', {
            admission_number: 'ADM-G4-022',
            class_name: 'Grade 4',
            stream_name: 'Full',
          }),
      ),
    /Class section "Grade 4 Full" is at capacity/,
  );
  assert.equal(createStudentCalls, 0);
});

test('AdmissionsService registration is idempotent for an already registered application', async () => {
  const requestContext = new RequestContextService();
  let createStudentCalls = 0;
  let inviteParentCalls = 0;

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationById: async () => ({
        id: '00000000-0000-0000-0000-000000000721',
        tenant_id: 'tenant-a',
        full_name: 'Already Registered',
        date_of_birth: '2015-08-10',
        gender: 'female',
        birth_certificate_number: 'BC-448300',
        nationality: 'Kenyan',
        class_applying: 'Grade 5',
        status: 'registered',
        admitted_student_id: '00000000-0000-0000-0000-000000000722',
        parent_name: 'Existing Parent',
        parent_phone: '254712300500',
        parent_email: 'existing.parent@example.test',
        parent_occupation: 'Teacher',
        relationship: 'Mother',
      }),
      findApplicationByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000721',
        tenant_id: 'tenant-a',
        full_name: 'Already Registered',
        date_of_birth: '2015-08-10',
        gender: 'female',
        birth_certificate_number: 'BC-448300',
        nationality: 'Kenyan',
        class_applying: 'Grade 5',
        status: 'registered',
        admitted_student_id: '00000000-0000-0000-0000-000000000722',
        parent_name: 'Existing Parent',
        parent_phone: '254712300500',
        parent_email: 'existing.parent@example.test',
        parent_occupation: 'Teacher',
        relationship: 'Mother',
      }),
      findCurrentAllocationByStudentId: async () => ({
        id: '00000000-0000-0000-0000-000000000723',
        class_name: 'Grade 5',
        stream_name: 'East',
        dormitory_name: null,
        transport_route: null,
      }),
      markApplicationRegistered: async () => {
        throw new Error('registration should not be marked again');
      },
      attachApplicationDocumentsToStudent: async () => {
        throw new Error('documents should not be reattached');
      },
      createAllocation: async () => {
        throw new Error('allocation should not be recreated');
      },
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => {
        createStudentCalls += 1;
        throw new Error('student should not be recreated');
      },
      getStudent: async () => ({
        id: '00000000-0000-0000-0000-000000000722',
        tenant_id: 'tenant-a',
        admission_number: 'ADM-G5-044',
        first_name: 'Already',
        last_name: 'Registered',
        middle_name: null,
        status: 'active',
        date_of_birth: '2015-08-10',
        gender: 'female',
        primary_guardian_name: 'Existing Parent',
        primary_guardian_phone: '254712300500',
        metadata: {},
        created_by_user_id: '00000000-0000-0000-0000-000000000001',
        created_at: '2026-05-04T10:00:00.000Z',
        updated_at: '2026-05-04T10:00:00.000Z',
      }),
    } as never,
    {
      inviteTenantUser: async () => {
        inviteParentCalls += 1;
        throw new Error('parent should not be reinvited');
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-register-idempotent-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'students:*', 'users:write', 'tenant_memberships:write'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000721/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.registerApprovedApplication('00000000-0000-0000-0000-000000000721', {
        admission_number: 'ADM-G5-044',
        class_name: 'Grade 5',
        stream_name: 'East',
      }),
  );

  assert.equal(response.student.id, '00000000-0000-0000-0000-000000000722');
  assert.equal(response.allocation?.stream_name, 'East');
  assert.equal(response.application_status, 'registered');
  assert.equal(response.parent_invitation, null);
  assert.equal(createStudentCalls, 0);
  assert.equal(inviteParentCalls, 0);
});

test('AdmissionsService stores uploaded document metadata with pending verification', async () => {
  const requestContext = new RequestContextService();

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationById: async () => ({
        id: '00000000-0000-0000-0000-000000000701',
        tenant_id: 'tenant-a',
        status: 'pending',
      }),
      saveDocumentRecord: async () => ({
        id: '00000000-0000-0000-0000-000000000801',
        application_id: '00000000-0000-0000-0000-000000000701',
        student_id: null,
        verification_status: 'pending',
        document_type: 'birth_certificate',
        original_file_name: 'birth-cert-brenda.pdf',
      }),
    } as never,
    {
      save: async () => ({
        stored_path: 'tenant-a/admissions/2026/05/birth-cert-brenda.pdf',
        original_file_name: 'birth-cert-brenda.pdf',
        mime_type: 'application/pdf',
        size_bytes: 204800,
      }),
    } as never,
    {
      createStudent: async () => {
        throw new Error('not used in this test');
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-doc-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'documents:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000701/documents',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.storeApplicationDocument(
        '00000000-0000-0000-0000-000000000701',
        {
          document_type: 'birth_certificate',
          uploaded_by_user_id: '00000000-0000-0000-0000-000000000001',
        },
        {
          originalname: 'birth-cert-brenda.pdf',
          mimetype: 'application/pdf',
          size: 204800,
          buffer: Buffer.from('%PDF-1.7\nadmission document'),
        },
      ),
  );

  assert.equal(response.verification_status, 'pending');
  assert.equal(response.document_type, 'birth_certificate');
});

test('AdmissionsService scans uploaded documents before tenant file persistence when upload scanning is configured', async () => {
  const requestContext = new RequestContextService();
  const captured: Record<string, unknown> = {};

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationById: async () => ({
        id: '00000000-0000-0000-0000-000000000701',
        tenant_id: 'tenant-a',
        status: 'pending',
      }),
      saveDocumentRecord: async () => ({
        id: '00000000-0000-0000-0000-000000000801',
        application_id: '00000000-0000-0000-0000-000000000701',
        student_id: null,
        verification_status: 'pending',
        document_type: 'birth_certificate',
        original_file_name: 'birth-cert-brenda.pdf',
      }),
    } as never,
    {
      save: async (input: Record<string, unknown>) => {
        captured.savedFile = input.file;
        return {
          stored_path: 'tenant/tenant-a/admissions/2026/05/birth-cert-brenda.pdf',
          original_file_name: 'birth-cert-brenda.pdf',
          mime_type: 'application/pdf',
          size_bytes: 204800,
        };
      },
    } as never,
    {
      createStudent: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    undefined,
    undefined,
    {
      scanIfConfigured: async (file: Record<string, unknown>) => {
        captured.scannedFile = file;
        return {
          provider: 'webhook',
          status: 'clean',
          scannedAt: '2026-05-14T14:30:00.000Z',
          scanId: 'scan-admissions-1',
        };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-admissions-doc-scan-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['admissions:*', 'documents:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/admissions/applications/00000000-0000-0000-0000-000000000701/documents',
      started_at: '2026-05-14T14:30:00.000Z',
    },
    () =>
      service.storeApplicationDocument(
        '00000000-0000-0000-0000-000000000701',
        {
          document_type: 'birth_certificate',
          uploaded_by_user_id: '00000000-0000-0000-0000-000000000001',
        },
        {
          originalname: 'birth-cert-brenda.pdf',
          mimetype: 'application/pdf',
          size: 204800,
          buffer: Buffer.from('%PDF-1.7\nadmission document'),
        },
      ),
  );

  assert.equal((captured.scannedFile as { originalname: string }).originalname, 'birth-cert-brenda.pdf');
  assert.deepEqual((captured.savedFile as { providerMalwareScan: unknown }).providerMalwareScan, {
    provider: 'webhook',
    status: 'clean',
    scannedAt: '2026-05-14T14:30:00.000Z',
    scanId: 'scan-admissions-1',
  });
});

test('AdmissionsService updates document verification status', async () => {
  const requestContext = new RequestContextService();

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      updateDocumentVerificationStatus: async () => ({
        id: '00000000-0000-0000-0000-000000000901',
        document_type: 'passport_photo',
        original_file_name: 'brenda-photo.jpg',
        verification_status: 'verified',
      }),
    } as never,
    {
      save: async () => {
        throw new Error('not used in this test');
      },
    } as never,
    {
      createStudent: async () => {
        throw new Error('not used in this test');
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-admissions-doc-verify-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admissions',
      session_id: 'session-1',
      permissions: ['documents:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/admissions/documents/00000000-0000-0000-0000-000000000901',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.updateDocumentVerificationStatus('00000000-0000-0000-0000-000000000901', {
        verification_status: 'verified',
      }),
  );

  assert.equal(response.verification_status, 'verified');
  assert.equal(response.document_type, 'passport_photo');
});
