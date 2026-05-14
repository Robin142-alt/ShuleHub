import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HIGH_VOLUME_WORKFLOW_LOADS,
  assertHighVolumeLoadIsReadSafe,
  validateHighVolumeLoadTarget,
} from './high-volume-workflow-load';

test('high volume workflow load covers new critical read paths', () => {
  const ids = new Set(HIGH_VOLUME_WORKFLOW_LOADS.map((workload) => workload.id));

  for (const id of [
    'dashboard-summaries',
    'student-search',
    'admissions-lists',
    'inventory-reconciliation',
    'billing-invoice-reports',
    'student-fee-balances',
    'parent-linked-learner-balances',
    'exams-report-cards',
    'teacher-mark-sheets',
    'timetable-published-schedules',
    'hr-staff-directory',
    'library-circulation',
    'support-status',
    'report-export-jobs',
  ]) {
    assert.ok(ids.has(id), `${id} should be covered`);
  }
});

test('high volume workflow load is read-safe and blocks remote mutation by default', () => {
  assertHighVolumeLoadIsReadSafe(HIGH_VOLUME_WORKFLOW_LOADS);
  assert.throws(
    () =>
      validateHighVolumeLoadTarget({
        targetUrl: 'https://prod.example.test',
        allowRemoteMutation: false,
      }),
    /refuses remote targets/,
  );
});
