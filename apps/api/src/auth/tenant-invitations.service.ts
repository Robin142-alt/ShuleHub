import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import { AuditLogService } from '../modules/observability/audit-log.service';
import { AuthEmailService } from './auth-email.service';
import {
  CreateTenantInvitationDto,
  TENANT_INVITABLE_ROLE_CODES,
  TenantInvitationActionResponseDto,
  TenantManagedUserDto,
  TenantManagedUsersResponseDto,
  TenantInvitableRoleCode,
  TenantInvitationResponseDto,
} from './dto/tenant-invitation.dto';
import { AuthorizationRepository } from './repositories/authorization.repository';

type TenantNameRow = {
  name: string;
};

type TenantManagedUserRow = {
  id: string;
  kind: 'member' | 'invitation';
  display_name: string;
  email: string;
  role_code: string;
  role_name: string;
  status: 'active' | 'suspended' | 'invited' | 'expired';
  expires_at: Date | string | null;
  created_at: Date | string;
};

type PendingInvitationRow = {
  id: string;
  email: string;
  display_name: string;
  role_code: string;
  expires_at: Date | string;
};

@Injectable()
export class TenantInvitationsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authorizationRepository: AuthorizationRepository,
    private readonly emailService: AuthEmailService,
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  async inviteTenantUser(
    dto: CreateTenantInvitationDto,
  ): Promise<TenantInvitationResponseDto> {
    this.emailService.assertTransactionalEmailConfigured(
      'User invitations are temporarily unavailable. Please configure transactional email before inviting school users.',
    );

    const context = this.requestContext.requireStore();
    const tenantId = this.requireTenantId();

    const roleCode = this.normalizeRoleCode(dto.role_code);
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.display_name.trim();

    if (!displayName) {
      throw new BadRequestException('Invitee display name is required.');
    }

    return this.databaseService.withRequestTransaction(async () => {
      await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenantId);
      await this.authorizationRepository.getRoleByCode(tenantId, roleCode);

      const schoolName = await this.getSchoolName(tenantId);
      const token = randomBytes(32).toString('base64url');
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.getInvitationTtlMs());
      const inviteUrl = this.buildInvitationUrl(token);
      const payload = {
        tenant_id: tenantId,
        tenant_name: schoolName,
        role_code: roleCode,
        display_name: displayName,
        invited_by_user_id: context.user_id,
        purpose: 'tenant_user_invitation',
        expires_at: expiresAt.toISOString(),
      };

      const invitationId = await this.createInvitationAction({
        tenantId,
        email,
        displayName,
        roleCode,
        tokenHash,
        expiresAt,
        payload,
        inviteUrl,
        schoolName,
      });
      await this.recordAudit('tenant.invitation.created', 'tenant_invitation', invitationId, {
        email,
        display_name: displayName,
        role_code: roleCode,
        expires_at: expiresAt.toISOString(),
      });

      return {
        id: invitationId,
        tenant_id: tenantId,
        email,
        display_name: displayName,
        role_code: roleCode,
        invitation_sent: true,
        expires_at: expiresAt.toISOString(),
      };
    });
  }

  async listTenantUsers(): Promise<TenantManagedUsersResponseDto> {
    const tenantId = this.requireTenantId();
    const result = await this.databaseService.query<TenantManagedUserRow>(
      `
        WITH current_members AS (
          SELECT
            tm.id::text AS id,
            'member'::text AS kind,
            u.display_name,
            lower(u.email) AS email,
            r.code AS role_code,
            r.name AS role_name,
            tm.status,
            NULL::timestamptz AS expires_at,
            tm.created_at
          FROM tenant_memberships tm
          INNER JOIN users u
            ON u.id = tm.user_id
          INNER JOIN roles r
            ON r.id = tm.role_id
           AND r.tenant_id = tm.tenant_id
          WHERE tm.tenant_id = $1
            AND tm.status IN ('active', 'suspended')
        ),
        pending_invitations AS (
          SELECT
            token.id::text AS id,
            'invitation'::text AS kind,
            COALESCE(NULLIF(token.metadata->>'display_name', ''), token.email) AS display_name,
            lower(token.email) AS email,
            COALESCE(NULLIF(token.metadata->>'role_code', ''), 'member') AS role_code,
            COALESCE(role.name, initcap(replace(COALESCE(NULLIF(token.metadata->>'role_code', ''), 'member'), '_', ' '))) AS role_name,
            CASE
              WHEN token.expires_at <= NOW() THEN 'expired'
              ELSE 'invited'
            END AS status,
            token.expires_at,
            token.created_at
          FROM auth_action_tokens token
          LEFT JOIN roles role
            ON role.tenant_id = token.tenant_id
           AND role.code = COALESCE(NULLIF(token.metadata->>'role_code', ''), 'member')
          WHERE token.tenant_id = $1
            AND token.purpose = 'invite_acceptance'
            AND token.consumed_at IS NULL
            AND token.metadata->>'purpose' = 'tenant_user_invitation'
        )
        SELECT * FROM current_members
        UNION ALL
        SELECT * FROM pending_invitations
        ORDER BY
          CASE kind WHEN 'invitation' THEN 0 ELSE 1 END,
          created_at DESC
      `,
      [tenantId],
    );

    return {
      users: result.rows.map((row) => this.mapManagedUser(row)),
    };
  }

  async resendTenantInvitation(
    invitationId: string,
  ): Promise<TenantInvitationActionResponseDto> {
    this.emailService.assertTransactionalEmailConfigured(
      'User invitations are temporarily unavailable. Please configure transactional email before inviting school users.',
    );

    const tenantId = this.requireTenantId();

    return this.databaseService.withRequestTransaction(async () => {
      const invitation = await this.loadPendingTenantInvitationForUpdate(invitationId, tenantId);
      const roleCode = this.normalizeRoleCode(invitation.role_code);
      const schoolName = await this.getSchoolName(tenantId);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + this.getInvitationTtlMs());
      const inviteUrl = this.buildInvitationUrl(token);
      const metadata = {
        tenant_id: tenantId,
        tenant_name: schoolName,
        role_code: roleCode,
        display_name: invitation.display_name,
        invited_by_user_id: this.requestContext.requireStore().user_id,
        purpose: 'tenant_user_invitation',
        expires_at: expiresAt.toISOString(),
        resent_at: new Date().toISOString(),
      };

      await this.databaseService.query(
        `
          UPDATE auth_action_tokens
          SET
            token_hash = $3,
            expires_at = $4,
            metadata = $5::jsonb,
            updated_at = NOW()
          WHERE id = $1
            AND tenant_id = $2
            AND purpose = 'invite_acceptance'
            AND consumed_at IS NULL
        `,
        [
          invitationId,
          tenantId,
          this.hashToken(token),
          expiresAt,
          JSON.stringify(metadata),
        ],
      );

      const outboxId = await this.queueInvitationEmail({
        tenantId,
        email: invitation.email.toLowerCase(),
        payload: {
          ...metadata,
          invite_url: inviteUrl,
        },
      });

      try {
        await this.emailService.sendInvitationEmail({
          to: invitation.email.toLowerCase(),
          displayName: invitation.display_name,
          schoolName,
          inviteUrl,
          expiresAt,
        });
        await this.markOutboxDelivery(outboxId, 'sent');
      } catch (error) {
        await this.markOutboxDelivery(outboxId, 'failed');
        throw error;
      }
      await this.recordAudit('tenant.invitation.resent', 'tenant_invitation', invitationId, {
        email: invitation.email.toLowerCase(),
        display_name: invitation.display_name,
        role_code: roleCode,
        expires_at: expiresAt.toISOString(),
      });

      return {
        id: invitationId,
        invitation_sent: true,
        expires_at: expiresAt.toISOString(),
      };
    });
  }

  async revokeTenantInvitation(
    invitationId: string,
  ): Promise<TenantInvitationActionResponseDto> {
    const tenantId = this.requireTenantId();
    const context = this.requestContext.requireStore();
    const result = await this.databaseService.query<{ id: string }>(
      `
        UPDATE auth_action_tokens
        SET
          consumed_at = NOW(),
          metadata = metadata || jsonb_build_object(
            'status', 'revoked',
            'revoked_by_user_id', $3,
            'revoked_at', NOW()
          ),
          updated_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
          AND purpose = 'invite_acceptance'
          AND consumed_at IS NULL
          AND metadata->>'purpose' = 'tenant_user_invitation'
        RETURNING id::text
      `,
      [invitationId, tenantId, context.user_id],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Pending invitation was not found.');
    }
    await this.recordAudit('tenant.invitation.revoked', 'tenant_invitation', result.rows[0].id, {
      revoked_by_user_id: context.user_id,
    });

    return { id: result.rows[0].id, status: 'revoked' };
  }

  async updateTenantMembershipStatus(
    membershipId: string,
    status: 'active' | 'suspended',
  ): Promise<TenantManagedUserDto> {
    if (status !== 'active' && status !== 'suspended') {
      throw new BadRequestException('Tenant membership status must be active or suspended.');
    }

    const tenantId = this.requireTenantId();
    const result = await this.databaseService.query<TenantManagedUserRow>(
      `
        UPDATE tenant_memberships tm
        SET
          status = $3,
          updated_at = NOW()
        FROM users u, roles r
        WHERE tm.id = $1
          AND tm.tenant_id = $2
          AND u.id = tm.user_id
          AND r.id = tm.role_id
          AND r.tenant_id = tm.tenant_id
        RETURNING
          tm.id::text AS id,
          'member'::text AS kind,
          u.display_name,
          lower(u.email) AS email,
          r.code AS role_code,
          r.name AS role_name,
          tm.status,
          NULL::timestamptz AS expires_at,
          tm.created_at
      `,
      [membershipId, tenantId, status],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Tenant membership was not found.');
    }

    const membership = this.mapManagedUser(result.rows[0]);
    await this.recordAudit('tenant.membership.status_changed', 'tenant_membership', membership.id, {
      email: membership.email,
      display_name: membership.display_name,
      status,
      role_code: membership.role_code,
    });

    return membership;
  }

  async updateTenantMembershipRole(
    membershipId: string,
    roleCodeInput: string,
  ): Promise<TenantManagedUserDto> {
    const tenantId = this.requireTenantId();
    const roleCode = this.normalizeRoleCode(roleCodeInput);

    await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenantId);
    const role = await this.authorizationRepository.getRoleByCode(tenantId, roleCode);

    const result = await this.databaseService.query<TenantManagedUserRow>(
      `
        UPDATE tenant_memberships tm
        SET
          role_id = $3,
          updated_at = NOW()
        FROM users u, roles r
        WHERE tm.id = $1
          AND tm.tenant_id = $2
          AND u.id = tm.user_id
          AND r.id = $3
          AND r.tenant_id = tm.tenant_id
        RETURNING
          tm.id::text AS id,
          'member'::text AS kind,
          u.display_name,
          lower(u.email) AS email,
          r.code AS role_code,
          r.name AS role_name,
          tm.status,
          NULL::timestamptz AS expires_at,
          tm.created_at
      `,
      [membershipId, tenantId, role.id],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Tenant membership was not found.');
    }

    const membership = this.mapManagedUser(result.rows[0]);
    await this.recordAudit('tenant.membership.role_changed', 'tenant_membership', membership.id, {
      email: membership.email,
      display_name: membership.display_name,
      role_code: roleCode,
      role_name: membership.role_name,
    });

    return membership;
  }

  private normalizeRoleCode(roleCode: string): TenantInvitableRoleCode {
    const normalizedRoleCode = roleCode.trim().toLowerCase();

    if (!TENANT_INVITABLE_ROLE_CODES.includes(normalizedRoleCode as TenantInvitableRoleCode)) {
      throw new BadRequestException(`Unsupported invitation role "${roleCode}".`);
    }

    return normalizedRoleCode as TenantInvitableRoleCode;
  }

  private requireTenantId(): string {
    const context = this.requestContext.requireStore();
    const tenantId = context.tenant_id?.trim();

    if (!tenantId) {
      throw new BadRequestException('A school tenant context is required to send invitations.');
    }

    return tenantId;
  }

  private async getSchoolName(tenantId: string): Promise<string> {
    const result = await this.databaseService.query<TenantNameRow>(
      `
        SELECT name FROM tenants
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId],
    );

    return result.rows[0]?.name ?? tenantId;
  }

  private async createInvitationAction(input: {
    tenantId: string;
    email: string;
    displayName: string;
    roleCode: TenantInvitableRoleCode;
    tokenHash: string;
    expiresAt: Date;
    payload: Record<string, unknown>;
    inviteUrl: string;
    schoolName: string;
  }): Promise<string> {
    await this.databaseService.query(
      `
        UPDATE auth_action_tokens
        SET consumed_at = NOW()
        WHERE tenant_id = $1
          AND lower(email) = lower($2)
          AND purpose = 'invite_acceptance'
          AND consumed_at IS NULL
      `,
      [input.tenantId, input.email],
    );

    const invitationResult = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO auth_action_tokens (
          tenant_id,
          user_id,
          email,
          token_hash,
          purpose,
          expires_at,
          metadata
        )
        VALUES ($1, $2, $3, $4, 'invite_acceptance', $5, $6::jsonb)
        RETURNING id
      `,
      [
        input.tenantId,
        null,
        input.email,
        input.tokenHash,
        input.expiresAt,
        JSON.stringify(input.payload),
      ],
    );
    const invitationId = invitationResult.rows[0]?.id;

    if (!invitationId) {
      throw new Error('Invitation token could not be created.');
    }

    const outboxResult = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO auth_email_outbox (
          tenant_id,
          user_id,
          recipient_email,
          template,
          subject,
          payload,
          status
        )
        VALUES ($1, NULL, $2, 'invite_acceptance', $3, $4::jsonb, 'pending')
        RETURNING id
      `,
      [
        input.tenantId,
        input.email,
        'You have been invited to ShuleHub ERP',
        JSON.stringify({
          ...input.payload,
          invite_url: input.inviteUrl,
        }),
      ],
    );
    const outboxId = outboxResult.rows[0]?.id;

    try {
      await this.emailService.sendInvitationEmail({
        to: input.email,
        displayName: input.displayName,
        schoolName: input.schoolName,
        inviteUrl: input.inviteUrl,
        expiresAt: input.expiresAt,
      });
      await this.markOutboxDelivery(outboxId, 'sent');
    } catch (error) {
      await this.markOutboxDelivery(outboxId, 'failed');
      throw error;
    }

    return invitationId;
  }

  private async queueInvitationEmail(input: {
    tenantId: string;
    email: string;
    payload: Record<string, unknown>;
  }): Promise<string | undefined> {
    const outboxResult = await this.databaseService.query<{ id: string }>(
      `
        INSERT INTO auth_email_outbox (
          tenant_id,
          user_id,
          recipient_email,
          template,
          subject,
          payload,
          status
        )
        VALUES ($1, NULL, $2, 'invite_acceptance', $3, $4::jsonb, 'pending')
        RETURNING id
      `,
      [
        input.tenantId,
        input.email,
        'You have been invited to ShuleHub ERP',
        JSON.stringify(input.payload),
      ],
    );

    return outboxResult.rows[0]?.id;
  }

  private async loadPendingTenantInvitationForUpdate(
    invitationId: string,
    tenantId: string,
  ): Promise<PendingInvitationRow> {
    const result = await this.databaseService.query<PendingInvitationRow>(
      `
        SELECT
          id::text,
          lower(email) AS email,
          COALESCE(NULLIF(metadata->>'display_name', ''), email) AS display_name,
          COALESCE(NULLIF(metadata->>'role_code', ''), 'member') AS role_code,
          expires_at
        FROM auth_action_tokens
        WHERE id = $1
          AND tenant_id = $2
          AND purpose = 'invite_acceptance'
          AND consumed_at IS NULL
          AND metadata->>'purpose' = 'tenant_user_invitation'
        LIMIT 1
        FOR UPDATE
      `,
      [invitationId, tenantId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Pending invitation was not found.');
    }

    return result.rows[0];
  }

  private mapManagedUser(row: TenantManagedUserRow): TenantManagedUserDto {
    return {
      id: row.id,
      kind: row.kind,
      display_name: row.display_name,
      email: row.email,
      role_code: row.role_code,
      role_name: row.role_name,
      status: row.status,
      expires_at: this.toIsoStringOrNull(row.expires_at),
      created_at: this.toIsoString(row.created_at),
    };
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toIsoStringOrNull(value: Date | string | null): string | null {
    return value ? this.toIsoString(value) : null;
  }

  private async recordAudit(
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService?.record({
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    });
  }

  private async markOutboxDelivery(
    outboxId: string | undefined,
    status: 'sent' | 'failed',
  ): Promise<void> {
    if (!outboxId) {
      return;
    }

    await this.databaseService.query(
      'SELECT app.mark_auth_email_outbox_delivery($1, $2)',
      [outboxId, status],
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getInvitationTtlMs(): number {
    const ttlMinutes = Number(
      this.configService.get<number>('email.invitationTtlMinutes') ?? 10080,
    );
    const safeMinutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10080;

    return safeMinutes * 60 * 1000;
  }

  private buildInvitationUrl(token: string): string {
    const baseUrl = (
      this.configService.get<string>('email.publicAppUrl') ??
      'https://shule-hub-erp.vercel.app'
    ).replace(/\/$/, '');

    return `${baseUrl}/invite/accept?token=${encodeURIComponent(token)}`;
  }
}
