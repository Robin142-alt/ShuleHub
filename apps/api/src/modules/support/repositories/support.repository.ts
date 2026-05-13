import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import type { SupportPriority, SupportStatus } from '../dto/support.dto';
import { SUPPORT_CATEGORIES } from '../dto/support.dto';

export interface SupportCategoryRecord {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string;
  response_sla_minutes: number;
  resolution_sla_minutes: number;
  sort_order: number;
  is_active: boolean;
}

export interface SupportTicketRecord {
  id: string;
  tenant_id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  module_affected: string;
  description: string;
  status: SupportStatus;
  requester_user_id: string | null;
  assigned_agent_id: string | null;
  merged_into_ticket_id?: string | null;
  first_response_due_at: string;
  resolution_due_at: string;
  first_responded_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  escalated_at?: string | null;
  last_school_reply_at?: string | null;
  last_support_reply_at?: string | null;
  context: Record<string, unknown>;
  school_name?: string | null;
  assigned_agent_name?: string | null;
  message_count?: number;
  attachment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SupportMessageRecord {
  id: string;
  tenant_id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_type: 'school' | 'support' | 'system';
  body: string;
  visibility: 'public';
  created_at: string;
  updated_at?: string;
}

export interface SupportInternalNoteRecord {
  id: string;
  tenant_id: string;
  ticket_id: string;
  author_user_id: string | null;
  note: string;
  created_at: string;
  updated_at?: string;
}

interface CreateTicketInput {
  tenant_id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  module_affected: string;
  description: string;
  status: SupportStatus;
  requester_user_id: string | null;
  assigned_agent_id: string | null;
  first_response_due_at: string;
  resolution_due_at: string;
  context: Record<string, unknown>;
}

@Injectable()
export class SupportRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureDefaultCategories(tenantId: string): Promise<void> {
    for (const [index, name] of SUPPORT_CATEGORIES.entries()) {
      const code = this.toCode(name);
      const responseSlaMinutes = name === 'MPESA' || name === 'Login Issues' ? 30 : 240;
      const resolutionSlaMinutes = name === 'MPESA' || name === 'Performance' ? 480 : 2880;

      await this.databaseService.query(
        `
          INSERT INTO support_categories (
            tenant_id,
            code,
            name,
            description,
            response_sla_minutes,
            resolution_sla_minutes,
            sort_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            response_sla_minutes = EXCLUDED.response_sla_minutes,
            resolution_sla_minutes = EXCLUDED.resolution_sla_minutes,
            sort_order = EXCLUDED.sort_order,
            is_active = TRUE,
            updated_at = NOW()
        `,
        [
          tenantId,
          code,
          name,
          `${name} support and troubleshooting requests.`,
          responseSlaMinutes,
          resolutionSlaMinutes,
          index + 1,
        ],
      );
    }
  }

  async listCategories(tenantId: string): Promise<SupportCategoryRecord[]> {
    const result = await this.databaseService.query<SupportCategoryRecord>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          description,
          response_sla_minutes,
          resolution_sla_minutes,
          sort_order,
          is_active
        FROM support_categories
        WHERE tenant_id IN ($1, 'global')
          AND is_active = TRUE
        ORDER BY CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END, sort_order ASC, name ASC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.mapCategory(row));
  }

  async findCategoryByName(
    tenantId: string,
    categoryName: string,
  ): Promise<SupportCategoryRecord | null> {
    const result = await this.databaseService.query<SupportCategoryRecord>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          description,
          response_sla_minutes,
          resolution_sla_minutes,
          sort_order,
          is_active
        FROM support_categories
        WHERE tenant_id IN ($1, 'global')
          AND lower(name) = lower($2)
          AND is_active = TRUE
        ORDER BY CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [tenantId, categoryName],
    );

    return result.rows[0] ? this.mapCategory(result.rows[0]) : null;
  }

  async generateTicketNumber(): Promise<string> {
    const result = await this.databaseService.query<{ value: string }>(
      `SELECT nextval('support_ticket_number_seq')::text AS value`,
    );
    const year = new Date().getUTCFullYear();
    const value = String(result.rows[0]?.value ?? '1').padStart(6, '0');

    return `SUP-${year}-${value}`;
  }

  async createTicket(input: CreateTicketInput): Promise<SupportTicketRecord> {
    const result = await this.databaseService.query<SupportTicketRecord>(
      `
        INSERT INTO support_tickets (
          tenant_id,
          ticket_number,
          subject,
          category,
          priority,
          module_affected,
          description,
          status,
          requester_user_id,
          assigned_agent_id,
          first_response_due_at,
          resolution_due_at,
          escalated_at,
          context,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::uuid,
          $10::uuid,
          $11::timestamptz,
          $12::timestamptz,
          CASE WHEN $8 = 'Escalated' THEN NOW() ELSE NULL END,
          $13::jsonb,
          $9::uuid,
          $9::uuid
        )
        RETURNING
          id,
          tenant_id,
          ticket_number,
          subject,
          category,
          priority,
          module_affected,
          description,
          status,
          requester_user_id,
          assigned_agent_id,
          merged_into_ticket_id,
          first_response_due_at::text,
          resolution_due_at::text,
          first_responded_at::text,
          resolved_at::text,
          closed_at::text,
          escalated_at::text,
          last_school_reply_at::text,
          last_support_reply_at::text,
          context,
          created_at::text,
          updated_at::text
      `,
      [
        input.tenant_id,
        input.ticket_number,
        input.subject,
        input.category,
        input.priority,
        input.module_affected,
        input.description,
        input.status,
        input.requester_user_id,
        input.assigned_agent_id,
        input.first_response_due_at,
        input.resolution_due_at,
        JSON.stringify(input.context),
      ],
    );

    return this.mapTicket(result.rows[0]);
  }

  async listTickets(options: {
    tenantId?: string;
    search?: string;
    status?: SupportStatus;
    priority?: SupportPriority;
    module?: string;
    limit: number;
    offset: number;
  }): Promise<SupportTicketRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let parameterIndex = 1;

    if (options.tenantId) {
      conditions.push(`ticket.tenant_id = $${parameterIndex}`);
      values.push(options.tenantId);
      parameterIndex += 1;
    }

    if (options.search) {
      conditions.push(
        `(ticket.ticket_number ILIKE $${parameterIndex}
          OR ticket.subject ILIKE $${parameterIndex}
          OR ticket.module_affected ILIKE $${parameterIndex}
          OR ticket.category ILIKE $${parameterIndex}
          OR ticket.requester_user_id::text ILIKE $${parameterIndex}
          OR tenant.school_name ILIKE $${parameterIndex})`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    if (options.status) {
      conditions.push(`ticket.status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    if (options.priority) {
      conditions.push(`ticket.priority = $${parameterIndex}`);
      values.push(options.priority);
      parameterIndex += 1;
    }

    if (options.module) {
      conditions.push(`ticket.module_affected = $${parameterIndex}`);
      values.push(options.module);
      parameterIndex += 1;
    }

    values.push(options.limit, options.offset);
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.databaseService.query<SupportTicketRecord>(
      `
        SELECT
          ticket.id,
          ticket.tenant_id,
          ticket.ticket_number,
          ticket.subject,
          ticket.category,
          ticket.priority,
          ticket.module_affected,
          ticket.description,
          ticket.status,
          ticket.requester_user_id,
          ticket.assigned_agent_id,
          ticket.merged_into_ticket_id,
          ticket.first_response_due_at::text,
          ticket.resolution_due_at::text,
          ticket.first_responded_at::text,
          ticket.resolved_at::text,
          ticket.closed_at::text,
          ticket.escalated_at::text,
          ticket.last_school_reply_at::text,
          ticket.last_support_reply_at::text,
          ticket.context,
          tenant.school_name,
          agent.display_name AS assigned_agent_name,
          COUNT(DISTINCT message.id)::int AS message_count,
          COUNT(DISTINCT attachment.id)::int AS attachment_count,
          ticket.created_at::text,
          ticket.updated_at::text
        FROM support_tickets ticket
        LEFT JOIN tenants tenant
          ON tenant.tenant_id = ticket.tenant_id
        LEFT JOIN support_agents agent
          ON agent.id = ticket.assigned_agent_id
        LEFT JOIN support_messages message
          ON message.tenant_id = ticket.tenant_id
         AND message.ticket_id = ticket.id
        LEFT JOIN support_attachments attachment
          ON attachment.tenant_id = ticket.tenant_id
         AND attachment.ticket_id = ticket.id
        ${whereSql}
        GROUP BY ticket.id, tenant.school_name, agent.display_name
        ORDER BY
          CASE ticket.priority
            WHEN 'Critical' THEN 0
            WHEN 'High' THEN 1
            WHEN 'Medium' THEN 2
            ELSE 3
          END,
          ticket.updated_at DESC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      values,
    );

    return result.rows.map((row) => this.mapTicket(row));
  }

  async findTicketByIdForAccess(ticketId: string): Promise<SupportTicketRecord | null> {
    const result = await this.databaseService.query<SupportTicketRecord>(
      `
        SELECT
          ticket.id,
          ticket.tenant_id,
          ticket.ticket_number,
          ticket.subject,
          ticket.category,
          ticket.priority,
          ticket.module_affected,
          ticket.description,
          ticket.status,
          ticket.requester_user_id,
          ticket.assigned_agent_id,
          ticket.merged_into_ticket_id,
          ticket.first_response_due_at::text,
          ticket.resolution_due_at::text,
          ticket.first_responded_at::text,
          ticket.resolved_at::text,
          ticket.closed_at::text,
          ticket.escalated_at::text,
          ticket.last_school_reply_at::text,
          ticket.last_support_reply_at::text,
          ticket.context,
          tenant.school_name,
          agent.display_name AS assigned_agent_name,
          ticket.created_at::text,
          ticket.updated_at::text
        FROM support_tickets ticket
        LEFT JOIN tenants tenant
          ON tenant.tenant_id = ticket.tenant_id
        LEFT JOIN support_agents agent
          ON agent.id = ticket.assigned_agent_id
        WHERE ticket.id = $1::uuid
        LIMIT 1
      `,
      [ticketId],
    );

    return result.rows[0] ? this.mapTicket(result.rows[0]) : null;
  }

  async createMessage(input: {
    tenant_id: string;
    ticket_id: string;
    author_user_id: string | null;
    author_type: 'school' | 'support' | 'system';
    body: string;
  }): Promise<SupportMessageRecord> {
    const result = await this.databaseService.query<SupportMessageRecord>(
      `
        INSERT INTO support_messages (
          tenant_id,
          ticket_id,
          author_user_id,
          author_type,
          body,
          visibility
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'public')
        RETURNING
          id,
          tenant_id,
          ticket_id,
          author_user_id,
          author_type,
          body,
          visibility,
          created_at::text,
          updated_at::text
      `,
      [
        input.tenant_id,
        input.ticket_id,
        input.author_user_id,
        input.author_type,
        input.body,
      ],
    );

    await this.databaseService.query(
      `
        UPDATE support_tickets
        SET
          last_school_reply_at = CASE WHEN $3 = 'school' THEN NOW() ELSE last_school_reply_at END,
          last_support_reply_at = CASE WHEN $3 = 'support' THEN NOW() ELSE last_support_reply_at END,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [input.tenant_id, input.ticket_id, input.author_type],
    );

    return result.rows[0];
  }

  async listMessages(tenantId: string, ticketId: string): Promise<SupportMessageRecord[]> {
    const result = await this.databaseService.query<SupportMessageRecord>(
      `
        SELECT
          id,
          tenant_id,
          ticket_id,
          author_user_id,
          author_type,
          body,
          visibility,
          created_at::text,
          updated_at::text
        FROM support_messages
        WHERE tenant_id = $1
          AND ticket_id = $2::uuid
        ORDER BY created_at ASC
      `,
      [tenantId, ticketId],
    );

    return result.rows;
  }

  async createInternalNote(input: {
    tenant_id: string;
    ticket_id: string;
    author_user_id: string | null;
    note: string;
  }): Promise<SupportInternalNoteRecord> {
    const result = await this.databaseService.query<SupportInternalNoteRecord>(
      `
        INSERT INTO support_internal_notes (
          tenant_id,
          ticket_id,
          author_user_id,
          note
        )
        VALUES ($1, $2::uuid, $3::uuid, $4)
        RETURNING
          id,
          tenant_id,
          ticket_id,
          author_user_id,
          note,
          created_at::text,
          updated_at::text
      `,
      [input.tenant_id, input.ticket_id, input.author_user_id, input.note],
    );

    return result.rows[0];
  }

  async listInternalNotes(tenantId: string, ticketId: string): Promise<SupportInternalNoteRecord[]> {
    const result = await this.databaseService.query<SupportInternalNoteRecord>(
      `
        SELECT
          id,
          tenant_id,
          ticket_id,
          author_user_id,
          note,
          created_at::text,
          updated_at::text
        FROM support_internal_notes
        WHERE tenant_id = $1
          AND ticket_id = $2::uuid
        ORDER BY created_at DESC
      `,
      [tenantId, ticketId],
    );

    return result.rows;
  }

  async createStatusLog(input: {
    tenant_id: string;
    ticket_id: string;
    actor_user_id: string | null;
    from_status: SupportStatus | null;
    to_status: SupportStatus;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO support_status_logs (
          tenant_id,
          ticket_id,
          actor_user_id,
          from_status,
          to_status,
          action,
          metadata
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)
      `,
      [
        input.tenant_id,
        input.ticket_id,
        input.actor_user_id,
        input.from_status,
        input.to_status,
        input.action,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async listStatusLogs(tenantId: string, ticketId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          id,
          tenant_id,
          ticket_id,
          actor_user_id,
          from_status,
          to_status,
          action,
          metadata,
          created_at::text
        FROM support_status_logs
        WHERE tenant_id = $1
          AND ticket_id = $2::uuid
        ORDER BY created_at DESC
      `,
      [tenantId, ticketId],
    );

    return result.rows;
  }

  async updateTicketStatus(
    ticketId: string,
    status: SupportStatus,
    actorUserId: string | null = null,
  ): Promise<SupportTicketRecord | null> {
    const result = await this.databaseService.query<SupportTicketRecord>(
      `
        UPDATE support_tickets
        SET
          status = $2,
          resolved_at = CASE WHEN $2 = 'Resolved' THEN NOW() ELSE resolved_at END,
          closed_at = CASE WHEN $2 = 'Closed' THEN NOW() ELSE closed_at END,
          escalated_at = CASE WHEN $2 = 'Escalated' THEN COALESCE(escalated_at, NOW()) ELSE escalated_at END,
          updated_by_user_id = $3::uuid,
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          tenant_id,
          ticket_number,
          subject,
          category,
          priority,
          module_affected,
          description,
          status,
          requester_user_id,
          assigned_agent_id,
          merged_into_ticket_id,
          first_response_due_at::text,
          resolution_due_at::text,
          first_responded_at::text,
          resolved_at::text,
          closed_at::text,
          escalated_at::text,
          last_school_reply_at::text,
          last_support_reply_at::text,
          context,
          created_at::text,
          updated_at::text
      `,
      [ticketId, status, actorUserId],
    );

    return result.rows[0] ? this.mapTicket(result.rows[0]) : null;
  }

  async markFirstResponseIfNeeded(ticketId: string, respondedAt: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE support_tickets
        SET first_responded_at = COALESCE(first_responded_at, $2::timestamptz),
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [ticketId, respondedAt],
    );
  }

  async assignTicket(ticketId: string, assignedAgentId: string, actorUserId: string | null) {
    const result = await this.databaseService.query<SupportTicketRecord>(
      `
        UPDATE support_tickets
        SET assigned_agent_id = $2::uuid,
            updated_by_user_id = $3::uuid,
            updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          tenant_id,
          ticket_number,
          subject,
          category,
          priority,
          module_affected,
          description,
          status,
          requester_user_id,
          assigned_agent_id,
          merged_into_ticket_id,
          first_response_due_at::text,
          resolution_due_at::text,
          first_responded_at::text,
          resolved_at::text,
          closed_at::text,
          escalated_at::text,
          last_school_reply_at::text,
          last_support_reply_at::text,
          context,
          created_at::text,
          updated_at::text
      `,
      [ticketId, assignedAgentId, actorUserId],
    );

    return result.rows[0] ? this.mapTicket(result.rows[0]) : null;
  }

  async mergeTicket(ticketId: string, targetTicketId: string, actorUserId: string | null) {
    const result = await this.databaseService.query<SupportTicketRecord>(
      `
        UPDATE support_tickets
        SET merged_into_ticket_id = $2::uuid,
            status = 'Closed',
            closed_at = NOW(),
            updated_by_user_id = $3::uuid,
            updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING
          id,
          tenant_id,
          ticket_number,
          subject,
          category,
          priority,
          module_affected,
          description,
          status,
          requester_user_id,
          assigned_agent_id,
          merged_into_ticket_id,
          first_response_due_at::text,
          resolution_due_at::text,
          first_responded_at::text,
          resolved_at::text,
          closed_at::text,
          escalated_at::text,
          last_school_reply_at::text,
          last_support_reply_at::text,
          context,
          created_at::text,
          updated_at::text
      `,
      [ticketId, targetTicketId, actorUserId],
    );

    return result.rows[0] ? this.mapTicket(result.rows[0]) : null;
  }

  async createAttachment(input: {
    tenant_id: string;
    ticket_id: string;
    message_id: string | null;
    internal_note_id: string | null;
    uploaded_by_user_id: string | null;
    original_file_name: string;
    stored_path: string;
    mime_type: string;
    size_bytes: number;
    attachment_type: 'ticket' | 'message' | 'internal_note';
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO support_attachments (
          tenant_id,
          ticket_id,
          message_id,
          internal_note_id,
          uploaded_by_user_id,
          original_file_name,
          stored_path,
          mime_type,
          size_bytes,
          attachment_type
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10)
        RETURNING
          id,
          tenant_id,
          ticket_id,
          message_id,
          internal_note_id,
          uploaded_by_user_id,
          original_file_name,
          stored_path,
          mime_type,
          size_bytes,
          attachment_type,
          created_at::text,
          updated_at::text
      `,
      [
        input.tenant_id,
        input.ticket_id,
        input.message_id,
        input.internal_note_id,
        input.uploaded_by_user_id,
        input.original_file_name,
        input.stored_path,
        input.mime_type,
        input.size_bytes,
        input.attachment_type,
      ],
    );

    return result.rows[0];
  }

  async listAttachments(tenantId: string, ticketId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          id,
          tenant_id,
          ticket_id,
          message_id,
          internal_note_id,
          uploaded_by_user_id,
          original_file_name,
          stored_path,
          mime_type,
          size_bytes,
          attachment_type,
          created_at::text
        FROM support_attachments
        WHERE tenant_id = $1
          AND ticket_id = $2::uuid
        ORDER BY created_at DESC
      `,
      [tenantId, ticketId],
    );

    return result.rows;
  }

  async createNotifications(inputs: Array<{
    tenant_id: string;
    ticket_id: string | null;
    recipient_user_id?: string | null;
    recipient_type: 'school' | 'support';
    channel: 'in_app' | 'email' | 'sms';
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    for (const input of inputs) {
      await this.databaseService.query(
        `
          INSERT INTO support_notifications (
            tenant_id,
            ticket_id,
            recipient_user_id,
            recipient_type,
            channel,
            title,
            body,
            metadata
          )
          VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          input.tenant_id,
          input.ticket_id,
          input.recipient_user_id ?? null,
          input.recipient_type,
          input.channel,
          input.title,
          input.body,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    }
  }

  async listNotifications(options: { tenantId?: string; recipientType?: 'school' | 'support'; limit: number }) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let parameterIndex = 1;

    if (options.tenantId) {
      conditions.push(`tenant_id = $${parameterIndex}`);
      values.push(options.tenantId);
      parameterIndex += 1;
    }

    if (options.recipientType) {
      conditions.push(`recipient_type = $${parameterIndex}`);
      values.push(options.recipientType);
      parameterIndex += 1;
    }

    values.push(options.limit);
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.databaseService.query(
      `
        SELECT
          id,
          tenant_id,
          ticket_id,
          recipient_user_id,
          recipient_type,
          channel,
          title,
          body,
          read_at::text,
          delivery_status,
          metadata,
          created_at::text
        FROM support_notifications
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${parameterIndex}
      `,
      values,
    );

    return result.rows;
  }

  async listKnowledgeBase(options: { search?: string; category?: string }) {
    const conditions = ['published = TRUE'];
    const values: unknown[] = [];
    let parameterIndex = 1;

    if (options.search) {
      conditions.push(
        `(title ILIKE $${parameterIndex}
          OR summary ILIKE $${parameterIndex}
          OR body ILIKE $${parameterIndex}
          OR $${parameterIndex} = ANY(tags))`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    if (options.category) {
      conditions.push(`category = $${parameterIndex}`);
      values.push(options.category);
      parameterIndex += 1;
    }

    const result = await this.databaseService.query(
      `
        SELECT
          id,
          tenant_id,
          category,
          slug,
          title,
          summary,
          body,
          tags,
          helpful_count,
          created_at::text,
          updated_at::text
        FROM support_kb_articles
        WHERE ${conditions.join(' AND ')}
        ORDER BY helpful_count DESC, title ASC
      `,
      values,
    );

    return result.rows;
  }

  async getSystemStatus() {
    const [components, incidents] = await Promise.all([
      this.databaseService.query(
        `
          SELECT
            id,
            tenant_id,
            name,
            slug,
            status,
            uptime_percent,
            latency_ms,
            metadata,
            updated_at::text
          FROM support_system_components
          ORDER BY name ASC
        `,
      ),
      this.databaseService.query(
        `
          SELECT
            incident.id,
            incident.tenant_id,
            incident.component_id,
            component.name AS component_name,
            incident.title,
            incident.impact,
            incident.status,
            incident.started_at::text,
            incident.resolved_at::text,
            incident.update_summary,
            incident.updated_at::text
          FROM support_incidents incident
          LEFT JOIN support_system_components component
            ON component.tenant_id = incident.tenant_id
           AND component.id = incident.component_id
          ORDER BY incident.started_at DESC
          LIMIT 10
        `,
      ),
    ]);

    return {
      components: components.rows,
      incidents: incidents.rows,
    };
  }

  async getAnalytics() {
    const [statusCounts, priorityCounts, slaBreaches, recurringIssues, heatmap] = await Promise.all([
      this.databaseService.query(
        `
          SELECT status, COUNT(*)::int AS total
          FROM support_tickets
          GROUP BY status
          ORDER BY total DESC
        `,
      ),
      this.databaseService.query(
        `
          SELECT priority, COUNT(*)::int AS total
          FROM support_tickets
          GROUP BY priority
          ORDER BY total DESC
        `,
      ),
      this.databaseService.query(
        `
          SELECT COUNT(*)::int AS total
          FROM support_tickets
          WHERE status NOT IN ('Resolved', 'Closed')
            AND (
              first_responded_at IS NULL AND first_response_due_at < NOW()
              OR resolution_due_at < NOW()
            )
        `,
      ),
      this.databaseService.query(
        `
          SELECT category, module_affected, COUNT(*)::int AS total
          FROM support_tickets
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY category, module_affected
          ORDER BY total DESC
          LIMIT 8
        `,
      ),
      this.databaseService.query(
        `
          SELECT date_trunc('day', created_at)::date::text AS day, COUNT(*)::int AS total
          FROM support_tickets
          WHERE created_at >= NOW() - INTERVAL '14 days'
          GROUP BY day
          ORDER BY day ASC
        `,
      ),
    ]);

    return {
      status_counts: statusCounts.rows,
      priority_counts: priorityCounts.rows,
      sla_breaches: Number(slaBreaches.rows[0]?.total ?? 0),
      recurring_issues: recurringIssues.rows,
      ticket_heatmap: heatmap.rows,
    };
  }

  private mapCategory(row: SupportCategoryRecord): SupportCategoryRecord {
    return {
      ...row,
      response_sla_minutes: Number(row.response_sla_minutes ?? 240),
      resolution_sla_minutes: Number(row.resolution_sla_minutes ?? 2880),
      sort_order: Number(row.sort_order ?? 100),
    };
  }

  private mapTicket(row: SupportTicketRecord): SupportTicketRecord {
    return {
      ...row,
      context: row.context ?? {},
      message_count: Number(row.message_count ?? 0),
      attachment_count: Number(row.attachment_count ?? 0),
    };
  }

  private toCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
}
