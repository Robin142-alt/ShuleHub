import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface IncidentDrillCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  evidence: string;
}

export interface IncidentDrillResult {
  ok: boolean;
  dry_run: boolean;
  generated_at: string;
  checks: IncidentDrillCheck[];
}

export interface IncidentDrillOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  dryRun?: boolean;
  sourceOverrides?: Record<string, string>;
}

const requiredProviderPlaybooks = [
  'email',
  'SMS provider',
  'Daraja',
  'Redis',
  'Postgres',
  'object storage',
  'malware scanner',
];

export function runIncidentDrill(options: IncidentDrillOptions = {}): IncidentDrillResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const incidentRunbook = readRequiredSource(
    workspaceRoot,
    'docs/runbooks/incident-response.md',
    options.sourceOverrides,
  );
  const monitoringRunbook = readRequiredSource(
    workspaceRoot,
    'docs/runbooks/production-monitoring.md',
    options.sourceOverrides,
  );
  const backupRunbook = readRequiredSource(
    workspaceRoot,
    'docs/runbooks/backup-restore.md',
    options.sourceOverrides,
  );
  const workflow = readRequiredSource(
    workspaceRoot,
    '.github/workflows/production-operability.yml',
    options.sourceOverrides,
  );

  const checks: IncidentDrillCheck[] = [
    createCheck({
      id: 'backup-restore-scheduled',
      label: 'Backup restore verification is scheduled',
      passed: /backup-restore/i.test(workflow) && /dr:backup-restore/i.test(workflow),
      evidence: 'production-operability workflow includes a backup-restore check running npm run dr:backup-restore',
    }),
    createCheck({
      id: 'backup-artifact-recorded',
      label: 'Latest restore artifact is recorded',
      passed: /production-backup-restore\.txt/i.test(workflow)
        && /production-backup-restore\.txt/i.test(backupRunbook),
      evidence: 'backup restore output is written to production-backup-restore.txt and uploaded as an artifact',
    }),
    createCheck({
      id: 'incident-checklist',
      label: 'Incident drill checklist exists',
      passed: allMatch(incidentRunbook, [
        /incident drill checklist/i,
        /incident commander/i,
        /severity/i,
        /rollback decision/i,
        /communications checkpoint/i,
        /evidence/i,
        /closeout/i,
      ]),
      evidence: 'incident response runbook includes owner, severity, rollback, communications, evidence, and closeout checklist items',
    }),
    createCheck({
      id: 'provider-playbooks',
      label: 'Provider outage playbooks cover operational dependencies',
      passed: requiredProviderPlaybooks.every((provider) =>
        new RegExp(`${escapeRegExp(provider)} outage`, 'i').test(incidentRunbook),
      ),
      evidence: `required provider playbooks: ${requiredProviderPlaybooks.join(', ')}`,
    }),
    createCheck({
      id: 'dependency-ownership',
      label: 'Operational dependencies have owners and escalation paths',
      passed: /dependency ownership matrix/i.test(incidentRunbook)
        && requiredProviderPlaybooks.every((provider) =>
          new RegExp(`${escapeRegExp(provider)}[\\s\\S]{0,160}(owner|platform owner|support lead|engineering)`, 'i')
            .test(incidentRunbook),
        ),
      evidence: 'incident runbook maps each dependency to a primary owner and escalation path',
    }),
    createCheck({
      id: 'alert-routing',
      label: 'Alert routing is verified',
      passed: allMatch(monitoringRunbook, [
        /alert routing/i,
        /primary owner/i,
        /fallback owner/i,
        /acknowledgement SLA/i,
        /manual verification/i,
      ]),
      evidence: 'production monitoring runbook defines owner, fallback, acknowledgement SLA, and manual verification',
    }),
  ];

  return {
    ok: checks.every((check) => check.status === 'pass'),
    dry_run: options.dryRun ?? process.argv.includes('--dry-run'),
    generated_at: options.generatedAt ?? new Date().toISOString(),
    checks,
  };
}

function createCheck(input: {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
}): IncidentDrillCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.passed ? 'pass' : 'fail',
    evidence: input.evidence,
  };
}

function allMatch(source: string, patterns: RegExp[]) {
  return patterns.every((pattern) => pattern.test(source));
}

function readRequiredSource(
  workspaceRoot: string,
  relativePath: string,
  overrides: Record<string, string> | undefined,
) {
  if (overrides && relativePath in overrides) {
    return overrides[relativePath] ?? '';
  }

  const absolutePath = join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    return '';
  }

  return readFileSync(absolutePath, 'utf8');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (require.main === module) {
  const result = runIncidentDrill();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}
