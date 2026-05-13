import { Injectable } from '@nestjs/common';

import { AuditService } from '../../auth/audit.service';
import { DEFAULT_ROLE_PRINCIPAL } from '../../auth/auth.constants';
import { InvitationService, CreatedInvitation } from '../../auth/invitation.service';
import { AuthorizationRepository } from '../../auth/repositories/authorization.repository';
import { SubscriptionsRepository } from '../billing/repositories/subscriptions.repository';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantEntity } from './entities/tenant.entity';
import { TenantsRepository } from './repositories/tenants.repository';

interface SubscriptionProvisioner {
  ensureBaselineSubscription?: (input: {
    tenant_id: string;
    plan_code: string;
    student_limit: number;
    billing_phone_number: string | null;
  }) => Promise<unknown>;
  expireCurrentSubscriptions?: (tenantId: string) => Promise<void>;
  createSubscription?: (input: {
    tenant_id: string;
    plan_code: string;
    status: 'trialing' | 'active';
    billing_phone_number: string | null;
    currency_code: string;
    features: string[];
    limits: Record<string, number | string | boolean | null>;
    seats_allocated: number;
    current_period_start: string;
    current_period_end: string;
    trial_ends_at: string | null;
    activated_at: string | null;
    metadata: Record<string, unknown>;
  }) => Promise<unknown>;
}

export interface OnboardedTenantResult {
  tenant: Pick<TenantEntity, 'tenant_id' | 'slug' | 'school_name' | 'status' | 'onboarding_status'>;
  invitation: CreatedInvitation;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly authorizationRepository: AuthorizationRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository & SubscriptionProvisioner,
    private readonly invitationService: InvitationService,
    private readonly auditService: AuditService,
  ) {}

  async createSchoolTenant(input: CreateTenantDto): Promise<OnboardedTenantResult> {
    const slug = input.subdomain.trim().toLowerCase();
    const tenant = await this.tenantsRepository.createTenant({
      tenant_id: slug,
      school_name: input.school_name.trim(),
      slug,
      primary_domain: `${slug}.domain.com`,
      contact_email: input.contact_email.trim().toLowerCase(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      county: input.county.trim(),
      plan_code: input.plan.trim(),
      student_limit: input.student_limit,
      branding: input.branding ?? this.createDefaultBranding(input.school_name, slug),
      metadata: {
        created_from: 'superadmin_onboarding',
      },
    });

    await this.authorizationRepository.ensureTenantAuthorizationBaseline(tenant.tenant_id);
    await this.ensureBaselineSubscription({
      tenant_id: tenant.tenant_id,
      plan_code: tenant.plan_code,
      student_limit: tenant.student_limit,
      billing_phone_number: tenant.phone,
    });

    const invitation = await this.invitationService.createInvitation({
      tenant_id: tenant.tenant_id,
      email: tenant.contact_email,
      display_name: `${tenant.school_name} Principal`,
      role: DEFAULT_ROLE_PRINCIPAL,
      created_by_user_id: null,
      base_url: input.base_url ?? `https://${tenant.primary_domain}`,
    });

    await this.tenantsRepository.markAdminInvited(tenant.tenant_id);
    await this.auditService.record({
      tenant_id: tenant.tenant_id,
      action: 'tenant.created',
      resource_type: 'tenant',
      metadata: {
        school_name: tenant.school_name,
        slug: tenant.slug,
        plan_code: tenant.plan_code,
        student_limit: tenant.student_limit,
      },
    });

    return {
      tenant: {
        tenant_id: tenant.tenant_id,
        slug: tenant.slug,
        school_name: tenant.school_name,
        status: tenant.status,
        onboarding_status: 'admin_invited',
      },
      invitation,
    };
  }

  private async ensureBaselineSubscription(input: {
    tenant_id: string;
    plan_code: string;
    student_limit: number;
    billing_phone_number: string | null;
  }): Promise<void> {
    if (this.subscriptionsRepository.ensureBaselineSubscription) {
      await this.subscriptionsRepository.ensureBaselineSubscription(input);
      return;
    }

    if (!this.subscriptionsRepository.createSubscription) {
      return;
    }

    await this.subscriptionsRepository.expireCurrentSubscriptions?.(input.tenant_id);
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
    await this.subscriptionsRepository.createSubscription({
      tenant_id: input.tenant_id,
      plan_code: input.plan_code,
      status: 'trialing',
      billing_phone_number: input.billing_phone_number,
      currency_code: 'KES',
      features: ['identity', 'students', 'finance', 'academics', 'portal'],
      limits: {
        students: input.student_limit,
      },
      seats_allocated: 1,
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      activated_at: null,
      metadata: {
        provisioned_by: 'tenant_onboarding',
      },
    });
  }

  private createDefaultBranding(schoolName: string, slug: string): Record<string, unknown> {
    const initials = schoolName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');

    return {
      school_name: schoolName,
      logo_mark: initials || slug.slice(0, 2).toUpperCase(),
      primary_color: '#0f766e',
      accent_color: '#1d4ed8',
    };
  }
}
