import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { UploadMalwareScanService } from '../../common/uploads/upload-malware-scan.service';
import { validateUploadedFile } from '../../common/uploads/upload-policy';
import { DatabaseService } from '../../database/database.service';
import {
  AssignTicketDto,
  CreateInternalNoteDto,
  CreateSupportMessageDto,
  CreateSupportTicketDto,
  KnowledgeBaseQueryDto,
  ListSupportTicketsQueryDto,
  MergeTicketsDto,
  SupportPriority,
  SupportStatus,
  UpdateTicketStatusDto,
  UploadTicketAttachmentDto,
} from './dto/support.dto';
import {
  SupportCategoryRecord,
  SupportRepository,
  SupportTicketRecord,
} from './repositories/support.repository';
import {
  SupportAttachmentStorageService,
  UploadedSupportFile,
} from './storage/support-attachment-storage.service';
import { SupportNotificationDeliveryService } from './support-notification-delivery.service';

const SUPPORT_OPERATOR_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'support_agent',
  'support_lead',
  'developer',
  'system',
]);

@Injectable()
export class SupportService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly supportRepository: SupportRepository,
    private readonly attachmentStorage: SupportAttachmentStorageService,
    @Optional() private readonly notificationDelivery?: SupportNotificationDeliveryService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly uploadMalwareScan?: UploadMalwareScanService,
  ) {}

  async getCategories() {
    const tenantId = this.currentTenantOrGlobal();

    await this.supportRepository.ensureDefaultCategories(tenantId);
    return this.supportRepository.listCategories(tenantId);
  }

  async createTicket(dto: CreateSupportTicketDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const actorUserId = this.getActorUserId();
      const subject = this.requireText(dto.subject, 'Ticket subject');
      const description = this.requireText(dto.description, 'Ticket description');
      const categoryName = this.requireText(dto.category, 'Ticket category');
      const priority = dto.priority;

      await this.supportRepository.ensureDefaultCategories(tenantId);
      const category = await this.supportRepository.findCategoryByName(tenantId, categoryName);
      const ticketNumber = await this.supportRepository.generateTicketNumber();
      const startedAt = this.getRequestStartedAt();
      const status: SupportStatus = priority === 'Critical' ? 'Escalated' : 'Open';
      const ticket = await this.supportRepository.createTicket({
        tenant_id: tenantId,
        ticket_number: ticketNumber,
        subject,
        category: category?.name ?? categoryName,
        priority,
        module_affected: this.requireText(dto.module_affected, 'Affected module'),
        description,
        status,
        requester_user_id: actorUserId,
        assigned_agent_id: null,
        first_response_due_at: this.addMinutes(startedAt, category?.response_sla_minutes ?? this.defaultResponseSla(priority)),
        resolution_due_at: this.addMinutes(startedAt, category?.resolution_sla_minutes ?? this.defaultResolutionSla(priority)),
        context: this.buildDiagnosticContext(dto),
      });
      const initialMessage = await this.supportRepository.createMessage({
        tenant_id: tenantId,
        ticket_id: ticket.id,
        author_user_id: actorUserId,
        author_type: 'school',
        body: description,
      });

      await this.supportRepository.createStatusLog({
        tenant_id: tenantId,
        ticket_id: ticket.id,
        actor_user_id: actorUserId,
        from_status: null,
        to_status: ticket.status,
        action: 'ticket.created',
        metadata: {
          ticket_number: ticket.ticket_number,
          priority: ticket.priority,
          category: ticket.category,
          module_affected: ticket.module_affected,
        },
      });
      await this.createAndDispatchNotifications(
        this.buildTicketCreatedNotifications(ticket, category),
      );

      return {
        ticket,
        initial_message: initialMessage,
      };
    });
  }

  async listTickets(query: ListSupportTicketsQueryDto) {
    const supportOperator = this.isSupportOperator();
    const tenantId = supportOperator
      ? query.tenant_id?.trim() || undefined
      : this.requireTenantId();

    return this.supportRepository.listTickets({
      tenantId,
      search: query.search?.trim() || undefined,
      status: query.status,
      priority: query.priority,
      module: query.module?.trim() || undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async getTicket(ticketId: string) {
    const ticket = await this.requireTicket(ticketId);
    const supportOperator = this.isSupportOperator();
    const [messages, attachments, statusLogs, internalNotes] = await Promise.all([
      this.supportRepository.listMessages(ticket.tenant_id, ticket.id),
      this.supportRepository.listAttachments(ticket.tenant_id, ticket.id),
      this.supportRepository.listStatusLogs(ticket.tenant_id, ticket.id),
      supportOperator
        ? this.supportRepository.listInternalNotes(ticket.tenant_id, ticket.id)
        : Promise.resolve([]),
    ]);

    return {
      ticket,
      messages,
      attachments,
      status_logs: statusLogs,
      internal_notes: internalNotes,
    };
  }

  async replyToTicket(ticketId: string, dto: CreateSupportMessageDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const ticket = await this.requireTicket(ticketId);
      const actorUserId = this.getActorUserId();
      const supportOperator = this.isSupportOperator();
      const authorType = supportOperator ? 'support' : 'school';
      const nextStatus = this.resolveReplyStatus(ticket, dto.next_status, supportOperator);
      const message = await this.supportRepository.createMessage({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        author_user_id: actorUserId,
        author_type: authorType,
        body: this.requireText(dto.body, 'Support message'),
      });
      let updatedTicket = ticket;

      if (supportOperator) {
        await this.supportRepository.markFirstResponseIfNeeded(ticket.id, new Date().toISOString());
      }

      if (nextStatus !== ticket.status) {
        const changedTicket = await this.supportRepository.updateTicketStatus(
          ticket.id,
          nextStatus,
          actorUserId,
        );

        if (changedTicket) {
          updatedTicket = changedTicket;
        }

        await this.supportRepository.createStatusLog({
          tenant_id: ticket.tenant_id,
          ticket_id: ticket.id,
          actor_user_id: actorUserId,
          from_status: ticket.status,
          to_status: nextStatus,
          action: this.isReopenTransition(ticket.status, nextStatus)
            ? 'ticket.reopened'
            : 'ticket.status_changed',
          metadata: {
            source: 'reply',
            author_type: authorType,
            requested_status: dto.next_status ?? null,
          },
        });
      }

      await this.createAndDispatchNotifications(
        supportOperator
          ? this.buildSchoolReplyNotifications(ticket)
          : this.buildCustomerReplyNotifications(ticket),
      );

      return {
        ticket: updatedTicket,
        message,
      };
    });
  }

  async addInternalNote(ticketId: string, dto: CreateInternalNoteDto) {
    this.requireSupportOperator();

    return this.databaseService.withRequestTransaction(async () => {
      const ticket = await this.requireTicket(ticketId);
      const note = await this.supportRepository.createInternalNote({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        author_user_id: this.getActorUserId(),
        note: this.requireText(dto.note, 'Internal note'),
      });

      await this.supportRepository.createStatusLog({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        actor_user_id: this.getActorUserId(),
        from_status: ticket.status,
        to_status: ticket.status,
        action: 'ticket.internal_note_added',
        metadata: {
          private: true,
        },
      });

      return note;
    });
  }

  async updateTicketStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    this.requireSupportOperator();

    return this.databaseService.withRequestTransaction(async () => {
      const ticket = await this.requireTicket(ticketId);
      const updated = await this.supportRepository.updateTicketStatus(
        ticket.id,
        dto.status,
        this.getActorUserId(),
      );

      if (!updated) {
        throw new NotFoundException(`Support ticket "${ticketId}" was not found`);
      }

      await this.supportRepository.createStatusLog({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        actor_user_id: this.getActorUserId(),
        from_status: ticket.status,
        to_status: dto.status,
        action: 'ticket.status_changed',
        metadata: {
          reason: dto.reason?.trim() || null,
        },
      });
      await this.createAndDispatchNotifications(this.buildStatusNotifications(updated));

      return updated;
    });
  }

  async assignTicket(ticketId: string, dto: AssignTicketDto) {
    this.requireSupportOperator();

    return this.databaseService.withRequestTransaction(async () => {
      const ticket = await this.requireTicket(ticketId);
      const updated = await this.supportRepository.assignTicket(
        ticket.id,
        dto.assigned_agent_id,
        this.getActorUserId(),
      );

      if (!updated) {
        throw new NotFoundException(`Support ticket "${ticketId}" was not found`);
      }

      await this.supportRepository.createStatusLog({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        actor_user_id: this.getActorUserId(),
        from_status: ticket.status,
        to_status: ticket.status,
        action: 'ticket.assigned',
        metadata: {
          previous_assigned_agent_id: ticket.assigned_agent_id,
          assigned_agent_id: dto.assigned_agent_id,
          reassigned: ticket.assigned_agent_id !== dto.assigned_agent_id,
        },
      });

      return updated;
    });
  }

  async escalateTicket(ticketId: string, reason?: string) {
    this.requireSupportOperator();
    return this.updateTicketStatus(ticketId, {
      status: 'Escalated',
      reason: reason ?? 'Manual escalation',
    });
  }

  async mergeTickets(ticketId: string, dto: MergeTicketsDto) {
    this.requireSupportOperator();

    return this.databaseService.withRequestTransaction(async () => {
      const ticket = await this.requireTicket(ticketId);
      const targetTicket = await this.requireTicket(dto.target_ticket_id);

      if (ticket.tenant_id !== targetTicket.tenant_id) {
        throw new BadRequestException('Only tickets from the same tenant can be merged');
      }

      const merged = await this.supportRepository.mergeTicket(
        ticket.id,
        targetTicket.id,
        this.getActorUserId(),
      );

      if (!merged) {
        throw new NotFoundException(`Support ticket "${ticketId}" was not found`);
      }

      await this.supportRepository.createStatusLog({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        actor_user_id: this.getActorUserId(),
        from_status: ticket.status,
        to_status: 'Closed',
        action: 'ticket.merged',
        metadata: {
          target_ticket_id: targetTicket.id,
          target_ticket_number: targetTicket.ticket_number,
          reason: dto.reason?.trim() || null,
        },
      });

      return merged;
    });
  }

  async uploadAttachment(
    ticketId: string,
    dto: UploadTicketAttachmentDto,
    file: UploadedSupportFile,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A support attachment file is required');
    }

    const scannedFile = await this.scanUploadedAttachment(file);

    return this.databaseService.withRequestTransaction(async () => {
      const ticket = await this.requireTicket(ticketId);
      const persisted = await this.attachmentStorage.save({
        tenantId: ticket.tenant_id,
        ticketId: ticket.id,
        file: scannedFile,
      });
      const attachment = await this.supportRepository.createAttachment({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        message_id: dto.message_id?.trim() || null,
        internal_note_id: dto.internal_note_id?.trim() || null,
        uploaded_by_user_id: this.getActorUserId(),
        original_file_name: persisted.original_file_name,
        stored_path: persisted.stored_path,
        mime_type: persisted.mime_type,
        size_bytes: persisted.size_bytes,
        attachment_type: dto.internal_note_id ? 'internal_note' : dto.message_id ? 'message' : 'ticket',
      });

      await this.supportRepository.createStatusLog({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        actor_user_id: this.getActorUserId(),
        from_status: ticket.status,
        to_status: ticket.status,
        action: 'ticket.attachment_uploaded',
        metadata: {
          original_file_name: persisted.original_file_name,
          stored_path: persisted.stored_path,
          size_bytes: persisted.size_bytes,
        },
      });

      return attachment;
    });
  }

  private async scanUploadedAttachment(file: UploadedSupportFile): Promise<UploadedSupportFile> {
    validateUploadedFile(file);

    const providerMalwareScan = await this.uploadMalwareScan?.scanIfConfigured(file);

    if (!providerMalwareScan) {
      return file;
    }

    const scannedFile = { ...file, providerMalwareScan };
    validateUploadedFile(scannedFile);
    return scannedFile;
  }

  async listKnowledgeBase(query: KnowledgeBaseQueryDto) {
    return this.supportRepository.listKnowledgeBase({
      search: query.search?.trim() || undefined,
      category: query.category?.trim() || undefined,
    });
  }

  async getSystemStatus() {
    return this.supportRepository.getSystemStatus();
  }

  async listNotifications() {
    const supportOperator = this.isSupportOperator();

    return this.supportRepository.listNotifications({
      tenantId: supportOperator ? undefined : this.requireTenantId(),
      recipientType: supportOperator ? 'support' : 'school',
      limit: 30,
    });
  }

  async listNotificationDeadLetters() {
    this.requireSupportOperator();

    return this.supportRepository.listNotificationDeadLetters({
      limit: 30,
    });
  }

  async getAnalytics() {
    this.requireSupportOperator();
    return this.supportRepository.getAnalytics();
  }

  private async requireTicket(ticketId: string): Promise<SupportTicketRecord> {
    const ticket = await this.supportRepository.findTicketByIdForAccess(ticketId);

    if (!ticket) {
      throw new NotFoundException(`Support ticket "${ticketId}" was not found`);
    }

    return ticket;
  }

  private currentTenantOrGlobal(): string {
    return this.requestContext.getStore()?.tenant_id ?? 'global';
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for support operations');
    }

    return tenantId;
  }

  private getActorUserId(): string | null {
    const userId = this.requestContext.getStore()?.user_id;
    return userId && userId !== 'anonymous' ? userId : null;
  }

  private isSupportOperator(): boolean {
    const context = this.requestContext.getStore();

    if (!context) {
      return false;
    }

    return Boolean(
      (context.role && SUPPORT_OPERATOR_ROLES.has(context.role))
        || context.permissions.includes('support:*')
        || context.permissions.includes('*:*'),
    );
  }

  private requireSupportOperator(): void {
    if (!this.isSupportOperator()) {
      throw new ForbiddenException('Support agent access is required for this operation');
    }
  }

  private async createAndDispatchNotifications(
    inputs: Parameters<SupportRepository['createNotifications']>[0],
  ): Promise<void> {
    const notifications = await this.supportRepository.createNotifications(inputs);

    if (this.notificationDelivery && Array.isArray(notifications)) {
      await this.notificationDelivery.deliverCreatedNotifications(notifications);
    }
  }

  private buildDiagnosticContext(dto: CreateSupportTicketDto): Record<string, unknown> {
    const context = this.requestContext.requireStore();

    return {
      request_id: context.request_id,
      browser: dto.browser?.trim() || context.user_agent || 'Unknown browser',
      device: dto.device?.trim() || 'Unknown device',
      current_page_url: dto.current_page_url?.trim() || context.path,
      app_version: dto.app_version?.trim() || 'unknown',
      error_logs: dto.error_logs ?? [],
      user_agent: context.user_agent,
      client_ip: context.client_ip,
      method: context.method,
      path: context.path,
    };
  }

  private buildTicketCreatedNotifications(
    ticket: SupportTicketRecord,
    category: SupportCategoryRecord | null,
  ) {
    const title = ticket.priority === 'Critical'
      ? `Critical support ticket raised: ${ticket.ticket_number}`
      : `New support ticket: ${ticket.ticket_number}`;
    const body = `${ticket.school_name ?? ticket.tenant_id} reported ${ticket.subject} in ${ticket.module_affected}.`;
    const base = {
      tenant_id: ticket.tenant_id,
      ticket_id: ticket.id,
      recipient_type: 'support' as const,
      title,
      body,
      metadata: {
        ticket_number: ticket.ticket_number,
        priority: ticket.priority,
        category: category?.name ?? ticket.category,
      },
    };

    if (ticket.priority === 'Critical') {
      const criticalNotifications: Parameters<SupportRepository['createNotifications']>[0] = [
        {
          ...base,
          channel: 'in_app' as const,
        },
        {
          ...base,
          channel: 'email' as const,
        },
      ];

      if (this.isSupportSmsConfigured()) {
        criticalNotifications.push({
          ...base,
          channel: 'sms' as const,
        });
      }

      return criticalNotifications;
    }

    return [
      {
        ...base,
        channel: 'in_app' as const,
      },
    ];
  }

  private buildSchoolReplyNotifications(ticket: SupportTicketRecord) {
    return [
      {
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        recipient_user_id: ticket.requester_user_id,
        recipient_type: 'school' as const,
        channel: 'in_app' as const,
        title: `Support replied on ${ticket.ticket_number}`,
        body: `A support agent replied to "${ticket.subject}".`,
        metadata: { ticket_number: ticket.ticket_number },
      },
      {
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        recipient_user_id: ticket.requester_user_id,
        recipient_type: 'school' as const,
        channel: 'email' as const,
        title: `Support replied on ${ticket.ticket_number}`,
        body: `A support agent replied to "${ticket.subject}".`,
        metadata: { ticket_number: ticket.ticket_number },
      },
    ];
  }

  private buildCustomerReplyNotifications(ticket: SupportTicketRecord) {
    return [
      {
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        recipient_type: 'support' as const,
        channel: 'in_app' as const,
        title: `Customer replied on ${ticket.ticket_number}`,
        body: `${ticket.school_name ?? ticket.tenant_id} replied to "${ticket.subject}".`,
        metadata: { ticket_number: ticket.ticket_number },
      },
    ];
  }

  private buildStatusNotifications(ticket: SupportTicketRecord) {
    return [
      {
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        recipient_user_id: ticket.requester_user_id,
        recipient_type: 'school' as const,
        channel: 'in_app' as const,
        title: `${ticket.ticket_number} is ${ticket.status}`,
        body: `Your support ticket "${ticket.subject}" changed status to ${ticket.status}.`,
        metadata: {
          ticket_number: ticket.ticket_number,
          status: ticket.status,
        },
      },
    ];
  }

  private isSupportSmsConfigured(): boolean {
    const webhookUrl = this.configService?.get<string>('support.notificationSmsWebhookUrl') ?? '';
    const recipients = this.configService?.get<string[] | string>('support.notificationSmsRecipients') ?? [];
    const recipientList = Array.isArray(recipients) ? recipients : recipients.split(',');

    return Boolean(
      webhookUrl.trim()
      && recipientList.some((recipient) => recipient.trim().length > 0),
    );
  }

  private resolveReplyStatus(
    ticket: SupportTicketRecord,
    requestedStatus: SupportStatus | undefined,
    supportOperator: boolean,
  ): SupportStatus {
    if (!supportOperator && requestedStatus) {
      throw new ForbiddenException('Only support agents can set ticket status while replying');
    }

    if (supportOperator && ticket.status === 'Closed' && !requestedStatus) {
      throw new BadRequestException('Closed support tickets require an explicit reopen status before replying');
    }

    if (requestedStatus) {
      return requestedStatus;
    }

    if (supportOperator) {
      return 'Waiting for School';
    }

    if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
      return 'In Progress';
    }

    if (ticket.status === 'Waiting for School' || ticket.status === 'Open') {
      return 'In Progress';
    }

    return ticket.status;
  }

  private isReopenTransition(fromStatus: SupportStatus, toStatus: SupportStatus): boolean {
    return (fromStatus === 'Resolved' || fromStatus === 'Closed')
      && toStatus !== 'Resolved'
      && toStatus !== 'Closed';
  }

  private requireText(value: string | undefined, fieldName: string): string {
    const normalized = value?.trim() ?? '';

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private getRequestStartedAt(): Date {
    const startedAt = this.requestContext.getStore()?.started_at;
    const parsed = startedAt ? new Date(startedAt) : new Date();

    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private addMinutes(startedAt: Date, minutes: number): string {
    return new Date(startedAt.getTime() + minutes * 60_000).toISOString();
  }

  private defaultResponseSla(priority: SupportPriority): number {
    if (priority === 'Critical') return 15;
    if (priority === 'High') return 60;
    if (priority === 'Medium') return 240;
    return 480;
  }

  private defaultResolutionSla(priority: SupportPriority): number {
    if (priority === 'Critical') return 240;
    if (priority === 'High') return 720;
    if (priority === 'Medium') return 2880;
    return 5760;
  }
}
