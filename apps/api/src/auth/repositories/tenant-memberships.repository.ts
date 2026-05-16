import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { TenantMembershipEntity } from '../entities/tenant-membership.entity';

interface TenantMembershipRow {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  role_code: string;
  role_name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TenantMembershipsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async countActiveMembershipsByTenant(tenantId: string): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM tenant_memberships
        WHERE tenant_id = $1
          AND status = 'active'
      `,
      [tenantId],
    );

    return Number(result.rows[0]?.total ?? '0');
  }

  async findMembershipByUserAndTenant(userId: string, tenantId: string): Promise<TenantMembershipEntity | null> {
    const result = await this.databaseService.query<TenantMembershipRow>(
      `
        SELECT
          tm.id,
          tm.tenant_id,
          tm.user_id,
          tm.role_id,
          r.code AS role_code,
          r.name AS role_name,
          tm.status,
          tm.created_at,
          tm.updated_at
        FROM tenant_memberships tm
        INNER JOIN roles r
          ON r.id = tm.role_id
         AND r.tenant_id = tm.tenant_id
        WHERE tm.user_id = $1
          AND tm.tenant_id = $2
        LIMIT 1
      `,
      [userId, tenantId],
    );

    return result.rows[0] ? this.mapTenantMembership(result.rows[0]) : null;
  }

  async findActiveMembership(userId: string, tenantId: string): Promise<TenantMembershipEntity | null> {
    const membership = await this.findMembershipByUserAndTenant(userId, tenantId);

    if (!membership || membership.status !== 'active') {
      return null;
    }

    return membership;
  }

  async findActiveMembershipsByUser(userId: string): Promise<TenantMembershipEntity[]> {
    const result = await this.databaseService.query<TenantMembershipRow>(
      `
        SELECT
          id,
          tenant_id,
          user_id,
          role_id,
          role_code,
          role_name,
          status,
          created_at,
          updated_at
        FROM app.find_active_memberships_by_user_for_auth($1)
        ORDER BY created_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => this.mapTenantMembership(row));
  }

  async createOrActivateMembership(input: {
    tenant_id: string;
    user_id: string;
    role_id: string;
  }): Promise<TenantMembershipEntity> {
    const result = await this.databaseService.query<TenantMembershipRow>(
      `
        INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          role_id = EXCLUDED.role_id,
          status = 'active',
          updated_at = NOW()
        RETURNING id, tenant_id, user_id, role_id, '' AS role_code, '' AS role_name, status, created_at, updated_at
      `,
      [input.tenant_id, input.user_id, input.role_id],
    );

    const membership = result.rows[0];
    const hydratedMembership = await this.findMembershipByUserAndTenant(membership.user_id, membership.tenant_id);

    if (!hydratedMembership) {
      throw new Error('Tenant membership could not be loaded after creation');
    }

    return hydratedMembership;
  }

  async activateInvitedMembership(input: {
    tenant_id: string;
    user_id: string;
    role_code: string;
    email: string;
  }): Promise<TenantMembershipEntity> {
    const roleResult = await this.databaseService.query<{ id: string }>(
      `
        SELECT id
        FROM roles
        WHERE tenant_id = $1
          AND code = $2
        LIMIT 1
      `,
      [input.tenant_id, input.role_code],
    );
    const roleId = roleResult.rows[0]?.id;

    if (!roleId) {
      throw new Error(`Role "${input.role_code}" was not found for tenant "${input.tenant_id}"`);
    }

    await this.databaseService.query(
      `
        INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          role_id = EXCLUDED.role_id,
          status = 'active',
          updated_at = NOW()
      `,
      [input.tenant_id, input.user_id, roleId],
    );

    const membership = await this.findMembershipByUserAndTenant(input.user_id, input.tenant_id);

    if (!membership) {
      throw new Error(`Membership for "${input.email}" could not be activated`);
    }

    return membership;
  }

  private mapTenantMembership(row: TenantMembershipRow): TenantMembershipEntity {
    return Object.assign(new TenantMembershipEntity(), row);
  }
}
