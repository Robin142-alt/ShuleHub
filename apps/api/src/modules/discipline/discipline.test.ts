import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PERMISSION_CATALOG,
  DEFAULT_ROLE_CATALOG,
} from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { CounsellingNoteEncryptionService } from './counselling-note-encryption.service';
import { CounsellingService } from './counselling.service';
import { DisciplineSchemaService } from './discipline-schema.service';
import { DisciplineService } from './discipline.service';

const uuid = (suffix: string) => `00000000-0000-0000-0000-${suffix.padStart(12, '0')}`;

test('DisciplineSchemaService creates tenant-scoped discipline and counselling tables with RLS', async () => {
  let bootstrapSql = '';
  const service = new DisciplineSchemaService({
    runSchemaBootstrap: async (sql: string): Promise<void> => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  for (const tableName of [
    'discipline_incidents',
    'offense_categories',
    'discipline_actions',
    'counselling_sessions',
    'counselling_notes',
    'behavior_points',
    'commendations',
    'parent_acknowledgements',
    'discipline_attachments',
    'discipline_comments',
    'discipline_audit_logs',
    'discipline_notifications',
    'behavior_improvement_plans',
  ]) {
    assert.match(bootstrapSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`));
    assert.match(bootstrapSql, new RegExp(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`));
  }

  assert.match(bootstrapSql, /tenant_id text NOT NULL/);
  assert.match(bootstrapSql, /school_id uuid NOT NULL/);
  assert.match(bootstrapSql, /CREATE INDEX IF NOT EXISTS ix_discipline_incidents_student_term/);
  assert.match(bootstrapSql, /CREATE INDEX IF NOT EXISTS ix_counselling_sessions_counsellor_schedule/);
  assert.match(bootstrapSql, /visibility IN \('internal_only', 'discipline_office', 'parent_visible'\)/);
});

test('default auth catalog exposes discipline and counselling permissions to operational roles', () => {
  const permissionKeys = DEFAULT_PERMISSION_CATALOG.map(
    (permission) => `${permission.resource}:${permission.action}`,
  );

  for (const permission of [
    'discipline:read',
    'discipline:write',
    'discipline:manage',
    'discipline:approve',
    'discipline:reports',
    'counselling:read',
    'counselling:write',
    'counselling:manage',
  ]) {
    assert.ok(permissionKeys.includes(permission), `${permission} missing from catalog`);
  }

  const teacher = DEFAULT_ROLE_CATALOG.find((role) => role.code === 'teacher');
  const admin = DEFAULT_ROLE_CATALOG.find((role) => role.code === 'admin');
  const counsellor = DEFAULT_ROLE_CATALOG.find((role) => role.code === 'school_counsellor');
  const dean = DEFAULT_ROLE_CATALOG.find((role) => role.code === 'discipline_master');

  assert.ok(teacher?.permissions.includes('discipline:write'));
  assert.ok(admin?.permissions.includes('discipline:manage'));
  assert.ok(admin?.permissions.includes('discipline:approve'));
  assert.ok(counsellor?.permissions.includes('counselling:manage'));
  assert.ok(dean?.permissions.includes('discipline:manage'));
});

test('CounsellingNoteEncryptionService encrypts private notes without exposing raw text', () => {
  const service = new CounsellingNoteEncryptionService({
    get: (key: string) =>
      key === 'security.piiEncryptionKey'
        ? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        : undefined,
  } as never);

  const encrypted = service.encrypt('Student disclosed sensitive family context.');

  assert.notEqual(encrypted.encrypted_note, 'Student disclosed sensitive family context.');
  assert.ok(encrypted.note_nonce.length > 0);
  assert.ok(encrypted.note_auth_tag.length > 0);
  assert.equal(service.decrypt(encrypted), 'Student disclosed sensitive family context.');
});

test('DisciplineService creates an incident with audit log and behavior points', async () => {
  const requestContext = new RequestContextService();
  const createdIncident = {
    id: uuid('101'),
    tenant_id: 'tenant-a',
    school_id: uuid('201'),
    student_id: uuid('301'),
    class_id: uuid('401'),
    academic_term_id: uuid('501'),
    academic_year_id: uuid('601'),
    offense_category_id: uuid('701'),
    reporting_staff_id: uuid('801'),
    assigned_staff_id: null,
    incident_number: 'DIS-2026-000001',
    title: 'Fighting',
    severity: 'high',
    status: 'reported',
    occurred_at: '2026-05-16T09:00:00.000Z',
    reported_at: '2026-05-16T09:15:00.000Z',
    location: 'Playground',
    witnesses: [],
    description: 'Student was involved in a fight during break.',
    action_taken: null,
    recommendations: 'Review by discipline office.',
    linked_counselling_referral_id: null,
    behavior_points_delta: -15,
    parent_notification_status: 'queued',
    metadata: {},
    deleted_at: null,
    created_at: '2026-05-16T09:15:00.000Z',
    updated_at: '2026-05-16T09:15:00.000Z',
  };
  const calls: string[] = [];
  const repository = {
    findTenantSchoolId: async () => uuid('201'),
    findOffenseCategoryById: async () => ({
      id: uuid('701'),
      name: 'Fighting',
      default_severity: 'high',
      default_points: -15,
      notify_parent_by_default: true,
    }),
    generateIncidentNumber: async () => 'DIS-2026-000001',
    createIncident: async (input: Record<string, unknown>) => {
      calls.push(`incident:${input.incident_number}`);
      assert.equal(input.tenant_id, 'tenant-a');
      assert.equal(input.school_id, uuid('201'));
      assert.equal(input.behavior_points_delta, -15);
      return createdIncident;
    },
    createAuditLog: async (input: Record<string, unknown>) => {
      calls.push(`audit:${input.action}`);
    },
    createBehaviorPoint: async (input: Record<string, unknown>) => {
      calls.push(`points:${input.points_delta}`);
    },
    createNotification: async (input: Record<string, unknown>) => {
      calls.push(`notification:${input.notification_type}`);
    },
  };
  const service = new DisciplineService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>) => callback() } as never,
    repository as never,
    undefined as never,
  );

  const result = await requestContext.run(
    {
      tenant_id: 'tenant-a',
      user_id: uuid('801'),
      role: 'teacher',
      permissions: ['discipline:write'],
      request_id: 'request-1',
      session_id: null,
      client_ip: '127.0.0.1',
      user_agent: 'node-test',
      method: 'POST',
      path: '/discipline/incidents',
      started_at: '2026-05-16T09:15:00.000Z',
      is_authenticated: true,
    },
    () =>
      service.createIncident({
        student_id: uuid('301'),
        class_id: uuid('401'),
        academic_term_id: uuid('501'),
        academic_year_id: uuid('601'),
        offense_category_id: uuid('701'),
        title: ' Fighting ',
        severity: 'high',
        occurred_at: '2026-05-16T09:00:00.000Z',
        location: ' Playground ',
        description: ' Student was involved in a fight during break. ',
        recommendations: ' Review by discipline office. ',
      }),
  );

  assert.equal(result.incident.incident_number, 'DIS-2026-000001');
  assert.deepEqual(calls, [
    'incident:DIS-2026-000001',
    'audit:incident.created',
    'points:-15',
    'notification:incident_alert',
  ]);
});

test('DisciplineService blocks parent acknowledgement for unlinked students', async () => {
  const requestContext = new RequestContextService();
  const repository = {
    findIncidentById: async () => ({
      id: uuid('101'),
      tenant_id: 'tenant-a',
      school_id: uuid('201'),
      student_id: uuid('301'),
      class_id: uuid('401'),
      academic_term_id: uuid('501'),
      academic_year_id: uuid('601'),
      offense_category_id: uuid('701'),
      reporting_staff_id: uuid('801'),
      assigned_staff_id: null,
      incident_number: 'DIS-2026-000001',
      title: 'Fighting',
      severity: 'high',
      status: 'awaiting_parent_response',
      occurred_at: '2026-05-16T09:00:00.000Z',
      reported_at: '2026-05-16T09:15:00.000Z',
      location: 'Playground',
      witnesses: [],
      description: 'Student was involved in a fight during break.',
      action_taken: null,
      recommendations: null,
      linked_counselling_referral_id: null,
      behavior_points_delta: -15,
      parent_notification_status: 'sent',
      metadata: {},
      deleted_at: null,
      created_at: '2026-05-16T09:15:00.000Z',
      updated_at: '2026-05-16T09:15:00.000Z',
    }),
    isParentLinkedToStudent: async () => false,
  };
  const service = new DisciplineService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>) => callback() } as never,
    repository as never,
    undefined as never,
  );

  await assert.rejects(
    requestContext.run(
      {
        tenant_id: 'tenant-a',
        user_id: uuid('901'),
        role: 'parent',
        permissions: ['portal:read_own_children'],
        request_id: 'request-2',
        session_id: null,
        client_ip: '127.0.0.1',
        user_agent: 'node-test',
        method: 'POST',
        path: '/discipline/parent/incidents/00000000-0000-0000-0000-000000000101/acknowledge',
        started_at: '2026-05-16T10:00:00.000Z',
        is_authenticated: true,
      },
      () =>
        service.acknowledgeIncident(uuid('101'), {
          acknowledgement_note: 'I have seen this notice.',
        }),
    ),
    /linked child/,
  );
});

test('DisciplineService updates incident fields through the repository before auditing', async () => {
  const requestContext = new RequestContextService();
  const calls: string[] = [];
  const repository = {
    findIncidentById: async () => ({
      id: uuid('101'),
      tenant_id: 'tenant-a',
      school_id: uuid('201'),
      student_id: uuid('301'),
      class_id: uuid('401'),
      academic_term_id: uuid('501'),
      academic_year_id: uuid('601'),
      offense_category_id: uuid('701'),
      reporting_staff_id: uuid('801'),
      assigned_staff_id: null,
      incident_number: 'DIS-2026-000001',
      title: 'Original title',
      severity: 'medium',
      status: 'under_review',
      occurred_at: '2026-05-16T09:00:00.000Z',
      reported_at: '2026-05-16T09:15:00.000Z',
      location: 'Dormitory',
      witnesses: [],
      description: 'Original description',
      action_taken: null,
      recommendations: null,
      linked_counselling_referral_id: null,
      behavior_points_delta: -8,
      parent_notification_status: 'not_required',
      metadata: {},
      deleted_at: null,
      created_at: '2026-05-16T09:15:00.000Z',
      updated_at: '2026-05-16T09:15:00.000Z',
    }),
    updateIncident: async (input: Record<string, unknown>) => {
      calls.push(`update:${input.incident_id}`);
      assert.equal(input.tenant_id, 'tenant-a');
      assert.equal(input.title, 'Updated title');
      return { id: uuid('101'), title: 'Updated title', severity: 'high' };
    },
    createAuditLog: async (input: Record<string, unknown>) => {
      calls.push(`audit:${input.action}`);
    },
  };
  const service = new DisciplineService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>) => callback() } as never,
    repository as never,
  );

  const result = await requestContext.run(
    {
      tenant_id: 'tenant-a',
      user_id: uuid('802'),
      role: 'discipline_master',
      permissions: ['discipline:manage'],
      request_id: 'request-3',
      session_id: null,
      client_ip: '127.0.0.1',
      user_agent: 'node-test',
      method: 'PATCH',
      path: '/discipline/incidents/00000000-0000-0000-0000-000000000101',
      started_at: '2026-05-16T10:00:00.000Z',
      is_authenticated: true,
    },
    () =>
      service.updateIncident(uuid('101'), {
        title: ' Updated title ',
        severity: 'high',
      }),
  );

  assert.deepEqual(result, { id: uuid('101'), title: 'Updated title', severity: 'high' });
  assert.deepEqual(calls, [
    `update:${uuid('101')}`,
    'audit:incident.updated',
  ]);
});

test('DisciplineService returns operational analytics from the repository', async () => {
  const requestContext = new RequestContextService();
  const repository = {
    getDisciplineAnalytics: async (tenantId: string) => {
      assert.equal(tenantId, 'tenant-a');
      return {
        open_cases: 12,
        severe_incidents: 3,
        pending_approvals: 2,
        repeat_offender_alerts: 4,
        top_offenses: [{ offense: 'Fighting', count: 5 }],
        incidents_by_severity: [{ severity: 'high', count: 3 }],
        incidents_by_status: [{ status: 'under_review', count: 8 }],
      };
    },
  };
  const service = new DisciplineService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>) => callback() } as never,
    repository as never,
  );

  const analytics = await requestContext.run(
    {
      tenant_id: 'tenant-a',
      user_id: uuid('803'),
      role: 'principal',
      permissions: ['discipline:reports'],
      request_id: 'request-4',
      session_id: null,
      client_ip: '127.0.0.1',
      user_agent: 'node-test',
      method: 'GET',
      path: '/discipline/analytics',
      started_at: '2026-05-16T10:00:00.000Z',
      is_authenticated: true,
    },
    () => service.getAnalytics(),
  );

  assert.equal(analytics.open_cases, 12);
  assert.deepEqual(analytics.top_offenses, [{ offense: 'Fighting', count: 5 }]);
  assert.ok(analytics.generated_at);
});

test('CounsellingService dashboard is backed by counselling repository aggregates', async () => {
  const requestContext = new RequestContextService();
  const counsellingRepository = {
    getCounsellingDashboard: async (tenantId: string) => {
      assert.equal(tenantId, 'tenant-a');
      return {
        active_referrals: 7,
        upcoming_sessions: 4,
        improvement_cases: 3,
        repeat_referrals: 2,
        high_risk_students: 1,
        followups_due: 5,
      };
    },
  };
  const service = new CounsellingService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>) => callback() } as never,
    {} as never,
    counsellingRepository as never,
    {} as never,
  );

  const dashboard = await requestContext.run(
    {
      tenant_id: 'tenant-a',
      user_id: uuid('804'),
      role: 'school_counsellor',
      permissions: ['counselling:read'],
      request_id: 'request-5',
      session_id: null,
      client_ip: '127.0.0.1',
      user_agent: 'node-test',
      method: 'GET',
      path: '/counselling/dashboard',
      started_at: '2026-05-16T10:00:00.000Z',
      is_authenticated: true,
    },
    () => service.getDashboard(),
  );

  assert.equal(dashboard.active_referrals, 7);
  assert.equal(dashboard.followups_due, 5);
  assert.ok(dashboard.generated_at);
});
