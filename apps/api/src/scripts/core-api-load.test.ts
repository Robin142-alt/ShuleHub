import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCoreApiLoadPlan,
  CORE_API_LOAD_WORKLOADS,
  runCoreApiLoadProbe,
  validateCoreApiLoadWorkloads,
} from './core-api-load';

test('core API load workloads are read-only and exclude retired attendance', () => {
  const workloadIds = CORE_API_LOAD_WORKLOADS.map((workload) => workload.id);

  assert.ok(workloadIds.includes('inventory-report-export'));
  assert.ok(workloadIds.includes('admissions-report-export'));
  assert.ok(workloadIds.includes('billing-invoice-report-export'));
  assert.ok(workloadIds.includes('academics-teacher-assignments'));
  assert.ok(workloadIds.includes('exams-report-cards'));
  assert.equal(workloadIds.some((id) => id.includes('attendance')), false);
  assert.deepEqual(validateCoreApiLoadWorkloads(CORE_API_LOAD_WORKLOADS), []);

  const plan = buildCoreApiLoadPlan({
    baseUrl: 'http://127.0.0.1:3000',
    tenantId: 'tenant-a',
    accessToken: 'access-token',
  });

  assert.equal(plan.endpoints.every((endpoint) => endpoint.method === 'GET'), true);
  assert.equal(plan.endpoints.some((endpoint) => endpoint.path.includes('attendance')), false);

  const inventoryExport = plan.endpoints.find((endpoint) => endpoint.id === 'inventory-report-export');
  assert.ok(inventoryExport);
  assert.equal(inventoryExport.url, 'http://127.0.0.1:3000/inventory/reports/stock-valuation/export');
  assert.equal(inventoryExport.headers.authorization, 'Bearer access-token');
  assert.equal(inventoryExport.headers['x-tenant-id'], 'tenant-a');

  const health = plan.endpoints.find((endpoint) => endpoint.id === 'health-ready');
  assert.ok(health);
  assert.equal('authorization' in health.headers, false);
  assert.equal('x-tenant-id' in health.headers, false);
});

test('core API load plan prefers scoped monitor tokens over human access tokens', () => {
  const plan = buildCoreApiLoadPlan({
    baseUrl: 'http://127.0.0.1:3000',
    tenantId: 'tenant-a',
    monitorToken: 'shm_monitor-token',
    accessToken: 'human-token',
  });

  const tenantEndpoint = plan.endpoints.find((endpoint) => endpoint.auth === 'tenant');

  assert.ok(tenantEndpoint);
  assert.equal(tenantEndpoint.headers.authorization, 'Bearer shm_monitor-token');
  assert.equal(tenantEndpoint.headers['x-tenant-id'], 'tenant-a');
});

test('core API load workload validation rejects retired attendance probes', () => {
  const errors = validateCoreApiLoadWorkloads([
    ...CORE_API_LOAD_WORKLOADS,
    {
      id: 'attendance-online',
      method: 'GET',
      path: '/students/student-a/attendance',
      auth: 'tenant',
      weight: 1,
      targetP95Ms: 500,
      description: 'Old attendance endpoint',
    },
  ]);

  assert.deepEqual(errors, [
    'Workload attendance-online references retired attendance functionality.',
  ]);
});

test('core API load plan refuses remote targets without an explicit opt-in', () => {
  assert.throws(
    () =>
      buildCoreApiLoadPlan({
        baseUrl: 'https://shulehub-production.up.railway.app',
        tenantId: 'tenant-a',
        accessToken: 'access-token',
      }),
    /refuses remote targets/i,
  );

  const plan = buildCoreApiLoadPlan({
    baseUrl: 'https://staging.example.test',
    tenantId: 'tenant-a',
    accessToken: 'access-token',
    allowRemote: true,
  });

  assert.equal(plan.baseUrl, 'https://staging.example.test');
});

test('core API load probe records request outcomes with an injected fetch', async () => {
  const seenRequests: Array<{ url: string; headers: Record<string, string> }> = [];

  const result = await runCoreApiLoadProbe({
    baseUrl: 'http://localhost:3000/',
    tenantId: 'tenant-a',
    accessToken: 'access-token',
    iterations: 2,
    fetchImpl: async (url, init) => {
      seenRequests.push({ url, headers: init.headers });

      return {
        ok: true,
        status: 200,
        text: async () => '',
      };
    },
  });

  assert.equal(result.summary.totalRequests, CORE_API_LOAD_WORKLOADS.length * 2);
  assert.equal(result.summary.failedRequests, 0);
  assert.equal(result.results.every((request) => request.status === 200), true);
  assert.equal(seenRequests.some((request) => request.url.includes('/attendance')), false);
  assert.ok(result.summary.p95Ms >= 0);
});
