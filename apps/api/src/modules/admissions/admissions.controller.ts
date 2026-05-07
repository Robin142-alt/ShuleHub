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
import { FileInterceptor } from '@nestjs/platform-express';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/create-application.dto';
import { ListAdmissionsQueryDto } from './dto/list-admissions-query.dto';
import {
  CreateAllocationDto,
  CreateTransferRecordDto,
  RegisterApplicationDto,
  UpdateDocumentVerificationDto,
  UploadApplicationDocumentDto,
} from './dto/register-application.dto';
import { AdmissionsService } from './admissions.service';
import type { UploadedBinaryFile } from './storage/local-document-storage.service';

const { memoryStorage } = require('multer');

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

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
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
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

  @Get('reports')
  @Permissions('admissions:read')
  getReports() {
    return this.admissionsService.getReports();
  }
}
