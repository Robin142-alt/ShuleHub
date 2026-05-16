import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { StreamingUploadInterceptor } from '../../common/uploads/streaming-upload.interceptor';
import {
  AcknowledgeDisciplineIncidentDto,
  AssignDisciplineIncidentDto,
  CompleteDisciplineActionDto,
  CreateCommendationDto,
  CreateDisciplineActionDto,
  CreateDisciplineCommentDto,
  CreateDisciplineIncidentDto,
  CreateOffenseCategoryDto,
  ExportDisciplineReportDto,
  GenerateDisciplineDocumentDto,
  ListDisciplineIncidentsQueryDto,
  UpdateDisciplineIncidentDto,
  UpdateDisciplineStatusDto,
  UploadDisciplineAttachmentDto,
} from './dto/discipline.dto';
import { DisciplineService } from './discipline.service';
import type { UploadedDisciplineFile } from './storage/discipline-attachment-storage.service';

@Controller('discipline')
export class DisciplineController {
  constructor(private readonly disciplineService: DisciplineService) {}

  @Get('offense-categories')
  @Permissions('discipline:read')
  listOffenseCategories() {
    return this.disciplineService.listOffenseCategories();
  }

  @Post('offense-categories')
  @Permissions('discipline:manage')
  upsertOffenseCategory(@Body() dto: CreateOffenseCategoryDto) {
    return this.disciplineService.upsertOffenseCategory(dto);
  }

  @Get('incidents')
  @Permissions('discipline:read')
  listIncidents(@Query() query: ListDisciplineIncidentsQueryDto) {
    return this.disciplineService.listIncidents(query);
  }

  @Get('parent/incidents')
  @Permissions('portal:read_own_children')
  listParentIncidents(@Query() query: { limit?: number; offset?: number }) {
    return this.disciplineService.listParentIncidents(query);
  }

  @Post('incidents')
  @Permissions('discipline:write')
  createIncident(@Body() dto: CreateDisciplineIncidentDto) {
    return this.disciplineService.createIncident(dto);
  }

  @Get('incidents/:incidentId')
  @Permissions('discipline:read')
  getIncident(@Param('incidentId', new ParseUUIDPipe()) incidentId: string) {
    return this.disciplineService.getIncident(incidentId);
  }

  @Patch('incidents/:incidentId')
  @Permissions('discipline:write')
  updateIncident(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: UpdateDisciplineIncidentDto,
  ) {
    return this.disciplineService.updateIncident(incidentId, dto);
  }

  @Post('incidents/:incidentId/status')
  @Permissions('discipline:manage')
  updateStatus(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: UpdateDisciplineStatusDto,
  ) {
    return this.disciplineService.updateStatus(incidentId, dto);
  }

  @Post('incidents/:incidentId/assign')
  @Permissions('discipline:manage')
  assignIncident(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: AssignDisciplineIncidentDto,
  ) {
    return this.disciplineService.assignIncident(incidentId, dto);
  }

  @Post('incidents/:incidentId/escalate')
  @Permissions('discipline:manage')
  escalateIncident(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.disciplineService.escalateIncident(incidentId, dto.reason);
  }

  @Post('incidents/:incidentId/resolve')
  @Permissions('discipline:manage')
  resolveIncident(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.disciplineService.resolveIncident(incidentId, dto.reason);
  }

  @Post('incidents/:incidentId/close')
  @Permissions('discipline:manage')
  closeIncident(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.disciplineService.closeIncident(incidentId, dto.reason);
  }

  @Post('incidents/:incidentId/actions')
  @Permissions('discipline:manage')
  createAction(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: CreateDisciplineActionDto,
  ) {
    return this.disciplineService.createAction(incidentId, dto);
  }

  @Post('actions/:actionId/complete')
  @Permissions('discipline:manage')
  completeAction(
    @Param('actionId', new ParseUUIDPipe()) actionId: string,
    @Body() dto: CompleteDisciplineActionDto,
  ) {
    return this.disciplineService.completeAction(actionId, dto);
  }

  @Post('actions/:actionId/approve')
  @Permissions('discipline:approve')
  approveAction(@Param('actionId', new ParseUUIDPipe()) actionId: string) {
    return this.disciplineService.approveAction(actionId);
  }

  @Post('incidents/:incidentId/comments')
  @Permissions('discipline:write')
  createComment(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: CreateDisciplineCommentDto,
  ) {
    return this.disciplineService.createComment(incidentId, dto);
  }

  @Post('incidents/:incidentId/attachments')
  @Permissions('discipline:write')
  @UseInterceptors(StreamingUploadInterceptor('file'))
  uploadAttachment(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: UploadDisciplineAttachmentDto,
    @UploadedFile() file: UploadedDisciplineFile,
  ) {
    return this.disciplineService.uploadAttachment(incidentId, dto, file);
  }

  @Post('commendations')
  @Permissions('discipline:write')
  createCommendation(@Body() dto: CreateCommendationDto) {
    return this.disciplineService.createCommendation(dto);
  }

  @Get('students/:studentId/behavior-score')
  @Permissions('discipline:read')
  getStudentBehaviorScore(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: { academic_term_id?: string; academic_year_id?: string },
  ) {
    return this.disciplineService.getStudentBehaviorScore(studentId, query);
  }

  @Post('parent/incidents/:incidentId/acknowledge')
  @Permissions('portal:read_own_children')
  acknowledgeIncident(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: AcknowledgeDisciplineIncidentDto,
  ) {
    return this.disciplineService.acknowledgeIncident(incidentId, dto);
  }

  @Get('analytics/overview')
  @Permissions('discipline:reports')
  getAnalytics() {
    return this.disciplineService.getAnalytics();
  }

  @Post('reports/export')
  @Permissions('discipline:reports')
  exportReport(@Body() dto: ExportDisciplineReportDto) {
    return this.disciplineService.exportReport(dto);
  }

  @Post('incidents/:incidentId/documents')
  @Permissions('discipline:manage')
  generateDocument(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: GenerateDisciplineDocumentDto,
  ) {
    return this.disciplineService.generateDocument(incidentId, dto);
  }
}
