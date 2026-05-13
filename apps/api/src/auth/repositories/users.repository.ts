import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { UserEntity } from '../entities/user.entity';

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  display_name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureGlobalUserForSeed(input: {
    email: string;
    password_hash: string;
    display_name: string;
  }): Promise<UserEntity> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, created_at, updated_at
        FROM app.ensure_global_user_for_seed($1, $2, $3)
      `,
      [input.email, input.password_hash, input.display_name],
    );

    return this.mapUser(result.rows[0]);
  }

  async ensureGlobalUserForRegistration(input: {
    email: string;
    password_hash: string;
    display_name: string;
  }): Promise<UserEntity> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, created_at, updated_at
        FROM app.ensure_global_user_for_registration($1, $2, $3)
      `,
      [input.email, input.password_hash, input.display_name],
    );

    return this.mapUser(result.rows[0]);
  }

  async ensureGlobalUserForInvitation(input: {
    email: string;
    password_hash: string;
    display_name: string;
  }): Promise<UserEntity> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, created_at, updated_at
        FROM app.ensure_global_user_for_invitation($1, $2, $3)
      `,
      [input.email, input.password_hash, input.display_name],
    );

    return this.mapUser(result.rows[0]);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.databaseService.query(
      `
        SELECT app.update_global_user_password_for_reset($1, $2)
      `,
      [userId, passwordHash],
    );
  }

  async findActiveTenantUserByEmail(tenantId: string, email: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT u.id, u.tenant_id, u.email, u.password_hash, u.display_name, u.status, u.created_at, u.updated_at
        FROM users u
        INNER JOIN tenant_memberships tm
          ON tm.user_id = u.id
         AND tm.tenant_id = $1
         AND tm.status = 'active'
        WHERE lower(u.email) = lower($2)
          AND u.status = 'active'
        LIMIT 1
      `,
      [tenantId, email],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, created_at, updated_at
        FROM app.find_user_by_email_for_auth($1)
      `,
      [email],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findById(userId: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, created_at, updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async createUser(input: {
    email: string;
    password_hash: string;
    display_name: string;
    tenant_id: string;
  }): Promise<UserEntity> {
    const result = await this.databaseService.query<UserRow>(
      `
        INSERT INTO users (tenant_id, email, password_hash, display_name)
        VALUES ($1, lower($2), $3, $4)
        RETURNING id, tenant_id, email, password_hash, display_name, status, created_at, updated_at
      `,
      [input.tenant_id, input.email, input.password_hash, input.display_name],
    );

    return this.mapUser(result.rows[0]);
  }

  private mapUser(row: UserRow): UserEntity {
    return Object.assign(new UserEntity(), row);
  }
}
