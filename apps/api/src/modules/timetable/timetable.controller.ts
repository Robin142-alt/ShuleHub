import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CreateTimetableSlotDto, PublishTimetableVersionDto } from './dto/timetable.dto';
import { TimetableService } from './timetable.service';

@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Post('slots')
  @Permissions('timetable:write')
  createSlot(@Body() dto: CreateTimetableSlotDto) {
    return this.timetableService.createSlot(dto);
  }

  @Post('versions/publish')
  @Permissions('timetable:write')
  publishVersion(@Body() dto: PublishTimetableVersionDto) {
    return this.timetableService.publishVersion(dto);
  }

  @Get('published')
  @Permissions('timetable:read')
  listPublishedSchedules(@Query() query: Record<string, string | undefined>) {
    return this.timetableService.listPublishedSchedules(query);
  }
}
