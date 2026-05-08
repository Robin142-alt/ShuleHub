import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import type { AuthAudience } from '../auth/auth.interfaces';

@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(
    private readonly authService: AuthService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
  ) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    try {
      const accessToken = this.authService.extractBearerToken(request);

      if (!accessToken) {
        next();
        return;
      }

      const requestContext = this.requestContext.requireStore();

      const audience = this.resolveAudience(request);
      const expectedTenantId = audience === 'superadmin' ? null : requestContext.tenant_id;

      if (!requestContext.tenant_id && expectedTenantId !== null) {
        throw new UnauthorizedException('Tenant context is required before authentication');
      }

      const principal = await this.authService.authenticateAccessToken(
        accessToken,
        expectedTenantId,
        audience,
      );

      this.requestContext.setUserId(principal.user_id);
      this.requestContext.setAudience(principal.audience);
      this.requestContext.setRole(principal.role);
      this.requestContext.setSessionId(principal.session_id);
      this.requestContext.setPermissions(principal.permissions);
      this.requestContext.setAuthenticated(principal.is_authenticated);

      await this.databaseService.synchronizeRequestSession(this.requestContext.requireStore());

      next();
    } catch (error) {
      next(error as Error);
    }
  }

  private resolveAudience(request: Request): AuthAudience {
    const audienceHeader = request.headers['x-auth-audience'];
    const audience = Array.isArray(audienceHeader)
      ? audienceHeader[0]
      : audienceHeader;

    if (audience === 'superadmin' || audience === 'portal' || audience === 'school') {
      return audience;
    }

    return 'school';
  }
}
