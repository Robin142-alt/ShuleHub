import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PasswordRecoveryEmailInput = {
  to: string;
  displayName: string;
  resetUrl: string;
  expiresAt: Date;
};

type InvitationEmailInput = {
  to: string;
  displayName: string;
  schoolName: string;
  inviteUrl: string;
  expiresAt: Date;
};

type EmailVerificationEmailInput = {
  to: string;
  displayName: string;
  verifyUrl: string;
  expiresAt: Date;
};

type SupportNotificationEmailInput = {
  to: string;
  title: string;
  body: string;
};

export type TransactionalEmailStatus = {
  provider: string;
  status: 'configured' | 'missing';
  api_key_configured: boolean;
  sender_configured: boolean;
  public_app_url_configured: boolean;
};

@Injectable()
export class AuthEmailService {
  constructor(private readonly configService: ConfigService) {}

  assertPasswordRecoveryConfigured(): void {
    this.assertTransactionalEmailConfigured(
      'Password recovery is temporarily unavailable. Please contact support if you need immediate access.',
    );
  }

  assertEmailVerificationConfigured(): void {
    this.assertTransactionalEmailConfigured(
      'Email verification is temporarily unavailable. Please contact support if you need immediate access.',
    );
  }

  assertTransactionalEmailConfigured(message: string): void {
    if (!this.getResendApiKey() || !this.getSender()) {
      throw new ServiceUnavailableException(
        message,
      );
    }
  }

  getTransactionalEmailStatus(): TransactionalEmailStatus {
    const apiKeyConfigured = this.getResendApiKey().length > 0;
    const senderConfigured = this.getSender().length > 0;
    const publicAppUrlConfigured = this.getPublicAppUrl().length > 0;

    return {
      provider: this.configService.get<string>('email.provider')?.trim() || 'resend',
      status: apiKeyConfigured && senderConfigured ? 'configured' : 'missing',
      api_key_configured: apiKeyConfigured,
      sender_configured: senderConfigured,
      public_app_url_configured: publicAppUrlConfigured,
    };
  }

  async sendPasswordRecoveryEmail(input: PasswordRecoveryEmailInput): Promise<void> {
    const apiKey = this.getResendApiKey();
    const from = this.getSender();

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Password recovery is temporarily unavailable. Please contact support if you need immediate access.',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'Reset your ShuleHub ERP password',
        html: this.renderPasswordRecoveryHtml(input),
        text: this.renderPasswordRecoveryText(input),
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Password recovery email could not be sent right now.',
      );
    }
  }

  async sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
    const apiKey = this.getResendApiKey();
    const from = this.getSender();

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'School invitation email could not be sent right now.',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'You have been invited to ShuleHub ERP',
        html: this.renderInvitationHtml(input),
        text: this.renderInvitationText(input),
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'School invitation email could not be sent right now.',
      );
    }
  }

  async sendEmailVerificationEmail(input: EmailVerificationEmailInput): Promise<void> {
    const apiKey = this.getResendApiKey();
    const from = this.getSender();

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Email verification email could not be sent right now.',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'Verify your ShuleHub ERP email address',
        html: this.renderEmailVerificationHtml(input),
        text: this.renderEmailVerificationText(input),
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Email verification email could not be sent right now.',
      );
    }
  }

  async sendSupportNotificationEmail(input: SupportNotificationEmailInput): Promise<void> {
    const apiKey = this.getResendApiKey();
    const from = this.getSender();

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Support notification email could not be sent right now.',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.title,
        html: this.renderSupportNotificationHtml(input),
        text: this.renderSupportNotificationText(input),
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Support notification email could not be sent right now.',
      );
    }
  }

  private getResendApiKey(): string {
    return this.configService.get<string>('email.resendApiKey')?.trim() ?? '';
  }

  private getSender(): string {
    return this.configService.get<string>('email.from')?.trim() ?? '';
  }

  private getPublicAppUrl(): string {
    return this.configService.get<string>('email.publicAppUrl')?.trim() ?? '';
  }

  private renderPasswordRecoveryText(input: PasswordRecoveryEmailInput): string {
    return [
      `Hello ${input.displayName},`,
      '',
      'We received a request to reset your ShuleHub ERP password.',
      `Open this secure link before ${input.expiresAt.toISOString()}:`,
      input.resetUrl,
      '',
      'If you did not request this, you can ignore this email.',
      'ShuleHub ERP',
    ].join('\n');
  }

  private renderPasswordRecoveryHtml(input: PasswordRecoveryEmailInput): string {
    const safeName = this.escapeHtml(input.displayName);
    const safeUrl = this.escapeHtml(input.resetUrl);
    const expiry = this.escapeHtml(input.expiresAt.toISOString());

    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:32px 20px;">
        <p>Hello ${safeName},</p>
        <p>We received a request to reset your ShuleHub ERP password.</p>
        <p>
          <a href="${safeUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">
            Reset password
          </a>
        </p>
        <p style="color:#475569;font-size:14px;">This link expires at ${expiry}.</p>
        <p style="color:#475569;font-size:14px;">If you did not request this, you can ignore this email.</p>
        <p>ShuleHub ERP</p>
      </div>
    `;
  }

  private renderInvitationText(input: InvitationEmailInput): string {
    return [
      `Hello ${input.displayName},`,
      '',
      `You have been invited to manage ${input.schoolName} in ShuleHub ERP.`,
      `Accept this secure invitation before ${input.expiresAt.toISOString()}:`,
      input.inviteUrl,
      '',
      'If you were not expecting this invitation, ignore this email.',
      'ShuleHub ERP',
    ].join('\n');
  }

  private renderInvitationHtml(input: InvitationEmailInput): string {
    const safeName = this.escapeHtml(input.displayName);
    const safeSchoolName = this.escapeHtml(input.schoolName);
    const safeUrl = this.escapeHtml(input.inviteUrl);
    const expiry = this.escapeHtml(input.expiresAt.toISOString());

    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:32px 20px;">
        <p>Hello ${safeName},</p>
        <p>You have been invited to manage <strong>${safeSchoolName}</strong> in ShuleHub ERP.</p>
        <p>
          <a href="${safeUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">
            Accept invitation
          </a>
        </p>
        <p style="color:#475569;font-size:14px;">This invitation expires at ${expiry}.</p>
        <p style="color:#475569;font-size:14px;">If you were not expecting this invitation, ignore this email.</p>
        <p>ShuleHub ERP</p>
      </div>
    `;
  }

  private renderEmailVerificationText(input: EmailVerificationEmailInput): string {
    return [
      `Hello ${input.displayName},`,
      '',
      'Verify your ShuleHub ERP email address to keep your account recovery and security notices working.',
      `Open this secure link before ${input.expiresAt.toISOString()}:`,
      input.verifyUrl,
      '',
      'If you did not request this, you can ignore this email.',
      'ShuleHub ERP',
    ].join('\n');
  }

  private renderEmailVerificationHtml(input: EmailVerificationEmailInput): string {
    const safeName = this.escapeHtml(input.displayName);
    const safeUrl = this.escapeHtml(input.verifyUrl);
    const expiry = this.escapeHtml(input.expiresAt.toISOString());

    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:32px 20px;">
        <p>Hello ${safeName},</p>
        <p>Verify your ShuleHub ERP email address to keep your account recovery and security notices working.</p>
        <p>
          <a href="${safeUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">
            Verify email
          </a>
        </p>
        <p style="color:#475569;font-size:14px;">This link expires at ${expiry}.</p>
        <p style="color:#475569;font-size:14px;">If you did not request this, you can ignore this email.</p>
        <p>ShuleHub ERP</p>
      </div>
    `;
  }

  private renderSupportNotificationText(input: SupportNotificationEmailInput): string {
    return [
      input.title,
      '',
      input.body,
      '',
      'ShuleHub ERP Support',
    ].join('\n');
  }

  private renderSupportNotificationHtml(input: SupportNotificationEmailInput): string {
    const safeTitle = this.escapeHtml(input.title);
    const safeBody = this.escapeHtml(input.body);

    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:32px 20px;">
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">${safeTitle}</h1>
        <p>${safeBody}</p>
        <p style="color:#475569;font-size:14px;">ShuleHub ERP Support</p>
      </div>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
