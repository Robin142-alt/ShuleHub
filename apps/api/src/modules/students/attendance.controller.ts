import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { FeatureGate } from '../billing/decorators/feature-gate.decorator';
import { AttendanceService } from './attendance.service';
import { AttendanceRecordResponseDto } from './dto/attendance-record-response.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { UpsertAttendanceRecordDto } from './dto/upsert-attendance-record.dto';

@Controller('students')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Put(':studentId/attendance/:attendanceDate')
  @FeatureGate('attendance')
  @Permissions('attendance:write')
  async upsertAttendance(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('attendanceDate') attendanceDate: string,
    @Body() dto: UpsertAttendanceRecordDto,
  ): Promise<AttendanceRecordResponseDto> {
    return this.attendanceService.upsertStudentAttendance(studentId, attendanceDate, dto);
  }

  @Get(':studentId/attendance')
  @FeatureGate('attendance')
  @Permissions('attendance:read')
  async listAttendance(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ListAttendanceQueryDto,
  ): Promise<AttendanceRecordResponseDto[]> {
    return this.attendanceService.listStudentAttendance(studentId, query);
  }
}
