import {
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, randomUUID } from 'node:crypto';

import { AuthResponseDto } from '../../auth/dto/auth-response.dto';
import { AuthorizationRepository } from '../../auth/repositories/authorization.repository';
import { SessionService } from '../../auth/session.service';
import { TokenService } from '../../auth/token.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import {
  RequestParentOtpDto,
  VerifyParentOtpDto,
} from './dto/integrations.dto';
import { ParentPortalAuthRepository } from './parent-portal-auth.repository';
import { SchoolSmsWalletService } from './school-sms-wallet.service';
import type { ParentAuthSubject } from './integrations.types';

@Injectable()
export class ParentPortalAuthService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly parentPortalAuthRepository: ParentPortalAuthRepository,
    private readonly authorizationRepository: AuthorizationRepository,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    @Optional() private readonly schoolSmsWalletService?: SchoolSmsWalletService,
  ) {}

  async requestOtp(dto: RequestParentOtpDto): Promise<{
    sent: true;
    challenge_id?: string;
    delivery_channel: 'sms' | 'email' | 'unknown';
    message: string;
  }> {
    const identifier = dto.identifier.trim();
    const phoneHash = this.isProbablyPhone(identifier) ? this.hashPhone(identifier) : null;
    const subject = await this.parentPortalAuthRepository.findParentAuthSubject({
      identifier,
      phone_hash: phoneHash,
    });

    if (!subject) {
      return {
        sent: true,
        delivery_channel: 'unknown',
        message: 'If a parent account exists, a verification code has been sent.',
      };
    }

    await this.activateTenantContext(subject.tenant_id);
    const otpCode = this.generateOtp();
    const challenge = await this.parentPortalAuthRepository.createOtpChallenge({
      tenant_id: subject.tenant_id,
      user_id: subject.user_id,
      email: subject.email,
      phone_hash: subject.phone_number_hash ?? phoneHash,
      phone_last4: subject.phone_number_last4 ?? this.last4(identifier),
      otp_hash: this.hashOtp(otpCode),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    await this.sendOtpBestEffort(subject, otpCode, identifier);

    return {
      sent: true,
      challenge_id: challenge.id,
      delivery_channel: subject.phone_number_hash ? 'sms' : 'email',
      message: 'If a parent account exists, a verification code has been sent.',
    };
  }

  async verifyOtp(dto: VerifyParentOtpDto): Promise<AuthResponseDto> {
    const challenge = await this.parentPortalAuthRepository.findChallengeForVerify(dto.challenge_id);

    if (!challenge || !challenge.user_id) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.activateTenantContext(challenge.tenant_id);

    if (challenge.consumed_at || Date.parse(String(challenge.expires_at)) < Date.now()) {
      throw new UnauthorizedException('Verification code has expired');
    }

    if (challenge.attempts >= 5) {
      throw new UnauthorizedException('Verification attempts exceeded');
    }

    if (this.hashOtp(dto.otp_code.trim()) !== challenge.otp_hash) {
      await this.parentPortalAuthRepository.incrementAttempts(challenge.tenant_id, challenge.id);
      throw new UnauthorizedException('Invalid verification code');
    }

    const subject = await this.parentPortalAuthRepository.findParentAuthSubject({
      identifier: challenge.email ?? '',
      phone_hash: challenge.phone_hash,
    });

    if (!subject) {
      throw new UnauthorizedException('Parent account is no longer active');
    }

    await this.authorizationRepository.ensureTenantAuthorizationBaseline(subject.tenant_id);
    const permissions = await this.authorizationRepository.getPermissionsByRoleId(
      subject.tenant_id,
      subject.role_id,
    );
    const tokenPair = await this.tokenService.issueTokenPair({
      user_id: subject.user_id,
      tenant_id: subject.tenant_id,
      role: subject.role_code,
      audience: 'portal',
      session_id: randomUUID(),
    });

    await this.sessionService.createSession({
      user_id: subject.user_id,
      tenant_id: subject.tenant_id,
      role: subject.role_code,
      audience: 'portal',
      permissions,
      session_id: tokenPair.session_id,
      is_authenticated: true,
      email_verified_at: new Date().toISOString(),
      refresh_token_id: tokenPair.refresh_token_id,
      refresh_expires_at: tokenPair.refresh_expires_at,
      ip_address: this.requestContext.getStore()?.client_ip ?? null,
      user_agent: this.requestContext.getStore()?.user_agent ?? null,
    });
    await this.parentPortalAuthRepository.consumeChallenge(challenge.tenant_id, challenge.id);

    return {
      tokens: {
        access_token: tokenPair.access_token,
        refresh_token: tokenPair.refresh_token,
        token_type: tokenPair.token_type,
        access_expires_in: tokenPair.access_expires_in,
        refresh_expires_in: tokenPair.refresh_expires_in,
        access_expires_at: tokenPair.access_expires_at,
        refresh_expires_at: tokenPair.refresh_expires_at,
      },
      user: {
        user_id: subject.user_id,
        tenant_id: subject.tenant_id,
        role: subject.role_code,
        audience: 'portal',
        email: subject.email,
        display_name: subject.display_name,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        permissions,
        session_id: tokenPair.session_id,
      },
    };
  }

  private async activateTenantContext(tenantId: string): Promise<void> {
    this.requestContext.setTenantId(tenantId);
    await this.databaseService.synchronizeRequestSession(this.requestContext.requireStore());
  }

  private async sendOtpBestEffort(subject: ParentAuthSubject, otpCode: string, identifier: string): Promise<void> {
    const recipient = this.isProbablyPhone(identifier) ? identifier : null;

    if (!this.schoolSmsWalletService || !recipient || !subject.phone_number_hash) {
      return;
    }

    try {
      await this.schoolSmsWalletService.sendSms({
        recipient,
        message: `Your ShuleHub parent portal code is ${otpCode}. It expires in 10 minutes.`,
        message_type: 'parent_otp',
      });
    } catch {
      // Parent OTP creation remains generic. Delivery failures are monitored through SMS logs.
    }
  }

  private generateOtp(): string {
    return String(randomInt(100000, 999999));
  }

  private hashOtp(value: string): string {
    return createHash('sha256')
      .update(`${value}:${this.pepper()}`)
      .digest('hex');
  }

  private hashPhone(value: string): string {
    return createHash('sha256')
      .update(`${value.replace(/\D/g, '')}:${this.pepper()}`)
      .digest('hex');
  }

  private pepper(): string {
    const value = this.configService.get<string>('security.piiEncryptionKey') ?? '';

    if (!value) {
      throw new BadRequestException('Parent portal security key is not configured');
    }

    return value;
  }

  private isProbablyPhone(value: string): boolean {
    return value.replace(/\D/g, '').length >= 7 && !value.includes('@');
  }

  private last4(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    return digits ? digits.slice(-4) : null;
  }
}
