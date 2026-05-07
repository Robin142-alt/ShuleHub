import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AUTH_ANONYMOUS_USER_ID } from '../../auth/auth.constants';
import { SessionService } from '../../auth/session.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { ConsentRecordResponseDto } from './dto/consent-record-response.dto';
import { DataExportResponseDto, ExportedMembershipDto, ExportedUserDto } from './dto/data-export-response.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { RecordConsentDto } from './dto/record-consent.dto';

interface UserExportRow {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface MembershipExportRow {
  tenant_id: string;
  role_code: string;
  role_name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface ConsentRecordRow {
  id: string;
  tenant_id: string;
  consent_type: string;
  status: 'granted' | 'revoked' | 'withdrawn';
  policy_version: string;
  metadata: Record<string, unknown> | null;
  captured_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly sessionService: SessionService,
  ) {}

  async exportMyData(): Promise<DataExportResponseDto> {
    const { tenantId, userId } = this.requireAuthenticatedContext();
    const user = await this.loadUser(userId);
    const membership = await this.loadCurrentMembership(userId, tenantId);
    const consents = await this.listConsentRows(tenantId, userId);

    return Object.assign(new DataExportResponseDto(), {
      generated_at: new Date().toISOString(),
      user: this.mapUser(user),
      membership: this.mapMembership(membership),
      consents: consents.map((consent) => this.mapConsent(consent)),
    });
  }

  async listMyConsents(): Promise<ConsentRecordResponseDto[]> {
    const { tenantId, userId } = this.requireAuthenticatedContext();
    await this.loadCurrentMembership(userId, tenantId);
    const consents = await this.listConsentRows(tenantId, userId);
    return consents.map((consent) => this.mapConsent(consent));
  }

  async recordMyConsent(dto: RecordConsentDto): Promise<ConsentRecordResponseDto> {
    const { tenantId, userId } = this.requireAuthenticatedContext();
    await this.loadCurrentMembership(userId, tenantId);

    const consent = await this.databaseService.withRequestTransaction(async () => {
      const result = await this.databaseService.query<ConsentRecordRow>(
        `
          INSERT INTO consent_records (
            tenant_id,
            user_id,
            consent_type,
            status,
            policy_version,
            metadata,
            captured_at
          )
          VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb, NOW())
          RETURNING
            id,
            tenant_id,
            consent_type,
            status,
            policy_version,
            metadata,
            captured_at,
            created_at,
            updated_at
        `,
        [
          tenantId,
          userId,
          dto.consent_type.trim(),
          dto.status,
          dto.policy_version.trim(),
          JSON.stringify(dto.metadata ?? {}),
        ],
      );

      return result.rows[0];
    });

    return this.mapConsent(consent);
  }

  async deleteMyAccount(): Promise<DeleteAccountResponseDto> {
    const { tenantId, userId } = this.requireAuthenticatedContext();
    const deletedAt = new Date().toISOString();

    await this.databaseService.withRequestTransaction(async () => {
      await this.loadCurrentMembership(userId, tenantId);
      const deletionResult = await this.databaseService.query<{ id: string }>(
        `
          DELETE FROM users
          WHERE id = $1::uuid
          RETURNING id
        `,
        [userId],
      );

      if (!deletionResult.rows[0]) {
        throw new UnauthorizedException('User account could not be deleted');
      }
    });

    await this.sessionService.invalidateUserSessions(userId);

    return {
      success: true,
      deleted_at: deletedAt,
      deleted_user_id: userId,
    };
  }

  private requireAuthenticatedContext(): { tenantId: string; userId: string } {
    const store = this.requestContext.requireStore();

    if (
      !store.is_authenticated
      || !store.user_id
      || store.user_id === AUTH_ANONYMOUS_USER_ID
      || !store.tenant_id
      || !store.session_id
    ) {
      throw new UnauthorizedException('An authenticated user context is required');
    }

    return {
      tenantId: store.tenant_id,
      userId: store.user_id,
    };
  }

  private async loadUser(userId: string): Promise<UserExportRow> {
    const result = await this.databaseService.query<UserExportRow>(
      `
        SELECT
          id,
          email,
          display_name,
          status,
          created_at,
          updated_at
        FROM users
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [userId],
    );

    if (!result.rows[0]) {
      throw new UnauthorizedException('User account is no longer available');
    }

    return result.rows[0];
  }

  private async loadCurrentMembership(
    userId: string,
    tenantId: string,
  ): Promise<MembershipExportRow> {
    const result = await this.databaseService.query<MembershipExportRow>(
      `
        SELECT
          tm.tenant_id,
          r.code AS role_code,
          r.name AS role_name,
          tm.status,
          tm.created_at,
          tm.updated_at
        FROM tenant_memberships tm
        INNER JOIN roles r
          ON r.id = tm.role_id
         AND r.tenant_id = tm.tenant_id
        WHERE tm.user_id = $1::uuid
          AND tm.tenant_id = $2
          AND tm.status = 'active'
        LIMIT 1
      `,
      [userId, tenantId],
    );

    if (!result.rows[0]) {
      throw new UnauthorizedException('User no longer has access to this tenant');
    }

    return result.rows[0];
  }

  private async listConsentRows(
    tenantId: string,
    userId: string,
  ): Promise<ConsentRecordRow[]> {
    const result = await this.databaseService.query<ConsentRecordRow>(
      `
        SELECT
          id,
          tenant_id,
          consent_type,
          status,
          policy_version,
          metadata,
          captured_at,
          created_at,
          updated_at
        FROM consent_records
        WHERE tenant_id = $1
          AND user_id = $2::uuid
        ORDER BY captured_at DESC, created_at DESC
      `,
      [tenantId, userId],
    );

    return result.rows;
  }

  private mapUser(user: UserExportRow): ExportedUserDto {
    return Object.assign(new ExportedUserDto(), {
      user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      status: user.status,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    });
  }

  private mapMembership(membership: MembershipExportRow): ExportedMembershipDto {
    return Object.assign(new ExportedMembershipDto(), {
      tenant_id: membership.tenant_id,
      role_code: membership.role_code,
      role_name: membership.role_name,
      status: membership.status,
      created_at: membership.created_at.toISOString(),
      updated_at: membership.updated_at.toISOString(),
    });
  }

  private mapConsent(consent: ConsentRecordRow): ConsentRecordResponseDto {
    return Object.assign(new ConsentRecordResponseDto(), {
      id: consent.id,
      tenant_id: consent.tenant_id,
      consent_type: consent.consent_type,
      status: consent.status,
      policy_version: consent.policy_version,
      metadata: consent.metadata ?? {},
      captured_at: consent.captured_at.toISOString(),
      created_at: consent.created_at.toISOString(),
      updated_at: consent.updated_at.toISOString(),
    });
  }
}
