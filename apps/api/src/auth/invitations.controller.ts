import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { RequestContextService } from '../common/request-context/request-context.service';
import { Permissions } from './decorators/permissions.decorator';
import { Public } from './decorators/public.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  AcceptedInvitation,
  CreatedInvitation,
  InvitationService,
} from './invitation.service';

@Controller('auth/invitations')
export class InvitationsController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Post()
  @Permissions('users:write')
  async createInvitation(
    @Body() dto: CreateInvitationDto,
    @Req() request: Request,
  ): Promise<CreatedInvitation> {
    const store = this.requestContext.requireStore();

    if (!store.tenant_id || store.user_id === 'anonymous') {
      throw new UnauthorizedException('Authenticated tenant context is required');
    }

    return this.invitationService.createInvitation({
      tenant_id: store.tenant_id,
      email: dto.email,
      display_name: dto.display_name,
      role: dto.role,
      created_by_user_id: store.user_id,
      base_url: dto.base_url ?? this.getRequestBaseUrl(request),
    });
  }

  @Public()
  @Post('accept')
  async acceptInvitation(@Body() dto: AcceptInvitationDto): Promise<AcceptedInvitation> {
    return this.invitationService.acceptInvitation(dto);
  }

  private getRequestBaseUrl(request: Request): string {
    const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol ?? 'https').split(',')[0]?.trim() || 'https';
    const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost';
    const normalizedHost = Array.isArray(host) ? host[0] : host;

    return `${protocol}://${normalizedHost}`;
  }
}
