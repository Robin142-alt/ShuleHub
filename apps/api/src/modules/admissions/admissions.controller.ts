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
  ReportExportQueueService,
  type QueueReportExportRequest,
} from '../../common/reports/report-export-queue';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/create-application.dto';
import { ListAdmissionsQueryDto } from './dto/list-admissions-query.dto';
import {
  AdvanceAcademicLifecycleDto,
  CreateAllocationDto,
  CreateTransferRecordDto,
  RegisterApplicationDto,
  UpdateDocumentVerificationDto,
  UploadApplicationDocumentDto,
} from './dto/register-application.dto';
import { AdmissionsService } from './admissions.service';
import type { UploadedBinaryFile } from './storage/local-document-storage.service';

@Controller('admissions')
export class AdmissionsController {
  constructor(
    private readonly admissionsService: AdmissionsService,
    private readonly reportExportQueueService: ReportExportQueueService,
  ) {}

  @Get('summary')
  @Permissions('admissions:read')
  getSummary() {
    return this.admissionsService.getSummary();
  }

  @Get('applications')
  @Permissions('admissions:read')
  listApplications(@Query() query: ListAdmissionsQueryDto) {
    return this.admissionsService.listApplications(query);
  }

  @Post('applications')
  @Permissions('admissions:write')
  createApplication(@Body() dto: CreateApplicationDto) {
    return this.admissionsService.createApplication(dto);
  }

  @Patch('applications/:applicationId')
  @Permissions('admissions:write')
  updateApplication(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.admissionsService.updateApplication(applicationId, dto);
  }

  @Post('applications/:applicationId/documents')
  @Permissions('documents:write')
  @UseInterceptors(StreamingUploadInterceptor('file'))
  uploadApplicationDocument(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: UploadApplicationDocumentDto,
    @UploadedFile() file: UploadedBinaryFile,
  ) {
    return this.admissionsService.storeApplicationDocument(applicationId, dto, file);
  }

  @Post('applications/:applicationId/register')
  @Permissions('admissions:write', 'students:write')
  registerApplication(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: RegisterApplicationDto,
  ) {
    return this.admissionsService.registerApprovedApplication(applicationId, dto);
  }

  @Get('students')
  @Permissions('admissions:read')
  listStudents(@Query() query: ListAdmissionsQueryDto) {
    return this.admissionsService.listStudents(query);
  }

  @Get('students/:studentId/profile')
  @Permissions('admissions:read')
  getStudentProfile(@Param('studentId', new ParseUUIDPipe()) studentId: string) {
    return this.admissionsService.getStudentProfile(studentId);
  }

  @Post('students/:studentId/academic-lifecycle')
  @Permissions('admissions:write', 'students:write')
  advanceStudentAcademicLifecycle(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: AdvanceAcademicLifecycleDto,
  ) {
    return this.admissionsService.advanceStudentAcademicLifecycle(studentId, dto);
  }

  @Get('parents')
  @Permissions('admissions:read')
  listParents() {
    return this.admissionsService.listParents();
  }

  @Get('documents')
  @Permissions('documents:read')
  listDocuments() {
    return this.admissionsService.listDocuments();
  }

  @Patch('documents/:documentId')
  @Permissions('documents:write')
  updateDocumentVerificationStatus(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: UpdateDocumentVerificationDto,
  ) {
    return this.admissionsService.updateDocumentVerificationStatus(documentId, dto);
  }

  @Get('allocations')
  @Permissions('admissions:read')
  listAllocations() {
    return this.admissionsService.listAllocations();
  }

  @Post('allocations/:studentId')
  @Permissions('admissions:write')
  assignAllocation(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: CreateAllocationDto,
  ) {
    return this.admissionsService.assignAllocation(studentId, dto);
  }

  @Get('transfers')
  @Permissions('transfers:read')
  listTransfers() {
    return this.admissionsService.listTransfers();
  }

  @Post('transfers')
  @Permissions('transfers:write')
  createTransfer(@Body() dto: CreateTransferRecordDto) {
    return this.admissionsService.createTransfer(dto);
  }

  @Post('reports/:reportId/export-jobs')
  @Permissions('admissions:read')
  queueReportExport(
    @Param('reportId') reportId: string,
    @Body() body: QueueReportExportRequest = {},
  ) {
    return this.reportExportQueueService.enqueueCurrentRequestReportExport({
      module: 'admissions',
      report_id: reportId,
      format: body.format ?? 'csv',
      filters: body.filters,
      estimated_rows: body.estimated_rows,
    });
  }

  @Get('reports/:reportId/export')
  @Permissions('admissions:read')
  exportReport(@Param('reportId') reportId: string) {
    return this.admissionsService.exportReportCsv(reportId);
  }

  @Get('reports')
  @Permissions('admissions:read')
  getReports() {
    return this.admissionsService.getReports();
  }
}
