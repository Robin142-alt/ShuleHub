import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { AcceptInvitationDto, InvitationAcceptanceResponseDto } from './dto/invitation.dto';
import { PasswordService } from './password.service';

type InvitationAcceptanceRow = {
  user_id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role_code: string;
};

@Injectable()
export class AuthInvitationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly passwordService: PasswordService,
  ) {}

  async acceptInvitation(
    dto: AcceptInvitationDto,
  ): Promise<InvitationAcceptanceResponseDto> {
    const tokenHash = this.hashToken(dto.token.trim());
    const passwordHash = await this.passwordService.hash(dto.password);
    let acceptedInvite: InvitationAcceptanceRow | undefined;

    try {
      const result = await this.databaseService.query<InvitationAcceptanceRow>(
        `
          SELECT user_id, tenant_id, email, display_name, role_code
          FROM app.consume_invite_acceptance_action($1, $2, $3)
        `,
        [
          tokenHash,
          passwordHash,
          dto.display_name?.trim() || null,
        ],
      );
      acceptedInvite = result.rows[0];
    } catch (error) {
      if (this.isInvalidInvitationTokenError(error)) {
        throw new UnauthorizedException('Invalid or expired invitation token');
      }

      throw error;
    }

    if (!acceptedInvite) {
      throw new UnauthorizedException('Invalid or expired invitation token');
    }

    return {
      success: true,
      message: 'Invitation accepted. You can now sign in.',
      tenant_id: acceptedInvite.tenant_id,
      email: acceptedInvite.email,
      display_name: acceptedInvite.display_name,
      role: acceptedInvite.role_code,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isInvalidInvitationTokenError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes('Invalid or expired invitation token')
    );
  }
}
