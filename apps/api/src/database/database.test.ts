import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from './database.service';

interface RecordedQuery {
  text: string;
  values?: unknown[];
}

class FakePoolClient {
  readonly queries: RecordedQuery[] = [];
  released = false;

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    this.queries.push({ text, values });

    return {
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [{ ok: true }] as unknown as T[],
    };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool {
  readonly queryCalls: RecordedQuery[] = [];
  readonly client = new FakePoolClient();
  connectCalls = 0;

  async connect(): Promise<PoolClient> {
    this.connectCalls += 1;
    return this.client as unknown as PoolClient;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    this.queryCalls.push({ text, values });

    return {
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [{ ok: true }] as unknown as T[],
    };
  }

  async end(): Promise<void> {
    return Promise.resolve();
  }
}

test('DatabaseService.query scopes request-context calls into a transaction-local session', async () => {
  const requestContext = new RequestContextService();
  const pool = new FakePool();
  const service = new DatabaseService(
    pool as never,
    requestContext,
    {
      getRuntimeRoleName: () => 'shule_hub_runtime',
    } as never,
    {
      get: () => undefined,
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['students:read'],
      is_authenticated: true,
      client_ip: null,
      user_agent: 'database.test',
      method: 'GET',
      path: '/students',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    async () => {
      await service.query('SELECT 42');
    },
  );

  assert.equal(pool.connectCalls, 1);
  assert.equal(pool.client.released, true);
  assert.deepEqual(
    pool.client.queries.map((query) => query.text),
    [
      'BEGIN',
      "SET LOCAL ROLE shule_hub_runtime; SET LOCAL app.tenant_id = 'tenant-a'; SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000001'; SET LOCAL app.request_id = 'req-1'; SET LOCAL app.role = 'owner'; SET LOCAL app.session_id = 'session-1'; SET LOCAL app.method = 'GET'; SET LOCAL app.path = '/students'; SET LOCAL app.client_ip = ''; SET LOCAL app.user_agent = 'database.test'; SET LOCAL app.started_at = '2026-04-26T00:00:00.000Z'; SET LOCAL app.is_authenticated = 'true'",
      'SELECT 42',
      'COMMIT',
    ],
  );
});

test('DatabaseService.query uses the raw pool when no request context exists', async () => {
  const requestContext = new RequestContextService();
  const pool = new FakePool();
  const service = new DatabaseService(
    pool as never,
    requestContext,
    {
      getRuntimeRoleName: () => 'shule_hub_runtime',
    } as never,
    {
      get: () => undefined,
    } as never,
  );

  await service.query('SELECT 1');

  assert.equal(pool.connectCalls, 0);
  assert.deepEqual(pool.queryCalls, [{ text: 'SELECT 1', values: [] }]);
});
