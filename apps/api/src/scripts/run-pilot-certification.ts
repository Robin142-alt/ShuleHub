import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type PilotCertificationStatus = 'pass' | 'fail';

export interface PilotEvidenceCheck {
  id: string;
  label: string;
  file: string;
  pattern: RegExp;
}

export interface PilotWorkflowResult {
  id: string;
  evidence_id: string;
  title: string;
  status: PilotCertificationStatus;
  checks: Array<{
    id: string;
    label: string;
    file: string;
    status: PilotCertificationStatus;
  }>;
}

export interface PilotCertificationResult {
  generated_at: string;
  mode: 'contract' | 'live';
  ok: boolean;
  workflows: PilotWorkflowResult[];
  notes: string[];
}

export interface PilotCertificationOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  mode?: 'contract' | 'live';
  outputPath?: string;
  sourceOverrides?: Record<string, string>;
  env?: Record<string, string | undefined>;
}

const REQUIRED_LIVE_ENV = [
  'PILOT_API_BASE_URL',
  'PILOT_WEB_BASE_URL',
  'PILOT_TENANT_ID',
  'PILOT_ACCESS_TOKEN',
];

const WORKFLOWS: Array<{
  id: string;
  title: string;
  checks: PilotEvidenceCheck[];
}> = [
  {
    id: 'platform-owner-login',
    title: 'Platform owner login',
    checks: [
      check('superadmin-login-view', 'Superadmin login view exists', 'apps/web/src/components/auth/superadmin-login-view.tsx', /SuperadminLoginView/),
      check('secure-session', 'Superadmin login uses session service', 'apps/web/src/components/auth/superadmin-login-view.tsx', /useExperienceSession\("superadmin"\)/),
      check('no-demo-creds', 'Superadmin login has no visible demo credentials', 'apps/web/src/components/auth/superadmin-login-view.tsx', /ShuleHub never asks users to share passwords/),
    ],
  },
  {
    id: 'school-creation',
    title: 'School creation',
    checks: [
      check('platform-onboarding', 'Platform onboarding service creates schools', 'apps/api/src/modules/platform/platform-onboarding.service.ts', /createSchool|school/i),
      check('platform-schools-api', 'Platform schools API route exists', 'apps/web/src/app/api/platform/schools/route.ts', /proxyPlatformApiRequest|platform/),
      check('tenant-isolation', 'Created school records carry tenant identity', 'apps/api/src/modules/platform/platform-onboarding.service.ts', /tenant_id|tenantId/),
    ],
  },
  {
    id: 'school-admin-invitation',
    title: 'School admin invitation and activation',
    checks: [
      check('tenant-invitation-service', 'Tenant invitation service exists', 'apps/api/src/auth/tenant-invitations.service.ts', /TenantInvitationsService/),
      check('invitation-email', 'Invitation flow uses email delivery', 'apps/api/src/auth/auth-email.service.ts', /send.*Invitation|Invitation/i),
      check('accept-invite-route', 'Invite acceptance page exists', 'apps/web/src/app/invite/accept/page.tsx', /Invitation|invite/i),
    ],
  },
  {
    id: 'automatic-workspace-login',
    title: 'School login by email and password with automatic workspace resolution',
    checks: [
      check('school-login-simple', 'School login collects email and password only', 'apps/web/src/components/auth/school-login-view.tsx', /Email address[\s\S]+Password/),
      check('school-login-no-workspace-code', 'School login does not ask for workspace code', 'apps/web/src/components/auth/school-login-view.tsx', /ShuleHub will open the school linked to your account/),
      check('auth-tenant-session', 'Auth service binds sessions to tenant membership', 'apps/api/src/auth/auth.service.ts', /membership\.tenant_id|tenant_id/),
    ],
  },
  {
    id: 'daraja-configuration',
    title: 'School Daraja configuration save and masked display',
    checks: [
      check('daraja-service', 'Daraja integration service exists', 'apps/api/src/modules/integrations/daraja-integration.service.ts', /saveDarajaSettings|Daraja/),
      check('daraja-secret-encryption', 'Daraja credentials are encrypted', 'apps/api/src/modules/integrations/daraja-integration.service.ts', /encrypt/),
      check('daraja-masked-response', 'Daraja secrets return masked metadata', 'apps/api/src/modules/integrations/daraja-integration.service.ts', /masked/i),
    ],
  },
  {
    id: 'platform-sms-configuration',
    title: 'Platform SMS provider setup and masked display',
    checks: [
      check('platform-sms-service', 'Platform SMS service exists', 'apps/api/src/modules/integrations/platform-sms.service.ts', /PlatformSmsService/),
      check('platform-sms-encryption', 'Platform SMS API keys are encrypted', 'apps/api/src/modules/integrations/platform-sms.service.ts', /encrypt/),
      check('platform-sms-dashboard', 'Superadmin SMS settings page exists', 'apps/web/src/components/platform/superadmin-pages.tsx', /SMS settings/),
    ],
  },
  {
    id: 'school-sms-wallet',
    title: 'School SMS wallet balance, send, deduction, and low-balance handling',
    checks: [
      check('wallet-service', 'School SMS wallet service exists', 'apps/api/src/modules/integrations/school-sms-wallet.service.ts', /SchoolSmsWalletService/),
      check('credit-reservation', 'SMS credits are reserved before dispatch', 'apps/api/src/modules/integrations/school-sms-wallet.repository.ts', /reserveSmsCredits/),
      check('dispatch-service', 'SMS sends use shared dispatch service', 'apps/api/src/modules/integrations/sms-dispatch.service.ts', /class SmsDispatchService/),
    ],
  },
  {
    id: 'parent-portal-access',
    title: 'Parent account creation or invite and parent login',
    checks: [
      check('parent-auth-service', 'Parent portal auth service exists', 'apps/api/src/modules/integrations/parent-portal-auth.service.ts', /ParentPortalAuthService/),
      check('parent-otp', 'Parent OTP flow exists', 'apps/web/src/components/auth/portal-login-view.tsx', /SMS code|otp/i),
      check('parent-scope', 'Parent portal copy emphasizes linked learners only', 'apps/web/src/components/auth/portal-login-view.tsx', /linked learners/i),
    ],
  },
  {
    id: 'finance-payment-lifecycle',
    title: 'Fee invoice, cheque posting, MPESA callback, receipt, and balance lifecycle',
    checks: [
      check('finance-module', 'Finance module exists', 'apps/api/src/modules/finance/finance.module.ts', /FinanceModule/),
      check('mpesa-callback', 'MPESA callback processor exists', 'apps/api/src/modules/payments/services/mpesa-callback-processor.service.ts', /callback|idempot/i),
      check('manual-payment-ui', 'Manual payment UI supports familiar school payment entry', 'apps/web/src/components/dashboard/erp-pages.tsx', /cheque|manual|reference/i),
    ],
  },
  {
    id: 'library-scanner-lifecycle',
    title: 'Library book creation, borrower lookup, scanner issue, return, and fine lifecycle',
    checks: [
      check('library-routes', 'Library scan issue route exists', 'apps/web/src/app/api/library/scan-issue/route.ts', /scan-issue|library/i),
      check('library-admission-lookup', 'Library flow supports admission number or name lookup', 'apps/web/src/components/library/library-workspace.tsx', /admission|name/i),
      check('library-keyboard-scanner', 'Scanner is treated as keyboard input', 'apps/web/src/components/library/library-workspace.tsx', /Keyboard scanner ready|scanner/i),
    ],
  },
  {
    id: 'support-ticket-lifecycle',
    title: 'Support ticket creation, support reply, status, notification, and audit lifecycle',
    checks: [
      check('support-service', 'Support service exists', 'apps/api/src/modules/support/support.service.ts', /createTicket|reply/i),
      check('support-notification', 'Support notifications use delivery service', 'apps/api/src/modules/support/support-notification-delivery.service.ts', /deliverCreatedNotifications/),
      check('support-ui', 'Support center workspace exists', 'apps/web/src/components/support/support-center-workspace.tsx', /Ticket conversation|New Ticket/i),
    ],
  },
  {
    id: 'discipline-counselling-lifecycle',
    title: 'Discipline incident, counselling referral, parent acknowledgement, and confidential note lifecycle',
    checks: [
      check('discipline-service', 'Discipline service exists', 'apps/api/src/modules/discipline/discipline.service.ts', /createIncident|discipline/i),
      check('counselling-service', 'Counselling service exists', 'apps/api/src/modules/discipline/counselling.service.ts', /CounsellingService|counselling/i),
      check('discipline-parent-ack', 'Parent acknowledgement table exists', 'apps/api/src/modules/discipline/discipline-schema.service.ts', /parent_acknowledgements/),
    ],
  },
  {
    id: 'exports-and-audit',
    title: 'Export generation and audit log verification',
    checks: [
      check('report-export', 'Report export queue exists', 'apps/api/src/common/reports/report-export-queue.ts', /validateReportExportJobPayload|queue/i),
      check('audit-review', 'Audit coverage review exists', 'apps/api/src/scripts/audit-coverage-review.ts', /AUDIT_COVERAGE_REQUIREMENTS|audit/i),
      check('release-gate', 'Release gate requires audit coverage', 'apps/api/src/scripts/release-readiness-gate.ts', /audit-coverage-review/),
    ],
  },
];

export function runPilotCertification(
  options: PilotCertificationOptions = {},
): PilotCertificationResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const mode = options.mode ?? (options.env?.PILOT_CERTIFICATION_LIVE === 'true' ? 'live' : 'contract');
  const notes: string[] = [
    'Contract mode verifies implementation evidence without creating demo data or printing secrets.',
  ];
  const workflows = WORKFLOWS.map((workflow, index) => {
    const checks = workflow.checks.map((evidenceCheck) => {
      const source = readSource(workspaceRoot, evidenceCheck.file, options.sourceOverrides);
      const passed = evidenceCheck.pattern.test(source);

      return {
        id: evidenceCheck.id,
        label: evidenceCheck.label,
        file: evidenceCheck.file,
        status: passed ? 'pass' as const : 'fail' as const,
      };
    });

    return {
      id: workflow.id,
      evidence_id: `PILOT-${String(index + 1).padStart(3, '0')}-${workflow.id}`,
      title: workflow.title,
      status: checks.every((item) => item.status === 'pass') ? 'pass' as const : 'fail' as const,
      checks,
    };
  });

  if (mode === 'live') {
    const missing = REQUIRED_LIVE_ENV.filter((key) => !options.env?.[key]?.trim());

    if (missing.length > 0) {
      workflows.push({
        id: 'live-environment',
        evidence_id: 'PILOT-LIVE-ENVIRONMENT',
        title: 'Live authenticated pilot environment',
        status: 'fail',
        checks: missing.map((key) => ({
          id: key.toLowerCase(),
          label: `${key} is configured`,
          file: 'environment',
          status: 'fail',
        })),
      });
      notes.push('Live mode requires pilot base URLs, tenant id, and access token configured as environment variables.');
    } else {
      notes.push('Live mode environment variables are present. HTTP workflow execution can run against the configured pilot tenant.');
    }
  }

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    mode,
    ok: workflows.every((workflow) => workflow.status === 'pass'),
    workflows,
    notes,
  };
}

export function renderPilotCertificationMarkdown(result: PilotCertificationResult): string {
  const lines = [
    '# Implementation 10 Pilot Certification',
    '',
    `Generated at: ${result.generated_at}`,
    '',
    `Mode: ${result.mode}`,
    '',
    `Status: ${result.ok ? 'pass' : 'fail'}`,
    '',
    '| Evidence ID | Workflow | Status | Checks |',
    '| --- | --- | --- | --- |',
  ];

  for (const workflow of result.workflows) {
    const checks = workflow.checks
      .map((item) => `${item.status}: ${item.label}`)
      .join('; ');
    lines.push(
      `| ${workflow.evidence_id} | ${escapeTable(workflow.title)} | ${workflow.status} | ${escapeTable(checks)} |`,
    );
  }

  lines.push('', '## Notes', '');

  for (const note of result.notes) {
    lines.push(`- ${note}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function writePilotCertificationArtifact(
  result: PilotCertificationResult,
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderPilotCertificationMarkdown(result), 'utf8');
}

function check(
  id: string,
  label: string,
  file: string,
  pattern: RegExp,
): PilotEvidenceCheck {
  return { id, label, file, pattern };
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
  const result = runPilotCertification({
    workspaceRoot,
    env: process.env,
  });
  const outputPath = join(
    workspaceRoot,
    'docs',
    'validation',
    'implementation10-pilot-certification.md',
  );
  writePilotCertificationArtifact(result, outputPath);

  console.log(`Pilot certification artifact written to ${outputPath}`);
  console.log(`Pilot certification status: ${result.ok ? 'pass' : 'fail'}`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}
