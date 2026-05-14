import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { AcademicsService } from './academics.service';
import {
  AssignTeacherDto,
  CreateAcademicTermDto,
  CreateAcademicYearDto,
  CreateClassSectionDto,
  CreateSubjectDto,
} from './dto/academic.dto';

@Controller('academics')
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Post('years')
  @Permissions('academics:write')
  createAcademicYear(@Body() dto: CreateAcademicYearDto) {
    return this.academicsService.createAcademicYear(dto);
  }

  @Post('terms')
  @Permissions('academics:write')
  createAcademicTerm(@Body() dto: CreateAcademicTermDto) {
    return this.academicsService.createAcademicTerm(dto);
  }

  @Post('class-sections')
  @Permissions('academics:write')
  createClassSection(@Body() dto: CreateClassSectionDto) {
    return this.academicsService.createClassSection(dto);
  }

  @Post('subjects')
  @Permissions('academics:write')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.academicsService.createSubject(dto);
  }

  @Post('teacher-assignments')
  @Permissions('academics:assign-teachers')
  assignTeacher(@Body() dto: AssignTeacherDto) {
    return this.academicsService.assignTeacher(dto);
  }

  @Get('teacher-assignments')
  @Permissions('academics:read')
  listTeacherAssignments(@Query('teacher_user_id') teacherUserId?: string) {
    return this.academicsService.listTeacherAssignments(teacherUserId);
  }
}
