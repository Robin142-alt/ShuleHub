import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type MaintainabilityCheckStatus = 'pass' | 'fail';

export interface MaintainabilityCheck {
  id: string;
  label: string;
  status: MaintainabilityCheckStatus;
  details: string[];
}

export interface MaintainabilityScanResult {
  generated_at: string;
  ok: boolean;
  checks: MaintainabilityCheck[];
}

export interface MaintainabilityScanOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  sourceOverrides?: Record<string, string>;
}

const HUMAN_IDENTIFIER_WORKFLOW_FILES = [
  'apps/web/src/components/school/school-pages.tsx',
  'apps/web/src/components/discipline/discipline-workspace.tsx',
  'apps/web/src/components/library/library-workspace.tsx',
] as const;

const INTERNAL_ID_COPY =
  /Student UUID|Invoice UUID|Student record ID|Class record ID|Academic term ID|Academic year ID|Scan student ID|Student ID or admission barcode/i;

export function runMaintainabilityScan(
  options: MaintainabilityScanOptions = {},
): MaintainabilityScanResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const checks = [
    checkNoInternalIdCopy(workspaceRoot, options.sourceOverrides),
    checkPublicStatusTruth(workspaceRoot, options.sourceOverrides),
    checkGeneratedArtifactHygiene(workspaceRoot, options.sourceOverrides),
  ];

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    ok: checks.every((check) => check.status === 'pass'),
    checks,
  };
}

export function renderMaintainabilityScanMarkdown(result: MaintainabilityScanResult): string {
  const lines = [
    '# Implementation 11 Maintainability Scan',
    '',
    `Generated at: ${result.generated_at}`,
    '',
    `Status: ${result.ok ? 'pass' : 'fail'}`,
    '',
    '| Check | Status | Details |',
    '| --- | --- | --- |',
  ];

  for (const check of result.checks) {
    lines.push(`| ${check.label} | ${check.status} | ${check.details.join('; ') || 'clear'} |`);
  }

  return `${lines.join('\n')}\n`;
}

export function writeMaintainabilityScanArtifact(
  result: MaintainabilityScanResult,
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderMaintainabilityScanMarkdown(result), 'utf8');
}

function checkNoInternalIdCopy(
  workspaceRoot: string,
  sourceOverrides?: Record<string, string>,
): MaintainabilityCheck {
  const details = HUMAN_IDENTIFIER_WORKFLOW_FILES.flatMap((relativePath) => {
    const source = readSource(workspaceRoot, relativePath, sourceOverrides);
    return INTERNAL_ID_COPY.test(source)
      ? [`${relativePath} exposes internal record IDs instead of name/admission-number lookup.`]
      : [];
  });

  return buildCheck('no-internal-id-copy', 'Production forms avoid internal UUID copy.', details);
}

function checkPublicStatusTruth(
  workspaceRoot: string,
  sourceOverrides?: Record<string, string>,
): MaintainabilityCheck {
  const relativePath = 'apps/web/src/app/support/status/page.tsx';
  const source = readSource(workspaceRoot, relativePath, sourceOverrides);
  const details = /uptime:\s*["']N\/A["']|latency:\s*["']N\/A["']/.test(source)
    ? [`${relativePath} uses N/A telemetry in the public status fallback.`]
    : [];

  return buildCheck('public-status-truth', 'Public status fallback is explicit and diagnostic.', details);
}

function checkGeneratedArtifactHygiene(
  workspaceRoot: string,
  sourceOverrides?: Record<string, string>,
): MaintainabilityCheck {
  const source = readSource(workspaceRoot, '.gitignore', sourceOverrides);
  const details = source.includes('apps/web/test-results/')
    ? []
    : ['.gitignore must ignore apps/web/test-results/ generated browser artifacts.'];

  return buildCheck('generated-artifact-hygiene', 'Generated browser artifacts are ignored.', details);
}

function buildCheck(id: string, label: string, details: string[]): MaintainabilityCheck {
  return {
    id,
    label,
    status: details.length === 0 ? 'pass' : 'fail',
    details,
  };
}

function readSource(
  workspaceRoot: string,
  relativePath: string,
  sourceOverrides?: Record<string, string>,
): string {
  if (sourceOverrides?.[relativePath] !== undefined) {
    return sourceOverrides[relativePath];
  }

  const absolutePath = join(workspaceRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

function main(): void {
  const result = runMaintainabilityScan();
  const outputPath = join(process.cwd(), 'docs', 'validation', 'implementation11-maintainability-scan.md');

  writeMaintainabilityScanArtifact(result, outputPath);
  process.stdout.write(`Maintainability scan artifact written to ${outputPath}\n`);
  process.stdout.write(`Maintainability scan status: ${result.ok ? 'pass' : 'fail'}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
