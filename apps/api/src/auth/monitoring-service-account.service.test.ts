import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashMonitoringToken,
  MonitoringServiceAccountService,
  normalizeReadOnlyPermissions,
} from './monitoring-service-account.service';

test('MonitoringServiceAccountService creates tenant-scoped tokens and stores only a hash', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const service = new MonitoringServiceAccountService({
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });

      if (/INSERT INTO monitoring_service_accounts/i.test(sql)) {
        return {
          rows: [
            {
              id: 'account-1',
              tenant_id: values[0],
              name: values[1],
              token_hash: values[2],
              permissions: values[3],
              status: 'active',
              expires_at: values[4],
              last_used_at: null,
              created_by: values[5],
              created_at: '2026-05-15T00:00:00.000Z',
              updated_at: '2026-05-15T00:00:00.000Z',
            },
          ],
        };
      }

      return { rows: [] };
    },
  } as never);

  const created = await service.createToken({
    tenantId: 'tenant-a',
    name: 'production monitor',
    createdBy: 'owner-1',
    expiresAt: '2026-08-15T00:00:00.000Z',
    permissions: ['students:read', 'support:view'],
  });

  assert.equal(created.tenant_id, 'tenant-a');
  assert.equal(created.token.startsWith('shm_'), true);
  assert.equal(queries[0].values.includes(created.token), false);
  assert.equal(queries[0].values[2], hashMonitoringToken(created.token));
  assert.deepEqual(created.permissions, ['students:read', 'support:view']);
  assert.match(queries[1].sql, /INSERT INTO monitoring_service_account_audit_logs/);
});

test('MonitoringServiceAccountService verifies valid tokens and returns tenant monitor principal', async () => {
  const rawToken = 'shm_valid-token';
  const updates: string[] = [];
  const service = new MonitoringServiceAccountService({
    query: async (sql: string, values: unknown[]) => {
      if (/SELECT id, tenant_id, name, token_hash/i.test(sql)) {
        assert.equal(values[0], hashMonitoringToken(rawToken));
        return {
          rows: [
            {
              id: 'account-1',
              tenant_id: 'tenant-a',
              name: 'production monitor',
              token_hash: values[0],
              permissions: ['students:read', 'support:view'],
              status: 'active',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_used_at: null,
              created_by: null,
              created_at: '2026-05-15T00:00:00.000Z',
              updated_at: '2026-05-15T00:00:00.000Z',
            },
          ],
        };
      }

      updates.push(sql);
      return { rows: [] };
    },
  } as never);

  const principal = await service.verifyToken(rawToken, 'tenant-a');

  assert.deepEqual(principal, {
    user_id: 'monitor:account-1',
    tenant_id: 'tenant-a',
    role: 'monitor',
    audience: 'school',
    session_id: 'monitor:account-1',
    permissions: ['students:read', 'support:view'],
    is_authenticated: true,
  });
  assert.equal(updates.some((sql) => /last_used_at = NOW/i.test(sql)), true);
});

test('MonitoringServiceAccountService rejects expired revoked or tenant-mismatched tokens', async () => {
  for (const row of [
    { status: 'active', tenant_id: 'tenant-a', expires_at: new Date(Date.now() - 60_000).toISOString() },
    { status: 'revoked', tenant_id: 'tenant-a', expires_at: new Date(Date.now() + 60_000).toISOString() },
    { status: 'active', tenant_id: 'tenant-b', expires_at: new Date(Date.now() + 60_000).toISOString() },
  ]) {
    const audits: string[] = [];
    const service = new MonitoringServiceAccountService({
      query: async (sql: string, values: unknown[]) => {
        if (/SELECT id, tenant_id, name, token_hash/i.test(sql)) {
          return {
            rows: [
              {
                id: 'account-1',
                name: 'production monitor',
                token_hash: 'hash',
                permissions: ['students:read'],
                last_used_at: null,
                created_by: null,
                created_at: '2026-05-15T00:00:00.000Z',
                updated_at: '2026-05-15T00:00:00.000Z',
                ...row,
              },
            ],
          };
        }

        if (/INSERT INTO monitoring_service_account_audit_logs/i.test(sql)) {
          audits.push(String(values[2]));
        }

        return { rows: [] };
      },
    } as never);

    await assert.rejects(() => service.verifyToken('shm_invalid', 'tenant-a'), /Invalid monitoring token/);
    assert.deepEqual(audits, ['validation_failed']);
  }
});

test('MonitoringServiceAccountService records audit rows for malformed token validation failures', async () => {
  const audits: string[] = [];
  const service = new MonitoringServiceAccountService({
    query: async (sql: string, values: unknown[]) => {
      if (/INSERT INTO monitoring_service_account_audit_logs/i.test(sql)) {
        audits.push(String(values[2]));
      }

      return { rows: [] };
    },
  } as never);

  await assert.rejects(() => service.verifyToken('not-a-monitor-token', 'tenant-a'), /Invalid monitoring token/);
  assert.deepEqual(audits, ['validation_failed']);
});

test('MonitoringServiceAccountService rejects write-capable permissions', () => {
  assert.throws(
    () => normalizeReadOnlyPermissions(['students:read', 'support:manage']),
    /read-only permissions/,
  );
});

test('MonitoringServiceAccountService records audit rows for revocation and rotation', async () => {
  const audits: string[] = [];
  const service = new MonitoringServiceAccountService({
    query: async (sql: string, values: unknown[]) => {
      if (/UPDATE monitoring_service_accounts\s+SET status = 'revoked'/i.test(sql)) {
        return { rows: [{ id: values[0], tenant_id: 'tenant-a' }] };
      }

      if (/UPDATE monitoring_service_accounts\s+SET token_hash/i.test(sql)) {
        return {
          rows: [
            {
              id: values[0],
              tenant_id: 'tenant-a',
              name: 'production monitor',
              token_hash: values[1],
              permissions: ['students:read'],
              status: 'active',
              expires_at: '2026-08-15T00:00:00.000Z',
              last_used_at: null,
              created_by: null,
              created_at: '2026-05-15T00:00:00.000Z',
              updated_at: '2026-05-15T00:00:00.000Z',
            },
          ],
        };
      }

      if (/INSERT INTO monitoring_service_account_audit_logs/i.test(sql)) {
        audits.push(String(values[2]));
      }

      return { rows: [] };
    },
  } as never);

  await service.revokeToken('account-1', 'owner-1');
  const rotated = await service.rotateToken('account-1', 'owner-1');

  assert.equal(rotated.token.startsWith('shm_'), true);
  assert.deepEqual(audits, ['revoked', 'rotated']);
});
