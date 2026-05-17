import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateProductionScorecard,
  renderProductionScorecardMarkdown,
} from './generate-production-scorecard';

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
    test: 'node --test dist/apps/api/src/scripts/generate-production-scorecard.test.js dist/apps/api/src/scripts/release-readiness-gate.test.js',
    'web:lint': 'npm --prefix apps/web run lint',
    'web:build': 'npm --prefix apps/web run build',
    'web:test:design': 'npm --prefix apps/web run test:design',
    'auth:production-verify': 'node apps/api/src/scripts/verify-production-auth-cleanup.ts',
    'auth:rotate-owner-password': 'node apps/api/src/scripts/rotate-platform-owner-password.ts',
    'test:auth-security': 'jest apps/api/test/auth-security.integration-spec.ts',
    'certify:pilot': 'node apps/api/src/scripts/run-pilot-certification.ts',
    'test:tenant-isolation': 'jest apps/api/test/tenant-isolation.integration-spec.ts',
    'tenant:isolation:audit': 'node apps/api/src/scripts/tenant-isolation-audit.ts',
    'security:scan': 'node apps/api/src/scripts/security-scan.ts',
    'security:deps': 'npm audit --omit=dev --audit-level=high',
    'finance:certify': 'node apps/api/src/scripts/certify-finance.ts',
    'library:certify': 'node apps/api/src/scripts/certify-library.ts',
    'discipline:certify': 'node apps/api/src/scripts/certify-discipline.ts',
    'test:api-consistency': 'jest apps/api/test/api-consistency.integration-spec.ts',
    'test:finance-integrity': 'jest apps/api/test/finance-integrity.integration-spec.ts',
    'test:financial-reconciliation': 'jest apps/api/test/financial-reconciliation.integration-spec.ts',
    'test:mpesa-adversarial': 'jest apps/api/test/mpesa-adversarial.integration-spec.ts',
    'load:financial-truth': 'node apps/api/test/financial-truth-load.ts',
    'smoke:providers': 'node apps/api/src/scripts/provider-credential-smoke.ts',
    'load:tenant-scale': 'node apps/api/test/tenant-scale.load.ts',
    'load:kenyan-school': 'node apps/api/test/kenyan-school-load.ts',
    'perf:query-plan-review': 'node apps/api/src/scripts/query-plan-review.ts',
    'load:core-api': 'node apps/api/src/scripts/core-api-load.ts',
    'monitor:synthetic': 'node apps/api/src/scripts/synthetic-journey-monitor.ts',
    'dr:backup-restore': 'npm run test:backup-integrity && npm run test:disaster-recovery',
    'ops:incident-drill': 'node apps/api/src/scripts/incident-drill.ts',
    'scorecard:production': 'node apps/api/src/scripts/generate-production-scorecard.ts',
    'audit:coverage-review': 'node apps/api/src/scripts/audit-coverage-review.ts',
    'fixture:pilot-school': 'node apps/api/src/scripts/generate-pilot-school-fixture.ts',
    'load:high-volume-workflows': 'node apps/api/src/scripts/high-volume-workflow-load.ts',
    'release:readiness': 'node dist/apps/api/src/scripts/release-readiness-gate.js',
    'monitor:create-service-account': 'node apps/api/src/scripts/create-monitoring-service-account.ts',
    'build:sms-relay': 'npm --prefix apps/sms-relay run build',
    'test:sms-relay': 'npm --prefix apps/sms-relay run test',
    'build:malware-scanner': 'npm --prefix apps/malware-scanner run build',
    'test:malware-scanner': 'npm --prefix apps/malware-scanner run test',
    'test:backup-integrity': 'jest apps/api/test/backup-integrity.integration-spec.ts',
    'test:disaster-recovery': 'jest apps/api/test/disaster-recovery.integration-spec.ts',
  },
});

const passingIncidentRunbookSource = `
  Check GET /health/ready.
  Check GET /support/public/system-status.
  Review public status subscriptions and status notification attempts.
  Run npm run smoke:providers.
  Run npm run load:high-volume-workflows.
  Review support notification dead-letter.
  Review SLA breach alerts.
  Communicate impact and rollback when unsafe.
  Confirm Exams scope.
  Attendance is retired.
`;

const passingDisasterRecoveryRunbookSource = `
  Run test:backup-integrity, test:disaster-recovery, dr:backup-restore, fixture:pilot-school, and load:high-volume-workflows.
  Verify full schema restore, tenant-scoped restore, point-in-time restore, RTO, RPO, sandbox schemas, tenant digests, and checksum_sha256.
  Never restore over production.
  Exams is included. Attendance is retired.
`;

const passingProviderSmokeSource = `
  SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS
  live-support-sms-provider
  live-upload-malware-scan-provider
  UPLOAD_MALWARE_SCAN_HEALTH_URL
  live-upload-object-storage
  delete_checked
`;

const passingProductionWorkflowSource = `
  name: production-operability
  steps:
    - run: npm run monitor:synthetic
    - run: npm run load:core-api
    - run: npm run smoke:providers
    - run: npm run perf:query-plan-review
    - run: npm run release:readiness
    - run: npm run scorecard:production
    - run: npm run certify:pilot
    - run: npm run finance:certify
    - run: npm run library:certify
    - run: npm run discipline:certify
    - run: npm run tenant:isolation:audit
    - run: npm run security:scan
    - run: npm run security:deps
    - run: npm run dr:backup-restore > production-backup-restore.txt
    - run: npm run ops:incident-drill -- --dry-run > production-incident-drill.json
  env:
    PROD_MONITOR_ACCESS_TOKEN: secret
`;

const passingMonitoringRunbookSource = 'Rotate monitor token with monitor:create-service-account.';
const passingPilotChecklistSource = 'Platform owner creates school.';
const passingImplementation7Source = 'Live SMS provider smoke. Live object storage smoke. Real pilot school workflow checklist.';

test('generateProductionScorecard produces an audit-safe scorecard with implementation10 categories', () => {
  const scorecard = generateProductionScorecard({
    generatedAt: '2026-05-16T00:00:00.000Z',
    moduleReadinessSource: passingModuleReadinessSource,
    packageJsonSource: passingPackageJsonSource,
    incidentRunbookSource: passingIncidentRunbookSource,
    disasterRecoveryRunbookSource: passingDisasterRecoveryRunbookSource,
    providerCredentialSmokeTestSource: passingProviderSmokeSource,
    productionOperabilityWorkflowSource: passingProductionWorkflowSource,
    productionMonitoringRunbookSource: passingMonitoringRunbookSource,
    pilotWorkflowChecklistSource: passingPilotChecklistSource,
    implementation7LiveValidationSource: passingImplementation7Source,
  });

  assert.equal(scorecard.generated_at, '2026-05-16T00:00:00.000Z');
  assert.equal(scorecard.categories.some((category) => category.id === 'provider-integrations'), true);
  assert.equal(scorecard.categories.some((category) => category.id === 'visual-brand-trust'), true);
  assert.equal(scorecard.overall_score >= 90, true);
  assert.equal(JSON.stringify(scorecard).includes('live-api-key-secret'), false);
  assert.equal(JSON.stringify(scorecard).includes('re_secret'), false);
});

test('renderProductionScorecardMarkdown renders category evidence for CI artifacts', () => {
  const scorecard = generateProductionScorecard({
    generatedAt: '2026-05-16T00:00:00.000Z',
    moduleReadinessSource: passingModuleReadinessSource,
    packageJsonSource: passingPackageJsonSource,
    incidentRunbookSource: passingIncidentRunbookSource,
    disasterRecoveryRunbookSource: passingDisasterRecoveryRunbookSource,
    providerCredentialSmokeTestSource: passingProviderSmokeSource,
    productionOperabilityWorkflowSource: passingProductionWorkflowSource,
    productionMonitoringRunbookSource: passingMonitoringRunbookSource,
    pilotWorkflowChecklistSource: passingPilotChecklistSource,
    implementation7LiveValidationSource: passingImplementation7Source,
  });

  const markdown = renderProductionScorecardMarkdown(scorecard);

  assert.match(markdown, /Production Readiness Scorecard/);
  assert.match(markdown, /Support and operations/);
  assert.match(markdown, /Visual design and brand trust/);
  assert.equal(markdown.includes('| Area | Score | Target | Status | Evidence | Remediation |'), true);
});
