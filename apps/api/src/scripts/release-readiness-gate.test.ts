import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runReleaseReadinessGate,
  type ReleaseReadinessGateOptions,
} from './release-readiness-gate';

const passingModuleReadinessSource = `
  const productionReadyModules = new Set([
    "dashboard",
    "students",
    "admissions",
    "inventory",
    "exams",
    "settings",
  ]);
  const inactiveModules = new Set([
    "attendance",
    "academics",
    "communication",
    "reports",
    "staff",
    "timetable",
  ]);
`;

const passingPackageJsonSource = JSON.stringify({
  scripts: {
    test: [
      'node --test',
      'dist/apps/api/src/app-route-permissions.test.js',
      'dist/apps/api/src/auth/mfa.service.test.js',
      'dist/apps/api/src/auth/trusted-device.service.test.js',
      'dist/apps/api/src/auth/magic-link.service.test.js',
      'dist/apps/api/src/scripts/audit-coverage-review.test.js',
      'dist/apps/api/src/common/dashboard/dashboard-summary.repository.test.js',
      'dist/apps/api/src/common/reports/report-excel-artifact.test.js',
      'dist/apps/api/src/common/reports/report-pdf-artifact.test.js',
      'dist/apps/api/src/common/reports/report-artifact-storage.service.test.js',
      'dist/apps/api/src/common/reports/report-export.worker.test.js',
      'dist/apps/api/src/common/reports/report-export-queue.test.js',
      'dist/apps/api/src/common/reports/report-snapshot-manifest.test.js',
      'dist/apps/api/src/common/reports/report-snapshot.repository.test.js',
      'dist/apps/api/src/scripts/core-api-load.test.js',
      'dist/apps/api/src/scripts/generate-pilot-school-fixture.test.js',
      'dist/apps/api/src/scripts/high-volume-workflow-load.test.js',
      'dist/apps/api/src/scripts/query-plan-review.test.js',
      'dist/apps/api/src/scripts/release-readiness-gate.test.js',
      'dist/apps/api/src/scripts/provider-credential-smoke.test.js',
      'dist/apps/api/src/scripts/synthetic-journey-monitor.test.js',
      'dist/apps/api/src/common/uploads/streaming-upload.service.test.js',
      'dist/apps/api/src/modules/academics/academics.test.js',
      'dist/apps/api/src/modules/exams/exams.test.js',
      'dist/apps/api/src/modules/billing/student-fee-payment-allocation.service.test.js',
      'dist/apps/api/src/modules/hr/hr.test.js',
      'dist/apps/api/src/modules/library/library.test.js',
      'dist/apps/api/src/modules/timetable/timetable.test.js',
      'dist/apps/api/src/modules/support/support-status-subscription.service.test.js',
    ].join(' '),
    'web:test:design': 'npm --prefix apps/web run test:design',
    'audit:coverage-review': 'node apps/api/src/scripts/audit-coverage-review.ts',
    'fixture:pilot-school': 'node apps/api/src/scripts/generate-pilot-school-fixture.ts',
    'load:core-api': 'node apps/api/src/scripts/core-api-load.ts',
    'load:high-volume-workflows': 'node apps/api/src/scripts/high-volume-workflow-load.ts',
    'perf:query-plan-review': 'node apps/api/src/scripts/query-plan-review.ts',
    'monitor:synthetic': 'node apps/api/src/scripts/synthetic-journey-monitor.ts',
    'smoke:providers': 'node apps/api/src/scripts/provider-credential-smoke.ts',
    'release:readiness': 'node dist/apps/api/src/scripts/release-readiness-gate.js',
    'test:backup-integrity': 'jest apps/api/test/backup-integrity.integration-spec.ts',
    'test:disaster-recovery': 'jest apps/api/test/disaster-recovery.integration-spec.ts',
    'dr:backup-restore': 'npm run test:backup-integrity && npm run test:disaster-recovery',
  },
});

const passingIncidentRunbookSource = `
  # Incident Response Runbook

  ## Detection
  - Check GET /health/ready.
  - Check GET /support/public/system-status.
  - Confirm public status subscriptions and status notification attempts are healthy.
  - Run npm run smoke:providers for provider readiness.
  - Run npm run load:high-volume-workflows for read-safe release scale checks.
  - Review support notification dead-letter deliveries.
  - Review SLA breach alerts.

  ## Triage
  Confirm tenant scope and whether Exams workflows are affected.

  ## Communications
  Publish public status updates for schools.

  ## Mitigation
  Use rollback when the latest release is unsafe.

  ## Retired Modules
  Attendance is retired and must not be restored during incidents.
`;

const passingDisasterRecoveryRunbookSource = `
  # Backup and Restore Drill Runbook

  ## Scope
  Verify full schema restore, tenant-scoped restore, point-in-time restore, RTO, and RPO.

  ## Commands
  - npm run test:backup-integrity
  - npm run test:disaster-recovery
  - npm run dr:backup-restore
  - npm run fixture:pilot-school
  - npm run load:high-volume-workflows

  ## Safety
  Run only against sandbox schemas. Never restore over production.

  ## Tenant Isolation
  Confirm tenant digests before and after restore.

  ## Artifacts
  Verify checksum_sha256 before restore.

  ## Modules
  Exams data belongs to active academic recovery scope.
  Attendance is retired and must not be restored as a production module.
`;

test('runReleaseReadinessGate passes the current release safety contract', () => {
  const result = runGate();

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.filter((check) => check.status === 'fail'),
    [],
  );
});

test('runReleaseReadinessGate fails if attendance is exposed as production-ready', () => {
  const result = runGate({
    moduleReadinessSource: `
      const productionReadyModules = new Set(["dashboard", "exams", "attendance"]);
      const inactiveModules = new Set(["academics"]);
    `,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'frontend-module-readiness')?.message ?? '',
    /attendance/i,
  );
});

test('runReleaseReadinessGate fails when required release scripts are missing', () => {
  const result = runGate({
    packageJsonSource: JSON.stringify({
      scripts: {
        test: 'node --test dist/apps/api/src/app-route-permissions.test.js',
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'release-scripts')?.details.join('\n') ?? '',
    /perf:query-plan-review/,
  );
});

test('runReleaseReadinessGate fails when provider smoke coverage is missing', () => {
  const result = runGate({
    packageJsonSource: JSON.stringify({
      scripts: {
        ...JSON.parse(passingPackageJsonSource).scripts,
        test: [
          'node --test',
          'dist/apps/api/src/app-route-permissions.test.js',
          'dist/apps/api/src/scripts/audit-coverage-review.test.js',
          'dist/apps/api/src/common/dashboard/dashboard-summary.repository.test.js',
          'dist/apps/api/src/common/reports/report-export-queue.test.js',
          'dist/apps/api/src/common/reports/report-snapshot-manifest.test.js',
          'dist/apps/api/src/common/reports/report-snapshot.repository.test.js',
          'dist/apps/api/src/scripts/core-api-load.test.js',
          'dist/apps/api/src/scripts/query-plan-review.test.js',
          'dist/apps/api/src/scripts/release-readiness-gate.test.js',
          'dist/apps/api/src/scripts/synthetic-journey-monitor.test.js',
        ].join(' '),
        'smoke:providers': undefined,
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'release-scripts')?.details.join('\n') ?? '',
    /smoke:providers/,
  );
});

test('runReleaseReadinessGate fails when report snapshot coverage is missing', () => {
  const result = runGate({
    packageJsonSource: JSON.stringify({
      scripts: {
        ...JSON.parse(passingPackageJsonSource).scripts,
        test: [
          'node --test',
          'dist/apps/api/src/app-route-permissions.test.js',
          'dist/apps/api/src/scripts/audit-coverage-review.test.js',
          'dist/apps/api/src/common/dashboard/dashboard-summary.repository.test.js',
          'dist/apps/api/src/common/reports/report-export-queue.test.js',
          'dist/apps/api/src/scripts/core-api-load.test.js',
          'dist/apps/api/src/scripts/query-plan-review.test.js',
          'dist/apps/api/src/scripts/release-readiness-gate.test.js',
          'dist/apps/api/src/scripts/provider-credential-smoke.test.js',
          'dist/apps/api/src/scripts/synthetic-journey-monitor.test.js',
        ].join(' '),
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'release-scripts')?.details.join('\n') ?? '',
    /report-snapshot-manifest/,
  );
});

test('runReleaseReadinessGate fails when report snapshot persistence coverage is missing', () => {
  const result = runGate({
    packageJsonSource: JSON.stringify({
      scripts: {
        ...JSON.parse(passingPackageJsonSource).scripts,
        test: [
          'node --test',
          'dist/apps/api/src/app-route-permissions.test.js',
          'dist/apps/api/src/scripts/audit-coverage-review.test.js',
          'dist/apps/api/src/common/dashboard/dashboard-summary.repository.test.js',
          'dist/apps/api/src/common/reports/report-export-queue.test.js',
          'dist/apps/api/src/common/reports/report-snapshot-manifest.test.js',
          'dist/apps/api/src/scripts/core-api-load.test.js',
          'dist/apps/api/src/scripts/query-plan-review.test.js',
          'dist/apps/api/src/scripts/release-readiness-gate.test.js',
          'dist/apps/api/src/scripts/provider-credential-smoke.test.js',
          'dist/apps/api/src/scripts/synthetic-journey-monitor.test.js',
        ].join(' '),
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'release-scripts')?.details.join('\n') ?? '',
    /report-snapshot\.repository/,
  );
});

test('runReleaseReadinessGate fails when dashboard summary coverage is missing', () => {
  const result = runGate({
    packageJsonSource: JSON.stringify({
      scripts: {
        ...JSON.parse(passingPackageJsonSource).scripts,
        test: [
          'node --test',
          'dist/apps/api/src/app-route-permissions.test.js',
          'dist/apps/api/src/scripts/audit-coverage-review.test.js',
          'dist/apps/api/src/common/reports/report-export-queue.test.js',
          'dist/apps/api/src/common/reports/report-snapshot-manifest.test.js',
          'dist/apps/api/src/common/reports/report-snapshot.repository.test.js',
          'dist/apps/api/src/scripts/core-api-load.test.js',
          'dist/apps/api/src/scripts/query-plan-review.test.js',
          'dist/apps/api/src/scripts/release-readiness-gate.test.js',
          'dist/apps/api/src/scripts/provider-credential-smoke.test.js',
          'dist/apps/api/src/scripts/synthetic-journey-monitor.test.js',
        ].join(' '),
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'release-scripts')?.details.join('\n') ?? '',
    /dashboard-summary\.repository/,
  );
});

test('runReleaseReadinessGate fails when upload controllers use memoryStorage', () => {
  const result = runGate({
    uploadControllerSources: {
      'apps/api/src/modules/support/support.controller.ts': `
        import { FileInterceptor } from '@nestjs/platform-express';
        const { memoryStorage } = require('multer');
        @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
        export class SupportController {}
      `,
      'apps/api/src/modules/admissions/admissions.controller.ts': `
        import { StreamingUploadInterceptor } from '../../common/uploads/streaming-upload.interceptor';
        @UseInterceptors(StreamingUploadInterceptor('file'))
        export class AdmissionsController {}
      `,
    },
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'streaming-upload-ingestion')?.details.join('\n') ?? '',
    /memoryStorage/,
  );
});

test('runReleaseReadinessGate fails when the incident runbook loses required response steps', () => {
  const result = runGate({
    incidentRunbookSource: '# Incident Response Runbook\n\nNo operational steps yet.',
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'incident-response-runbook')?.details.join('\n') ?? '',
    /GET \/health\/ready/,
  );
});

test('runReleaseReadinessGate fails when the backup restore drill runbook loses required safeguards', () => {
  const result = runGate({
    disasterRecoveryRunbookSource: '# Backup and Restore\n\nNo safeguards yet.',
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'backup-restore-runbook')?.details.join('\n') ?? '',
    /test:backup-integrity/,
  );
});

test('runReleaseReadinessGate fails when synthetic journeys reference retired attendance', () => {
  const result = runGate({
    syntheticJourneys: [
      {
        id: 'attendance-monitor',
        description: 'Bad retired monitor',
        steps: [
          {
            id: 'attendance',
            target: 'api',
            method: 'GET',
            path: '/attendance',
            auth: 'tenant',
            targetP95Ms: 500,
            description: 'Retired attendance path',
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'synthetic-journey-coverage')?.details.join('\n') ?? '',
    /attendance/i,
  );
});

test('runReleaseReadinessGate fails when audit coverage requirements reference retired attendance', () => {
  const result = runGate({
    auditCoverageRequirements: [
      {
        id: 'attendance-audit',
        module: 'attendance',
        description: 'Bad retired audit requirement',
        evidence: [
          {
            file: 'apps/api/src/modules/students/attendance.service.ts',
            patterns: ['attendance.recorded'],
          },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(
    result.checks.find((check) => check.id === 'audit-coverage-review')?.details.join('\n') ?? '',
    /attendance/i,
  );
});

function runGate(overrides: ReleaseReadinessGateOptions = {}) {
  return runReleaseReadinessGate({
    moduleReadinessSource: passingModuleReadinessSource,
    packageJsonSource: passingPackageJsonSource,
    incidentRunbookSource: passingIncidentRunbookSource,
    disasterRecoveryRunbookSource: passingDisasterRecoveryRunbookSource,
    ...overrides,
  });
}
