import { Controller, Get, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { ReportSnapshotRepository } from './report-snapshot.repository';

@Controller('reports')
export class ReportExportJobsController {
  constructor(private readonly reportSnapshots: ReportSnapshotRepository) {}

  @Get('export-jobs')
  @Permissions('reports:read')
  listExportJobs(@Query('limit') limit?: string) {
    return this.reportSnapshots.listCompletedExportJobs({
      limit: parsePositiveLimit(limit),
    });
  }
}

function parsePositiveLimit(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(parsed, 500);
}
