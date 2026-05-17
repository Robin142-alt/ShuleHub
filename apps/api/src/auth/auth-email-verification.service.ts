import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import { AuthEmailService } from './auth-email.service';
import { AuthRequestMetadata } from './auth.interfaces';
import { AuthActionResponseDto } from './dto/password-recovery.dto';
import { VerifyEmailDto } from './dto/email-verification.dto';

type EmailVerificationUserRow = {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  email_verified_at: Date | string | null;
};

type EmailVerificationActionRow = {
  token_id: string;
  outbox_id: string;
};

@Injectable()
export class AuthEmailVerificationService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly emailService: AuthEmailService,
    private readonly configService: ConfigService,
  ) {}

  async requestEmailVerification(
    metadata: AuthRequestMetadata,
  ): Promise<AuthActionResponseDto> {
    void metadata;
    this.emailService.assertEmailVerificationConfigured();

    const userId = this.requestContext.getStore()?.user_id;

    if (!userId) {
      throw new UnauthorizedException('Authentication is required to verify email');
    }

    const user = await this.findCurrentUser(userId);

    if (!user) {
      throw new UnauthorizedException('Authentication is required to verify email');
    }

    if (user.email_verified_at) {
      return {
        success: true,
        message: 'Email is already verified.',
      };
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.getEmailVerificationTtlMs());
    const verifyUrl = this.buildVerifyUrl(token);
    const subject = 'Verify your ShuleHub ERP email address';
    const payload = {
      display_name: user.display_name,
      expires_at: expiresAt.toISOString(),
      purpose: 'email_verification',
    };
    const verificationAction = await this.createVerificationAction({
      tenantId: user.tenant_id,
      userId: user.id,
      email: user.email,
      tokenHash,
      expiresAt,
      subject,
      payload,
    });

    try {
      await this.emailService.sendEmailVerificationEmail({
        to: user.email,
        displayName: user.display_name,
        verifyUrl,
        expiresAt,
      });
      await this.markOutboxDelivery(verificationAction.outbox_id, 'sent');
    } catch (error) {
      await this.markOutboxDelivery(verificationAction.outbox_id, 'failed');
      throw error;
    }

    return {
      success: true,
      message: 'Email verification instructions have been sent.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthActionResponseDto> {
    const tokenHash = this.hashToken(dto.token.trim());
    let result: Awaited<ReturnType<DatabaseService['query']>>;

    try {
      result = await this.databaseService.query(
        `
          SELECT user_id, email, tenant_id
          FROM app.consume_email_verification_action($1)
        `,
        [tokenHash],
      );
    } catch (error) {
      if (this.isInvalidVerificationTokenError(error)) {
        throw new UnauthorizedException('Invalid or expired email verification token');
      }

      throw error;
    }

    if (!result.rows[0]) {
      throw new UnauthorizedException('Invalid or expired email verification token');
    }

    return {
      success: true,
      message: 'Email verified successfully.',
    };
  }

  private async findCurrentUser(userId: string): Promise<EmailVerificationUserRow | null> {
    const result = await this.databaseService.query<EmailVerificationUserRow>(
      `
        SELECT id, tenant_id, email, display_name, email_verified_at
        FROM users
        WHERE id = $1
          AND status = 'active'
        LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  }

  private async createVerificationAction(input: {
    tenantId: string;
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    subject: string;
    payload: Record<string, unknown>;
  }): Promise<EmailVerificationActionRow> {
    const result = await this.databaseService.query<EmailVerificationActionRow>(
      `
        SELECT token_id, outbox_id
        FROM app.create_email_verification_action($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        input.tenantId,
        input.userId,
        input.email,
        input.tokenHash,
        input.expiresAt,
        input.subject,
        JSON.stringify(input.payload),
      ],
    );

    return result.rows[0];
  }

  private async markOutboxDelivery(
    outboxId: string,
    status: 'sent' | 'failed',
  ): Promise<void> {
    await this.databaseService.query(
      'SELECT app.mark_auth_email_outbox_delivery($1, $2)',
      [outboxId, status],
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isInvalidVerificationTokenError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes('Invalid or expired email verification token')
    );
  }

  private getEmailVerificationTtlMs(): number {
    const ttlMinutes = Number(
      this.configService.get<number>('email.emailVerificationTtlMinutes') ?? 60 * 24,
    );
    const safeMinutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 60 * 24;

    return safeMinutes * 60 * 1000;
  }

  private buildVerifyUrl(token: string): string {
    const baseUrl = (
      this.configService.get<string>('email.publicAppUrl') ??
      'https://shule-hub-erp.vercel.app'
    ).replace(/\/$/, '');

    return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  }
}
