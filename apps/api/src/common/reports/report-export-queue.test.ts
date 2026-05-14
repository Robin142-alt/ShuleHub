import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SYNC_EXPORT_ROW_LIMIT,
  REPORT_EXPORT_JOB_NAME,
  REPORT_EXPORT_QUEUE_NAME,
  ReportExportQueueService,
  shouldQueueReportExport,
  validateReportExportJobPayload,
} from './report-export-queue';

test('shouldQueueReportExport keeps small exports synchronous unless forced', () => {
  assert.equal(shouldQueueReportExport({ estimated_rows: 25 }), false);
  assert.equal(
    shouldQueueReportExport({ estimated_rows: DEFAULT_SYNC_EXPORT_ROW_LIMIT + 1 }),
    true,
  );
  assert.equal(shouldQueueReportExport({ estimated_rows: 1, force_async: true }), true);
});

test('validateReportExportJobPayload rejects retired attendance export jobs', () => {
  assert.deepEqual(
    validateReportExportJobPayload({
      tenant_id: 'tenant-1',
      requested_by_user_id: 'user-1',
      request_id: 'req-1',
      module: 'attendance',
      report_id: 'daily-attendance',
      format: 'csv',
      enqueued_at: '2026-05-14T00:00:00.000Z',
    }),
    [
      'Attendance exports are retired. Use the exams or active academic modules instead.',
    ],
  );

  assert.deepEqual(
    validateReportExportJobPayload({
      tenant_id: 'tenant-1',
      requested_by_user_id: 'user-1',
      request_id: 'req-1',
      module: 'inventory',
      report_id: 'stock-valuation',
      format: 'csv',
      filters: { search: 'attendance register' },
      enqueued_at: '2026-05-14T00:00:00.000Z',
    }),
    [
      'Attendance exports are retired. Use the exams or active academic modules instead.',
    ],
  );
});

test('ReportExportQueueService enqueues report exports with a stable job contract', async () => {
  const queueCalls: Array<{
    jobName: string;
    payload: unknown;
    options: unknown;
    queueName: string;
  }> = [];
  const queueService = {
    add: async (jobName: string, payload: unknown, options: unknown, queueName: string) => {
      queueCalls.push({ jobName, payload, options, queueName });
      return {
        id: (options as { jobId: string }).jobId,
        getState: async () => 'waiting',
      };
    },
  };
  const requestContext = {
    requireStore: () => ({
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      request_id: 'req-1',
    }),
  };
  const service = new ReportExportQueueService(queueService as never, requestContext as never);

  const response = await service.enqueueCurrentRequestReportExport({
    module: 'inventory',
    report_id: 'stock-valuation',
    format: 'csv',
    estimated_rows: 50000,
    filters: { category_id: 'category-1' },
  });

  assert.equal(response.queue_name, REPORT_EXPORT_QUEUE_NAME);
  assert.equal(response.state, 'waiting');
  assert.equal(response.module, 'inventory');
  assert.equal(response.report_id, 'stock-valuation');
  assert.equal(response.format, 'csv');
  assert.equal(
    response.job_id,
    'report-exports:tenant-1:inventory:stock-valuation:req-1',
  );

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0]?.jobName, REPORT_EXPORT_JOB_NAME);
  assert.equal(queueCalls[0]?.queueName, REPORT_EXPORT_QUEUE_NAME);
  assert.deepEqual(queueCalls[0]?.payload, {
    tenant_id: 'tenant-1',
    requested_by_user_id: 'user-1',
    request_id: 'req-1',
    module: 'inventory',
    report_id: 'stock-valuation',
    format: 'csv',
    estimated_rows: 50000,
    filters: { category_id: 'category-1' },
    enqueued_at: response.queued_at,
  });
  assert.deepEqual(queueCalls[0]?.options, {
    jobId: 'report-exports:tenant-1:inventory:stock-valuation:req-1',
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
});
