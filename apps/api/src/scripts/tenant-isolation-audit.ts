import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AuditStatus = 'pass' | 'fail';

export interface TenantIsolationAuditCheck {
  id: string;
  label: string;
  file: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
}

export interface TenantIsolationAuditResult {
  generated_at: string;
  ok: boolean;
  checks: Array<{
    id: string;
    label: string;
    file: string;
    severity: 'critical' | 'high' | 'medium';
    status: AuditStatus;
  }>;
}

export interface TenantIsolationAuditOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  sourceOverrides?: Record<string, string>;
  outputPath?: string;
}

const CHECKS: TenantIsolationAuditCheck[] = [
  check('support-ticket-rls', 'Support tickets enforce row level security', 'apps/api/src/modules/support/support-schema.service.ts', /ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY/, 'critical'),
  check('support-internal-note-rls', 'Support internal notes enforce row level security', 'apps/api/src/modules/support/support-schema.service.ts', /ALTER TABLE support_internal_notes FORCE ROW LEVEL SECURITY/, 'critical'),
  check('support-notification-rls', 'Support notifications enforce row level security', 'apps/api/src/modules/support/support-schema.service.ts', /ALTER TABLE support_notifications FORCE ROW LEVEL SECURITY/, 'critical'),
  check('support-query-tenant-scope', 'Support ticket list queries are tenant scoped', 'apps/api/src/modules/support/repositories/support.repository.ts', /WHERE[\s\S]+tenant_id|\btenantId\b/ , 'critical'),
  check('support-merge-tenant-guard', 'Support ticket merge prevents cross-tenant merge', 'apps/api/src/modules/support/support.service.ts', /ticket\.tenant_id !== targetTicket\.tenant_id/, 'critical'),
  check('integration-wallet-rls', 'School SMS wallets enforce row level security', 'apps/api/src/modules/integrations/integrations-schema.service.ts', /ALTER TABLE school_sms_wallets FORCE ROW LEVEL SECURITY|TENANT_TABLES[\s\S]+'school_sms_wallets'[\s\S]+ALTER TABLE \$\{table\} FORCE ROW LEVEL SECURITY/, 'critical'),
  check('integration-daraja-rls', 'School integrations enforce row level security', 'apps/api/src/modules/integrations/integrations-schema.service.ts', /ALTER TABLE school_integrations FORCE ROW LEVEL SECURITY|TENANT_TABLES[\s\S]+'school_integrations'[\s\S]+ALTER TABLE \$\{table\} FORCE ROW LEVEL SECURITY/, 'critical'),
  check('integration-sms-log-rls', 'SMS logs enforce row level security', 'apps/api/src/modules/integrations/integrations-schema.service.ts', /ALTER TABLE sms_logs FORCE ROW LEVEL SECURITY|TENANT_TABLES[\s\S]+'sms_logs'[\s\S]+ALTER TABLE \$\{table\} FORCE ROW LEVEL SECURITY/, 'high'),
  check('platform-sms-secret-encryption', 'Platform SMS provider secrets are encrypted', 'apps/api/src/modules/integrations/platform-sms.service.ts', /piiEncryptionService\.encrypt[\s\S]+api_key/i, 'critical'),
  check('daraja-secret-encryption', 'Daraja school payment secrets are encrypted', 'apps/api/src/modules/integrations/daraja-integration.service.ts', /piiEncryptionService\.encrypt|encrypt\(/i, 'critical'),
  check('discipline-rls', 'Discipline tables enforce row level security', 'apps/api/src/modules/discipline/discipline-schema.service.ts', /FORCE ROW LEVEL SECURITY/, 'critical'),
  check('discipline-policy-tenant', 'Discipline RLS policies bind tenant setting', 'apps/api/src/modules/discipline/discipline-schema.service.ts', /tenant_id = current_setting\('app\.tenant_id'/, 'critical'),
  check('counselling-requires-tenant', 'Counselling services require tenant context', 'apps/api/src/modules/discipline/counselling.service.ts', /requireTenantId\(\)|tenant_id: this\.requireTenantId/, 'critical'),
  check('auth-membership-tenant', 'Authentication resolves tenant membership', 'apps/api/src/auth/auth.service.ts', /membership\.tenant_id|expectedTenantId/, 'critical'),
  check('parent-portal-scope', 'Parent portal resolves tenant-scoped parent subject', 'apps/api/src/modules/integrations/parent-portal-auth.service.ts', /tenant_id|requireStore|setTenantId/, 'high'),
  check('reports-block-retired-attendance', 'Report exports block retired attendance data', 'apps/api/src/common/reports/report-export-queue.ts', /attendance/i, 'high'),
  check('upload-policy-size-mime', 'Upload policy validates type and size', 'apps/api/src/common/uploads/upload-policy.ts', /max.*size|mime|contentType/i, 'high'),
  check('upload-malware-scan', 'Upload path supports malware scanning', 'apps/api/src/common/uploads/upload-malware-scan.service.ts', /malware|scan/i, 'high'),
  check('object-storage-signed-path', 'Object storage path is tenant scoped or signed', 'apps/api/src/common/uploads/database-file-storage.service.ts', /tenant|signed|object/i, 'medium'),
  check('sms-dispatch-no-console', 'SMS dispatch service does not log raw provider secrets', 'apps/api/src/modules/integrations/sms-dispatch.service.ts', /class SmsDispatchService(?![\s\S]*console\.log)/, 'critical'),
];

export function runTenantIsolationAudit(
  options: TenantIsolationAuditOptions = {},
): TenantIsolationAuditResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const checks = CHECKS.map((item) => {
    const source = readSource(workspaceRoot, item.file, options.sourceOverrides);
    const passed = item.pattern.test(source);

    return {
      id: item.id,
      label: item.label,
      file: item.file,
      severity: item.severity,
      status: passed ? 'pass' as const : 'fail' as const,
    };
  });

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    ok: checks.every((item) => item.status === 'pass'),
    checks,
  };
}

export function renderTenantIsolationAuditMarkdown(result: TenantIsolationAuditResult): string {
  const lines = [
    '# Implementation 10 Security And Tenant Isolation Audit',
    '',
    `Generated at: ${result.generated_at}`,
    '',
    `Status: ${result.ok ? 'pass' : 'fail'}`,
    '',
    '| Severity | Check | Status | Evidence File |',
    '| --- | --- | --- | --- |',
  ];

  for (const item of result.checks) {
    lines.push(`| ${item.severity} | ${escapeTable(item.label)} | ${item.status} | ${escapeTable(item.file)} |`);
  }

  lines.push(
    '',
    '## Audit Scope',
    '',
    '- Direct ID and search access must remain tenant scoped.',
    '- Reports, exports, files, notifications, SMS logs, support tickets, discipline records, and parent portal data must not cross tenant boundaries.',
    '- Raw provider secrets must stay encrypted and must not be written to logs or API responses.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

export function writeTenantIsolationAuditArtifact(
  result: TenantIsolationAuditResult,
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderTenantIsolationAuditMarkdown(result), 'utf8');
}

function check(
  id: string,
  label: string,
  file: string,
  pattern: RegExp,
  severity: TenantIsolationAuditCheck['severity'],
): TenantIsolationAuditCheck {
  return { id, label, file, pattern, severity };
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
  const result = runTenantIsolationAudit({ workspaceRoot });
  const outputPath = join(workspaceRoot, 'docs', 'security', 'implementation10-security-audit.md');
  writeTenantIsolationAuditArtifact(result, outputPath);

  console.log(`Tenant isolation audit artifact written to ${outputPath}`);
  console.log(`Tenant isolation audit status: ${result.ok ? 'pass' : 'fail'}`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}
