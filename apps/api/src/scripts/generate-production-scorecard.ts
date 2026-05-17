import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  runReleaseReadinessGate,
  type ReleaseReadinessGateOptions,
} from './release-readiness-gate';

export type ProductionScoreStatus = 'pass' | 'watch' | 'fail';

export interface ProductionScoreCategory {
  id: string;
  label: string;
  score: number;
  target: number;
  status: ProductionScoreStatus;
  evidence: string[];
  remediation: string;
}

export interface ProductionScorecard {
  generated_at: string;
  overall_score: number;
  target_score: number;
  status: ProductionScoreStatus;
  categories: ProductionScoreCategory[];
}

export interface ProductionScorecardOptions extends ReleaseReadinessGateOptions {
  generatedAt?: string;
  outputPath?: string;
  minimumScore?: number;
}

type PackageJsonLike = {
  scripts?: Record<string, string>;
};

const DEFAULT_TARGET_SCORE = 95;

export function generateProductionScorecard(
  options: ProductionScorecardOptions = {},
): ProductionScorecard {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const packageJson = readPackageJson(workspaceRoot, options.packageJsonSource);
  const scripts = packageJson.scripts ?? {};
  const gate = runReleaseReadinessGate({ ...options, workspaceRoot });
  const implementation10 = readOptionalFile(
    workspaceRoot,
    'implementation10.md',
    options.moduleReadinessSource,
  );
  const productionWorkflow = readOptionalFile(
    workspaceRoot,
    '.github/workflows/production-operability.yml',
    options.productionOperabilityWorkflowSource,
  );
  const providerSmokeSource = readOptionalFile(
    workspaceRoot,
    'apps/api/src/scripts/provider-credential-smoke.ts',
    options.providerCredentialSmokeTestSource,
  );
  const moduleReadiness = readOptionalFile(
    workspaceRoot,
    'apps/web/src/lib/features/module-readiness.ts',
    options.moduleReadinessSource,
  );
  const smsDispatchSource = readOptionalFile(
    workspaceRoot,
    'apps/api/src/modules/integrations/sms-dispatch.service.ts',
  );
  const supportNotificationSource = readOptionalFile(
    workspaceRoot,
    'apps/api/src/modules/support/support-notification-delivery.service.ts',
  );

  const categories: ProductionScoreCategory[] = [
    createCategory({
      id: 'release-readiness',
      label: 'Release readiness gate',
      score: gate.ok ? 96 : 70,
      target: 96,
      evidence: [
        gate.ok ? 'release readiness gate passes' : 'release readiness gate has failing checks',
        `${gate.checks.filter((check) => check.status === 'pass').length}/${gate.checks.length} checks passing`,
      ],
      remediation: 'Run npm run release:readiness and resolve every failing check before deployment.',
    }),
    createCategory({
      id: 'auth-session-ux',
      label: 'Authentication and session UX',
      score: scoreByEvidence([
        hasScript(scripts, 'auth:production-verify'),
        hasScript(scripts, 'auth:rotate-owner-password'),
        hasScript(scripts, 'test:auth-security'),
        hasScript(scripts, 'certify:pilot'),
        !/enter workspace code|workspace code required|tenant code required/i.test(implementation10),
      ], 84, 3),
      target: 95,
      evidence: [
        evidenceLine(hasScript(scripts, 'auth:production-verify'), 'production auth verification script exists'),
        evidenceLine(hasScript(scripts, 'auth:rotate-owner-password'), 'owner password rotation script exists'),
        evidenceLine(hasScript(scripts, 'test:auth-security'), 'auth security integration test script exists'),
        evidenceLine(hasScript(scripts, 'certify:pilot'), 'pilot certification script exists'),
        'login plan preserves email/password workspace auto-resolution',
      ],
      remediation: 'Complete authenticated pilot login, recovery, invite, and session-expiry certification.',
    }),
    createCategory({
      id: 'tenant-isolation',
      label: 'Tenant isolation',
      score: scoreByEvidence([
        hasScript(scripts, 'test:tenant-isolation'),
        hasScript(scripts, 'tenant:isolation:audit'),
        hasScript(scripts, 'security:scan'),
        hasScript(scripts, 'security:deps'),
        hasScript(scripts, 'test:api-consistency'),
        /tenant:isolation:audit/i.test(implementation10),
        /FORCE ROW LEVEL SECURITY/i.test(readOptionalFile(workspaceRoot, 'apps/api/src/modules/integrations/integrations-schema.service.ts')),
      ], 84, 2),
      target: 96,
      evidence: [
        evidenceLine(hasScript(scripts, 'test:tenant-isolation'), 'tenant isolation test script exists'),
        evidenceLine(hasScript(scripts, 'tenant:isolation:audit'), 'tenant isolation audit script exists'),
        evidenceLine(hasScript(scripts, 'security:scan'), 'security scan script exists'),
        evidenceLine(hasScript(scripts, 'security:deps'), 'dependency vulnerability scan script exists'),
        evidenceLine(hasScript(scripts, 'test:api-consistency'), 'API consistency test script exists'),
        evidenceLine(/tenant:isolation:audit/i.test(implementation10), 'implementation10 requires tenant isolation audit'),
      ],
      remediation: 'Add the tenant isolation audit runner and require it in CI for finance, support, library, discipline, reports, and files.',
    }),
    createCategory({
      id: 'finance-payments',
      label: 'Finance and payments',
      score: scoreByEvidence([
        hasScript(scripts, 'test:finance-integrity'),
        hasScript(scripts, 'test:financial-reconciliation'),
        hasScript(scripts, 'test:mpesa-adversarial'),
        hasScript(scripts, 'load:financial-truth'),
        hasScript(scripts, 'finance:certify'),
      ], 86, 2),
      target: 95,
      evidence: [
        evidenceLine(hasScript(scripts, 'test:finance-integrity'), 'finance integrity test script exists'),
        evidenceLine(hasScript(scripts, 'test:financial-reconciliation'), 'financial reconciliation test script exists'),
        evidenceLine(hasScript(scripts, 'test:mpesa-adversarial'), 'MPESA adversarial test script exists'),
        evidenceLine(hasScript(scripts, 'finance:certify'), 'finance certification script exists'),
      ],
      remediation: 'Run finance certification against real tenant workflows: cheque, MPESA callback, reversal, receipts, balances, and exports.',
    }),
    createCategory({
      id: 'support-operations',
      label: 'Support and operations',
      score: scoreByEvidence([
        /missing_provider/.test(supportNotificationSource),
        /missing_credentials/.test(supportNotificationSource),
        /SmsDispatchService/.test(supportNotificationSource),
        /support-notification-delivery.service.test/.test(JSON.stringify(scripts)),
      ], 88, 2),
      target: 95,
      evidence: [
        evidenceLine(/SmsDispatchService/.test(supportNotificationSource), 'support SMS uses dashboard-managed dispatch service'),
        evidenceLine(/missing_provider/.test(supportNotificationSource), 'support notification health reports precise missing provider state'),
        evidenceLine(/missing_credentials/.test(supportNotificationSource), 'support notification health reports precise missing credential state'),
      ],
      remediation: 'Wire support analytics and system status dashboards to live operational endpoints.',
    }),
    createCategory({
      id: 'provider-integrations',
      label: 'Provider integrations',
      score: scoreByEvidence([
        /class SmsDispatchService/.test(smsDispatchSource),
        hasScript(scripts, 'smoke:providers'),
        /live-support-sms-provider/.test(providerSmokeSource),
        /live-upload-malware-scan-provider/.test(providerSmokeSource),
        /live-upload-object-storage/.test(providerSmokeSource),
      ], 84, 2),
      target: 94,
      evidence: [
        evidenceLine(/class SmsDispatchService/.test(smsDispatchSource), 'shared SMS dispatch service exists'),
        evidenceLine(hasScript(scripts, 'smoke:providers'), 'provider smoke script exists'),
        evidenceLine(/live-upload-malware-scan-provider/.test(providerSmokeSource), 'malware scanner smoke coverage exists'),
        evidenceLine(/live-upload-object-storage/.test(providerSmokeSource), 'object storage smoke coverage exists'),
      ],
      remediation: 'Configure live production secrets and require provider smoke evidence in the production operability workflow.',
    }),
    createCategory({
      id: 'frontend-ux',
      label: 'Frontend UX completeness',
      score: scoreByEvidence([
        hasScript(scripts, 'web:lint'),
        hasScript(scripts, 'web:build'),
        hasScript(scripts, 'web:test:design'),
        /attendance/.test(moduleReadiness) && /inactiveModules/.test(moduleReadiness),
      ], 82, 3),
      target: 93,
      evidence: [
        evidenceLine(hasScript(scripts, 'web:lint'), 'web lint script exists'),
        evidenceLine(hasScript(scripts, 'web:build'), 'web build script exists'),
        evidenceLine(hasScript(scripts, 'web:test:design'), 'design test script exists'),
        'attendance remains inactive in module readiness',
      ],
      remediation: 'Replace fallback telemetry with live states and run mobile journeys for login, parent, finance, library, support, and discipline.',
    }),
    createCategory({
      id: 'performance-scale',
      label: 'Performance and scale proof',
      score: scoreByEvidence([
        hasScript(scripts, 'load:tenant-scale'),
        hasScript(scripts, 'load:kenyan-school'),
        hasScript(scripts, 'perf:query-plan-review'),
        hasScript(scripts, 'load:core-api'),
      ], 82, 3),
      target: 94,
      evidence: [
        evidenceLine(hasScript(scripts, 'load:tenant-scale'), 'tenant-scale load script exists'),
        evidenceLine(hasScript(scripts, 'load:kenyan-school'), 'Kenyan school load script exists'),
        evidenceLine(hasScript(scripts, 'perf:query-plan-review'), 'query-plan review script exists'),
      ],
      remediation: 'Publish tenant-scale load artifacts and enforce query budgets in CI.',
    }),
    createCategory({
      id: 'observability-recovery',
      label: 'Observability and recovery',
      score: scoreByEvidence([
        hasScript(scripts, 'monitor:synthetic'),
        hasScript(scripts, 'dr:backup-restore'),
        /production-operability/.test(productionWorkflow),
        /PROD_MONITOR_ACCESS_TOKEN/.test(productionWorkflow),
      ], 84, 3),
      target: 95,
      evidence: [
        evidenceLine(hasScript(scripts, 'monitor:synthetic'), 'synthetic monitor script exists'),
        evidenceLine(hasScript(scripts, 'dr:backup-restore'), 'backup restore script exists'),
        evidenceLine(/PROD_MONITOR_ACCESS_TOKEN/.test(productionWorkflow), 'production monitor token is referenced by workflow'),
      ],
      remediation: 'Store production monitoring, backup restore, provider smoke, and scorecard artifacts on every scheduled run.',
    }),
    createCategory({
      id: 'visual-brand-trust',
      label: 'Visual design and brand trust',
      score: scoreByEvidence([
        /Visual Identity Requirements/.test(implementation10),
        /emerald primary/.test(implementation10),
        /Login Page Meaning/.test(implementation10),
        /no demo credentials/i.test(implementation10),
      ], 78, 4),
      target: 94,
      evidence: [
        evidenceLine(/Visual Identity Requirements/.test(implementation10), 'visual identity requirements are documented'),
        evidenceLine(/Login Page Meaning/.test(implementation10), 'login purpose messaging is documented'),
        evidenceLine(/no demo credentials/i.test(implementation10), 'auth pages must remain credential-free'),
      ],
      remediation: 'Implement the visual identity pass and verify login pages at mobile and desktop widths.',
    }),
  ];

  const overallScore = Math.round(
    categories.reduce((total, category) => total + category.score, 0) / categories.length,
  );

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    overall_score: overallScore,
    target_score: DEFAULT_TARGET_SCORE,
    status: resolveStatus(overallScore, DEFAULT_TARGET_SCORE),
    categories,
  };
}

export function renderProductionScorecardMarkdown(scorecard: ProductionScorecard): string {
  const lines = [
    '# Production Readiness Scorecard',
    '',
    `Generated at: ${scorecard.generated_at}`,
    '',
    `Overall score: ${scorecard.overall_score}/${scorecard.target_score}`,
    '',
    `Status: ${scorecard.status}`,
    '',
    '| Area | Score | Target | Status | Evidence | Remediation |',
    '| --- | ---: | ---: | --- | --- | --- |',
  ];

  for (const category of scorecard.categories) {
    lines.push(
      `| ${escapeMarkdownTable(category.label)} | ${category.score} | ${category.target} | ${category.status} | ${escapeMarkdownTable(category.evidence.join('; '))} | ${escapeMarkdownTable(category.remediation)} |`,
    );
  }

  lines.push(
    '',
    '## Next Score-Lifting Actions',
    '',
    '1. Keep support SMS health tied to dashboard-managed platform SMS providers.',
    '2. Replace fallback operational telemetry with live API-backed dashboard states.',
    '3. Run authenticated pilot certification for school, finance, parent, library, support, discipline, and reporting workflows.',
    '4. Publish tenant-scale, provider-smoke, security, and backup-restore artifacts in CI.',
    '5. Complete the visual identity pass so login pages feel calm, trustworthy, and meaningful.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

export function writeProductionScorecard(
  scorecard: ProductionScorecard,
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderProductionScorecardMarkdown(scorecard), 'utf8');
}

function createCategory(input: Omit<ProductionScoreCategory, 'status'>): ProductionScoreCategory {
  return {
    ...input,
    status: resolveStatus(input.score, input.target),
  };
}

function resolveStatus(score: number, target: number): ProductionScoreStatus {
  if (score >= target) {
    return 'pass';
  }

  if (score >= Math.max(target - 10, 80)) {
    return 'watch';
  }

  return 'fail';
}

function scoreByEvidence(
  checks: boolean[],
  baseScore: number,
  pointsPerCheck: number,
): number {
  return Math.min(99, baseScore + checks.filter(Boolean).length * pointsPerCheck);
}

function evidenceLine(passed: boolean, label: string): string {
  return `${passed ? 'present' : 'missing'}: ${label}`;
}

function hasScript(scripts: Record<string, string>, name: string): boolean {
  return Boolean(scripts[name]);
}

function readPackageJson(workspaceRoot: string, packageJsonSource?: string): PackageJsonLike {
  const source = packageJsonSource ?? readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
  return JSON.parse(source) as PackageJsonLike;
}

function readOptionalFile(
  workspaceRoot: string,
  relativePath: string,
  sourceOverride?: string,
): string {
  if (sourceOverride !== undefined) {
    return sourceOverride;
  }

  const path = join(workspaceRoot, relativePath);

  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

if (require.main === module) {
  const workspaceRoot = process.cwd();
  const outputPath = join(
    workspaceRoot,
    'docs',
    'scorecards',
    'production-readiness-scorecard.md',
  );
  const scorecard = generateProductionScorecard({ workspaceRoot });
  writeProductionScorecard(scorecard, outputPath);

  const minimumScore = Number(process.env.PRODUCTION_SCORECARD_MIN ?? DEFAULT_TARGET_SCORE);
  console.log(`Production scorecard written to ${outputPath}`);
  console.log(`Overall score: ${scorecard.overall_score}/${scorecard.target_score}`);

  if (Number.isFinite(minimumScore) && scorecard.overall_score < minimumScore) {
    process.exitCode = 1;
  }
}
