import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';

import { FinanceSyncConflictResolverService } from './conflict-resolvers/finance-sync-conflict-resolver.service';
import { SYNC_SUPPORTED_ENTITIES } from './sync.constants';
import { SyncOperationLogService } from './sync-operation-log.service';
import { SyncService } from './sync.service';
import { RequestContextService } from '../../common/request-context/request-context.service';

test('attendance is retired from client sync entities', () => {
  assert.deepEqual([...SYNC_SUPPORTED_ENTITIES], ['finance']);

  const operationLogService = new SyncOperationLogService({} as never, {} as never);

  assert.throws(
    () => operationLogService.ensureSupportedEntity('attendance'),
    BadRequestException,
  );
});

test('retired attendance sync source files are removed from the active API tree', () => {
  for (const relativePath of [
    'apps/api/src/modules/sync/conflict-resolvers/attendance-sync-conflict-resolver.service.ts',
    'apps/api/src/modules/sync/entities/attendance-record.entity.ts',
    'apps/api/src/modules/sync/repositories/attendance-records.repository.ts',
  ]) {
    assert.equal(existsSync(join(process.cwd(), relativePath)), false, `${relativePath} should be removed`);
  }
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

test('SyncService pull returns ordered finance operations after attendance retirement', async () => {
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
      getCursorMap: async () => new Map([['finance', '2']]),
    } as never,
    {
      findByOpId: async (): Promise<null> => null,
      fetchByEntitySinceVersion: async () => [
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
      getLatestCursors: async () => [],
      ensureSupportedEntity: (): void => undefined,
    } as never,
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
        entities: ['finance'],
        limit: 10,
      }),
  );

  assert.equal(response.operations.length, 1);
  assert.deepEqual(
    response.operations.map((operation) => operation.version),
    ['5'],
  );
});
