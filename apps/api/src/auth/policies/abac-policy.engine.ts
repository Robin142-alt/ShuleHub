import { Injectable } from '@nestjs/common';

import { AuthenticatedPrincipal, PolicyContext } from '../auth.interfaces';

@Injectable()
export class AbacPolicyEngine {
  canAccess(
    user: AuthenticatedPrincipal | null | undefined,
    resource: string,
    action: string,
    context: PolicyContext = {},
  ): boolean {
    if (!user?.is_authenticated) {
      return false;
    }

    if (context.tenant_id && user.tenant_id !== context.tenant_id) {
      return false;
    }

    const hasMatchingPermission =
      this.hasPermission(user.permissions, '*', '*') ||
      this.hasPermission(user.permissions, resource, '*') ||
      this.hasPermission(user.permissions, resource, action);

    if (!hasMatchingPermission) {
      return false;
    }

    if (context.require_ownership) {
      return context.owner_user_id === user.user_id;
    }

    return true;
  }

  private hasPermission(permissions: string[], resource: string, action: string): boolean {
    const permissionKey = `${resource}:${action}`;
    return permissions.includes(permissionKey);
  }
}
