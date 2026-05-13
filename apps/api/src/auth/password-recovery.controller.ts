import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { RequestContextService } from '../common/request-context/request-context.service';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ForgotPasswordResult,
  PasswordRecoveryService,
} from './password-recovery.service';

@Controller('auth/password')
export class PasswordRecoveryController {
  constructor(
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Public()
  @Post('forgot')
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<ForgotPasswordResult> {
    const store = this.requestContext.requireStore();

    return this.passwordRecoveryService.requestReset({
      tenant_id: store.tenant_id ?? '',
      email: dto.email,
      base_url: this.getRequestBaseUrl(request),
      ip_address: store.client_ip,
      user_agent: store.user_agent,
    });
  }

  @Public()
  @Post('reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: true }> {
    return this.passwordRecoveryService.resetPassword(dto);
  }

  private getRequestBaseUrl(request: Request): string {
    const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol ?? 'https').split(',')[0]?.trim() || 'https';
    const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost';
    const normalizedHost = Array.isArray(host) ? host[0] : host;

    return `${protocol}://${normalizedHost}`;
  }
}
