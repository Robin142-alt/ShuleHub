import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';

@Injectable()
export class TenantBoundGuard implements CanActivate {
  constructor(private readonly requestContext: RequestContextService) {}

  canActivate(_context: ExecutionContext): boolean {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new BadRequestException('Tenant context is missing for this request');
    }

    return true;
  }
}

