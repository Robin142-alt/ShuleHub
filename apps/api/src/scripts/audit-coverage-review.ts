import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AuditCoverageEvidence {
  file: string;
  patterns: string[];
}

export interface AuditCoverageRequirement {
  id: string;
  module: string;
  description: string;
  evidence: AuditCoverageEvidence[];
}

export interface AuditCoverageMissingEvidence {
  file: string;
  pattern: string;
}

export interface AuditCoverageRequirementResult {
  id: string;
  module: string;
  description: string;
  ok: boolean;
  missing: AuditCoverageMissingEvidence[];
}

export interface AuditCoverageReviewResult {
  ok: boolean;
  validationErrors: string[];
  results: AuditCoverageRequirementResult[];
}

export interface AuditCoverageReviewOptions {
  requirements?: readonly AuditCoverageRequirement[];
  workspaceRoot?: string;
  readFile?: (filePath: string) => string;
}

export const AUDIT_COVERAGE_REQUIREMENTS: readonly AuditCoverageRequirement[] = [
  {
    id: 'tenant-invitation-membership-audit',
    module: 'auth',
    description: 'Tenant invitation and membership mutations record audit logs.',
    evidence: [
      {
        file: 'apps/api/src/auth/tenant-invitations.service.ts',
        patterns: [
          'tenant.invitation.created',
          'tenant.invitation.resent',
          'tenant.invitation.revoked',
          'tenant.membership.status_changed',
          'tenant.membership.role_changed',
        ],
      },
      {
        file: 'apps/api/src/auth/tenant-invitations.service.test.ts',
        patterns: [
          'tenant.invitation.created',
          'tenant.invitation.resent',
          'tenant.invitation.revoked',
          'tenant.membership.status_changed',
          'tenant.membership.role_changed',
        ],
      },
    ],
  },
  {
    id: 'support-ticket-status-audit',
    module: 'support',
    description: 'Support ticket creation, reopening, assignment, and SLA breach transitions are logged.',
    evidence: [
      {
        file: 'apps/api/src/modules/support/support.service.ts',
        patterns: ['ticket.created', 'ticket.reopened', 'ticket.assigned'],
      },
      {
        file: 'apps/api/src/modules/support/support-sla-monitoring.service.ts',
        patterns: ['ticket.sla_breached'],
      },
      {
        file: 'apps/api/src/modules/support/support.test.ts',
        patterns: ['ticket.created', 'ticket.reopened', 'ticket.assigned'],
      },
      {
        file: 'apps/api/src/modules/support/support-sla-monitoring.service.test.ts',
        patterns: ['ticket.sla_breached'],
      },
    ],
  },
  {
    id: 'admissions-academic-events',
    module: 'admissions',
    description: 'Admissions academic handoff and lifecycle changes publish tenant-scoped domain events.',
    evidence: [
      {
        file: 'apps/api/src/modules/admissions/admissions.service.ts',
        patterns: [
          'student.academic_enrollment.created',
          'student.academic_lifecycle.changed',
        ],
      },
      {
        file: 'apps/api/src/modules/admissions/admissions.test.ts',
        patterns: [
          'student.academic_enrollment.created',
          'student.academic_lifecycle.changed',
        ],
      },
    ],
  },
  {
    id: 'finance-transaction-audit',
    module: 'finance',
    description: 'Financial transaction posting is auditable with tenant and request context.',
    evidence: [
      {
        file: 'apps/api/src/modules/observability/audit-log.service.ts',
        patterns: ['finance.transaction.posted'],
      },
      {
        file: 'apps/api/test/observability.integration-spec.ts',
        patterns: ['finance.transaction.posted'],
      },
    ],
  },
  {
    id: 'grades-audit',
    module: 'grades',
    description: 'Grade mutations use the shared audit log service.',
    evidence: [
      {
        file: 'apps/api/src/modules/observability/grades-audit.service.ts',
        patterns: ['grade.created', 'grade.updated', 'grade.published', 'grade.deleted'],
      },
      {
        file: 'apps/api/src/modules/observability/observability.test.ts',
        patterns: ['grade.updated'],
      },
    ],
  },
  {
    id: 'academics-teacher-assignment-audit',
    module: 'academics',
    description: 'Teacher subject assignment mutations record academic audit logs.',
    evidence: [
      {
        file: 'apps/api/src/modules/academics/academics.service.ts',
        patterns: ['academics.teacher_subject_assigned', 'appendAuditLog'],
      },
      {
        file: 'apps/api/src/modules/academics/academics.test.ts',
        patterns: ['assigns teachers', 'audit'],
      },
    ],
  },
  {
    id: 'exams-report-card-audit',
    module: 'exams',
    description: 'Exam marks and report-card publication record audit events.',
    evidence: [
      {
        file: 'apps/api/src/modules/exams/exams.service.ts',
        patterns: ['grade.updated', 'grade.published'],
      },
      {
        file: 'apps/api/src/modules/exams/exams.test.ts',
        patterns: ['subject-scoped marks with audit', 'publishes report cards with snapshot linkage and audit'],
      },
    ],
  },
  {
    id: 'student-fee-allocation-audit',
    module: 'billing',
    description: 'Student fee payment allocation is idempotent and append-only.',
    evidence: [
      {
        file: 'apps/api/src/modules/billing/student-fee-payment-allocation.service.ts',
        patterns: ['student-fee', 'idempotencyKey', 'createStudentFeePaymentAllocation'],
      },
      {
        file: 'apps/api/src/modules/billing/student-fee-payment-allocation.service.test.ts',
        patterns: ['duplicate', 'credit'],
      },
    ],
  },
  {
    id: 'hr-staff-management-audit',
    module: 'hr',
    description: 'Staff contract, leave, and status changes record HR audit logs.',
    evidence: [
      {
        file: 'apps/api/src/modules/hr/hr.service.ts',
        patterns: ['staff.contract.approved', 'staff.leave.approved', 'staff.status.changed'],
      },
      {
        file: 'apps/api/src/modules/hr/hr.test.ts',
        patterns: ['records audit logs for staff status changes', 'audit'],
      },
    ],
  },
  {
    id: 'timetable-version-audit',
    module: 'timetable',
    description: 'Timetable slot creation and version publishing are audited.',
    evidence: [
      {
        file: 'apps/api/src/modules/timetable/timetable.service.ts',
        patterns: ['timetable.slot.created', 'timetable.version.published'],
      },
      {
        file: 'apps/api/src/modules/timetable/timetable.test.ts',
        patterns: ['publishes immutable versions', 'audit'],
      },
    ],
  },
  {
    id: 'library-circulation-ledger',
    module: 'library',
    description: 'Library issue, reserve, return, and fine handoff write circulation ledger evidence.',
    evidence: [
      {
        file: 'apps/api/src/modules/library/library.service.ts',
        patterns: ['appendLedger', "action: 'issue'", "action: 'reserve'", "action: 'return'"],
      },
      {
        file: 'apps/api/src/modules/library/library.test.ts',
        patterns: ['billing handoff for overdue fines', 'ledger'],
      },
    ],
  },
  {
    id: 'support-status-subscription-privacy',
    module: 'support',
    description: 'Public status subscriptions store hashed contacts and suppress internal incident notes.',
    evidence: [
      {
        file: 'apps/api/src/modules/support/support-status-subscription.service.ts',
        patterns: ['contact_hash', 'hashContact', 'queueIncidentNotifications'],
      },
      {
        file: 'apps/api/src/modules/support/support-status-subscription.service.test.ts',
        patterns: ['stores hashed contact', 'without internal notes', 'internal_notes'],
      },
    ],
  },
  {
    id: 'fraud-security-audit',
    module: 'security',
    description: 'Fraud signals create security audit events.',
    evidence: [
      {
        file: 'apps/api/src/modules/security/fraud-detection.service.ts',
        patterns: [
          'fraud.payment.high_value_detected',
          'fraud.payment.velocity_detected',
          'fraud.payment.phone_reused_across_accounts',
          'fraud.payment.suspicious_pattern_detected',
          'fraud.mpesa.callback_failures_detected',
        ],
      },
      {
        file: 'apps/api/src/modules/security/security.test.ts',
        patterns: ['fraud.payment.high_value_detected'],
      },
      {
        file: 'apps/api/test/fraud-scenarios.integration-spec.ts',
        patterns: [
          'fraud.payment.velocity_detected',
          'fraud.payment.phone_reused_across_accounts',
          'fraud.payment.suspicious_pattern_detected',
        ],
      },
    ],
  },
];

const RETIRED_AUDIT_PATTERN = /attendance/i;

export function validateAuditCoverageRequirements(
  requirements: readonly AuditCoverageRequirement[] = AUDIT_COVERAGE_REQUIREMENTS,
): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const requirement of requirements) {
    if (seenIds.has(requirement.id)) {
      errors.push(`Audit coverage requirement ${requirement.id} is duplicated.`);
    }
    seenIds.add(requirement.id);

    if (
      RETIRED_AUDIT_PATTERN.test(requirement.id)
      || RETIRED_AUDIT_PATTERN.test(requirement.module)
      || RETIRED_AUDIT_PATTERN.test(requirement.description)
      || requirement.evidence.some((evidence) =>
        RETIRED_AUDIT_PATTERN.test(evidence.file)
        || evidence.patterns.some((pattern) => RETIRED_AUDIT_PATTERN.test(pattern)),
      )
    ) {
      errors.push(`Audit coverage requirement ${requirement.id} references retired attendance functionality.`);
    }

    if (!requirement.module.trim()) {
      errors.push(`Audit coverage requirement ${requirement.id} must declare a module.`);
    }

    if (requirement.evidence.length === 0) {
      errors.push(`Audit coverage requirement ${requirement.id} must include evidence.`);
    }

    for (const evidence of requirement.evidence) {
      if (!evidence.file.trim()) {
        errors.push(`Audit coverage requirement ${requirement.id} has blank evidence file.`);
      }

      if (evidence.patterns.length === 0) {
        errors.push(`Audit coverage requirement ${requirement.id} evidence ${evidence.file} must include patterns.`);
      }
    }
  }

  return errors;
}

export function runAuditCoverageReview(
  options: AuditCoverageReviewOptions = {},
): AuditCoverageReviewResult {
  const requirements = options.requirements ?? AUDIT_COVERAGE_REQUIREMENTS;
  const validationErrors = validateAuditCoverageRequirements(requirements);

  if (validationErrors.length > 0) {
    return {
      ok: false,
      validationErrors,
      results: [],
    };
  }

  const readFile = options.readFile ?? createWorkspaceFileReader(options.workspaceRoot ?? process.cwd());
  const results = requirements.map((requirement) => {
    const missing: AuditCoverageMissingEvidence[] = [];

    for (const evidence of requirement.evidence) {
      let source = '';

      try {
        source = readFile(evidence.file);
      } catch (error) {
        missing.push({
          file: evidence.file,
          pattern: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      for (const pattern of evidence.patterns) {
        if (!source.includes(pattern)) {
          missing.push({
            file: evidence.file,
            pattern,
          });
        }
      }
    }

    return {
      id: requirement.id,
      module: requirement.module,
      description: requirement.description,
      ok: missing.length === 0,
      missing,
    };
  });

  return {
    ok: results.every((result) => result.ok),
    validationErrors: [],
    results,
  };
}

function createWorkspaceFileReader(workspaceRoot: string): (filePath: string) => string {
  return (filePath: string) => readFileSync(join(workspaceRoot, filePath), 'utf8');
}

function main(): void {
  const result = runAuditCoverageReview();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
