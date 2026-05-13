import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { getDefaultDashboardPathForRole } from './auth.constants';
import { hashIdentityToken, createIdentityToken } from './identity-token.util';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuditService } from './audit.service';
import { InvitationsRepository, ValidInvitationToken } from './repositories/invitations.repository';
import { TenantMembershipsRepository } from './repositories/tenant-memberships.repository';
import { UsersRepository } from './repositories/users.repository';

export interface CreateInvitationInput {
  tenant_id: string;
  email: string;
  display_name: string;
  role: string;
  created_by_user_id?: string | null;
  expires_at?: string;
  base_url: string;
}

export interface CreatedInvitation {
  invitation_id: string;
  email: string;
  role: string;
  accept_url: string;
  expires_at: string;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  display_name?: string;
}

export interface AcceptedInvitation {
  tenant_id: string;
  email: string;
  role: string;
  redirect_to: string;
}

@Injectable()
export class InvitationService {
  constructor(
    private readonly invitationsRepository: InvitationsRepository,
    private readonly passwordService: PasswordService,
    private readonly usersRepository: UsersRepository,
    private readonly tenantMembershipsRepository: TenantMembershipsRepository,
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
  ) {}

  async createInvitation(input: CreateInvitationInput): Promise<CreatedInvitation> {
    const rawToken = createIdentityToken();
    const expiresAt = input.expires_at ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const invitation = await this.invitationsRepository.createInvitation({
      tenant_id: input.tenant_id,
      email: input.email,
      display_name: input.display_name,
      role: input.role,
      created_by_user_id: input.created_by_user_id ?? null,
      expires_at: expiresAt,
      token_hash: hashIdentityToken(rawToken),
    });
    const acceptUrl = new URL('/invite/accept', input.base_url);
    acceptUrl.searchParams.set('token', rawToken);

    await this.auditService.record({
      tenant_id: input.tenant_id,
      actor_user_id: input.created_by_user_id ?? null,
      action: 'invitation.created',
      resource_type: 'user_invitation',
      resource_id: invitation.invitation_id,
      metadata: {
        email: input.email.toLowerCase(),
        role: input.role,
      },
    });

    return {
      invitation_id: invitation.invitation_id,
      email: input.email.toLowerCase(),
      role: input.role,
      accept_url: acceptUrl.toString(),
      expires_at: expiresAt,
    };
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptedInvitation> {
    this.assertPassword(input.password);

    const token = await this.invitationsRepository.findValidToken(
      hashIdentityToken(input.token),
    );

    if (!token) {
      throw new UnauthorizedException('Invitation link is invalid or has expired');
    }

    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.usersRepository.ensureGlobalUserForInvitation({
      email: token.email,
      password_hash: passwordHash,
      display_name: input.display_name?.trim() || token.email,
    });

    await this.tenantMembershipsRepository.activateInvitedMembership({
      tenant_id: token.tenant_id,
      user_id: user.id,
      role_code: token.role,
      email: token.email,
    });
    await this.invitationsRepository.markAccepted({
      invitation_id: token.invitation_id,
      accepted_user_id: user.id,
    });
    await this.sessionService.invalidateUserSessions(user.id);
    await this.auditService.record({
      tenant_id: token.tenant_id,
      actor_user_id: user.id,
      action: 'invitation.accepted',
      resource_type: 'user_invitation',
      resource_id: token.invitation_id,
      metadata: {
        email: token.email,
        role: token.role,
      },
    });

    return this.toAcceptedInvitation(token);
  }

  private toAcceptedInvitation(token: ValidInvitationToken): AcceptedInvitation {
    return {
      tenant_id: token.tenant_id,
      email: token.email,
      role: token.role,
      redirect_to: getDefaultDashboardPathForRole(token.role),
    };
  }

  private assertPassword(password: string): void {
    if (password.trim().length < 12) {
      throw new BadRequestException('Password must be at least 12 characters long');
    }
  }
}
