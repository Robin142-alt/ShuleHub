import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { AuthRequestMetadata } from './auth.interfaces';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, this.buildRequestMetadata(request));
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, this.buildRequestMetadata(request));
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(dto, this.buildRequestMetadata(request));
  }

  @Post('logout')
  async logout(): Promise<LogoutResponseDto> {
    return this.authService.logout();
  }

  @Get('me')
  async me(): Promise<MeResponseDto> {
    return this.authService.me();
  }

  private buildRequestMetadata(request: Request): AuthRequestMetadata {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim() || request.ip || null;
    const userAgentHeader = request.headers['user-agent'];

    return {
      ip_address: ipAddress,
      user_agent: Array.isArray(userAgentHeader) ? userAgentHeader[0] ?? null : userAgentHeader ?? null,
    };
  }
}
