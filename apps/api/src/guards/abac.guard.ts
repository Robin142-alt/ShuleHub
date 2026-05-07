import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { POLICY_KEY } from '../auth/auth.constants';
import { PolicyMetadata } from '../auth/auth.interfaces';
import { AbacPolicyEngine } from '../auth/policies/abac-policy.engine';
import { RequestContextService } from '../common/request-context/request-context.service';

@Injectable()
export class AbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
    private readonly abacPolicyEngine: AbacPolicyEngine,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<PolicyMetadata>(POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!policy) {
      return true;
    }

    const requestContext = this.requestContext.requireStore();

    if (!requestContext.is_authenticated || !requestContext.tenant_id) {
      throw new ForbiddenException('Authenticated tenant access is required for policy checks');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const policyContext = policy.contextFactory
      ? policy.contextFactory(request)
      : {
          tenant_id: requestContext.tenant_id,
          owner_user_id:
            request.body?.owner_user_id ??
            request.body?.user_id ??
            request.params?.userId ??
            request.params?.ownerUserId,
          request,
        };

    const allowed = this.abacPolicyEngine.canAccess(
      {
        user_id: requestContext.user_id,
        tenant_id: requestContext.tenant_id,
        role: requestContext.role ?? 'guest',
        audience: 'school',
        permissions: requestContext.permissions,
        session_id: requestContext.session_id ?? '',
        is_authenticated: requestContext.is_authenticated,
      },
      policy.resource,
      policy.action,
      policyContext,
    );

    if (!allowed) {
      throw new ForbiddenException('Attribute-based access denied');
    }

    return true;
  }
}
