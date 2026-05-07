import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RequestContextService } from '../common/request-context/request-context.service';
import { BillingAccessService } from '../modules/billing/billing-access.service';
import { FEATURE_GATE_KEY } from '../modules/billing/billing.constants';

@Injectable()
export class BillingFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
    private readonly billingAccessService: BillingAccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(FEATURE_GATE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const requestContext = this.requestContext.requireStore();
    const access = requestContext.billing;

    if (!requestContext.tenant_id || !access?.is_active) {
      throw new HttpException(
        'An active subscription is required to access this feature',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const missingFeature = requiredFeatures.find(
      (feature) => !this.billingAccessService.hasFeature(access, feature),
    );

    if (missingFeature) {
      throw new HttpException(
        `Current subscription does not include feature "${missingFeature}"`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
