import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { RequestContextService } from '../common/request-context/request-context.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();

    if (isPublic || request.method === 'OPTIONS') {
      return true;
    }

    const requestContext = this.requestContext.getStore();

    if (!requestContext?.is_authenticated || !requestContext.session_id) {
      throw new UnauthorizedException('Authentication is required');
    }

    return true;
  }
}

