import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { TenantInvitationsService } from '../../auth/tenant-invitations.service';
import { StudentsService } from '../students/students.service';
import {
  createCsvReportArtifact,
  type ReportCsvValue,
} from '../../common/reports/report-csv-artifact';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { UploadMalwareScanService } from '../../common/uploads/upload-malware-scan.service';
import { validateUploadedFile } from '../../common/uploads/upload-policy';
import { DatabaseService } from '../../database/database.service';
import { EventPublisherService } from '../events/event-publisher.service';
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
import { AdmissionsRepository } from './repositories/admissions.repository';
import {
  AdmissionDocumentStorageService,
  UploadedBinaryFile,
} from './storage/local-document-storage.service';

type AcademicLifecycleAction = 'promotion' | 'graduation' | 'archive';

interface AcademicEnrollmentRecord {
  id: string;
  student_id?: string;
  application_id: string;
  class_section_id?: string | null;
  class_name: string;
  stream_name: string;
  academic_year: string;
  status: string;
}

interface AcademicClassSectionRecord {
  id?: string | null;
  class_name: string;
  stream_name: string;
  academic_year: string;
  capacity?: number | string | null;
  current_enrollments?: number | string | null;
}

type AdmissionsReportExportDefinition = {
  id: string;
  title: string;
  filename: string;
  headers: string[];
  rows: (repository: AdmissionsRepository, tenantId: string) => Promise<ReportCsvValue[][]>;
};

function formatReportValue(value: ReportCsvValue) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') {
    return value;
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const ADMISSIONS_REPORT_EXPORTS = new Map<string, AdmissionsReportExportDefinition>([
  [
    'applications',
    {
      id: 'applications',
      title: 'Applications register',
      filename: 'admissions-applications.csv',
      headers: ['Applicant', 'Application No', 'Class', 'Parent Phone', 'Status'],
      rows: async (repository, tenantId) =>
        (await repository.listApplications(tenantId, { limit: 5000 })).map((application) => [
          application.full_name,
          application.application_number,
          application.class_applying,
          application.parent_phone,
          formatReportValue(application.status),
        ]),
    },
  ],
  [
    'documents',
    {
      id: 'documents',
      title: 'Document compliance',
      filename: 'admissions-documents.csv',
      headers: ['Learner', 'Document', 'File', 'Uploaded On', 'Verification'],
      rows: async (repository, tenantId) =>
        (await repository.listDocuments(tenantId)).map((document) => [
          document.student_name ?? document.applicant_name ?? 'Unassigned learner',
          document.document_type,
          document.original_file_name,
          formatReportValue(document.created_at),
          formatReportValue(document.verification_status),
        ]),
    },
  ],
  [
    'allocations',
    {
      id: 'allocations',
      title: 'Allocation report',
      filename: 'admissions-allocations.csv',
      headers: ['Student', 'Class', 'Stream', 'Dormitory', 'Route', 'Status'],
      rows: async (repository, tenantId) =>
        (await repository.listAllocations(tenantId)).map((allocation) => [
          [allocation.first_name, allocation.last_name].filter(Boolean).join(' '),
          allocation.class_name,
          allocation.stream_name,
          allocation.dormitory_name ?? 'Day school',
          allocation.transport_route ?? 'Not assigned',
          'Assigned',
        ]),
    },
  ],
  [
    'transfers',
    {
      id: 'transfers',
      title: 'Transfer history',
      filename: 'admissions-transfers.csv',
      headers: ['Learner Ref', 'Application Ref', 'Direction', 'School', 'Date', 'Status'],
      rows: async (repository, tenantId) =>
        (await repository.listTransfers(tenantId)).map((transfer) => [
          transfer.student_id ?? 'No student linked',
          transfer.application_id ?? 'No application linked',
          formatReportValue(transfer.transfer_type),
          transfer.school_name,
          formatReportValue(transfer.requested_on),
          formatReportValue(transfer.status),
        ]),
    },
  ],
]);

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly admissionsRepository: AdmissionsRepository,
    private readonly documentStorage: AdmissionDocumentStorageService,
    private readonly studentsService: StudentsService,
    @Optional() private readonly tenantInvitationsService?: TenantInvitationsService,
    @Optional() private readonly eventPublisher?: EventPublisherService,
    @Optional() private readonly uploadMalwareScan?: UploadMalwareScanService,
  ) {}

  async getSummary() {
    return this.admissionsRepository.buildSummary(this.requireTenantId());
  }

  async listApplications(query: ListAdmissionsQueryDto) {
    return this.admissionsRepository.listApplications(this.requireTenantId(), {
      search: query.search?.trim() || undefined,
      status: query.status?.trim() || undefined,
      limit: query.limit ?? 50,
    });
  }

  async createApplication(dto: CreateApplicationDto) {
    return this.admissionsRepository.createApplication({
      tenant_id: this.requireTenantId(),
      application_number: this.buildNumber('APP'),
      full_name: dto.full_name.trim(),
      date_of_birth: dto.date_of_birth,
      gender: dto.gender.trim(),
      birth_certificate_number: dto.birth_certificate_number.trim(),
      nationality: dto.nationality.trim(),
      previous_school: dto.previous_school?.trim() || null,
      kcpe_results: dto.kcpe_results?.trim() || null,
      cbc_level: dto.cbc_level?.trim() || null,
      class_applying: dto.class_applying.trim(),
      parent_name: dto.parent_name.trim(),
      parent_phone: dto.parent_phone.trim(),
      parent_email: dto.parent_email?.trim() || null,
      parent_occupation: dto.parent_occupation?.trim() || null,
      relationship: dto.relationship.trim(),
      allergies: dto.allergies?.trim() || null,
      conditions: dto.conditions?.trim() || null,
      emergency_contact: dto.emergency_contact?.trim() || null,
      status: 'pending',
      interview_date: null,
      review_notes: null,
    });
  }

  async updateApplication(applicationId: string, dto: UpdateApplicationDto) {
    const application = await this.admissionsRepository.updateApplication(
      this.requireTenantId(),
      applicationId,
      {
        status: dto.status?.trim(),
        review_notes: dto.review_notes?.trim(),
        interview_date: dto.interview_date,
      },
    );

    if (!application) {
      throw new NotFoundException(`Admission application "${applicationId}" was not found`);
    }

    return application;
  }

  async storeApplicationDocument(
    applicationId: string,
    dto: UploadApplicationDocumentDto,
    file: UploadedBinaryFile,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A document file is required for upload');
    }

    const scannedFile = await this.scanUploadedDocument(file);

    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const application = await this.admissionsRepository.findApplicationById(tenantId, applicationId);

      if (!application) {
        throw new NotFoundException(`Admission application "${applicationId}" was not found`);
      }

      const persistedFile = await this.documentStorage.save({
        tenantId,
        scope: 'admissions',
        file: scannedFile,
      });

      return this.admissionsRepository.saveDocumentRecord({
        tenant_id: tenantId,
        application_id: applicationId,
        student_id: null,
        document_type: dto.document_type.trim(),
        original_file_name: persistedFile.original_file_name,
        stored_path: persistedFile.stored_path,
        mime_type: persistedFile.mime_type,
        size_bytes: persistedFile.size_bytes,
        verification_status: 'pending',
        uploaded_by_user_id:
          dto.uploaded_by_user_id?.trim() || this.requestContext.getStore()?.user_id || null,
      });
    });
  }

  private async scanUploadedDocument(file: UploadedBinaryFile): Promise<UploadedBinaryFile> {
    validateUploadedFile(file);

    const providerMalwareScan = await this.uploadMalwareScan?.scanIfConfigured(file);

    if (!providerMalwareScan) {
      return file;
    }

    const scannedFile = { ...file, providerMalwareScan };
    validateUploadedFile(scannedFile);
    return scannedFile;
  }

  async registerApprovedApplication(applicationId: string, dto: RegisterApplicationDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const application = await this.admissionsRepository.findApplicationByIdForUpdate(
        tenantId,
        applicationId,
      );

      if (!application) {
        throw new NotFoundException(`Admission application "${applicationId}" was not found`);
      }

      if (application.status === 'registered' && application.admitted_student_id) {
        const student = await this.studentsService.getStudent(application.admitted_student_id);
        const allocation = await this.admissionsRepository.findCurrentAllocationByStudentId(
          tenantId,
          application.admitted_student_id,
        );

        return {
          student,
          allocation,
          academic_enrollment: null,
          subject_enrollments: [],
          timetable_enrollments: [],
          parent_invitation: null,
          guardian_link: null,
          fee_assignment: null,
          fee_invoice: null,
          application_status: 'registered',
        };
      }

      if (application.status !== 'approved') {
        throw new BadRequestException('Only approved applications can be registered');
      }

      const className = dto.class_name.trim();
      const streamName = dto.stream_name.trim();
      const academicClassSection = await this.admissionsRepository.findAcademicClassSectionForUpdate(
        tenantId,
        className,
        streamName,
      );
      this.assertAcademicCapacityAvailable(className, streamName, academicClassSection);

      const nameParts = this.splitName(application.full_name);
      const student = await this.studentsService.createStudent({
        admission_number: dto.admission_number.trim(),
        first_name: nameParts.first_name,
        last_name: nameParts.last_name,
        middle_name: nameParts.middle_name ?? undefined,
        status: 'active',
        date_of_birth: application.date_of_birth,
        gender: this.mapApplicationGender(application.gender),
        primary_guardian_name: application.parent_name,
        primary_guardian_phone: application.parent_phone,
        metadata: {
          admissions: {
            application_id: application.id,
            class_applying: application.class_applying,
            previous_school: application.previous_school,
            kcpe_results: application.kcpe_results,
            cbc_level: application.cbc_level,
            nationality: application.nationality,
            medical: {
              allergies: application.allergies,
              conditions: application.conditions,
              emergency_contact: application.emergency_contact,
            },
            guardian: {
              parent_name: application.parent_name,
              parent_email: application.parent_email,
              parent_occupation: application.parent_occupation,
              relationship: application.relationship,
            },
          },
        },
      });

      await this.admissionsRepository.markApplicationRegistered(tenantId, applicationId, student.id);
      await this.admissionsRepository.attachApplicationDocumentsToStudent(
        tenantId,
        applicationId,
        student.id,
      );
      const allocation = await this.admissionsRepository.createAllocation({
        tenant_id: tenantId,
        student_id: student.id,
        class_name: className,
        stream_name: streamName,
        dormitory_name: dto.dormitory_name?.trim() || null,
        transport_route: dto.transport_route?.trim() || null,
        effective_from: new Date().toISOString().slice(0, 10),
      });
      const academicEnrollment = await this.createAcademicEnrollment(
        tenantId,
        application.id,
        student.id,
        className,
        streamName,
        academicClassSection,
      );
      await this.publishAcademicEnrollmentCreated(tenantId, student.id, academicEnrollment);
      const subjectTimetableEnrollment = await this.enrollSubjectsAndTimetable(
        tenantId,
        student.id,
        academicEnrollment,
        academicClassSection,
      );
      const parentInvitation = await this.inviteParentPortalUser(application);
      const guardianLink = await this.linkParentGuardian(
        tenantId,
        student.id,
        application,
        parentInvitation,
      );
      const feeRegistration = await this.assignRegistrationFees(
        tenantId,
        application,
        student.id,
        dto.class_name.trim(),
      );

      return {
        student,
        allocation,
        academic_enrollment: academicEnrollment,
        subject_enrollments: subjectTimetableEnrollment.subject_enrollments,
        timetable_enrollments: subjectTimetableEnrollment.timetable_enrollments,
        parent_invitation: parentInvitation,
        guardian_link: guardianLink,
        fee_assignment: feeRegistration?.assignment ?? null,
        fee_invoice: feeRegistration?.invoice ?? null,
        application_status: 'registered',
      };
    });
  }

  async listStudents(query: ListAdmissionsQueryDto) {
    return this.admissionsRepository.listStudentDirectory(this.requireTenantId(), {
      search: query.search?.trim() || undefined,
      limit: query.limit ?? 50,
    });
  }

  async getStudentProfile(studentId: string) {
    const profile = await this.admissionsRepository.getStudentProfile(this.requireTenantId(), studentId);

    if (!profile) {
      throw new NotFoundException(`Student "${studentId}" was not found`);
    }

    return profile;
  }

  async advanceStudentAcademicLifecycle(
    studentId: string,
    dto: AdvanceAcademicLifecycleDto,
  ) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const action = this.parseAcademicLifecycleAction(dto.action);
      const activeEnrollment = await this.requireActiveAcademicEnrollment(tenantId, studentId);

      if (action === 'promotion') {
        return this.promoteStudentAcademicLifecycle(tenantId, studentId, activeEnrollment, dto);
      }

      const nextStudentStatus = action === 'graduation' ? 'graduated' : 'inactive';
      const completedEnrollment = await this.admissionsRepository.completeStudentAcademicEnrollment(
        tenantId,
        activeEnrollment.id,
        action === 'graduation' ? 'completed' : 'withdrawn',
      );
      const student = await this.studentsService.updateStudent(studentId, {
        status: nextStudentStatus,
      });
      const lifecycleEvent = await this.recordAcademicLifecycleEvent({
        tenantId,
        studentId,
        sourceEnrollment: activeEnrollment,
        eventType: action,
        reason: dto.reason,
        notes: dto.notes,
      });
      await this.publishAcademicLifecycleChanged(
        tenantId,
        studentId,
        activeEnrollment,
        lifecycleEvent,
      );

      return {
        lifecycle_event: lifecycleEvent,
        previous_academic_enrollment: completedEnrollment ?? activeEnrollment,
        academic_enrollment: null,
        allocation: null,
        subject_enrollments: [],
        timetable_enrollments: [],
        student_status: student.status ?? nextStudentStatus,
      };
    });
  }

  async listParents() {
    return this.admissionsRepository.listParents(this.requireTenantId());
  }

  async listDocuments() {
    return this.admissionsRepository.listDocuments(this.requireTenantId());
  }

  async updateDocumentVerificationStatus(
    documentId: string,
    dto: UpdateDocumentVerificationDto,
  ) {
    const document = await this.admissionsRepository.updateDocumentVerificationStatus(
      this.requireTenantId(),
      documentId,
      dto.verification_status.trim(),
    );

    if (!document) {
      throw new NotFoundException(`Admissions document "${documentId}" was not found`);
    }

    return document;
  }

  async listAllocations() {
    return this.admissionsRepository.listAllocations(this.requireTenantId());
  }

  async assignAllocation(studentId: string, dto: CreateAllocationDto) {
    return this.admissionsRepository.createAllocation({
      tenant_id: this.requireTenantId(),
      student_id: studentId,
      class_name: dto.class_name.trim(),
      stream_name: dto.stream_name.trim(),
      dormitory_name: dto.dormitory_name?.trim() || null,
      transport_route: dto.transport_route?.trim() || null,
      effective_from: dto.effective_from ?? new Date().toISOString().slice(0, 10),
      notes: null,
    });
  }

  async listTransfers() {
    return this.admissionsRepository.listTransfers(this.requireTenantId());
  }

  async createTransfer(dto: CreateTransferRecordDto) {
    return this.admissionsRepository.createTransferRecord({
      tenant_id: this.requireTenantId(),
      student_id: dto.student_id?.trim() || null,
      application_id: dto.application_id?.trim() || null,
      transfer_type: dto.transfer_type.trim(),
      school_name: dto.school_name.trim(),
      reason: dto.reason.trim(),
      requested_on: dto.requested_on ?? new Date().toISOString().slice(0, 10),
      status: 'pending',
      notes: dto.notes?.trim() || null,
    });
  }

  async getReports() {
    return this.admissionsRepository.buildReports(this.requireTenantId());
  }

  async exportReportCsv(reportId: string) {
    const normalizedReportId = reportId.trim().toLowerCase();
    const definition = ADMISSIONS_REPORT_EXPORTS.get(normalizedReportId);

    if (!definition) {
      throw new BadRequestException(`Unknown admissions report export "${reportId}"`);
    }

    const rows = await definition.rows(this.admissionsRepository, this.requireTenantId());

    return createCsvReportArtifact({
      reportId: definition.id,
      title: definition.title,
      filename: definition.filename,
      headers: definition.headers,
      rows,
    });
  }

  private requireTenantId() {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for admissions operations');
    }

    return tenantId;
  }

  private buildNumber(prefix: string) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Date.now().toString().slice(-5);
    return `${prefix}-${date}-${suffix}`;
  }

  private mapApplicationGender(
    gender?: string | null,
  ): 'male' | 'female' | 'other' | 'undisclosed' | undefined {
    const normalized = gender?.trim().toLowerCase();

    if (
      normalized === 'male'
      || normalized === 'female'
      || normalized === 'other'
      || normalized === 'undisclosed'
    ) {
      return normalized;
    }

    return undefined;
  }

  private splitName(fullName: string) {
    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 1) {
      return {
        first_name: parts[0],
        middle_name: null,
        last_name: parts[0],
      };
    }

    if (parts.length === 2) {
      return {
        first_name: parts[0]!,
        middle_name: null,
        last_name: parts[1]!,
      };
    }

    return {
      first_name: parts[0]!,
      middle_name: parts.slice(1, -1).join(' '),
      last_name: parts.at(-1)!,
    };
  }

  private async inviteParentPortalUser(application: {
    parent_email?: string | null;
    parent_name: string;
  }) {
    const parentEmail = application.parent_email?.trim().toLowerCase();

    if (!parentEmail || !this.tenantInvitationsService) {
      return null;
    }

    return this.tenantInvitationsService.inviteTenantUser({
      email: parentEmail,
      display_name: application.parent_name.trim(),
      role_code: 'parent',
    });
  }

  private async linkParentGuardian(
    tenantId: string,
    studentId: string,
    application: {
      parent_email?: string | null;
      parent_name: string;
      parent_phone: string;
      relationship: string;
    },
    parentInvitation: { id?: string } | null,
  ) {
    const parentEmail = application.parent_email?.trim().toLowerCase();

    if (!parentEmail || !parentInvitation?.id) {
      return null;
    }

    return this.admissionsRepository.upsertStudentGuardianLink({
      tenant_id: tenantId,
      student_id: studentId,
      invitation_id: parentInvitation.id,
      display_name: application.parent_name.trim(),
      email: parentEmail,
      phone: application.parent_phone.trim(),
      relationship: application.relationship.trim(),
    });
  }

  private async assignRegistrationFees(
    tenantId: string,
    application: { id: string },
    studentId: string,
    className: string,
  ) {
    const feeStructure = await this.admissionsRepository.findActiveFeeStructureForClass(
      tenantId,
      className,
    );

    if (!feeStructure) {
      return null;
    }

    const dueDays = Number(feeStructure.due_days_after_registration ?? 14);
    const dueDate = this.addDays(new Date(), Number.isFinite(dueDays) ? dueDays : 14)
      .toISOString()
      .slice(0, 10);

    return this.admissionsRepository.createStudentFeeAssignmentInvoice({
      tenant_id: tenantId,
      student_id: studentId,
      application_id: application.id,
      fee_structure_id: feeStructure.id,
      invoice_number: this.buildStudentFeeInvoiceNumber(),
      description: feeStructure.description,
      currency_code: feeStructure.currency_code,
      amount_minor: feeStructure.amount_minor,
      due_date: dueDate,
    });
  }

  private buildStudentFeeInvoiceNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `SF-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private addDays(value: Date, days: number) {
    return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private assertAcademicCapacityAvailable(
    className: string,
    streamName: string,
    classSection: { capacity?: number | string | null; current_enrollments?: number | string | null } | null,
  ) {
    if (!classSection?.capacity) {
      return;
    }

    const capacity = Number(classSection.capacity);
    const currentEnrollments = Number(classSection.current_enrollments ?? 0);

    if (Number.isFinite(capacity) && Number.isFinite(currentEnrollments) && currentEnrollments >= capacity) {
      throw new BadRequestException(`Class section "${className} ${streamName}" is at capacity`);
    }
  }

  private parseAcademicLifecycleAction(action: string): AcademicLifecycleAction {
    const normalized = action?.trim() as AcademicLifecycleAction;

    if (!['promotion', 'graduation', 'archive'].includes(normalized)) {
      throw new BadRequestException('Academic lifecycle action must be promotion, graduation, or archive');
    }

    return normalized;
  }

  private async requireActiveAcademicEnrollment(
    tenantId: string,
    studentId: string,
  ): Promise<AcademicEnrollmentRecord> {
    const activeEnrollment = await this.admissionsRepository.findActiveAcademicEnrollmentForUpdate(
      tenantId,
      studentId,
    );

    if (!activeEnrollment?.id) {
      throw new BadRequestException(`No active academic enrollment found for student "${studentId}"`);
    }

    return activeEnrollment as AcademicEnrollmentRecord;
  }

  private async promoteStudentAcademicLifecycle(
    tenantId: string,
    studentId: string,
    activeEnrollment: AcademicEnrollmentRecord,
    dto: AdvanceAcademicLifecycleDto,
  ) {
    const className = dto.class_name?.trim();
    const streamName = dto.stream_name?.trim();

    if (!className || !streamName) {
      throw new BadRequestException('Promotion requires a target class_name and stream_name');
    }

    const targetClassSection = await this.admissionsRepository.findAcademicClassSectionForUpdate(
      tenantId,
      className,
      streamName,
    ) as AcademicClassSectionRecord | null;
    this.assertAcademicCapacityAvailable(className, streamName, targetClassSection);

    if (
      targetClassSection?.academic_year
      && targetClassSection.academic_year === activeEnrollment.academic_year
    ) {
      throw new BadRequestException('Promotion target must be in a different academic year');
    }

    const completedEnrollment = await this.admissionsRepository.completeStudentAcademicEnrollment(
      tenantId,
      activeEnrollment.id,
      'completed',
    );
    const nextEnrollment = await this.createAcademicEnrollment(
      tenantId,
      activeEnrollment.application_id,
      studentId,
      className,
      streamName,
      targetClassSection,
    );
    await this.publishAcademicEnrollmentCreated(tenantId, studentId, nextEnrollment);
    const subjectTimetableEnrollment = await this.enrollSubjectsAndTimetable(
      tenantId,
      studentId,
      nextEnrollment,
      targetClassSection,
    );
    const allocation = await this.admissionsRepository.createAllocation({
      tenant_id: tenantId,
      student_id: studentId,
      class_name: className,
      stream_name: streamName,
      effective_from: new Date().toISOString().slice(0, 10),
      notes: this.normalizeLifecycleReason(dto.reason),
    });
    const lifecycleEvent = await this.recordAcademicLifecycleEvent({
      tenantId,
      studentId,
      sourceEnrollment: activeEnrollment,
      targetEnrollment: nextEnrollment,
      targetClassSection,
      eventType: 'promotion',
      reason: dto.reason,
      notes: dto.notes,
    });
    await this.publishAcademicLifecycleChanged(
      tenantId,
      studentId,
      activeEnrollment,
      lifecycleEvent,
      nextEnrollment,
    );

    return {
      lifecycle_event: lifecycleEvent,
      previous_academic_enrollment: completedEnrollment ?? activeEnrollment,
      academic_enrollment: nextEnrollment,
      allocation,
      subject_enrollments: subjectTimetableEnrollment.subject_enrollments,
      timetable_enrollments: subjectTimetableEnrollment.timetable_enrollments,
      student_status: 'active',
    };
  }

  private async publishAcademicEnrollmentCreated(
    tenantId: string,
    studentId: string,
    academicEnrollment: {
      id?: string | null;
      application_id?: string | null;
      class_section_id?: string | null;
      class_name?: string | null;
      stream_name?: string | null;
      academic_year?: string | null;
      status?: string | null;
    } | null,
  ) {
    if (!this.eventPublisher || !academicEnrollment?.id) {
      return null;
    }

    return this.eventPublisher.publish({
      event_key: `student.academic_enrollment.created:${academicEnrollment.id}`,
      event_name: 'student.academic_enrollment.created',
      aggregate_type: 'student_academic_enrollment',
      aggregate_id: academicEnrollment.id,
      payload: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_enrollment_id: academicEnrollment.id,
        application_id: academicEnrollment.application_id ?? null,
        class_section_id: academicEnrollment.class_section_id ?? null,
        class_name: academicEnrollment.class_name ?? 'Unassigned',
        stream_name: academicEnrollment.stream_name ?? 'Unassigned',
        academic_year: academicEnrollment.academic_year ?? new Date().getUTCFullYear().toString(),
        status: academicEnrollment.status ?? 'active',
        occurred_at: new Date().toISOString(),
      },
    });
  }

  private async publishAcademicLifecycleChanged(
    tenantId: string,
    studentId: string,
    sourceEnrollment: AcademicEnrollmentRecord,
    lifecycleEvent: {
      id?: string | null;
      event_type?: AcademicLifecycleAction | string | null;
      target_enrollment_id?: string | null;
      to_class_name?: string | null;
      to_stream_name?: string | null;
      to_academic_year?: string | null;
      reason?: string | null;
    } | null,
    targetEnrollment?: {
      id?: string | null;
      class_name?: string | null;
      stream_name?: string | null;
      academic_year?: string | null;
    } | null,
  ) {
    if (!this.eventPublisher || !lifecycleEvent?.id) {
      return null;
    }

    const eventType = this.parseAcademicLifecycleAction(lifecycleEvent.event_type ?? '');

    return this.eventPublisher.publish({
      event_key: `student.academic_lifecycle.changed:${lifecycleEvent.id}`,
      event_name: 'student.academic_lifecycle.changed',
      aggregate_type: 'student_academic_lifecycle_event',
      aggregate_id: lifecycleEvent.id,
      payload: {
        tenant_id: tenantId,
        student_id: studentId,
        lifecycle_event_id: lifecycleEvent.id,
        event_type: eventType,
        source_enrollment_id: sourceEnrollment.id,
        target_enrollment_id: targetEnrollment?.id ?? lifecycleEvent.target_enrollment_id ?? null,
        from_class_name: sourceEnrollment.class_name,
        from_stream_name: sourceEnrollment.stream_name,
        from_academic_year: sourceEnrollment.academic_year,
        to_class_name: targetEnrollment?.class_name ?? lifecycleEvent.to_class_name ?? null,
        to_stream_name: targetEnrollment?.stream_name ?? lifecycleEvent.to_stream_name ?? null,
        to_academic_year: targetEnrollment?.academic_year ?? lifecycleEvent.to_academic_year ?? null,
        reason: this.normalizeLifecycleReason(lifecycleEvent.reason),
        occurred_at: new Date().toISOString(),
      },
    });
  }

  private async recordAcademicLifecycleEvent(input: {
    tenantId: string;
    studentId: string;
    sourceEnrollment: AcademicEnrollmentRecord;
    targetEnrollment?: { id?: string | null; class_name?: string | null; stream_name?: string | null; academic_year?: string | null } | null;
    targetClassSection?: AcademicClassSectionRecord | null;
    eventType: AcademicLifecycleAction;
    reason?: string | null;
    notes?: string | null;
  }) {
    return this.admissionsRepository.createStudentAcademicLifecycleEvent({
      tenant_id: input.tenantId,
      student_id: input.studentId,
      source_enrollment_id: input.sourceEnrollment.id,
      target_enrollment_id: input.targetEnrollment?.id ?? null,
      event_type: input.eventType,
      from_class_name: input.sourceEnrollment.class_name,
      from_stream_name: input.sourceEnrollment.stream_name,
      from_academic_year: input.sourceEnrollment.academic_year,
      to_class_section_id: input.targetClassSection?.id ?? null,
      to_class_name: input.targetEnrollment?.class_name ?? input.targetClassSection?.class_name ?? null,
      to_stream_name: input.targetEnrollment?.stream_name ?? input.targetClassSection?.stream_name ?? null,
      to_academic_year: input.targetEnrollment?.academic_year ?? input.targetClassSection?.academic_year ?? null,
      reason: this.normalizeLifecycleReason(input.reason),
      notes: input.notes?.trim() || null,
      created_by_user_id: this.requestContext.getStore()?.user_id ?? null,
    });
  }

  private normalizeLifecycleReason(reason?: string | null) {
    return reason?.trim() || 'Academic lifecycle change';
  }

  private async createAcademicEnrollment(
    tenantId: string,
    applicationId: string,
    studentId: string,
    className: string,
    streamName: string,
    classSection: { id?: string | null; academic_year?: string | null } | null,
  ) {
    return this.admissionsRepository.createStudentAcademicEnrollment({
      tenant_id: tenantId,
      student_id: studentId,
      application_id: applicationId,
      class_section_id: classSection?.id ?? null,
      class_name: className,
      stream_name: streamName,
      academic_year: classSection?.academic_year ?? new Date().getUTCFullYear().toString(),
    });
  }

  private async enrollSubjectsAndTimetable(
    tenantId: string,
    studentId: string,
    academicEnrollment: { id?: string | null } | null,
    classSection: { id?: string | null } | null,
  ) {
    if (!academicEnrollment?.id || !classSection?.id) {
      return {
        subject_enrollments: [],
        timetable_enrollments: [],
      };
    }

    return this.admissionsRepository.enrollStudentSubjectsAndTimetable({
      tenant_id: tenantId,
      student_id: studentId,
      academic_enrollment_id: academicEnrollment.id,
      class_section_id: classSection.id,
    });
  }
}
