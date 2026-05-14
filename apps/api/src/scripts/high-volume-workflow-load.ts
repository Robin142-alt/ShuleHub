export interface HighVolumeWorkflowLoad {
  id: string;
  method: 'GET' | 'HEAD';
  path: string;
  targetP95Ms: number;
}

export interface HighVolumeLoadTarget {
  targetUrl?: string;
  allowRemoteMutation?: boolean;
}

export const HIGH_VOLUME_WORKFLOW_LOADS: HighVolumeWorkflowLoad[] = [
  { id: 'dashboard-summaries', method: 'GET', path: '/dashboard/summary', targetP95Ms: 600 },
  { id: 'student-search', method: 'GET', path: '/students?search=a', targetP95Ms: 500 },
  { id: 'admissions-lists', method: 'GET', path: '/admissions/applications', targetP95Ms: 700 },
  { id: 'inventory-reconciliation', method: 'GET', path: '/inventory/reconciliation', targetP95Ms: 700 },
  { id: 'billing-invoice-reports', method: 'GET', path: '/billing/reports/invoices/export', targetP95Ms: 900 },
  { id: 'student-fee-balances', method: 'GET', path: '/billing/students/balances', targetP95Ms: 650 },
  { id: 'parent-linked-learner-balances', method: 'GET', path: '/billing/portal/linked-learners', targetP95Ms: 650 },
  { id: 'exams-report-cards', method: 'GET', path: '/exams/report-cards', targetP95Ms: 800 },
  { id: 'teacher-mark-sheets', method: 'GET', path: '/exams/mark-sheets', targetP95Ms: 800 },
  { id: 'timetable-published-schedules', method: 'GET', path: '/timetable/published', targetP95Ms: 700 },
  { id: 'hr-staff-directory', method: 'GET', path: '/hr/staff', targetP95Ms: 700 },
  { id: 'library-circulation', method: 'GET', path: '/library/circulation', targetP95Ms: 700 },
  { id: 'support-status', method: 'GET', path: '/support/public/system-status', targetP95Ms: 500 },
  { id: 'support-tickets', method: 'GET', path: '/support/tickets', targetP95Ms: 700 },
  { id: 'report-export-jobs', method: 'GET', path: '/reports/export-jobs', targetP95Ms: 800 },
];

export function assertHighVolumeLoadIsReadSafe(workloads: readonly HighVolumeWorkflowLoad[]): void {
  const unsafe = workloads.filter((workload) => workload.method !== 'GET' && workload.method !== 'HEAD');

  if (unsafe.length > 0) {
    throw new Error(`High-volume load workloads must be read-safe: ${unsafe.map((item) => item.id).join(', ')}`);
  }
}

export function validateHighVolumeLoadTarget(input: HighVolumeLoadTarget): void {
  const targetUrl = input.targetUrl ?? process.env.HIGH_VOLUME_LOAD_TARGET_URL ?? 'http://localhost';
  const allowRemoteMutation =
    input.allowRemoteMutation
    ?? process.env.ALLOW_REMOTE_FIXTURE_MUTATION === 'true';

  if (!isLocalTarget(targetUrl) && !allowRemoteMutation) {
    throw new Error('High-volume workflow load refuses remote targets without explicit opt-in');
  }
}

function isLocalTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return true;
  }
}

function main(): void {
  validateHighVolumeLoadTarget({});
  assertHighVolumeLoadIsReadSafe(HIGH_VOLUME_WORKFLOW_LOADS);
  process.stdout.write(`${JSON.stringify({ workloads: HIGH_VOLUME_WORKFLOW_LOADS }, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
