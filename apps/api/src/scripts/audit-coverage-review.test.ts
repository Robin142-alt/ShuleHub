import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIT_COVERAGE_REQUIREMENTS,
  runAuditCoverageReview,
  validateAuditCoverageRequirements,
} from './audit-coverage-review';

test('audit coverage requirements cover active modules and exclude retired attendance', () => {
  assert.deepEqual(validateAuditCoverageRequirements(AUDIT_COVERAGE_REQUIREMENTS), []);
  assert.equal(
    AUDIT_COVERAGE_REQUIREMENTS.some((requirement) => requirement.id === 'admissions-academic-events'),
    true,
  );
  assert.equal(
    AUDIT_COVERAGE_REQUIREMENTS.some((requirement) => requirement.id === 'exams-report-card-audit'),
    true,
  );
  assert.equal(
    AUDIT_COVERAGE_REQUIREMENTS.some((requirement) => requirement.id === 'support-status-subscription-privacy'),
    true,
  );
  assert.equal(
    JSON.stringify(AUDIT_COVERAGE_REQUIREMENTS).toLowerCase().includes('attendance'),
    false,
  );
});

test('validateAuditCoverageRequirements rejects retired attendance requirements', () => {
  assert.deepEqual(
    validateAuditCoverageRequirements([
      {
        id: 'attendance-audit',
        module: 'attendance',
        description: 'Bad retired audit surface',
        evidence: [
          {
            file: 'apps/api/src/modules/students/attendance.service.ts',
            patterns: ['attendance.recorded'],
          },
        ],
      },
    ]),
    ['Audit coverage requirement attendance-audit references retired attendance functionality.'],
  );
});

test('runAuditCoverageReview reports missing evidence by file and pattern', () => {
  const result = runAuditCoverageReview({
    requirements: [
      {
        id: 'tenant-membership-audit',
        module: 'auth',
        description: 'Tenant membership changes are audited.',
        evidence: [
          {
            file: 'apps/api/src/auth/tenant-invitations.service.ts',
            patterns: ['tenant.membership.status_changed', 'tenant.membership.role_changed'],
          },
        ],
      },
    ],
    readFile: (filePath) =>
      filePath.endsWith('tenant-invitations.service.ts')
        ? "recordAudit('tenant.membership.status_changed')"
        : '',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.results[0]?.missing, [
    {
      file: 'apps/api/src/auth/tenant-invitations.service.ts',
      pattern: 'tenant.membership.role_changed',
    },
  ]);
});

test('runAuditCoverageReview passes when all evidence patterns are present', () => {
  const result = runAuditCoverageReview({
    requirements: [
      {
        id: 'tenant-membership-audit',
        module: 'auth',
        description: 'Tenant membership changes are audited.',
        evidence: [
          {
            file: 'apps/api/src/auth/tenant-invitations.service.ts',
            patterns: ['tenant.membership.status_changed', 'tenant.membership.role_changed'],
          },
        ],
      },
    ],
    readFile: () =>
      "recordAudit('tenant.membership.status_changed') recordAudit('tenant.membership.role_changed')",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.results[0]?.missing, []);
});
