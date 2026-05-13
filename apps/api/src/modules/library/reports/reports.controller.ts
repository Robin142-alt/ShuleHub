import { Controller, Get } from '@nestjs/common';

import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

@Controller('library/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Permissions('library:reports')
  getReports() {
    return this.reportsService.getReports();
  }
}
