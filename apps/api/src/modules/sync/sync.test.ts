import assert from 'node:assert/strict';
import test from 'node:test';

import { AttendanceSyncConflictResolverService } from './conflict-resolvers/attendance-sync-conflict-resolver.service';
import { FinanceSyncConflictResolverService } from './conflict-resolvers/finance-sync-conflict-resolver.service';
import { SyncService } from './sync.service';
import { RequestContextService } from '../../common/request-context/request-context.service';

test('AttendanceSyncConflictResolverService applies a newer attendance operation', async () => {
  const resolver = new AttendanceSyncConflictResolverService(
    {
      lockById: async (): Promise<null> => null,
      lockByStudentAndDate: async (): Promise<null> => null,
      upsertRecord: async () => ({
        id: '00000000-0000-0000-0000-000000000101',
        student_id: '00000000-0000-0000-0000-000000000201',
        attendance_date: '2026-04-26',
        status: 'present',
        last_modified_at: new Date('2026-04-26T08:00:00.000Z'),
        notes: null,
        metadata: {},
        source_device_id: 'device-1',
        last_operation_id: '00000000-0000-0000-0000-000000000301',
        sync_version: '15',
      }),
    } as never,
    {
      createOperation: async () => ({
        version: '15',
      }),
    } as never,
  );

  const result = await resolver.applyOperation('tenant-a', 'device-1', {
    op_id: '00000000-0000-0000-0000-000000000301',
    entity: 'attendance',
    version: 7,
    payload: {
      action: 'upsert',
      record_id: '00000000-0000-0000-0000-000000000101',
      student_id: '00000000-0000-0000-0000-000000000201',
      attendance_date: '2026-04-26',
      status: 'present',
      last_modified_at: '2026-04-26T08:00:00.000Z',
    },
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.server_version, '15');
});

test('AttendanceSyncConflictResolverService rejects stale attendance updates', async () => {
  const resolver = new AttendanceSyncConflictResolverService(
    {
      lockById: async (): Promise<null> => null,
      lockByStudentAndDate: async () => ({
        id: '00000000-0000-0000-0000-000000000101',
        student_id: '00000000-0000-0000-0000-000000000201',
        attendance_date: '2026-04-26',
        status: 'absent',
        last_modified_at: new Date('2026-04-26T09:00:00.000Z'),
        notes: null,
        metadata: {},
        source_device_id: 'device-server',
        last_operation_id: '00000000-0000-0000-0000-000000000302',
        sync_version: '18',
      }),
      upsertRecord: async (): Promise<never> => {
        throw new Error('Stale operations must not upsert attendance records');
      },
    } as never,
    {
      createOperation: async (): Promise<never> => {
        throw new Error('Stale operations must not create sync logs');
      },
    } as never,
  );

  const result = await resolver.applyOperation('tenant-a', 'device-1', {
    op_id: '00000000-0000-0000-0000-000000000301',
    entity: 'attendance',
    version: 6,
    payload: {
      action: 'upsert',
      record_id: '00000000-0000-0000-0000-000000000101',
      student_id: '00000000-0000-0000-0000-000000000201',
      attendance_date: '2026-04-26',
      status: 'present',
      last_modified_at: '2026-04-26T08:00:00.000Z',
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.conflict_policy, 'last-write-wins');
  assert.equal(result.server_version, '18');
});

test('FinanceSyncConflictResolverService rejects client finance mutations', async () => {
  const resolver = new FinanceSyncConflictResolverService();
  const result = await resolver.applyOperation({
    op_id: '00000000-0000-0000-0000-000000000401',
    entity: 'finance',
    version: 1,
    payload: {
      action: 'posted',
      transaction_id: '00000000-0000-0000-0000-000000000501',
      reference: 'TX-1',
      description: 'Ledger tx',
      total_amount_minor: '10000',
      currency_code: 'KES',
      entry_count: 2,
      posted_at: '2026-04-26T08:00:00.000Z',
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.conflict_policy, 'server-authoritative');
});

test('SyncService pull merges cursor windows and returns ordered operations', async () => {
  const requestContext = new RequestContextService();
  const service = new SyncService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      upsertDevice: async () => ({
        id: 'device-row',
        tenant_id: 'tenant-a',
        device_id: 'device-1',
        platform: 'android',
        app_version: '1.0.0',
        metadata: {},
        last_seen_at: new Date(),
        last_push_at: null,
        last_pull_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }),
      markPush: async (): Promise<void> => undefined,
      markPull: async (): Promise<void> => undefined,
    } as never,
    {
      upsertCursor: async (): Promise<void> => undefined,
      getCursorMap: async () => new Map([['attendance', '2']]),
    } as never,
    {
      findByOpId: async (): Promise<null> => null,
      fetchByEntitySinceVersion: async (_tenantId: string, entity: string) =>
        entity === 'attendance'
          ? [
              {
                op_id: '00000000-0000-0000-0000-000000000601',
                tenant_id: 'tenant-a',
                device_id: 'device-2',
                entity: 'attendance',
                payload: { action: 'upsert' },
                version: '3',
                created_at: new Date('2026-04-26T08:00:00.000Z').toISOString(),
                updated_at: new Date('2026-04-26T08:00:00.000Z').toISOString(),
              },
            ]
          : [
              {
                op_id: '00000000-0000-0000-0000-000000000602',
                tenant_id: 'tenant-a',
                device_id: 'server',
                entity: 'finance',
                payload: { action: 'posted' },
                version: '5',
                created_at: new Date('2026-04-26T09:00:00.000Z').toISOString(),
                updated_at: new Date('2026-04-26T09:00:00.000Z').toISOString(),
              },
            ],
      getLatestVersionByEntities: async () => new Map(),
    } as never,
    {
      lockById: async (): Promise<null> => null,
      lockByStudentAndDate: async (): Promise<null> => null,
    } as never,
    {
      getLatestCursors: async () => [],
      ensureSupportedEntity: (): void => undefined,
    } as never,
    {} as never,
    {} as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/sync/pull',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.pull({
        device_id: 'device-1',
        platform: 'android',
        app_version: '1.0.0',
        metadata: {},
        entities: ['attendance', 'finance'],
        limit: 10,
      }),
  );

  assert.equal(response.operations.length, 2);
  assert.deepEqual(
    response.operations.map((operation) => operation.version),
    ['3', '5'],
  );
});
