import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderPilotCertificationMarkdown,
  runPilotCertification,
} from './run-pilot-certification';

test('runPilotCertification records evidence ids for all pilot workflows', () => {
  const result = runPilotCertification({
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: buildPassingSources(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'contract');
  assert.equal(result.workflows.length >= 10, true);
  assert.equal(result.workflows.every((workflow) => workflow.evidence_id.startsWith('PILOT-')), true);
});

test('runPilotCertification fails live mode when authenticated pilot env is missing', () => {
  const result = runPilotCertification({
    mode: 'live',
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: buildPassingSources(),
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.workflows.some((workflow) => workflow.id === 'live-environment'), true);
});

test('renderPilotCertificationMarkdown includes safe workflow evidence without secrets', () => {
  const result = runPilotCertification({
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: buildPassingSources(),
  });
  const markdown = renderPilotCertificationMarkdown(result);

  assert.match(markdown, /Implementation 10 Pilot Certification/);
  assert.match(markdown, /Library book creation/);
  assert.match(markdown, /Support ticket creation/);
  assert.equal(markdown.includes('live-api-key-secret'), false);
});

function buildPassingSources(): Record<string, string> {
  return {
    'apps/web/src/components/auth/superadmin-login-view.tsx': 'SuperadminLoginView useExperienceSession("superadmin") ShuleHub never asks users to share passwords',
    'apps/api/src/modules/platform/platform-onboarding.service.ts': 'createSchool tenant_id tenantId',
    'apps/web/src/app/api/platform/schools/route.ts': 'proxyPlatformApiRequest platform',
    'apps/api/src/auth/tenant-invitations.service.ts': 'class TenantInvitationsService {}',
    'apps/api/src/auth/auth-email.service.ts': 'sendTenantInvitationEmail Invitation',
    'apps/web/src/app/invite/accept/page.tsx': 'Invitation accept invite',
    'apps/web/src/components/auth/school-login-view.tsx': 'Email address Password ShuleHub will open the school linked to your account',
    'apps/api/src/auth/auth.service.ts': 'membership.tenant_id tenant_id',
    'apps/api/src/modules/integrations/daraja-integration.service.ts': 'saveDarajaSettings Daraja encrypt masked',
    'apps/api/src/modules/integrations/platform-sms.service.ts': 'class PlatformSmsService encrypt',
    'apps/web/src/components/platform/superadmin-pages.tsx': 'SMS settings',
    'apps/api/src/modules/integrations/school-sms-wallet.service.ts': 'class SchoolSmsWalletService',
    'apps/api/src/modules/integrations/school-sms-wallet.repository.ts': 'reserveSmsCredits',
    'apps/api/src/modules/integrations/sms-dispatch.service.ts': 'class SmsDispatchService',
    'apps/api/src/modules/integrations/parent-portal-auth.service.ts': 'class ParentPortalAuthService',
    'apps/web/src/components/auth/portal-login-view.tsx': 'SMS code linked learners otp',
    'apps/api/src/modules/finance/finance.module.ts': 'class FinanceModule',
    'apps/api/src/modules/payments/services/mpesa-callback-processor.service.ts': 'callback idempot',
    'apps/web/src/components/dashboard/erp-pages.tsx': 'manual cheque reference',
    'apps/web/src/app/api/library/scan-issue/route.ts': 'scan-issue library',
    'apps/web/src/components/library/library-workspace.tsx': 'admission name Keyboard scanner ready scanner',
    'apps/api/src/modules/support/support.service.ts': 'createTicket reply',
    'apps/api/src/modules/support/support-notification-delivery.service.ts': 'deliverCreatedNotifications',
    'apps/web/src/components/support/support-center-workspace.tsx': 'Ticket conversation New Ticket',
    'apps/api/src/modules/discipline/discipline.service.ts': 'createIncident discipline',
    'apps/api/src/modules/discipline/counselling.service.ts': 'class CounsellingService counselling',
    'apps/api/src/modules/discipline/discipline-schema.service.ts': 'parent_acknowledgements',
    'apps/api/src/common/reports/report-export-queue.ts': 'validateReportExportJobPayload queue',
    'apps/api/src/scripts/audit-coverage-review.ts': 'AUDIT_COVERAGE_REQUIREMENTS audit',
    'apps/api/src/scripts/release-readiness-gate.ts': 'audit-coverage-review',
  };
}
