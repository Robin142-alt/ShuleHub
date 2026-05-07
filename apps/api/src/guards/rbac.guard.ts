import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY, ROLES_KEY } from '../auth/auth.constants';
import { RequestContextService } from '../common/request-context/request-context.service';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredPermissions || requiredPermissions.length === 0)) {
      return true;
    }

    const requestContext = this.requestContext.requireStore();

    if (!requestContext.is_authenticated) {
      throw new ForbiddenException('Authenticated access is required for RBAC checks');
    }

    if (requiredRoles?.length && (!requestContext.role || !requiredRoles.includes(requestContext.role))) {
      throw new ForbiddenException('Role-based access denied');
    }

    if (requiredPermissions?.length) {
      const hasAllPermissions = requiredPermissions.every((permission) =>
        this.hasPermission(requestContext.permissions, permission),
      );

      if (!hasAllPermissions) {
        throw new ForbiddenException('Permission-based access denied');
      }
    }

    return true;
  }

  private hasPermission(grantedPermissions: string[], requiredPermission: string): boolean {
    if (grantedPermissions.includes('*:*')) {
      return true;
    }

    if (grantedPermissions.includes(requiredPermission)) {
      return true;
    }

    const [resource] = requiredPermission.split(':');
    return grantedPermissions.includes(`${resource}:*`);
  }
}

