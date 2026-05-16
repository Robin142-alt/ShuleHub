import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYNTHETIC_JOURNEYS,
  buildSyntheticJourneyPlan,
  runSyntheticJourneyMonitor,
  validateSyntheticJourneys,
} from './synthetic-journey-monitor';

test('synthetic journeys are read-only and exclude retired attendance', () => {
  assert.deepEqual(validateSyntheticJourneys(SYNTHETIC_JOURNEYS), []);
  assert.equal(
    SYNTHETIC_JOURNEYS.some((journey) => journey.id === 'exams-workspace'),
    true,
  );
  assert.equal(
    SYNTHETIC_JOURNEYS.some((journey) => journey.id === 'public-status-page'),
    true,
  );

  assert.deepEqual(
    validateSyntheticJourneys([
      {
        id: 'bad-attendance',
        description: 'Retired attendance check',
        steps: [
          {
            id: 'attendance',
            target: 'api',
            method: 'GET',
            path: '/attendance',
            auth: 'tenant',
            targetP95Ms: 500,
            description: 'Should not exist',
          },
        ],
      },
    ]),
    ['Synthetic journey bad-attendance step attendance references retired attendance functionality.'],
  );
});

test('synthetic journey plan refuses remote targets without opt-in and explicit tenant journeys require credentials', () => {
  assert.throws(
    () =>
      buildSyntheticJourneyPlan({
        apiBaseUrl: 'https://api.example.test',
        webBaseUrl: 'http://127.0.0.1:3000',
        allowRemote: false,
        tenantId: 'tenant-1',
        accessToken: 'token-1',
      }),
    /refuses remote targets/i,
  );

  assert.throws(
    () =>
      buildSyntheticJourneyPlan({
        apiBaseUrl: 'http://127.0.0.1:3100',
        webBaseUrl: 'http://127.0.0.1:3000',
        journeys: [
          {
            id: 'tenant-only',
            description: 'Tenant-only check.',
            steps: [
              {
                id: 'students',
                target: 'api',
                method: 'GET',
                path: '/students',
                auth: 'tenant',
                targetP95Ms: 900,
                description: 'Students.',
              },
            ],
          },
        ],
      }),
    /requires tenantId and monitorToken or accessToken/i,
  );
});

test('synthetic journey plan prefers scoped monitor tokens over human access tokens', () => {
  const plan = buildSyntheticJourneyPlan({
    apiBaseUrl: 'http://127.0.0.1:3100',
    webBaseUrl: 'http://127.0.0.1:3000',
    tenantId: 'tenant-1',
    monitorToken: 'shm_monitor-token',
    accessToken: 'human-token',
  });

  const tenantStep = plan.journeys
    .flatMap((journey) => journey.steps)
    .find((step) => step.auth === 'tenant');

  assert.ok(tenantStep);
  assert.equal(tenantStep.headers.authorization, 'Bearer shm_monitor-token');
  assert.equal(tenantStep.headers['x-tenant-id'], 'tenant-1');
});

test('synthetic journey plan keeps public checks when tenant credentials are absent', () => {
  const plan = buildSyntheticJourneyPlan({
    apiBaseUrl: 'http://127.0.0.1:3100',
    webBaseUrl: 'http://127.0.0.1:3000',
  });

  assert.deepEqual(
    plan.journeys.map((journey) => journey.id),
    ['public-readiness', 'public-status-page', 'exams-workspace', 'discipline-workspace'],
  );
  assert.equal(
    plan.journeys.flatMap((journey) => journey.steps).some((step) => step.auth === 'tenant'),
    false,
  );
});

test('runSyntheticJourneyMonitor groups step outcomes by journey', async () => {
  const requestedUrls: string[] = [];
  const result = await runSyntheticJourneyMonitor({
    apiBaseUrl: 'http://127.0.0.1:3100',
    webBaseUrl: 'http://127.0.0.1:3000',
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    journeys: [
      {
        id: 'smoke',
        description: 'Smoke journey',
        steps: [
          {
            id: 'ready',
            target: 'api',
            method: 'GET',
            path: '/health/ready',
            auth: 'none',
            targetP95Ms: 500,
            description: 'Readiness',
          },
          {
            id: 'students',
            target: 'api',
            method: 'GET',
            path: '/students',
            auth: 'tenant',
            targetP95Ms: 900,
            description: 'Students',
          },
        ],
      },
    ],
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return {
        ok: !url.endsWith('/students'),
        status: url.endsWith('/students') ? 503 : 200,
        text: async () => 'temporarily unavailable',
      };
    },
  });

  assert.equal(result.summary.totalSteps, 2);
  assert.equal(result.summary.failedSteps, 1);
  assert.equal(result.journeys[0]?.ok, false);
  assert.equal(result.journeys[0]?.steps[1]?.status, 503);
  assert.equal(result.journeys[0]?.steps[1]?.error, 'temporarily unavailable');
  assert.deepEqual(requestedUrls, [
    'http://127.0.0.1:3100/health/ready',
    'http://127.0.0.1:3100/students',
  ]);
});
