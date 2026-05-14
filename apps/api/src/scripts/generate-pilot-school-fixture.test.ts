import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPilotSchoolFixturePlan, assertFixtureMutationAllowed } from './generate-pilot-school-fixture';

test('pilot school fixture plan includes Implementation 6 domains without retired modules', () => {
  const plan = buildPilotSchoolFixturePlan();

  assert.equal(plan.tenants, 1);
  assert.equal(plan.students, 1500);
  assert.equal(plan.staff, 120);
  assert.equal(plan.invoices, 2000);
  assert.equal(plan.payments, 5000);
  assert.equal(plan.inventory_movements, 2000);
  assert.equal(plan.support_tickets, 100);
  assert.equal(plan.exam_series, 10);
  assert.ok(plan.modules.includes('hr'));
  assert.ok(plan.modules.includes('library'));
  assert.ok(plan.modules.includes('timetable'));
  assert.ok(!plan.modules.includes('attendance'));
  assert.ok(!plan.modules.includes('payroll'));
  assert.ok(!plan.modules.includes('transport'));
});

test('pilot school fixture generator refuses remote mutation without explicit opt-in', () => {
  assert.throws(
    () =>
      assertFixtureMutationAllowed({
        targetUrl: 'https://prod.example.test',
        allowRemoteMutation: false,
      }),
    /refuses remote targets/,
  );

  assert.doesNotThrow(() =>
    assertFixtureMutationAllowed({
      targetUrl: 'http://localhost:3000',
      allowRemoteMutation: false,
    }),
  );
});
