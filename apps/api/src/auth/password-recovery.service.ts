import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuditService } from './audit.service';
import { hashIdentityToken, createIdentityToken } from './identity-token.util';
import { PasswordService } from './password.service';
import { PasswordResetsRepository } from './repositories/password-resets.repository';
import { UsersRepository } from './repositories/users.repository';
import { SessionService } from './session.service';

export interface ForgotPasswordInput {
  tenant_id: string;
  email: string;
  base_url: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface ForgotPasswordResult {
  delivered: boolean;
  reset_url?: string;
  message: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly passwordResetsRepository: PasswordResetsRepository,
    private readonly passwordService: PasswordService,
    private readonly usersRepository: UsersRepository,
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
  ) {}

  async requestReset(input: ForgotPasswordInput): Promise<ForgotPasswordResult> {
    const genericMessage = 'If an active account exists, password reset instructions will be sent.';
    const user = await this.usersRepository.findActiveTenantUserByEmail(input.tenant_id, input.email);

    if (!user) {
      await this.auditService.record({
        tenant_id: input.tenant_id,
        action: 'password_reset.requested',
        resource_type: 'user',
        metadata: {
          email: input.email.toLowerCase(),
          delivered: false,
        },
      });

      return {
        delivered: false,
        message: genericMessage,
      };
    }

    const rawToken = createIdentityToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    await this.passwordResetsRepository.createReset({
      tenant_id: input.tenant_id,
      user_id: user.id,
      email: user.email,
      token_hash: hashIdentityToken(rawToken),
      expires_at: expiresAt,
      requested_ip: input.ip_address ?? null,
      requested_user_agent: input.user_agent ?? null,
    });

    const resetUrl = new URL('/reset-password', input.base_url);
    resetUrl.searchParams.set('token', rawToken);

    await this.auditService.record({
      tenant_id: input.tenant_id,
      actor_user_id: user.id,
      action: 'password_reset.requested',
      resource_type: 'user',
      resource_id: user.id,
      metadata: {
        email: user.email,
        delivered: true,
      },
    });

    return {
      delivered: true,
      reset_url: resetUrl.toString(),
      message: genericMessage,
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ success: true }> {
    this.assertPassword(input.password);

    const reset = await this.passwordResetsRepository.findValidToken(
      hashIdentityToken(input.token),
    );

    if (!reset) {
      throw new UnauthorizedException('Password reset link is invalid or has expired');
    }

    const passwordHash = await this.passwordService.hash(input.password);
    await this.usersRepository.updatePasswordHash(reset.user_id, passwordHash);
    await this.passwordResetsRepository.markUsed({
      tenant_id: reset.tenant_id,
      user_id: reset.user_id,
      token_hash: hashIdentityToken(input.token),
    });
    await this.sessionService.invalidateUserSessions(reset.user_id);
    await this.auditService.record({
      tenant_id: reset.tenant_id,
      actor_user_id: reset.user_id,
      action: 'password_reset.completed',
      resource_type: 'user',
      resource_id: reset.user_id,
      metadata: {
        email: reset.email,
      },
    });

    return { success: true };
  }

  private assertPassword(password: string): void {
    if (password.trim().length < 12) {
      throw new BadRequestException('Password must be at least 12 characters long');
    }
  }
}
