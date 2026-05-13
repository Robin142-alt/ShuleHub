import { ConflictException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { TenantEntity } from '../entities/tenant.entity';

interface TenantRow {
  id: string;
  tenant_id: string;
  school_name: string;
  slug: string;
  primary_domain: string;
  contact_email: string;
  phone: string;
  address: string;
  county: string;
  plan_code: string;
  student_limit: number;
  status: TenantEntity['status'];
  onboarding_status: TenantEntity['onboarding_status'];
  branding: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TenantsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createTenant(input: {
    tenant_id: string;
    school_name: string;
    slug: string;
    primary_domain: string;
    contact_email: string;
    phone: string;
    address: string;
    county: string;
    plan_code: string;
    student_limit: number;
    branding: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<TenantEntity> {
    try {
      const result = await this.databaseService.query<TenantRow>(
        `
          INSERT INTO tenants (
            tenant_id,
            school_name,
            slug,
            primary_domain,
            contact_email,
            phone,
            address,
            county,
            plan_code,
            student_limit,
            status,
            onboarding_status,
            branding,
            metadata
          )
          VALUES ($1, $2, $3, $4, lower($5), $6, $7, $8, $9, $10, 'provisioning', 'created', $11::jsonb, $12::jsonb)
          RETURNING
            id,
            tenant_id,
            school_name,
            slug,
            primary_domain,
            contact_email,
            phone,
            address,
            county,
            plan_code,
            student_limit,
            status,
            onboarding_status,
            branding,
            metadata,
            created_at,
            updated_at
        `,
        [
          input.tenant_id,
          input.school_name,
          input.slug,
          input.primary_domain,
          input.contact_email,
          input.phone,
          input.address,
          input.county,
          input.plan_code,
          input.student_limit,
          JSON.stringify(input.branding),
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      return this.mapRow(result.rows[0]);
    } catch (error) {
      if (error instanceof Error && /duplicate key/i.test(error.message)) {
        throw new ConflictException('A tenant with this subdomain already exists');
      }

      throw error;
    }
  }

  async markAdminInvited(tenantId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE tenants
        SET onboarding_status = 'admin_invited', updated_at = NOW()
        WHERE tenant_id = $1
      `,
      [tenantId],
    );
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    const result = await this.databaseService.query<TenantRow>(
      `
        SELECT
          id,
          tenant_id,
          school_name,
          slug,
          primary_domain,
          contact_email,
          phone,
          address,
          county,
          plan_code,
          student_limit,
          status,
          onboarding_status,
          branding,
          metadata,
          created_at,
          updated_at
        FROM tenants
        WHERE slug = $1
        LIMIT 1
      `,
      [slug],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: TenantRow): TenantEntity {
    return Object.assign(new TenantEntity(), {
      ...row,
      branding: row.branding ?? {},
      metadata: row.metadata ?? {},
    });
  }
}
