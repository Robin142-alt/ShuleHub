import { Controller, Delete, Get, Param, Post, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';
import { SafeSessionRecord, SessionService } from './session.service';

@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly sessionService: SessionService,
  ) {}

  @Get()
  async listSessions(): Promise<{ data: SafeSessionRecord[] }> {
    const store = this.requestContext.requireStore();
    return {
      data: await this.sessionService.listUserSessions(store.user_id),
    };
  }

  @Delete(':sessionId')
  async revokeSession(@Param('sessionId') sessionId: string): Promise<{ success: true }> {
    const store = this.requestContext.requireStore();
    const session = await this.sessionService.getSession(sessionId);

    if (!session || session.user_id !== store.user_id) {
      throw new UnauthorizedException('Session was not found for this user');
    }

    await this.sessionService.invalidateSession(sessionId);
    return { success: true };
  }

  @Post('logout-all')
  async logoutAll(): Promise<{ success: true }> {
    const store = this.requestContext.requireStore();
    await this.sessionService.invalidateUserSessions(store.user_id);
    return { success: true };
  }
}
