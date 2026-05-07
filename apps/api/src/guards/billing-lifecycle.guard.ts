import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';
import {
  BILLING_ALLOWED_BILLING_PATH_PREFIXES,
  BILLING_ALLOWED_EXPORT_PATH_PREFIXES,
  BILLING_ALLOWED_READ_ONLY_METHODS,
} from '../modules/billing/billing.constants';

@Injectable()
export class BillingLifecycleGuard implements CanActivate {
  constructor(private readonly requestContext: RequestContextService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string; path?: string; url?: string }>();
    const store = this.requestContext.requireStore();

    if (!store.tenant_id) {
      return true;
    }

    const path = request.path ?? request.url ?? store.path ?? '';
    const method = (request.method ?? store.method ?? 'GET').toUpperCase();

    if (this.isAlwaysAllowedPath(path)) {
      return true;
    }

    const access = store.billing;

    if (!access?.subscription_id || access.access_mode === 'billing_only') {
      throw new HttpException(
        'Your subscription is suspended. Billing, renewal, support, and data export are still available.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (
      access.access_mode === 'read_only'
      && !BILLING_ALLOWED_READ_ONLY_METHODS.includes(
        method as (typeof BILLING_ALLOWED_READ_ONLY_METHODS)[number],
      )
    ) {
      throw new HttpException(
        'Your subscription is in restricted read-only mode. Renew to restore updates and new records.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }

  private isAlwaysAllowedPath(path: string): boolean {
    return (
      BILLING_ALLOWED_BILLING_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
      || BILLING_ALLOWED_EXPORT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
    );
  }
}
