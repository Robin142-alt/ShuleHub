import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectPlanNodeTypes,
  QUERY_PLAN_REVIEWS,
  runQueryPlanReview,
  validateQueryPlanReviews,
} from './query-plan-review';

test('query plan reviews cover active search hotspots and exclude retired attendance', () => {
  const reviewIds = QUERY_PLAN_REVIEWS.map((review) => review.id);

  assert.ok(reviewIds.includes('students-directory-search'));
  assert.ok(reviewIds.includes('admissions-application-search'));
  assert.ok(reviewIds.includes('inventory-item-search'));
  assert.ok(reviewIds.includes('academics-teacher-assignment-lookup'));
  assert.ok(reviewIds.includes('exam-marks-student-series'));
  assert.ok(reviewIds.includes('student-fee-allocation-history'));
  assert.ok(reviewIds.includes('support-status-subscription-queue'));
  assert.ok(reviewIds.includes('hr-staff-profile-directory'));
  assert.ok(reviewIds.includes('library-catalog-search'));
  assert.ok(reviewIds.includes('timetable-slot-lookup'));
  assert.ok(reviewIds.includes('support-ticket-search'));
  assert.equal(reviewIds.some((id) => id.includes('attendance')), false);
  assert.deepEqual(validateQueryPlanReviews(QUERY_PLAN_REVIEWS), []);
});

test('query plan validation rejects retired attendance reviews', () => {
  const errors = validateQueryPlanReviews([
    ...QUERY_PLAN_REVIEWS,
    {
      id: 'attendance-history-search',
      description: 'Retired attendance search path',
      sql: 'SELECT * FROM attendance_records WHERE tenant_id = $1',
      parameters: ['tenant-a'],
      protectedTables: ['attendance_records'],
    },
  ]);

  assert.deepEqual(errors, [
    'Query plan review attendance-history-search references retired attendance functionality.',
  ]);
});

test('collectPlanNodeTypes walks nested JSON plans', () => {
  const nodeTypes = collectPlanNodeTypes({
    'Node Type': 'Nested Loop',
    Plans: [
      { 'Node Type': 'Bitmap Index Scan' },
      {
        'Node Type': 'Hash Join',
        Plans: [{ 'Node Type': 'Index Scan' }],
      },
    ],
  });

  assert.deepEqual(nodeTypes, ['Nested Loop', 'Bitmap Index Scan', 'Hash Join', 'Index Scan']);
});

test('runQueryPlanReview flags sequential scans on protected tables', async () => {
  const result = await runQueryPlanReview({
    reviews: [
      {
        id: 'students-directory-search',
        description: 'Student directory search',
        sql: 'SELECT * FROM students WHERE tenant_id = $1',
        parameters: ['tenant-a'],
        protectedTables: ['students'],
      },
    ],
    query: async () => ({
      rows: [
        {
          'QUERY PLAN': [
            {
              Plan: {
                'Node Type': 'Seq Scan',
                'Relation Name': 'students',
              },
            },
          ],
        },
      ],
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.results[0]?.warnings, [
    'Sequential scan on protected table students.',
  ]);
});

test('runQueryPlanReview passes index-backed plans', async () => {
  const result = await runQueryPlanReview({
    reviews: [
      {
        id: 'support-ticket-search',
        description: 'Support ticket search',
        sql: 'SELECT * FROM support_tickets WHERE tenant_id = $1',
        parameters: ['tenant-a'],
        protectedTables: ['support_tickets'],
      },
    ],
    query: async (sql, values) => {
      assert.match(sql, /^EXPLAIN \(FORMAT JSON\)/);
      assert.deepEqual(values, ['tenant-a']);

      return {
        rows: [
          {
            'QUERY PLAN': [
              {
                Plan: {
                  'Node Type': 'Bitmap Heap Scan',
                  'Relation Name': 'support_tickets',
                  Plans: [
                    {
                      'Node Type': 'Bitmap Index Scan',
                      'Index Name': 'ix_support_tickets_search_vector',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.results[0]?.nodeTypes, [
    'Bitmap Heap Scan',
    'Bitmap Index Scan',
  ]);
});
