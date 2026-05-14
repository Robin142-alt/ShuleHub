import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  CorrectLockedExamMarkDto,
  CreateExamAssessmentDto,
  CreateExamSeriesDto,
  EnterExamMarkDto,
  PublishReportCardDto,
} from './dto/exams.dto';
import { ExamsService } from './exams.service';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post('series')
  @Permissions('exams:write')
  createSeries(@Body() dto: CreateExamSeriesDto) {
    return this.examsService.createSeries(dto);
  }

  @Post('assessments')
  @Permissions('exams:write')
  createAssessment(@Body() dto: CreateExamAssessmentDto) {
    return this.examsService.createAssessment(dto);
  }

  @Post('marks')
  @Permissions('exams:enter-marks')
  enterMark(@Body() dto: EnterExamMarkDto) {
    return this.examsService.enterMark(dto);
  }

  @Patch('marks/corrections')
  @Permissions('exams:approve')
  correctLockedMark(@Body() dto: CorrectLockedExamMarkDto) {
    return this.examsService.correctLockedMark(dto);
  }

  @Post('report-cards/publish')
  @Permissions('exams:approve')
  publishReportCard(@Body() dto: PublishReportCardDto) {
    return this.examsService.publishReportCard(dto);
  }

  @Get('report-cards')
  @Permissions('exams:read')
  listReportCards(@Query('student_id') studentId?: string) {
    return this.examsService.listReportCards(studentId);
  }

  @Get('mark-sheets')
  @Permissions('exams:read')
  listMarkSheets(@Query() query: Record<string, string | undefined>) {
    return this.examsService.listMarkSheets(query);
  }
}
