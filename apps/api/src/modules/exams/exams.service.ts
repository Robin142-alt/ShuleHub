import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import {
  CorrectLockedExamMarkDto,
  CreateExamAssessmentDto,
  CreateExamSeriesDto,
  EnterExamMarkDto,
  PublishReportCardDto,
} from './dto/exams.dto';
import { ExamsRepository } from './repositories/exams.repository';

const OFFICER_PERMISSIONS = new Set(['exams:review', 'exams:approve', '*:*']);
const OFFICER_ROLES = new Set(['owner', 'admin', 'platform_owner', 'superadmin', 'exams_officer']);

@Injectable()
export class ExamsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly repository: ExamsRepository,
  ) {}

  createSeries(dto: CreateExamSeriesDto) {
    return this.repository.createSeries({
      tenant_id: this.requireTenantId(),
      created_by_user_id: this.currentUserId(),
      academic_term_id: this.requireText(dto.academic_term_id, 'Academic term'),
      name: this.requireText(dto.name, 'Exam series name'),
      starts_on: dto.starts_on,
      ends_on: dto.ends_on,
    });
  }

  createAssessment(dto: CreateExamAssessmentDto) {
    return this.repository.createAssessment({
      tenant_id: this.requireTenantId(),
      created_by_user_id: this.currentUserId(),
      exam_series_id: this.requireText(dto.exam_series_id, 'Exam series'),
      subject_id: this.requireText(dto.subject_id, 'Subject'),
      name: this.requireText(dto.name, 'Assessment name'),
      max_score: this.requirePositiveNumber(dto.max_score, 'Max score'),
      weight: this.requirePositiveNumber(dto.weight, 'Assessment weight'),
    });
  }

  async enterMark(dto: EnterExamMarkDto) {
    const tenantId = this.requireTenantId();
    const actorUserId = this.requireUserId();

    if (!this.isExamsOfficer()) {
      const assignment = await this.repository.findTeacherAssignment({
        tenant_id: tenantId,
        teacher_user_id: actorUserId,
        academic_term_id: dto.academic_term_id,
        class_section_id: dto.class_section_id,
        subject_id: dto.subject_id,
      });

      if (!assignment) {
        throw new ForbiddenException('Teacher is not assigned to this subject and class section');
      }
    }

    const series = await this.repository.findSeriesState({
      tenant_id: tenantId,
      exam_series_id: dto.exam_series_id,
    });

    if (series && (series.locked_at || series.published_at || ['locked', 'published'].includes(series.status))) {
      throw new ForbiddenException('Exam series is locked; use an audited correction workflow');
    }

    const score = this.requireNonNegativeNumber(dto.score, 'Score');
    const mark = await this.repository.upsertMark({
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      exam_series_id: dto.exam_series_id,
      assessment_id: dto.assessment_id,
      academic_term_id: dto.academic_term_id,
      class_section_id: dto.class_section_id,
      subject_id: dto.subject_id,
      student_id: dto.student_id,
      score,
      remarks: dto.remarks?.trim() || null,
    });

    await this.repository.appendMarkAuditLog({
      tenant_id: tenantId,
      mark_id: mark.id,
      exam_series_id: dto.exam_series_id,
      assessment_id: dto.assessment_id,
      student_id: dto.student_id,
      action: 'grade.updated',
      actor_user_id: actorUserId,
      new_score: score,
      metadata: {
        class_section_id: dto.class_section_id,
        subject_id: dto.subject_id,
      },
    });

    return mark;
  }

  async correctLockedMark(dto: CorrectLockedExamMarkDto) {
    if (!this.isExamsOfficer()) {
      throw new ForbiddenException('Exam officer approval is required to correct locked marks');
    }

    const tenantId = this.requireTenantId();
    const actorUserId = this.requireUserId();
    const reason = this.requireText(dto.reason, 'Correction reason');
    const existing = await this.repository.findExistingMark({
      tenant_id: tenantId,
      mark_id: dto.mark_id,
    });

    if (!existing) {
      throw new NotFoundException(`Exam mark "${dto.mark_id}" was not found`);
    }

    const score = this.requireNonNegativeNumber(dto.score, 'Score');
    const corrected = await this.repository.correctLockedMark({
      tenant_id: tenantId,
      mark_id: dto.mark_id,
      score,
      actor_user_id: actorUserId,
    });

    await this.repository.appendMarkAuditLog({
      tenant_id: tenantId,
      mark_id: dto.mark_id,
      exam_series_id: existing.exam_series_id,
      assessment_id: existing.assessment_id,
      student_id: existing.student_id,
      action: 'grade.updated',
      actor_user_id: actorUserId,
      previous_score: existing.score,
      new_score: score,
      reason,
      metadata: {
        correction: true,
      },
    });

    return corrected;
  }

  async publishReportCard(dto: PublishReportCardDto) {
    if (!this.isExamsOfficer()) {
      throw new ForbiddenException('Exam approval permission is required to publish report cards');
    }

    const tenantId = this.requireTenantId();
    const actorUserId = this.requireUserId();
    const reportCard = await this.repository.createReportCardSnapshot({
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      exam_series_id: this.requireText(dto.exam_series_id, 'Exam series'),
      student_id: this.requireText(dto.student_id, 'Student'),
      report_snapshot_id: this.requireText(dto.report_snapshot_id, 'Report snapshot'),
      metadata: {
        published_by: actorUserId,
      },
    });

    await this.repository.appendReportCardAuditLog({
      tenant_id: tenantId,
      report_card_id: reportCard.id,
      exam_series_id: dto.exam_series_id,
      student_id: dto.student_id,
      action: 'grade.published',
      actor_user_id: actorUserId,
      metadata: {
        report_snapshot_id: dto.report_snapshot_id,
      },
    });

    return reportCard;
  }

  listReportCards(studentId?: string) {
    return this.repository.listReportCards({
      tenant_id: this.requireTenantId(),
      student_id: studentId?.trim() || undefined,
    });
  }

  listMarkSheets(query: Record<string, string | undefined> = {}) {
    const input: {
      tenant_id: string;
      teacher_user_id?: string;
      exam_series_id?: string;
      class_section_id?: string;
      subject_id?: string;
    } = {
      tenant_id: this.requireTenantId(),
    };
    const teacherUserId = this.optionalText(query.teacher_user_id);
    const examSeriesId = this.optionalText(query.exam_series_id);
    const classSectionId = this.optionalText(query.class_section_id);
    const subjectId = this.optionalText(query.subject_id);

    if (teacherUserId) input.teacher_user_id = teacherUserId;
    if (examSeriesId) input.exam_series_id = examSeriesId;
    if (classSectionId) input.class_section_id = classSectionId;
    if (subjectId) input.subject_id = subjectId;

    return this.repository.listMarkSheets(input);
  }

  private isExamsOfficer(): boolean {
    const context = this.requestContext.getStore();

    if (!context) {
      return false;
    }

    return (
      (context.role ? OFFICER_ROLES.has(context.role) : false)
      || context.permissions.some((permission) => OFFICER_PERMISSIONS.has(permission))
    );
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for exams operations');
    }

    return tenantId;
  }

  private currentUserId(): string | null {
    return this.requestContext.getStore()?.user_id ?? null;
  }

  private requireUserId(): string {
    const userId = this.currentUserId();

    if (!userId) {
      throw new UnauthorizedException('Authenticated user context is required for exams operations');
    }

    return userId;
  }

  private requireText(value: string | undefined, fieldName: string): string {
    const normalized = value?.trim() ?? '';

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private optionalText(value: string | undefined): string | undefined {
    const normalized = value?.trim() ?? '';
    return normalized || undefined;
  }

  private requirePositiveNumber(value: number, fieldName: string): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${fieldName} must be positive`);
    }

    return value;
  }

  private requireNonNegativeNumber(value: number, fieldName: string): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${fieldName} must be non-negative`);
    }

    return value;
  }
}
