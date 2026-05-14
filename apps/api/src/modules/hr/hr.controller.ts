import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  ApproveLeaveRequestDto,
  ApproveStaffContractDto,
  ChangeStaffStatusDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@Controller('hr')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Post('contracts/approve')
  @Permissions('hr:write')
  approveContract(@Body() dto: ApproveStaffContractDto) {
    return this.hrService.approveContract(dto);
  }

  @Post('leave/approve')
  @Permissions('hr:write')
  approveLeave(@Body() dto: ApproveLeaveRequestDto) {
    return this.hrService.approveLeave(dto);
  }

  @Patch('staff/status')
  @Permissions('hr:write')
  changeStaffStatus(@Body() dto: ChangeStaffStatusDto) {
    return this.hrService.changeStaffStatus(dto);
  }

  @Get('staff')
  @Permissions('hr:read')
  listStaffDirectory(@Query() query: Record<string, string | undefined>) {
    return this.hrService.listStaffDirectory(query);
  }
}
