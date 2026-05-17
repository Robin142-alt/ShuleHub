import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import {
  CreateCounsellingNoteDto,
  CreateCounsellingReferralDto,
  CreateCounsellingSessionDto,
  CreateImprovementPlanDto,
  ListCounsellingQueryDto,
  UpdateCounsellingSessionDto,
} from './dto/counselling.dto';
import { CounsellingNoteEncryptionService } from './counselling-note-encryption.service';
import { DisciplineRepository } from './repositories/discipline.repository';
import { CounsellingRepository } from './repositories/counselling.repository';
import type { CounsellingNoteEntity } from './entities/discipline.entity';

@Injectable()
export class CounsellingService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly disciplineRepository: DisciplineRepository,
    private readonly counsellingRepository: CounsellingRepository,
    private readonly noteEncryption: CounsellingNoteEncryptionService,
  ) {}

  async getDashboard() {
    this.assertCounsellingRead();
    const dashboard = await this.counsellingRepository.getCounsellingDashboard(
      this.requireTenantId(),
    );

    return {
      ...dashboard,
      generated_at: new Date().toISOString(),
    };
  }

  async listReferrals(query: ListCounsellingQueryDto) {
    this.assertCounsellingRead();

    return this.counsellingRepository.listReferrals({
      tenant_id: this.requireTenantId(),
      query,
    });
  }

  async createReferral(dto: CreateCounsellingReferralDto) {
    return this.databaseService.withRequestTransaction(async () => {
      this.assertPermission('discipline:write');
      const tenantId = this.requireTenantId();
      const schoolId = await this.resolveSchoolId(dto.school_id);
      const referral = await this.counsellingRepository.createReferral({
        ...dto,
        tenant_id: tenantId,
        school_id: schoolId,
        reason: this.requireText(dto.reason),
        referred_by_user_id: this.actorUserId(),
      });

      await this.disciplineRepository.createAuditLog({
        tenant_id: tenantId,
        school_id: schoolId,
        actor_user_id: this.actorUserId(),
        actor_role: this.requestContext.requireStore().role,
        action: 'counselling_referral.created',
        entity_type: 'counselling_referral',
        entity_id: referral.id,
        ip_address: this.requestContext.requireStore().client_ip,
        user_agent: this.requestContext.requireStore().user_agent,
        metadata: { incident_id: dto.incident_id ?? null, risk_level: dto.risk_level ?? 'medium' },
      });

      return referral;
    });
  }

  async acceptReferral(referralId: string, responseNote?: string) {
    return this.updateReferralStatus(referralId, 'accepted', responseNote);
  }

  async declineReferral(referralId: string, responseNote?: string) {
    return this.updateReferralStatus(referralId, 'declined', responseNote);
  }

  async listSessions(query: ListCounsellingQueryDto) {
    this.assertCounsellingRead();
    const context = this.requestContext.requireStore();

    return this.counsellingRepository.listSessions({
      tenant_id: this.requireTenantId(),
      query,
      can_read_all: this.hasPermission('counselling:manage') || this.hasPermission('discipline:manage'),
      actor_user_id: context.user_id,
    });
  }

  async createSession(dto: CreateCounsellingSessionDto) {
    this.assertPermission('counselling:write');
    const schoolId = await this.resolveSchoolId();

    return this.counsellingRepository.createSession({
      ...dto,
      tenant_id: this.requireTenantId(),
      school_id: schoolId,
      counsellor_user_id: this.actorUserId(),
    });
  }

  async updateSession(sessionId: string, dto: UpdateCounsellingSessionDto) {
    this.assertPermission('counselling:write');
    await this.requireSession(sessionId);
    const session = await this.counsellingRepository.updateSession({
      ...dto,
      tenant_id: this.requireTenantId(),
      session_id: sessionId,
    });

    if (!session) {
      throw new NotFoundException('Counselling session was not found');
    }

    return session;
  }

  async createNote(sessionId: string, dto: CreateCounsellingNoteDto) {
    this.assertPermission('counselling:write');
    const session = await this.requireSession(sessionId);

    if (session.counsellor_user_id !== this.actorUserId() && !this.hasPermission('counselling:manage')) {
      throw new ForbiddenException('Only the assigned counsellor can add private session notes');
    }

    const encrypted = this.noteEncryption.encrypt(dto.note);

    return this.counsellingRepository.createNote({
      ...dto,
      tenant_id: this.requireTenantId(),
      school_id: session.school_id,
      student_id: session.student_id,
      counselling_session_id: session.id,
      counsellor_user_id: this.actorUserId(),
      encrypted,
      risk_indicators: dto.risk_indicators ?? [],
    });
  }

  async listNotes(sessionId: string) {
    this.assertCounsellingRead();
    const session = await this.requireSession(sessionId);
    const notes = await this.counsellingRepository.listNotes({
      tenant_id: this.requireTenantId(),
      session_id: session.id,
    });

    return Promise.all(notes.map((note) => this.presentNote(note)));
  }

  async createImprovementPlan(dto: CreateImprovementPlanDto) {
    this.assertPermission('counselling:write');

    return this.counsellingRepository.createImprovementPlan({
      ...dto,
      tenant_id: this.requireTenantId(),
      school_id: await this.resolveSchoolId(),
      counsellor_user_id: this.actorUserId(),
    });
  }

  private async updateReferralStatus(
    referralId: string,
    status: 'accepted' | 'declined' | 'closed',
    responseNote?: string,
  ) {
    this.assertPermission('counselling:manage');
    const referral = await this.counsellingRepository.updateReferralStatus({
      tenant_id: this.requireTenantId(),
      referral_id: referralId,
      status,
      counsellor_user_id: this.actorUserId(),
      response_note: responseNote?.trim() || null,
    });

    if (!referral) {
      throw new NotFoundException('Counselling referral was not found');
    }

    return referral;
  }

  private async presentNote(note: CounsellingNoteEntity) {
    if (!(await this.canReadNote(note))) {
      return {
        id: note.id,
        visibility: note.visibility,
        safe_summary: note.safe_summary,
        redacted: true,
        created_at: note.created_at,
      };
    }

    return {
      id: note.id,
      visibility: note.visibility,
      note: this.noteEncryption.decrypt(note),
      safe_summary: note.safe_summary,
      risk_indicators: note.risk_indicators,
      redacted: false,
      created_at: note.created_at,
    };
  }

  private async canReadNote(note: CounsellingNoteEntity): Promise<boolean> {
    const context = this.requestContext.requireStore();

    if (this.hasPermission('counselling:manage') || note.counsellor_user_id === context.user_id) {
      return true;
    }

    if (note.visibility === 'discipline_office' && this.hasPermission('discipline:manage')) {
      return true;
    }

    if (note.visibility === 'parent_visible' && this.hasPermission('portal:read_own_children')) {
      return this.disciplineRepository.isParentLinkedToStudent({
        tenant_id: note.tenant_id,
        parent_user_id: context.user_id,
        student_id: note.student_id,
      });
    }

    return false;
  }

  private async requireSession(sessionId: string) {
    const session = await this.counsellingRepository.findSessionById(
      this.requireTenantId(),
      sessionId,
    );

    if (!session) {
      throw new NotFoundException('Counselling session was not found');
    }

    if (!(await this.canAccessSession(session))) {
      throw new ForbiddenException('You cannot access this counselling session');
    }

    return session;
  }

  private async canAccessSession(session: { counsellor_user_id: string; student_id: string }): Promise<boolean> {
    const context = this.requestContext.requireStore();

    if (
      this.hasPermission('counselling:manage')
      || this.hasPermission('discipline:manage')
      || session.counsellor_user_id === context.user_id
    ) {
      return true;
    }

    if (this.hasPermission('portal:read_own_children')) {
      return this.disciplineRepository.isParentLinkedToStudent({
        tenant_id: this.requireTenantId(),
        parent_user_id: context.user_id,
        student_id: session.student_id,
      });
    }

    return false;
  }

  private assertCounsellingRead(): void {
    if (
      !this.hasPermission('counselling:read')
      && !this.hasPermission('counselling:manage')
      && !this.hasPermission('discipline:manage')
      && !this.hasPermission('portal:read_own_children')
    ) {
      throw new ForbiddenException('Counselling permission is required');
    }
  }

  private assertPermission(permission: string): void {
    if (!this.hasPermission(permission)) {
      throw new ForbiddenException('Counselling permission is required');
    }
  }

  private hasPermission(permission: string): boolean {
    const permissions = this.requestContext.requireStore().permissions;
    const [resource] = permission.split(':');

    return permissions.includes('*:*') || permissions.includes(permission) || permissions.includes(`${resource}:*`);
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for counselling operations');
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
      throw new NotFoundException('School profile was not found for this tenant');
    }

    return schoolId;
  }

  private requireText(value: string): string {
    const text = value.trim();

    if (!text) {
      throw new ForbiddenException('Counselling text is required');
    }

    return text;
  }
}
