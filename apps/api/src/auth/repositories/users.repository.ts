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
  email_verified_at: Date | string | null;
  mfa_enabled: boolean;
  mfa_verified_at: Date | string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureGlobalUserForSeed(_input: {
    email: string;
    password_hash: string;
    display_name: string;
  }): Promise<UserEntity> {
    throw new Error('Direct user creation is disabled in production mode. Use invitations.');
  }

  async createGlobalUserFromInvitation(input: {
    email: string;
    password_hash: string;
    display_name: string;
  }): Promise<UserEntity> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, email_verified_at, mfa_enabled, mfa_verified_at, created_at, updated_at
        FROM app.create_global_user_from_invitation($1, $2, $3)
      `,
      [input.email, input.password_hash, input.display_name],
    );

    return this.mapUser(result.rows[0]);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, email_verified_at, mfa_enabled, mfa_verified_at, created_at, updated_at
        FROM app.find_user_by_email_for_auth($1)
      `,
      [email],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findPlatformOwnerByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, email_verified_at, mfa_enabled, mfa_verified_at, created_at, updated_at
        FROM app.find_platform_owner_by_email_for_auth($1)
      `,
      [email],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findPlatformOwnerById(userId: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, email_verified_at, mfa_enabled, mfa_verified_at, created_at, updated_at
        FROM app.find_platform_owner_by_id_for_auth($1)
      `,
      [userId],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findById(userId: string): Promise<UserEntity | null> {
    const result = await this.databaseService.query<UserRow>(
      `
        SELECT id, tenant_id, email, password_hash, display_name, status, email_verified_at, mfa_enabled, mfa_verified_at, created_at, updated_at
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
        RETURNING id, tenant_id, email, password_hash, display_name, status, email_verified_at, mfa_enabled, mfa_verified_at, created_at, updated_at
      `,
      [input.tenant_id, input.email, input.password_hash, input.display_name],
    );

    return this.mapUser(result.rows[0]);
  }

  private mapUser(row: UserRow): UserEntity {
    return Object.assign(new UserEntity(), row);
  }
}
