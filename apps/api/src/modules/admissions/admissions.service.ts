import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { StudentsService } from '../students/students.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/create-application.dto';
import { ListAdmissionsQueryDto } from './dto/list-admissions-query.dto';
import {
  CreateAllocationDto,
  CreateTransferRecordDto,
  RegisterApplicationDto,
  UpdateDocumentVerificationDto,
  UploadApplicationDocumentDto,
} from './dto/register-application.dto';
import { AdmissionsRepository } from './repositories/admissions.repository';
import {
  LocalDocumentStorageService,
  UploadedBinaryFile,
} from './storage/local-document-storage.service';

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly admissionsRepository: AdmissionsRepository,
    private readonly documentStorage: LocalDocumentStorageService,
    private readonly studentsService: StudentsService,
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

    const tenantId = this.requireTenantId();
    const persistedFile = await this.documentStorage.save({
      tenantId,
      scope: 'admissions',
      file,
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
  }

  async registerApprovedApplication(applicationId: string, dto: RegisterApplicationDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const application = await this.admissionsRepository.findApplicationById(tenantId, applicationId);

      if (!application) {
        throw new NotFoundException(`Admission application "${applicationId}" was not found`);
      }

      if (application.status !== 'approved') {
        throw new BadRequestException('Only approved applications can be registered');
      }

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
      const allocation = await this.admissionsRepository.createAllocation({
        tenant_id: tenantId,
        student_id: student.id,
        class_name: dto.class_name.trim(),
        stream_name: dto.stream_name.trim(),
        dormitory_name: dto.dormitory_name?.trim() || null,
        transport_route: dto.transport_route?.trim() || null,
        effective_from: new Date().toISOString().slice(0, 10),
      });

      return {
        student,
        allocation,
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
}
