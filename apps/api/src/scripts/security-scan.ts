import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  renderTenantIsolationAuditMarkdown,
  runTenantIsolationAudit,
  type TenantIsolationAuditResult,
} from './tenant-isolation-audit';

export interface SecurityScanResult {
  generated_at: string;
  ok: boolean;
  tenant_isolation: TenantIsolationAuditResult;
  checks: Array<{
    id: string;
    label: string;
    status: 'pass' | 'fail';
  }>;
}

export interface SecurityScanOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  sourceOverrides?: Record<string, string>;
}

const SCAN_PATTERNS = [
  {
    id: 'no-visible-demo-credentials',
    label: 'Auth UI does not expose demo credentials',
    files: [
      'apps/web/src/components/auth/superadmin-login-view.tsx',
      'apps/web/src/components/auth/school-login-view.tsx',
      'apps/web/src/components/auth/portal-login-view.tsx',
      'apps/web/src/components/auth/public-school-login-view.tsx',
    ],
    forbidden: /demo credentials|test account|\bpassword\s*=|seeded password/i,
  },
  {
    id: 'support-internal-notes-private',
    label: 'Support internal notes are separated from school messages',
    files: ['apps/api/src/modules/support/support.service.ts'],
    required: /listInternalNotes|supportOperator/,
  },
  {
    id: 'counselling-confidentiality',
    label: 'Counselling workflow has role and confidentiality controls',
    files: ['apps/api/src/modules/discipline/counselling.service.ts'],
    required: /confidential|visibility|counsellor|role/i,
  },
  {
    id: 'password-reset-token-hash',
    label: 'Password reset flow stores token hashes',
    files: [
      'apps/api/src/auth/auth-recovery.service.ts',
      'apps/api/src/auth/auth-schema.service.ts',
    ],
    required: /hashToken\(token\)|input_token_hash|tokenHash/,
    forbidden: /reset_url\s*:|reset_url/,
  },
  {
    id: 'invitation-token-hash',
    label: 'Invitation flow stores token hashes',
    files: ['apps/api/src/auth/repositories/invitations.repository.ts'],
    required: /token_hash/,
  },
];

export function runSecurityScan(options: SecurityScanOptions = {}): SecurityScanResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const tenantIsolation = runTenantIsolationAudit({
    workspaceRoot,
    generatedAt: options.generatedAt,
    sourceOverrides: options.sourceOverrides,
  });
  const checks = SCAN_PATTERNS.map((pattern) => {
    const joinedSource = pattern.files
      .map((file) => readSource(workspaceRoot, file, options.sourceOverrides))
      .join('\n');
    const requiredPassed = pattern.required ? pattern.required.test(joinedSource) : true;
    const forbiddenPassed = pattern.forbidden ? !pattern.forbidden.test(joinedSource) : true;

    return {
      id: pattern.id,
      label: pattern.label,
      status: requiredPassed && forbiddenPassed ? 'pass' as const : 'fail' as const,
    };
  });

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    ok: tenantIsolation.ok && checks.every((item) => item.status === 'pass'),
    tenant_isolation: tenantIsolation,
    checks,
  };
}

export function renderSecurityScanMarkdown(result: SecurityScanResult): string {
  const lines = [
    '# Implementation 10 Security Scan',
    '',
    `Generated at: ${result.generated_at}`,
    '',
    `Status: ${result.ok ? 'pass' : 'fail'}`,
    '',
    '## Application Security Checks',
    '',
    '| Check | Status |',
    '| --- | --- |',
  ];

  for (const check of result.checks) {
    lines.push(`| ${escapeTable(check.label)} | ${check.status} |`);
  }

  lines.push('', '## Tenant Isolation', '', renderTenantIsolationAuditMarkdown(result.tenant_isolation));

  return `${lines.join('\n')}\n`;
}

export function writeSecurityScanArtifact(result: SecurityScanResult, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderSecurityScanMarkdown(result), 'utf8');
}

function readSource(
  workspaceRoot: string,
  relativePath: string,
  sourceOverrides?: Record<string, string>,
): string {
  if (sourceOverrides?.[relativePath] !== undefined) {
    return sourceOverrides[relativePath];
  }

  const filePath = join(workspaceRoot, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

if (require.main === module) {
  const workspaceRoot = process.cwd();
  const result = runSecurityScan({ workspaceRoot });
  const outputPath = join(workspaceRoot, 'docs', 'security', 'implementation10-security-scan.md');
  writeSecurityScanArtifact(result, outputPath);

  console.log(`Security scan artifact written to ${outputPath}`);
  console.log(`Security scan status: ${result.ok ? 'pass' : 'fail'}`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}
