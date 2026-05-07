import { Injectable } from '@nestjs/common';

import {
  AUTH_ANONYMOUS_USER_ID,
  AUTH_SYSTEM_ROLE,
  DEFAULT_PERMISSION_CATALOG,
} from '../auth/auth.constants';
import { PasswordService } from '../auth/password.service';
import { TenantMembershipsRepository } from '../auth/repositories/tenant-memberships.repository';
import { UsersRepository } from '../auth/repositories/users.repository';
import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import { PiiEncryptionService } from '../modules/security/pii-encryption.service';
import { SeedRuntimeContext, UserSeedRecord } from '../modules/seeder/seeder.types';
import { UserFactory } from './factories/user.factory';

interface RoleRow {
  id: string;
  code: string;
}

interface PermissionRow {
  id: string;
  permission_key: string;
}

@Injectable()
export class UserSeeder {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly requestContext: RequestContextService,
    private readonly usersRepository: UsersRepository,
    private readonly tenantMembershipsRepository: TenantMembershipsRepository,
    private readonly passwordService: PasswordService,
    private readonly piiEncryptionService: PiiEncryptionService,
    private readonly userFactory: UserFactory,
  ) {}

  async seed(context: SeedRuntimeContext): Promise<void> {
    await this.databaseService.withRequestTransaction(async () => {
      this.requestContext.setUserId(AUTH_ANONYMOUS_USER_ID);
      this.requestContext.setRole(AUTH_SYSTEM_ROLE);
      this.requestContext.setPermissions(['*:*']);
      this.requestContext.setAuthenticated(true);
      this.requestContext.setRequestMetadata({
        method: 'SEED',
        path: '/internal/seed',
      });

      const permissionIds = await this.ensurePermissions(context);
      const roleIds = await this.ensureRoles(context, permissionIds);
      const seededUsers = await this.ensureUsers(context, roleIds);
      await this.ensureStaffMembers(context, seededUsers);

      const ownerUserId = seededUsers.get('owner');

      if (!ownerUserId) {
        throw new Error('Owner user was not created by the user seeder');
      }

      context.registries.owner_user_id = ownerUserId;
      this.requestContext.setUserId(ownerUserId);
      this.requestContext.setRole('owner');
      this.requestContext.setPermissions(['*:*']);
      this.requestContext.setAuthenticated(true);
      this.requestContext.setRequestMetadata({
        method: 'SEED',
        path: '/internal/seed',
      });

      context.summary.counts.users = seededUsers.size;
      context.summary.counts.staff_members = context.registries.staff_member_ids.size;
      context.summary.counts.roles = roleIds.size;
      context.summary.counts.permissions = permissionIds.size;
    });
  }

  private async ensurePermissions(context: SeedRuntimeContext): Promise<Map<string, string>> {
    const permissions = [
      ...DEFAULT_PERMISSION_CATALOG,
      { resource: 'academics', action: 'read', description: 'View academic structure' },
      { resource: 'academics', action: 'write', description: 'Manage academic structure' },
      { resource: 'staff', action: 'read', description: 'View staff directory' },
      { resource: 'staff', action: 'write', description: 'Manage staff directory' },
      { resource: 'guardians', action: 'read', description: 'View guardian records' },
      { resource: 'guardians', action: 'write', description: 'Manage guardian records' },
      { resource: 'finance', action: 'read', description: 'View school finance records' },
      { resource: 'finance', action: 'write', description: 'Manage school finance records' },
      { resource: 'communications', action: 'read', description: 'View communications' },
      { resource: 'communications', action: 'write', description: 'Send communications' },
      { resource: 'notifications', action: 'read', description: 'View notifications' },
      { resource: 'notifications', action: 'write', description: 'Manage notifications' },
      { resource: 'timetable', action: 'read', description: 'View timetables' },
      { resource: 'timetable', action: 'write', description: 'Manage timetables' },
    ];

    const permissionMap = new Map<string, string>();

    for (const permission of permissions) {
      const result = await this.databaseService.query<PermissionRow>(
        `
          INSERT INTO permissions (tenant_id, resource, action, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, resource, action)
          DO UPDATE SET
            description = EXCLUDED.description,
            updated_at = NOW()
          RETURNING id, CONCAT(resource, ':', action) AS permission_key
        `,
        [
          context.options.tenant,
          permission.resource,
          permission.action,
          permission.description,
        ],
      );

      permissionMap.set(result.rows[0].permission_key, result.rows[0].id);
    }

    return permissionMap;
  }

  private async ensureRoles(
    context: SeedRuntimeContext,
    permissionIds: Map<string, string>,
  ): Promise<Map<string, string>> {
    const roleDefinitions: Array<{
      code: string;
      name: string;
      description: string;
      permissions: string[];
    }> = [
      {
        code: 'owner',
        name: 'Owner',
        description: 'Full tenant access',
        permissions: ['*:*'],
      },
      {
        code: 'admin',
        name: 'Administrator',
        description: 'Operational school access',
        permissions: [
          'auth:read',
          'users:read',
          'users:write',
          'students:read',
          'students:write',
          'attendance:read',
          'attendance:write',
          'academics:read',
          'academics:write',
          'staff:read',
          'staff:write',
          'guardians:read',
          'guardians:write',
          'finance:read',
          'finance:write',
          'communications:read',
          'communications:write',
          'notifications:read',
          'notifications:write',
          'billing:read',
          'billing:write',
          'timetable:read',
          'timetable:write',
        ],
      },
      {
        code: 'member',
        name: 'Member',
        description: 'Read-only school access',
        permissions: ['auth:read', 'students:read', 'attendance:read'],
      },
      {
        code: 'teacher',
        name: 'Teacher',
        description: 'Teacher-facing academic operations',
        permissions: [
          'auth:read',
          'students:read',
          'attendance:read',
          'attendance:write',
          'academics:read',
          'communications:read',
          'notifications:read',
          'timetable:read',
        ],
      },
      {
        code: 'storekeeper',
        name: 'Storekeeper',
        description: 'Inventory operations and stock control',
        permissions: [
          'auth:read',
          'inventory:read',
          'inventory:write',
          'procurement:read',
          'procurement:write',
          'transfers:read',
          'transfers:write',
          'documents:read',
        ],
      },
      {
        code: 'admissions',
        name: 'Admissions Officer',
        description: 'Front-office admissions and registration workflows',
        permissions: [
          'auth:read',
          'students:read',
          'students:write',
          'admissions:read',
          'admissions:write',
          'documents:read',
          'documents:write',
          'guardians:read',
          'guardians:write',
          'transfers:read',
          'transfers:write',
          'communications:read',
          'notifications:read',
        ],
      },
    ];

    const roleMap = new Map<string, string>();

    for (const role of roleDefinitions) {
      const result = await this.databaseService.query<RoleRow>(
        `
          INSERT INTO roles (tenant_id, code, name, description, is_system)
          VALUES ($1, $2, $3, $4, TRUE)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_system = TRUE,
            updated_at = NOW()
          RETURNING id, code
        `,
        [context.options.tenant, role.code, role.name, role.description],
      );

      const roleId = result.rows[0].id;
      roleMap.set(role.code, roleId);

      if (role.permissions.includes('*:*')) {
        const wildcardPermissionId = permissionIds.get('*:*');

        if (!wildcardPermissionId) {
          throw new Error('Wildcard permission missing while seeding roles');
        }

        await this.databaseService.query(
          `
            INSERT INTO role_permissions (tenant_id, role_id, permission_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, role_id, permission_id)
            DO NOTHING
          `,
          [context.options.tenant, roleId, wildcardPermissionId],
        );
        continue;
      }

      for (const permissionKey of role.permissions) {
        const permissionId = permissionIds.get(permissionKey);

        if (!permissionId) {
          throw new Error(`Permission "${permissionKey}" is missing while seeding roles`);
        }

        await this.databaseService.query(
          `
            INSERT INTO role_permissions (tenant_id, role_id, permission_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, role_id, permission_id)
            DO NOTHING
          `,
          [context.options.tenant, roleId, permissionId],
        );
      }
    }

    return roleMap;
  }

  private async ensureUsers(
    context: SeedRuntimeContext,
    roleIds: Map<string, string>,
  ): Promise<Map<string, string>> {
    const seededUsers = new Map<string, string>();
    const users = this.userFactory.buildUsers(context.options.tenant);
    const hashedPassword = await this.passwordService.hash(context.options.owner_password);

    for (const userSeed of users) {
      const user = await this.usersRepository.ensureGlobalUserForSeed({
        email: userSeed.email,
        password_hash: hashedPassword,
        display_name: userSeed.display_name,
      });

      seededUsers.set(userSeed.seed_key, user.id);
      context.registries.staff_user_ids.set(userSeed.employee_number, user.id);
      context.registries.staff_subject_codes.set(
        userSeed.employee_number,
        userSeed.subject_codes ?? [],
      );

      const roleId = roleIds.get(userSeed.role_code);

      if (!roleId) {
        throw new Error(`Role "${userSeed.role_code}" is missing while seeding users`);
      }

      await this.tenantMembershipsRepository.createOrActivateMembership({
        tenant_id: context.options.tenant,
        user_id: user.id,
        role_id: roleId,
      });
    }

    return seededUsers;
  }

  private async ensureStaffMembers(
    context: SeedRuntimeContext,
    seededUsers: Map<string, string>,
  ): Promise<void> {
    const staffSeeds = this.userFactory.buildUsers(context.options.tenant);

    for (const record of staffSeeds) {
      const userId = seededUsers.get(record.seed_key);

      if (!userId) {
        throw new Error(`User for staff seed "${record.seed_key}" was not found`);
      }

      const result = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO staff_members (
            tenant_id,
            user_id,
            employee_number,
            full_name,
            staff_type,
            phone_number,
            email,
            tsc_number,
            hire_date,
            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::date,
            $10::jsonb
          )
          ON CONFLICT (tenant_id, employee_number)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            full_name = EXCLUDED.full_name,
            staff_type = EXCLUDED.staff_type,
            phone_number = EXCLUDED.phone_number,
            email = EXCLUDED.email,
            tsc_number = EXCLUDED.tsc_number,
            hire_date = EXCLUDED.hire_date,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          userId,
          record.employee_number,
          record.display_name,
          record.staff_type,
          this.piiEncryptionService.encryptNullable(
            record.phone_number,
            this.staffPhoneAad(context.options.tenant),
          ),
          this.piiEncryptionService.encryptNullable(
            record.email,
            this.staffEmailAad(context.options.tenant),
          ),
          record.tsc_number ?? null,
          '2024-01-08',
          JSON.stringify({
            seed_key: record.seed_key,
            subject_codes: record.subject_codes ?? [],
          }),
        ],
      );

      context.registries.staff_member_ids.set(record.employee_number, result.rows[0].id);
    }
  }

  private staffPhoneAad(tenantId: string): string {
    return `staff_members:${tenantId}:phone_number`;
  }

  private staffEmailAad(tenantId: string): string {
    return `staff_members:${tenantId}:email`;
  }
}
