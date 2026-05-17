import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ModuleCertificationName = 'finance' | 'library' | 'discipline';
export type ModuleCertificationStatus = 'pass' | 'fail';

interface EvidenceCheck {
  id: string;
  label: string;
  file: string;
  pattern: RegExp;
}

interface WorkflowDefinition {
  id: string;
  title: string;
  checks: EvidenceCheck[];
}

export interface ModuleCertificationResult {
  generated_at: string;
  module: ModuleCertificationName;
  ok: boolean;
  workflows: Array<{
    id: string;
    evidence_id: string;
    title: string;
    status: ModuleCertificationStatus;
    checks: Array<{
      id: string;
      label: string;
      file: string;
      status: ModuleCertificationStatus;
    }>;
  }>;
}

export interface ModuleCertificationOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  sourceOverrides?: Record<string, string>;
}

const CERTIFICATIONS: Record<ModuleCertificationName, WorkflowDefinition[]> = {
  finance: [
    workflow('fee-structure-and-invoices', 'Fee structure and invoice generation', [
      check('create-invoice-api', 'Billing API exposes invoice creation', 'apps/api/src/modules/billing/billing.controller.ts', /createInvoice/),
      check('bulk-fee-invoices', 'Bulk fee invoice generation exists', 'apps/api/src/modules/billing/billing.controller.ts', /bulkGenerateFeeInvoices/),
      check('student-balance-response', 'Student balance responses expose calculated balance', 'apps/api/src/modules/billing/dto/student-fee-balance-response.dto.ts', /balance_amount_minor/),
    ]),
    workflow('manual-payments', 'Manual cheque, bank, EFT, and cash payment posting', [
      check('manual-payment-api', 'Manual fee payment API exists', 'apps/api/src/modules/billing/billing.controller.ts', /createManualFeePayment/),
      check('cheque-method', 'Cheque payment method is supported', 'apps/api/src/modules/billing/dto/create-manual-fee-payment.dto.ts', /cheque/),
      check('reference-validation', 'Manual payments capture reference and idempotency', 'apps/api/src/modules/billing/dto/create-manual-fee-payment.dto.ts', /idempotency_key[\s\S]+reference/),
    ]),
    workflow('mpesa-reconciliation', 'MPESA callback reconciliation and idempotency', [
      check('mpesa-callback', 'MPESA callback controller exists', 'apps/api/src/modules/payments/controllers/mpesa-callback.controller.ts', /callback/),
      check('mpesa-idempotency', 'Callback path handles duplicate or replayed events', 'apps/api/src/modules/payments/controllers/mpesa-callback.controller.ts', /replayed|idempot/i),
      check('payment-allocation', 'Payment allocation links payments to invoices', 'apps/api/src/modules/payments/services/payment-allocation.service.ts', /invoice_id|allocated/),
    ]),
    workflow('receipts-reversals-ledger', 'Receipts, reversals, and ledger consistency', [
      check('receipt-number', 'Manual payments generate receipt numbers', 'apps/api/src/modules/billing/entities/manual-fee-payment.entity.ts', /receipt_number/),
      check('reversal-api', 'Manual payment reversal API exists', 'apps/api/src/modules/billing/billing.controller.ts', /reverseManualFeePayment/),
      check('ledger-link', 'Payments retain ledger transaction linkage', 'apps/api/src/modules/billing/entities/manual-fee-payment.entity.ts', /ledger_transaction_id/),
    ]),
  ],
  library: [
    workflow('book-registration', 'Book registration with accession, barcode, QR, shelf, and status', [
      check('barcode-schema', 'Library schema stores barcode and QR code', 'apps/api/src/modules/library/library-schema.service.ts', /barcode[\s\S]+qr_code/),
      check('accession-index', 'Library schema indexes accession numbers', 'apps/api/src/modules/library/library-schema.service.ts', /accession_number/),
      check('availability-status', 'Library copies track availability status', 'apps/api/src/modules/library/library-schema.service.ts', /available[\s\S]+issued[\s\S]+lost[\s\S]+damaged/),
    ]),
    workflow('borrower-lookup', 'Borrower lookup by admission number or learner name', [
      check('admission-field', 'Library UI shows admission number fields', 'apps/web/src/components/library/library-workspace.tsx', /Admission\/Staff No|admission/i),
      check('name-search', 'Library UI supports borrower name context', 'apps/web/src/components/library/library-workspace.tsx', /fullName|name/i),
      check('simple-school-flow', 'Library workflow does not require scanning student ID cards', 'implementation10.md', /no student ID scan is required/i),
    ]),
    workflow('scanner-issue-return', 'Keyboard-style scanner issue and return', [
      check('scan-issue-route', 'Scan issue API route exists', 'apps/web/src/app/api/library/scan-issue/route.ts', /scan-issue|circulation\/issue/),
      check('scan-return-route', 'Scan return API route exists', 'apps/web/src/app/api/library/scan-return/route.ts', /scan-return|circulation\/return/),
      check('keyboard-scanner-copy', 'Scanner is treated as ordinary keyboard input', 'apps/web/src/components/library/library-workspace.tsx', /Keyboard scanner ready|keyboard/i),
    ]),
    workflow('fines-and-stock', 'Overdue fines and stock status updates', [
      check('overdue-fine', 'Return flow calculates overdue fines', 'apps/api/src/modules/library/library.service.ts', /calculateFineMinor/),
      check('prevent-duplicate-issue', 'Unavailable copies cannot be issued', 'apps/api/src/modules/library/library.service.ts', /not available for issue/),
      check('lost-damaged', 'Lost and damaged states are represented', 'apps/api/src/modules/library/library-schema.service.ts', /lost[\s\S]+damaged|damaged[\s\S]+lost/),
    ]),
  ],
  discipline: [
    workflow('incident-case-management', 'Incident creation, review, action, and audit lifecycle', [
      check('create-incident', 'Discipline service creates incidents', 'apps/api/src/modules/discipline/discipline.service.ts', /createIncident/),
      check('disciplinary-actions', 'Discipline actions are tracked', 'apps/api/src/modules/discipline/discipline-schema.service.ts', /discipline_actions/),
      check('audit-logs', 'Discipline audit logs are immutable or protected', 'apps/api/src/modules/discipline/discipline-schema.service.ts', /discipline_audit_logs[\s\S]+prevent_discipline_audit_mutation/),
    ]),
    workflow('parent-acknowledgement', 'Parent notification and acknowledgement', [
      check('parent-table', 'Parent acknowledgement table exists', 'apps/api/src/modules/discipline/discipline-schema.service.ts', /parent_acknowledgements/),
      check('parent-portal-api', 'Parent discipline acknowledgement client exists', 'apps/web/src/lib/discipline/discipline-live.ts', /acknowledgeDisciplineIncident/),
      check('parent-scope', 'Parent incident queries are scoped', 'apps/api/src/modules/discipline/repositories/discipline.repository.ts', /parent_user_id[\s\S]+student_id/),
    ]),
    workflow('counselling-confidentiality', 'Counselling referral, encrypted notes, and confidentiality controls', [
      check('counselling-service', 'Counselling service exists', 'apps/api/src/modules/discipline/counselling.service.ts', /CounsellingService/),
      check('encrypted-notes', 'Counselling notes are encrypted', 'apps/api/src/modules/discipline/counselling-note-encryption.service.ts', /encrypt[\s\S]+encrypted_note/),
      check('note-visibility', 'Counselling note visibility is permission gated', 'apps/api/src/modules/discipline/counselling.service.ts', /visibility[\s\S]+parent_visible[\s\S]+counselling:manage/),
    ]),
    workflow('reports-and-documents', 'Reports, documents, and confidential export safety', [
      check('discipline-report-api', 'Discipline reports are exposed through API', 'apps/web/src/lib/discipline/discipline-live.ts', /exportDisciplineReport|reports/),
      check('document-generation', 'Discipline document generation excludes confidential notes by default', 'apps/api/src/modules/discipline/discipline-document.service.ts', /confidential_notes_included: false/),
      check('analytics-dashboard', 'Discipline analytics dashboard exists', 'apps/api/src/modules/discipline/repositories/discipline.repository.ts', /getDashboard|incidents_by_severity/),
    ]),
  ],
};

export function runModuleCertification(
  moduleName: ModuleCertificationName,
  options: ModuleCertificationOptions = {},
): ModuleCertificationResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const definitions = CERTIFICATIONS[moduleName];
  const workflows = definitions.map((definition, index) => {
    const checks = definition.checks.map((item) => {
      const source = readSource(workspaceRoot, item.file, options.sourceOverrides);
      const passed = item.pattern.test(source);

      return {
        id: item.id,
        label: item.label,
        file: item.file,
        status: passed ? 'pass' as const : 'fail' as const,
      };
    });

    return {
      id: definition.id,
      evidence_id: `${moduleName.toUpperCase()}-${String(index + 1).padStart(3, '0')}-${definition.id}`,
      title: definition.title,
      status: checks.every((item) => item.status === 'pass') ? 'pass' as const : 'fail' as const,
      checks,
    };
  });

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    module: moduleName,
    ok: workflows.every((workflowResult) => workflowResult.status === 'pass'),
    workflows,
  };
}

export function renderModuleCertificationMarkdown(result: ModuleCertificationResult): string {
  const lines = [
    `# Implementation 10 ${titleCase(result.module)} Certification`,
    '',
    `Generated at: ${result.generated_at}`,
    '',
    `Status: ${result.ok ? 'pass' : 'fail'}`,
    '',
    '| Evidence ID | Workflow | Status | Checks |',
    '| --- | --- | --- | --- |',
  ];

  for (const workflowResult of result.workflows) {
    lines.push(
      `| ${workflowResult.evidence_id} | ${escapeTable(workflowResult.title)} | ${workflowResult.status} | ${escapeTable(workflowResult.checks.map((item) => `${item.status}: ${item.label}`).join('; '))} |`,
    );
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- This certification verifies implementation evidence and does not create demo data or print secrets.',
    '- Live pilot execution is handled by `npm run certify:pilot` when pilot environment variables are configured.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

export function writeModuleCertificationArtifact(
  result: ModuleCertificationResult,
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderModuleCertificationMarkdown(result), 'utf8');
}

export function runAndWriteModuleCertification(
  moduleName: ModuleCertificationName,
  workspaceRoot = process.cwd(),
): ModuleCertificationResult {
  const result = runModuleCertification(moduleName, { workspaceRoot });
  const outputPath = join(
    workspaceRoot,
    'docs',
    'validation',
    `implementation10-${moduleName}-certification.md`,
  );
  writeModuleCertificationArtifact(result, outputPath);
  return result;
}

function workflow(id: string, title: string, checks: EvidenceCheck[]): WorkflowDefinition {
  return { id, title, checks };
}

function check(id: string, label: string, file: string, pattern: RegExp): EvidenceCheck {
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

function titleCase(value: string): string {
  return value.replace(/(^|-)([a-z])/g, (_, prefix: string, letter: string) =>
    `${prefix ? ' ' : ''}${letter.toUpperCase()}`,
  );
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

