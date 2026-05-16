import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { UploadMalwareScanService } from '../../common/uploads/upload-malware-scan.service';
import { validateUploadedFile } from '../../common/uploads/upload-policy';
import {
  AcknowledgeDisciplineIncidentDto,
  AssignDisciplineIncidentDto,
  CompleteDisciplineActionDto,
  CreateCommendationDto,
  CreateDisciplineActionDto,
  CreateDisciplineCommentDto,
  CreateDisciplineIncidentDto,
  CreateOffenseCategoryDto,
  GenerateDisciplineDocumentDto,
  ListDisciplineIncidentsQueryDto,
  UpdateDisciplineStatusDto,
  UpdateDisciplineIncidentDto,
} from './dto/discipline.dto';
import {
  DisciplineIncidentEntity,
  OffenseCategoryEntity,
} from './entities/discipline.entity';
import { DisciplineRepository } from './repositories/discipline.repository';
import { DisciplineNotificationService } from './discipline-notification.service';
import { DisciplineDocumentService } from './discipline-document.service';
import {
  DisciplineAttachmentStorageService,
  UploadedDisciplineFile,
} from './storage/discipline-attachment-storage.service';

const HIGH_AUTHORITY_ROLES = new Set([
  'owner',
  'admin',
  'principal',
  'platform_owner',
  'system',
]);

@Injectable()
export class DisciplineService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly disciplineRepository: DisciplineRepository,
    @Optional() private readonly notificationService?: DisciplineNotificationService,
    @Optional() private readonly documentService?: DisciplineDocumentService,
    @Optional() private readonly attachmentStorage?: DisciplineAttachmentStorageService,
    @Optional() private readonly uploadMalwareScan?: UploadMalwareScanService,
  ) {}

  async listOffenseCategories() {
    const tenantId = this.requireTenantId();
    const schoolId = await this.resolveSchoolId();

    await this.disciplineRepository.ensureDefaultOffenseCategories({
      tenant_id: tenantId,
      school_id: schoolId,
      actor_user_id: this.actorUserId(),
    });

    return this.disciplineRepository.listOffenseCategories(tenantId);
  }

  async upsertOffenseCategory(dto: CreateOffenseCategoryDto) {
    this.assertPermission('discipline:manage');
    const tenantId = this.requireTenantId();
    const schoolId = await this.resolveSchoolId(dto.school_id);
    const category = await this.disciplineRepository.upsertOffenseCategory({
      tenant_id: tenantId,
      school_id: schoolId,
      code: this.slug(this.requireText(dto.code, 'Offense code')),
      name: this.requireText(dto.name, 'Offense name'),
      description: dto.description?.trim() || null,
      default_severity: dto.default_severity,
      default_points: Number(dto.default_points),
      default_action_type: dto.default_action_type ?? null,
      notify_parent_by_default: dto.notify_parent_by_default ?? false,
      is_positive: dto.is_positive ?? false,
      created_by_user_id: this.actorUserId(),
    });

    await this.audit({
      schoolId,
      action: 'offense_category.upserted',
      entityType: 'offense_category',
      entityId: category.id,
      metadata: { code: category.code, default_points: category.default_points },
    });

    return category;
  }

  async createIncident(dto: CreateDisciplineIncidentDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const actorUserId = this.actorUserId();
      const schoolId = await this.resolveSchoolId(dto.school_id);
      const category = await this.requireOffenseCategory(tenantId, dto.offense_category_id);
      const incidentNumber = await this.disciplineRepository.generateIncidentNumber();
      const behaviorDelta = Number(category.default_points ?? 0);
      const incident = await this.disciplineRepository.createIncident({
        tenant_id: tenantId,
        school_id: schoolId,
        student_id: dto.student_id,
        class_id: dto.class_id,
        academic_term_id: dto.academic_term_id,
        academic_year_id: dto.academic_year_id,
        offense_category_id: dto.offense_category_id,
        reporting_staff_id: dto.reporting_staff_id ?? actorUserId,
        assigned_staff_id: null,
        incident_number: incidentNumber,
        title: this.requireText(dto.title, 'Incident title'),
        severity: dto.severity || category.default_severity,
        status: dto.save_as_draft ? 'under_review' : 'reported',
        occurred_at: dto.occurred_at,
        location: dto.location?.trim() || null,
        witnesses: dto.witnesses ?? [],
        description: this.requireText(dto.description, 'Incident description'),
        action_taken: dto.action_taken?.trim() || null,
        recommendations: dto.recommendations?.trim() || null,
        behavior_points_delta: behaviorDelta,
        parent_notification_status: category.notify_parent_by_default ? 'queued' : 'not_required',
        metadata: dto.metadata ?? {},
      });

      await this.audit({
        schoolId,
        action: 'incident.created',
        entityType: 'discipline_incident',
        entityId: incident.id,
        metadata: {
          incident_number: incident.incident_number,
          severity: incident.severity,
          offense_category_id: incident.offense_category_id,
        },
      });

      if (behaviorDelta !== 0) {
        await this.disciplineRepository.createBehaviorPoint({
          tenant_id: tenantId,
          school_id: schoolId,
          student_id: incident.student_id,
          class_id: incident.class_id,
          academic_term_id: incident.academic_term_id,
          academic_year_id: incident.academic_year_id,
          source_type: 'incident',
          source_id: incident.id,
          points_delta: behaviorDelta,
          reason: category.name,
          awarded_by_user_id: actorUserId,
          metadata: { incident_number: incident.incident_number },
        });
      }

      if (category.notify_parent_by_default) {
        await this.queueIncidentNotification(incident, category);
      }

      return { incident };
    });
  }

  async listIncidents(query: ListDisciplineIncidentsQueryDto) {
    const context = this.requestContext.requireStore();
    const tenantId = this.requireTenantId();

    return this.disciplineRepository.listIncidents({
      tenant_id: tenantId,
      query,
      actor_user_id: context.user_id,
      can_read_all: this.canReadAllDiscipline(),
    });
  }

  async listParentIncidents(query: { limit?: number; offset?: number }) {
    this.assertPermission('portal:read_own_children');
    const context = this.requestContext.requireStore();

    return this.disciplineRepository.listParentIncidents({
      tenant_id: this.requireTenantId(),
      parent_user_id: context.user_id,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getIncident(incidentId: string) {
    const incident = await this.requireIncident(incidentId);
    const includeInternal = this.canManageDiscipline();
    const [actions, comments] = await Promise.all([
      this.disciplineRepository.listActions(incident.tenant_id, incident.id),
      this.disciplineRepository.listComments({
        tenant_id: incident.tenant_id,
        incident_id: incident.id,
        include_internal: includeInternal,
      }),
    ]);

    return {
      incident,
      actions,
      comments,
      internal_visible: includeInternal,
    };
  }

  async updateIncident(incidentId: string, dto: UpdateDisciplineIncidentDto) {
    return this.databaseService.withRequestTransaction(async () => {
      this.assertDisciplineWrite();
      const incident = await this.requireIncident(incidentId);
      const updated = await this.disciplineRepository.updateIncident({
        tenant_id: incident.tenant_id,
        incident_id: incident.id,
        title: dto.title === undefined ? undefined : this.requireText(dto.title, 'Incident title'),
        severity: dto.severity,
        location: this.optionalText(dto.location),
        description: dto.description === undefined ? undefined : this.requireText(dto.description, 'Incident description'),
        action_taken: this.optionalText(dto.action_taken),
        recommendations: this.optionalText(dto.recommendations),
        metadata: dto.metadata,
      });

      if (!updated) {
        throw new NotFoundException('Discipline incident was not found');
      }

      await this.audit({
        schoolId: incident.school_id,
        action: 'incident.updated',
        entityType: 'discipline_incident',
        entityId: incident.id,
        metadata: { fields: Object.keys(dto) },
      });

      return updated;
    });
  }

  async updateStatus(incidentId: string, dto: UpdateDisciplineStatusDto) {
    return this.databaseService.withRequestTransaction(async () => {
      this.assertPermission('discipline:manage');
      const incident = await this.requireIncident(incidentId);
      const next = await this.disciplineRepository.updateIncidentStatus({
        tenant_id: incident.tenant_id,
        incident_id: incident.id,
        status: dto.status,
      });

      await this.audit({
        schoolId: incident.school_id,
        action: 'incident.status_changed',
        entityType: 'discipline_incident',
        entityId: incident.id,
        metadata: { from_status: incident.status, to_status: dto.status, reason: dto.reason ?? null },
      });

      return next;
    });
  }

  async assignIncident(incidentId: string, dto: AssignDisciplineIncidentDto) {
    return this.databaseService.withRequestTransaction(async () => {
      this.assertPermission('discipline:manage');
      const incident = await this.requireIncident(incidentId);
      const next = await this.disciplineRepository.assignIncident({
        tenant_id: incident.tenant_id,
        incident_id: incident.id,
        assigned_staff_id: dto.assigned_staff_id,
      });

      await this.audit({
        schoolId: incident.school_id,
        action: 'incident.assigned',
        entityType: 'discipline_incident',
        entityId: incident.id,
        metadata: { assigned_staff_id: dto.assigned_staff_id, reason: dto.reason ?? null },
      });

      return next;
    });
  }

  async escalateIncident(incidentId: string, reason?: string) {
    return this.updateStatus(incidentId, { status: 'escalated', reason });
  }

  async resolveIncident(incidentId: string, reason?: string) {
    return this.updateStatus(incidentId, { status: 'resolved', reason });
  }

  async closeIncident(incidentId: string, reason?: string) {
    return this.updateStatus(incidentId, { status: 'closed', reason });
  }

  async createAction(incidentId: string, dto: CreateDisciplineActionDto) {
    return this.databaseService.withRequestTransaction(async () => {
      this.assertPermission('discipline:manage');
      const incident = await this.requireIncident(incidentId);
      const requiresApproval = dto.action_type === 'suspension' || dto.action_type === 'expulsion';
      const action = await this.disciplineRepository.createAction({
        ...dto,
        tenant_id: incident.tenant_id,
        school_id: incident.school_id,
        incident_id: incident.id,
        student_id: incident.student_id,
        title: this.requireText(dto.title, 'Action title'),
        created_by_user_id: this.actorUserId(),
        requires_approval: requiresApproval,
      });

      await this.audit({
        schoolId: incident.school_id,
        action: 'discipline_action.created',
        entityType: 'discipline_action',
        entityId: action.id,
        metadata: { incident_id: incident.id, action_type: action.action_type, requires_approval: requiresApproval },
      });

      return action;
    });
  }

  async completeAction(actionId: string, dto: CompleteDisciplineActionDto) {
    this.assertPermission('discipline:manage');
    const action = await this.disciplineRepository.completeAction({
      tenant_id: this.requireTenantId(),
      action_id: actionId,
      completion_notes: dto.completion_notes?.trim() || null,
    });

    if (!action) {
      throw new NotFoundException('Discipline action was not found');
    }

    await this.audit({
      schoolId: await this.resolveSchoolId(),
      action: 'discipline_action.completed',
      entityType: 'discipline_action',
      entityId: action.id,
      metadata: { completion_notes: dto.completion_notes ? '[redacted-present]' : null },
    });

    return action;
  }

  async approveAction(actionId: string) {
    this.assertPermission('discipline:approve');
    const action = await this.disciplineRepository.approveAction({
      tenant_id: this.requireTenantId(),
      action_id: actionId,
      approved_by_user_id: this.actorUserId(),
    });

    if (!action) {
      throw new NotFoundException('Discipline action was not found');
    }

    await this.audit({
      schoolId: await this.resolveSchoolId(),
      action: 'discipline_action.approved',
      entityType: 'discipline_action',
      entityId: action.id,
      metadata: { action_type: action.action_type },
    });

    return action;
  }

  async createComment(incidentId: string, dto: CreateDisciplineCommentDto) {
    const incident = await this.requireIncident(incidentId);

    if (dto.visibility === 'internal' && !this.canManageDiscipline()) {
      throw new ForbiddenException('Only discipline staff can add internal comments');
    }

    const comment = await this.disciplineRepository.createComment({
      tenant_id: incident.tenant_id,
      school_id: incident.school_id,
      incident_id: incident.id,
      author_user_id: this.actorUserId(),
      visibility: dto.visibility ?? 'public',
      body: this.requireText(dto.body, 'Comment body'),
    });

    await this.audit({
      schoolId: incident.school_id,
      action: 'discipline_comment.created',
      entityType: 'discipline_comment',
      entityId: comment.id,
      metadata: { visibility: comment.visibility },
    });

    return comment;
  }

  async uploadAttachment(
    incidentId: string,
    dto: { action_id?: string; visibility?: 'internal' | 'parent_visible' },
    file: UploadedDisciplineFile,
  ) {
    if (!this.attachmentStorage) {
      throw new BadRequestException('Discipline attachment storage is not configured');
    }

    const incident = await this.requireIncident(incidentId);
    validateUploadedFile(file);
    const scanResult = await this.uploadMalwareScan?.scanIfConfigured(file);
    const fileWithScan = {
      ...file,
      providerMalwareScan: scanResult,
    };
    const storedObject = await this.attachmentStorage.save({
      tenantId: incident.tenant_id,
      incidentId: incident.id,
      file: fileWithScan,
    });
    const attachment = await this.disciplineRepository.createAttachment({
      tenant_id: incident.tenant_id,
      school_id: incident.school_id,
      incident_id: incident.id,
      action_id: dto.action_id ?? null,
      uploaded_by_user_id: this.actorUserId(),
      file_object_id: typeof storedObject.id === 'string' ? storedObject.id : null,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      storage_path: String(storedObject.storage_path),
      visibility: dto.visibility ?? 'internal',
      scan_status: scanResult?.status ?? 'not_scanned',
    });

    await this.audit({
      schoolId: incident.school_id,
      action: 'discipline_attachment.uploaded',
      entityType: 'discipline_attachment',
      entityId: attachment.id,
      metadata: {
        incident_id: incident.id,
        mime_type: file.mimetype,
        file_size: file.size,
        visibility: attachment.visibility,
      },
    });

    return attachment;
  }

  async createCommendation(dto: CreateCommendationDto) {
    const schoolId = await this.resolveSchoolId(dto.school_id);
    const points = Number(dto.points_delta);

    if (points <= 0) {
      throw new BadRequestException('Commendation points must be positive');
    }

    const behaviorPoint = await this.disciplineRepository.createBehaviorPoint({
      tenant_id: this.requireTenantId(),
      school_id: schoolId,
      student_id: dto.student_id,
      class_id: dto.class_id,
      academic_term_id: dto.academic_term_id,
      academic_year_id: dto.academic_year_id,
      source_type: 'commendation',
      source_id: dto.student_id,
      points_delta: points,
      reason: this.requireText(dto.title, 'Commendation title'),
      awarded_by_user_id: this.actorUserId(),
      metadata: { description: dto.description },
    });

    await this.audit({
      schoolId,
      action: 'commendation.created',
      entityType: 'commendation',
      entityId: dto.student_id,
      metadata: { points_delta: points, title: dto.title },
    });

    return { behavior_point: behaviorPoint };
  }

  async getStudentBehaviorScore(studentId: string, query: {
    academic_term_id?: string;
    academic_year_id?: string;
  }) {
    return this.disciplineRepository.getBehaviorScore({
      tenant_id: this.requireTenantId(),
      student_id: studentId,
      academic_term_id: query.academic_term_id,
      academic_year_id: query.academic_year_id,
    });
  }

  async acknowledgeIncident(incidentId: string, dto: AcknowledgeDisciplineIncidentDto) {
    this.assertPermission('portal:read_own_children');
    const incident = await this.disciplineRepository.findIncidentById(
      this.requireTenantId(),
      incidentId,
    );

    if (!incident) {
      throw new NotFoundException('Discipline incident was not found');
    }

    const context = this.requestContext.requireStore();
    const linked = await this.disciplineRepository.isParentLinkedToStudent({
      tenant_id: incident.tenant_id,
      parent_user_id: context.user_id,
      student_id: incident.student_id,
    });

    if (!linked) {
      throw new ForbiddenException('Parents can only acknowledge notices for a linked child');
    }

    const acknowledgement = await this.disciplineRepository.createParentAcknowledgement({
      tenant_id: incident.tenant_id,
      school_id: incident.school_id,
      incident_id: incident.id,
      student_id: incident.student_id,
      parent_user_id: context.user_id,
      acknowledgement_note: dto.acknowledgement_note?.trim() || null,
      ip_address: context.client_ip,
      user_agent: context.user_agent,
      metadata: {},
    });

    await this.audit({
      schoolId: incident.school_id,
      action: 'parent_acknowledgement.created',
      entityType: 'discipline_incident',
      entityId: incident.id,
      metadata: { acknowledgement_note: dto.acknowledgement_note ? '[redacted-present]' : null },
    });

    return { acknowledged: true, incident_id: incident.id, acknowledgement };
  }

  async getAnalytics() {
    this.assertPermission('discipline:reports');
    const analytics = await this.disciplineRepository.getDisciplineAnalytics(
      this.requireTenantId(),
    );

    return {
      ...analytics,
      generated_at: new Date().toISOString(),
    };
  }

  async exportReport(dto: { report_type: string; format: string; filters?: Record<string, unknown> }) {
    this.assertPermission('discipline:reports');
    await this.audit({
      schoolId: await this.resolveSchoolId(),
      action: 'discipline_report.export_requested',
      entityType: 'discipline_report',
      metadata: { report_type: dto.report_type, format: dto.format, filters: dto.filters ?? {} },
    });

    return {
      status: 'queued',
      report_type: dto.report_type,
      format: dto.format,
      confidential_notes_included: false,
    };
  }

  async generateDocument(incidentId: string, dto: GenerateDisciplineDocumentDto) {
    const incident = await this.requireIncident(incidentId);
    const document = this.documentService
      ? await this.documentService.generate({ incident, dto, actorUserId: this.actorUserId() })
      : {
          status: 'generated',
          document_type: dto.document_type,
          incident_id: incident.id,
          verification_enabled: true,
        };

    await this.audit({
      schoolId: incident.school_id,
      action: 'discipline_document.generated',
      entityType: 'discipline_generated_document',
      entityId: incident.id,
      metadata: { document_type: dto.document_type },
    });

    return document;
  }

  private async requireIncident(incidentId: string): Promise<DisciplineIncidentEntity> {
    const incident = await this.disciplineRepository.findIncidentById(
      this.requireTenantId(),
      incidentId,
    );

    if (!incident) {
      throw new NotFoundException('Discipline incident was not found');
    }

    if (!this.canReadIncident(incident)) {
      throw new ForbiddenException('You cannot access this discipline incident');
    }

    return incident;
  }

  private async requireOffenseCategory(
    tenantId: string,
    offenseCategoryId: string,
  ): Promise<OffenseCategoryEntity> {
    const category = await this.disciplineRepository.findOffenseCategoryById(
      tenantId,
      offenseCategoryId,
    );

    if (!category) {
      throw new BadRequestException('Offense category is not configured');
    }

    return category;
  }

  private async queueIncidentNotification(
    incident: DisciplineIncidentEntity,
    category: OffenseCategoryEntity,
  ): Promise<void> {
    const notification = {
      tenant_id: incident.tenant_id,
      school_id: incident.school_id,
      incident_id: incident.id,
      student_id: incident.student_id,
      notification_type: 'incident_alert',
      channel: 'in_app' as const,
      title: 'Discipline notice',
      body: `A ${category.name} incident has been recorded. Please review the parent portal for details.`,
      metadata: {
        incident_number: incident.incident_number,
        severity: incident.severity,
      },
    };

    if (this.notificationService) {
      await this.notificationService.queue(notification);
      return;
    }

    await this.disciplineRepository.createNotification(notification);
  }

  private async audit(input: {
    schoolId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const context = this.requestContext.requireStore();

    await this.disciplineRepository.createAuditLog({
      tenant_id: this.requireTenantId(),
      school_id: input.schoolId,
      actor_user_id: this.actorUserId(),
      actor_role: context.role,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      ip_address: context.client_ip,
      user_agent: context.user_agent,
      metadata: input.metadata ?? {},
    });
  }

  private canReadIncident(incident: DisciplineIncidentEntity): boolean {
    const context = this.requestContext.requireStore();

    return (
      this.canReadAllDiscipline()
      || incident.reporting_staff_id === context.user_id
      || incident.assigned_staff_id === context.user_id
    );
  }

  private canReadAllDiscipline(): boolean {
    const context = this.requestContext.requireStore();

    return (
      this.hasPermission('discipline:manage')
      || this.hasPermission('discipline:reports')
      || context.permissions.includes('*:*')
      || HIGH_AUTHORITY_ROLES.has(context.role ?? '')
    );
  }

  private canManageDiscipline(): boolean {
    return this.hasPermission('discipline:manage') || this.hasPermission('*:*');
  }

  private assertDisciplineWrite(): void {
    if (!this.hasPermission('discipline:write') && !this.canManageDiscipline()) {
      throw new ForbiddenException('Discipline permission is required');
    }
  }

  private assertPermission(permission: string): void {
    if (!this.hasPermission(permission)) {
      throw new ForbiddenException('Discipline permission is required');
    }
  }

  private hasPermission(permission: string): boolean {
    const permissions = this.requestContext.requireStore().permissions;
    const [resource] = permission.split(':');

    return (
      permissions.includes('*:*')
      || permissions.includes(permission)
      || permissions.includes(`${resource}:*`)
    );
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for discipline operations');
    }

    return tenantId;
  }

  private actorUserId(): string {
    return this.requestContext.requireStore().user_id;
  }

  private async resolveSchoolId(explicitSchoolId?: string): Promise<string> {
    if (explicitSchoolId?.trim()) {
      return explicitSchoolId.trim();
    }

    const schoolId = await this.disciplineRepository.findTenantSchoolId(this.requireTenantId());

    if (!schoolId) {
      throw new BadRequestException('School profile is required before using discipline workflows');
    }

    return schoolId;
  }

  private requireText(value: string | undefined, label: string): string {
    const text = value?.trim();

    if (!text) {
      throw new BadRequestException(`${label} is required`);
    }

    return text;
  }

  private optionalText(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const text = value.trim();

    return text.length > 0 ? text : undefined;
  }

  private slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
