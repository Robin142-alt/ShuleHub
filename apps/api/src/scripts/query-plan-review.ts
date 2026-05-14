import { Client } from 'pg';

export interface QueryPlanReview {
  id: string;
  description: string;
  sql: string;
  parameters: readonly unknown[];
  protectedTables: readonly string[];
}

export interface QueryPlanReviewResult {
  id: string;
  description: string;
  nodeTypes: string[];
  warnings: string[];
}

export interface QueryPlanReviewRunResult {
  ok: boolean;
  results: QueryPlanReviewResult[];
}

export type QueryPlanRunner = (
  sql: string,
  values: readonly unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export interface RunQueryPlanReviewOptions {
  reviews?: readonly QueryPlanReview[];
  query: QueryPlanRunner;
}

type JsonPlanNode = Record<string, unknown> & {
  'Node Type'?: string;
  'Relation Name'?: string;
  Plans?: JsonPlanNode[];
};

export const QUERY_PLAN_REVIEWS: readonly QueryPlanReview[] = [
  {
    id: 'students-directory-search',
    description: 'Student directory search should use the student full-text index.',
    sql: `
      SELECT id, admission_number, first_name, last_name
      FROM students
      WHERE tenant_id = $1
        AND to_tsvector(
          'simple',
          admission_number || ' ' ||
          first_name || ' ' ||
          COALESCE(middle_name, '') || ' ' ||
          last_name || ' ' ||
          COALESCE(primary_guardian_name, '') || ' ' ||
          COALESCE(primary_guardian_phone, '')
        ) @@ plainto_tsquery('simple', $2)
      ORDER BY last_name ASC, first_name ASC
      LIMIT 25
    `,
    parameters: ['tenant-a', 'amina otieno'],
    protectedTables: ['students'],
  },
  {
    id: 'admissions-application-search',
    description: 'Admissions application search should use the admissions full-text index.',
    sql: `
      SELECT id, application_number, full_name
      FROM admission_applications
      WHERE tenant_id = $1
        AND to_tsvector(
          'simple',
          application_number || ' ' ||
          full_name || ' ' ||
          birth_certificate_number || ' ' ||
          class_applying || ' ' ||
          parent_name || ' ' ||
          parent_phone || ' ' ||
          COALESCE(parent_email, '')
        ) @@ plainto_tsquery('simple', $2)
      ORDER BY created_at DESC
      LIMIT 25
    `,
    parameters: ['tenant-a', 'grade 4 parent'],
    protectedTables: ['admission_applications'],
  },
  {
    id: 'inventory-item-search',
    description: 'Inventory item search should use the inventory item full-text index.',
    sql: `
      SELECT id, item_name, sku
      FROM inventory_items
      WHERE tenant_id = $1
        AND status = 'active'
        AND to_tsvector(
          'simple',
          item_name || ' ' ||
          sku || ' ' ||
          unit || ' ' ||
          COALESCE(storage_location, '') || ' ' ||
          COALESCE(notes, '')
        ) @@ plainto_tsquery('simple', $2)
      ORDER BY item_name ASC
      LIMIT 25
    `,
    parameters: ['tenant-a', 'a4 paper'],
    protectedTables: ['inventory_items'],
  },
  {
    id: 'academics-teacher-assignment-lookup',
    description: 'Teacher assignment lookup should use the academic assignment tenant/teacher index.',
    sql: `
      SELECT id, academic_term_id, class_section_id, subject_id
      FROM teacher_subject_assignments
      WHERE tenant_id = $1
        AND teacher_user_id = $2::uuid
      ORDER BY academic_term_id ASC
      LIMIT 50
    `,
    parameters: ['tenant-a', '11111111-1111-1111-1111-111111111111'],
    protectedTables: ['teacher_subject_assignments'],
  },
  {
    id: 'exam-marks-student-series',
    description: 'Exam mark lookup should use the student/report-card indexes.',
    sql: `
      SELECT id, assessment_id, score, status
      FROM exam_marks
      WHERE tenant_id = $1
        AND student_id = $2::uuid
        AND exam_series_id = $3::uuid
      ORDER BY updated_at DESC
      LIMIT 50
    `,
    parameters: [
      'tenant-a',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    ],
    protectedTables: ['exam_marks'],
  },
  {
    id: 'student-fee-allocation-history',
    description: 'Student fee allocation history should use the tenant/student allocation index.',
    sql: `
      SELECT id, invoice_id, amount_minor, created_at
      FROM student_fee_payment_allocations
      WHERE tenant_id = $1
        AND student_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `,
    parameters: ['tenant-a', '44444444-4444-4444-4444-444444444444'],
    protectedTables: ['student_fee_payment_allocations'],
  },
  {
    id: 'support-status-subscription-queue',
    description: 'Status subscribers should be listed from the active subscription queue index.',
    sql: `
      SELECT id, contact_hash, locale
      FROM support_status_subscriptions
      WHERE tenant_id = 'global'
        AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 500
    `,
    parameters: [],
    protectedTables: ['support_status_subscriptions'],
  },
  {
    id: 'hr-staff-profile-directory',
    description: 'Hidden HR staff directory read path remains tenant scoped.',
    sql: `
      SELECT id, staff_number, display_name, status
      FROM staff_profiles
      WHERE tenant_id = $1
        AND status = $2
      ORDER BY display_name ASC
      LIMIT 50
    `,
    parameters: ['tenant-a', 'active'],
    protectedTables: [],
  },
  {
    id: 'library-catalog-search',
    description: 'Hidden library catalog lookup remains tenant scoped.',
    sql: `
      SELECT id, title, author
      FROM library_catalog_items
      WHERE tenant_id = $1
        AND lower(title) LIKE lower($2)
      ORDER BY title ASC
      LIMIT 50
    `,
    parameters: ['tenant-a', '%math%'],
    protectedTables: [],
  },
  {
    id: 'timetable-slot-lookup',
    description: 'Hidden timetable slot lookup should use the conflict lookup index shape.',
    sql: `
      SELECT id, teacher_id, class_section_id, room_id
      FROM timetable_slots
      WHERE tenant_id = $1
        AND academic_year = $2
        AND term_name = $3
        AND day_of_week = $4
      ORDER BY starts_at ASC
      LIMIT 100
    `,
    parameters: ['tenant-a', '2026', 'Term 2', 1],
    protectedTables: ['timetable_slots'],
  },
  {
    id: 'support-ticket-search',
    description: 'Support ticket search should use the support ticket full-text index.',
    sql: `
      SELECT id, ticket_number, subject
      FROM support_tickets
      WHERE tenant_id = $1
        AND to_tsvector(
          'simple'::regconfig,
          ticket_number || ' ' ||
          subject || ' ' ||
          category || ' ' ||
          module_affected || ' ' ||
          description
        ) @@ plainto_tsquery('simple', $2)
      ORDER BY updated_at DESC
      LIMIT 25
    `,
    parameters: ['tenant-a', 'mpesa callback'],
    protectedTables: ['support_tickets'],
  },
];

const RETIRED_QUERY_PATTERN = /attendance/i;
const MUTATING_SQL_PATTERN = /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/i;

export function validateQueryPlanReviews(
  reviews: readonly QueryPlanReview[] = QUERY_PLAN_REVIEWS,
): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const review of reviews) {
    if (seenIds.has(review.id)) {
      errors.push(`Query plan review ${review.id} is duplicated.`);
    }
    seenIds.add(review.id);

    if (
      RETIRED_QUERY_PATTERN.test(review.id)
      || RETIRED_QUERY_PATTERN.test(review.description)
      || RETIRED_QUERY_PATTERN.test(review.sql)
      || review.protectedTables.some((table) => RETIRED_QUERY_PATTERN.test(table))
    ) {
      errors.push(`Query plan review ${review.id} references retired attendance functionality.`);
    }

    if (MUTATING_SQL_PATTERN.test(review.sql)) {
      errors.push(`Query plan review ${review.id} must be read-only.`);
    }
  }

  return errors;
}

export function collectPlanNodeTypes(plan: unknown): string[] {
  const node = normalizePlanNode(plan);
  if (!node) {
    return [];
  }

  const currentNodeType = typeof node['Node Type'] === 'string' ? [node['Node Type']] : [];
  const childNodeTypes = Array.isArray(node.Plans)
    ? node.Plans.flatMap((child) => collectPlanNodeTypes(child))
    : [];

  return [...currentNodeType, ...childNodeTypes];
}

export async function runQueryPlanReview(
  options: RunQueryPlanReviewOptions,
): Promise<QueryPlanReviewRunResult> {
  const reviews = options.reviews ?? QUERY_PLAN_REVIEWS;
  const validationErrors = validateQueryPlanReviews(reviews);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid query plan reviews: ${validationErrors.join('; ')}`);
  }

  const results: QueryPlanReviewResult[] = [];

  for (const review of reviews) {
    const explainSql = `EXPLAIN (FORMAT JSON) ${review.sql}`;
    const queryResult = await options.query(explainSql, review.parameters);
    const plan = extractPlanFromRows(queryResult.rows);
    const warnings = findSequentialScanWarnings(plan, new Set(review.protectedTables));

    results.push({
      id: review.id,
      description: review.description,
      nodeTypes: collectPlanNodeTypes(plan),
      warnings,
    });
  }

  return {
    ok: results.every((result) => result.warnings.length === 0),
    results,
  };
}

function extractPlanFromRows(rows: Array<Record<string, unknown>>): unknown {
  const rawPlan = rows[0]?.['QUERY PLAN'];
  if (Array.isArray(rawPlan)) {
    return (rawPlan[0] as Record<string, unknown> | undefined)?.Plan ?? rawPlan[0];
  }

  if (rawPlan && typeof rawPlan === 'object') {
    return (rawPlan as Record<string, unknown>).Plan ?? rawPlan;
  }

  return null;
}

function normalizePlanNode(plan: unknown): JsonPlanNode | null {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  const node = plan as JsonPlanNode;
  if ('Plan' in node && node.Plan && typeof node.Plan === 'object') {
    return node.Plan as JsonPlanNode;
  }

  return node;
}

function findSequentialScanWarnings(
  plan: unknown,
  protectedTables: ReadonlySet<string>,
): string[] {
  const node = normalizePlanNode(plan);
  if (!node) {
    return [];
  }

  const warnings: string[] = [];
  if (
    node['Node Type'] === 'Seq Scan'
    && typeof node['Relation Name'] === 'string'
    && protectedTables.has(node['Relation Name'])
  ) {
    warnings.push(`Sequential scan on protected table ${node['Relation Name']}.`);
  }

  if (Array.isArray(node.Plans)) {
    for (const child of node.Plans) {
      warnings.push(...findSequentialScanWarnings(child, protectedTables));
    }
  }

  return warnings;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    process.stderr.write('Set DATABASE_URL before running query-plan review.\n');
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL enable_seqscan = off');

    const result = await runQueryPlanReview({
      query: async (sql, values) => client.query(sql, [...values]),
    });

    await client.query('COMMIT');

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
