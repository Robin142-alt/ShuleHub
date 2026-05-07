import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { AdmissionsService } from './admissions.service';

test('AdmissionsService registers an approved application into the student directory', async () => {
  const requestContext = new RequestContextService();
  let applicationRegistered = false;

  const service = new AdmissionsService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findApplicationById: async () => ({
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
          buffer: Buffer.from('pdf'),
        },
      ),
  );

  assert.equal(response.verification_status, 'pending');
  assert.equal(response.document_type, 'birth_certificate');
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
