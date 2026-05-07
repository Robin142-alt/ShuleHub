import { Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { DEFAULT_PERMISSION_CATALOG, DEFAULT_ROLE_CATALOG } from '../auth.constants';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity } from '../entities/role.entity';

interface PermissionRow {
  id: string;
  tenant_id: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RoleRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AuthorizationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureTenantAuthorizationBaseline(tenantId: string): Promise<void> {
    const permissionsByKey = new Map<string, PermissionEntity>();

    for (const permission of DEFAULT_PERMISSION_CATALOG) {
      const result = await this.databaseService.query<PermissionRow>(
        `
          INSERT INTO permissions (tenant_id, resource, action, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, resource, action)
          DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()
          RETURNING id, tenant_id, resource, action, description, created_at, updated_at
        `,
        [tenantId, permission.resource, permission.action, permission.description],
      );

      const permissionEntity = this.mapPermission(result.rows[0]);
      permissionsByKey.set(this.asPermissionKey(permissionEntity.resource, permissionEntity.action), permissionEntity);
    }

    for (const role of DEFAULT_ROLE_CATALOG) {
      const roleResult = await this.databaseService.query<RoleRow>(
        `
          INSERT INTO roles (tenant_id, code, name, description, is_system)
          VALUES ($1, $2, $3, $4, TRUE)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_system = TRUE,
            updated_at = NOW()
          RETURNING id, tenant_id, code, name, description, is_system, created_at, updated_at
        `,
        [tenantId, role.code, role.name, role.description],
      );

      const roleEntity = this.mapRole(roleResult.rows[0]);

      for (const permissionKey of role.permissions) {
        const permissionEntity = permissionsByKey.get(permissionKey);

        if (!permissionEntity) {
          continue;
        }

        await this.databaseService.query(
          `
            INSERT INTO role_permissions (tenant_id, role_id, permission_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, role_id, permission_id)
            DO NOTHING
          `,
          [tenantId, roleEntity.id, permissionEntity.id],
        );
      }
    }
  }

  async getRoleByCode(tenantId: string, code: string): Promise<RoleEntity> {
    const result = await this.databaseService.query<RoleRow>(
      `
        SELECT id, tenant_id, code, name, description, is_system, created_at, updated_at
        FROM roles
        WHERE tenant_id = $1 AND code = $2
        LIMIT 1
      `,
      [tenantId, code],
    );

    if (!result.rows[0]) {
      throw new NotFoundException(`Role "${code}" was not found for tenant "${tenantId}"`);
    }

    return this.mapRole(result.rows[0]);
  }

  async getPermissionsByRoleId(tenantId: string, roleId: string): Promise<string[]> {
    const result = await this.databaseService.query<PermissionRow>(
      `
        SELECT p.id, p.tenant_id, p.resource, p.action, p.description, p.created_at, p.updated_at
        FROM role_permissions rp
        INNER JOIN permissions p
          ON p.id = rp.permission_id
         AND p.tenant_id = rp.tenant_id
        WHERE rp.tenant_id = $1
          AND rp.role_id = $2
        ORDER BY p.resource ASC, p.action ASC
      `,
      [tenantId, roleId],
    );

    return result.rows.map((row) => this.asPermissionKey(row.resource, row.action));
  }

  private asPermissionKey(resource: string, action: string): string {
    return `${resource}:${action}`;
  }

  private mapRole(row: RoleRow): RoleEntity {
    return Object.assign(new RoleEntity(), row);
  }

  private mapPermission(row: PermissionRow): PermissionEntity {
    return Object.assign(new PermissionEntity(), row);
  }
}

