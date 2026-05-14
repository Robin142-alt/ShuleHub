export interface PilotSchoolFixturePlan {
  tenants: number;
  students: number;
  staff: number;
  invoices: number;
  payments: number;
  inventory_movements: number;
  support_tickets: number;
  library_copies: number;
  exam_series: number;
  modules: string[];
}

export interface FixtureMutationTarget {
  targetUrl?: string;
  allowRemoteMutation?: boolean;
}

export function buildPilotSchoolFixturePlan(): PilotSchoolFixturePlan {
  return {
    tenants: 1,
    students: 1500,
    staff: 120,
    invoices: 2000,
    payments: 5000,
    inventory_movements: 2000,
    support_tickets: 100,
    library_copies: 750,
    exam_series: 10,
    modules: [
      'admissions',
      'billing',
      'exams',
      'hr',
      'inventory',
      'library',
      'payments',
      'support',
      'timetable',
    ],
  };
}

export function assertFixtureMutationAllowed(input: FixtureMutationTarget): void {
  const targetUrl = input.targetUrl ?? process.env.FIXTURE_TARGET_URL ?? 'http://localhost';
  const allowRemoteMutation =
    input.allowRemoteMutation
    ?? process.env.ALLOW_REMOTE_FIXTURE_MUTATION === 'true';

  if (!isLocalTarget(targetUrl) && !allowRemoteMutation) {
    throw new Error('Pilot school fixture generator refuses remote targets without ALLOW_REMOTE_FIXTURE_MUTATION=true');
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
  assertFixtureMutationAllowed({});
  process.stdout.write(`${JSON.stringify(buildPilotSchoolFixturePlan(), null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
