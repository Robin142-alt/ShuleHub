import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TenantService {
  constructor(private readonly configService: ConfigService) {}

  resolveTenantId(hostHeader?: string, forwardedTenantId?: string | string[]): string {
    const explicitTenantId = this.normalizeForwardedTenantId(forwardedTenantId);

    if (explicitTenantId) {
      this.assertTenantId(explicitTenantId);
      return explicitTenantId;
    }

    const host = this.normalizeHost(hostHeader);
    const baseDomain = String(this.configService.get<string>('app.baseDomain') ?? 'localhost').toLowerCase();
    const defaultTenantId = this.configService.get<string>('app.defaultTenantId');

    if (host === 'localhost') {
      if (defaultTenantId) {
        return defaultTenantId;
      }

      throw new BadRequestException('DEFAULT_TENANT_ID must be configured for localhost requests');
    }

    if (host === baseDomain) {
      if (defaultTenantId) {
        return defaultTenantId;
      }

      throw new BadRequestException('No tenant subdomain was provided for this request');
    }

    if (host.endsWith(`.${baseDomain}`)) {
      const subdomain = host.slice(0, -(baseDomain.length + 1));
      this.assertTenantId(subdomain);
      return subdomain;
    }

    if (host.endsWith('.localhost')) {
      const subdomain = host.replace(/\.localhost$/, '');
      this.assertTenantId(subdomain);
      return subdomain;
    }

    if (defaultTenantId) {
      return defaultTenantId;
    }

    throw new BadRequestException(`Unable to derive tenant from host "${host}"`);
  }

  private normalizeHost(hostHeader?: string): string {
    if (!hostHeader || hostHeader.trim().length === 0) {
      throw new BadRequestException('Host header is required to resolve the tenant');
    }

    return hostHeader.replace(/:\d+$/, '').trim().toLowerCase();
  }

  private normalizeForwardedTenantId(forwardedTenantId?: string | string[]): string | null {
    const rawValue = Array.isArray(forwardedTenantId)
      ? forwardedTenantId[0]
      : forwardedTenantId;
    const normalized = rawValue?.trim().toLowerCase() ?? '';

    return normalized.length > 0 ? normalized : null;
  }

  private assertTenantId(tenantId: string): void {
    const isValidTenantId = /^[a-z0-9-]+$/.test(tenantId);

    if (!isValidTenantId) {
      throw new BadRequestException(`Invalid tenant identifier "${tenantId}"`);
    }
  }
}

