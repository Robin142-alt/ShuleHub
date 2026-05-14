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

test('synthetic journey plan refuses remote targets without opt-in and requires tenant credentials', () => {
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
      }),
    /requires tenantId and accessToken/i,
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
