import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderModuleCertificationMarkdown,
  runModuleCertification,
} from './module-certification';

const passingSources: Record<string, string> = {
  'apps/api/src/modules/billing/billing.controller.ts': 'createInvoice bulkGenerateFeeInvoices createManualFeePayment reverseManualFeePayment',
  'apps/api/src/modules/billing/dto/student-fee-balance-response.dto.ts': 'balance_amount_minor',
  'apps/api/src/modules/billing/dto/create-manual-fee-payment.dto.ts': 'idempotency_key reference cheque',
  'apps/api/src/modules/payments/controllers/mpesa-callback.controller.ts': 'callback replayed idempotency',
  'apps/api/src/modules/payments/services/payment-allocation.service.ts': 'invoice_id allocated',
  'apps/api/src/modules/billing/entities/manual-fee-payment.entity.ts': 'receipt_number ledger_transaction_id',
  'apps/api/src/modules/library/library-schema.service.ts': 'barcode qr_code accession_number available issued lost damaged',
  'apps/web/src/components/library/library-workspace.tsx': 'Admission/Staff No fullName name Keyboard scanner ready keyboard',
  'implementation10.md': 'no student ID scan is required',
  'apps/web/src/app/api/library/scan-issue/route.ts': 'scan-issue circulation/issue',
  'apps/web/src/app/api/library/scan-return/route.ts': 'scan-return circulation/return',
  'apps/api/src/modules/library/library.service.ts': 'calculateFineMinor not available for issue',
  'apps/api/src/modules/discipline/discipline.service.ts': 'createIncident',
  'apps/api/src/modules/discipline/discipline-schema.service.ts': 'discipline_actions discipline_audit_logs prevent_discipline_audit_mutation parent_acknowledgements',
  'apps/web/src/lib/discipline/discipline-live.ts': 'acknowledgeDisciplineIncident exportDisciplineReport reports',
  'apps/api/src/modules/discipline/repositories/discipline.repository.ts': 'parent_user_id student_id getDashboard incidents_by_severity',
  'apps/api/src/modules/discipline/counselling.service.ts': 'CounsellingService visibility parent_visible counselling:manage',
  'apps/api/src/modules/discipline/counselling-note-encryption.service.ts': 'encrypt encrypted_note',
  'apps/api/src/modules/discipline/discipline-document.service.ts': 'confidential_notes_included: false',
};

test('module certifications pass when required implementation evidence is present', () => {
  for (const moduleName of ['finance', 'library', 'discipline'] as const) {
    const result = runModuleCertification(moduleName, {
      workspaceRoot: '/',
      generatedAt: '2026-05-16T00:00:00.000Z',
      sourceOverrides: passingSources,
    });

    assert.equal(result.ok, true);
    assert.equal(result.workflows.every((workflow) => workflow.status === 'pass'), true);
    assert.match(result.workflows[0].evidence_id, new RegExp(`^${moduleName.toUpperCase()}-001-`));
  }
});

test('module certification fails when required evidence is missing', () => {
  const result = runModuleCertification('library', {
    workspaceRoot: '/',
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: {
      ...passingSources,
      'apps/web/src/app/api/library/scan-return/route.ts': '',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.workflows.some((workflow) =>
      workflow.checks.some((check) => check.id === 'scan-return-route' && check.status === 'fail'),
    ),
    true,
  );
});

test('module certification markdown is artifact-safe', () => {
  const result = runModuleCertification('finance', {
    workspaceRoot: '/',
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceOverrides: passingSources,
  });

  const markdown = renderModuleCertificationMarkdown(result);

  assert.match(markdown, /Implementation 10 Finance Certification/);
  assert.match(markdown, /FINANCE-001-/);
  assert.equal(/password=/i.test(markdown), false);
});
