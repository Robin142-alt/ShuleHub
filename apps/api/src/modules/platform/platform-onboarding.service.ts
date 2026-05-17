import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { SUPERADMIN_ROLE_OWNER } from '../../auth/auth.constants';
import { AuthEmailService } from '../../auth/auth-email.service';
import { AuthorizationRepository } from '../../auth/repositories/authorization.repository';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { CreateSchoolDto, PlatformSchoolResponseDto } from './dto/create-school.dto';

type TenantRow = {
  tenant_id: string;
  name: string;
  subdomain: string;
  status: 'active' | 'inactive';
  created_at: Date | string;
};

@Injectable()
export class PlatformOnboardingService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authorizationRepository: AuthorizationRepository,
    private readonly emailService: AuthEmailService,
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  async listSchools(): Promise<PlatformSchoolResponseDto[]> {
    const result = await this.databaseService.query<TenantRow>(
      `
        SELECT tenant_id, name, subdomain, status, created_at
        FROM tenants
        ORDER BY created_at DESC, name ASC
      `,
    );

    return result.rows.map((row) => ({
      tenant_id: row.tenant_id,
      school_name: row.name,
      subdomain: row.subdomain,
      status: row.status,
      invitation_sent: false,
      admin_email: '',
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async createSchool(dto: CreateSchoolDto): Promise<PlatformSchoolResponseDto> {
    this.emailService.assertTransactionalEmailConfigured(
      'School invitations are temporarily unavailable. Please configure transactional email before inviting school administrators.',
    );

    const tenantId = this.normalizeTenantId(dto.tenant_id);
    const schoolName = dto.school_name.trim();
    const adminEmail = dto.admin_email.trim().toLowerCase();
    const adminName = dto.admin_name.trim();
    const invitedByUserId = this.requestContext.getStore()?.user_id ?? null;

    if (!schoolName || !adminName) {
      throw new BadRequestException('School name and administrator name are required.');
    }

    return this.databaseService.withRequestTransaction(async () => {
      const tenant = await this.createTenant({
        tenantId,
        schoolName,
        county: dto.county?.trim() || null,
        invitedByUserId,
      });

      await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenantId);

      const token = randomBytes(32).toString('base64url');
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.getInvitationTtlMs());
      const inviteUrl = this.buildInvitationUrl(token);
      const payload = {
        tenant_id: tenantId,
        tenant_name: schoolName,
        role_code: 'owner',
        display_name: adminName,
        invited_by_user_id: invitedByUserId,
        purpose: 'school_admin_invitation',
        expires_at: expiresAt.toISOString(),
      };

      await this.createInvitationAction({
        tenantId,
        adminEmail,
        adminName,
        tokenHash,
        expiresAt,
        payload,
        inviteUrl,
      });

      return {
        tenant_id: tenant.tenant_id,
        school_name: tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
        invitation_sent: true,
        admin_email: adminEmail,
        created_at: new Date(tenant.created_at).toISOString(),
      };
    });
  }

  private async createTenant(input: {
    tenantId: string;
    schoolName: string;
    county: string | null;
    invitedByUserId: string | null;
  }): Promise<TenantRow> {
    const result = await this.databaseService.query<TenantRow>(
      `
        INSERT INTO tenants (tenant_id, name, subdomain, status, settings, metadata)
        VALUES ($1, $2, $3, 'active', '{}'::jsonb, $4::jsonb)
        ON CONFLICT (tenant_id) DO NOTHING
        RETURNING tenant_id, name, subdomain, status, created_at
      `,
      [
        input.tenantId,
        input.schoolName,
        input.tenantId,
        JSON.stringify({
          county: input.county,
          onboarded_by_user_id: input.invitedByUserId,
          onboarding_source: SUPERADMIN_ROLE_OWNER,
        }),
      ],
    );

    const tenant = result.rows[0];
    if (!tenant) {
      throw new ConflictException('A school workspace with this code already exists.');
    }

    return tenant;
  }

  private async createInvitationAction(input: {
    tenantId: string;
    adminEmail: string;
    adminName: string;
    tokenHash: string;
    expiresAt: Date;
    payload: Record<string, unknown>;
    inviteUrl: string;
  }): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE auth_action_tokens
        SET consumed_at = NOW()
        WHERE tenant_id = $1
          AND lower(email) = lower($2)
          AND purpose = 'invite_acceptance'
          AND consumed_at IS NULL
      `,
      [input.tenantId, input.adminEmail],
    );

    await this.databaseService.query(
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
        input.adminEmail,
        input.tokenHash,
        input.expiresAt,
        JSON.stringify(input.payload),
      ],
    );

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
        VALUES ($1, NULL, $2, 'school_invitation', $3, $4::jsonb, 'pending')
        RETURNING id
      `,
      [
        input.tenantId,
        input.adminEmail,
        'You have been invited to ShuleHub ERP',
        JSON.stringify(input.payload),
      ],
    );
    const outboxId = outboxResult.rows[0]?.id;

    try {
      await this.emailService.sendInvitationEmail({
        to: input.adminEmail,
        displayName: input.adminName,
        schoolName: String(input.payload.tenant_name ?? input.tenantId),
        inviteUrl: input.inviteUrl,
        expiresAt: input.expiresAt,
      });
      await this.markOutboxDelivery(outboxId, 'sent');
    } catch (error) {
      await this.markOutboxDelivery(outboxId, 'failed');
      throw error;
    }
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

  private normalizeTenantId(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(normalized)) {
      throw new BadRequestException('Use a school URL slug with letters, numbers, and hyphens.');
    }

    return normalized;
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
