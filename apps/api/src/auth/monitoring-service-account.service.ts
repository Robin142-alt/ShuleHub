import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

export const MONITORING_TOKEN_PREFIX = 'shm_';

export const DEFAULT_MONITORING_PERMISSIONS = [
  'auth:read',
  'students:read',
  'academics:read',
  'exams:read',
  'admissions:read',
  'inventory:read',
  'billing:read',
  'reports:read',
  'support:view',
  'timetable:read',
  'hr:read',
  'library:read',
] as const;

export interface MonitoringServiceAccountRow {
  id: string;
  tenant_id: string;
  name: string;
  token_hash: string;
  permissions: string[];
  status: 'active' | 'revoked';
  expires_at: Date | string;
  last_used_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateMonitoringTokenInput {
  tenantId: string;
  name: string;
  createdBy?: string | null;
  expiresAt: string;
  permissions?: string[];
}

export interface CreatedMonitoringToken {
  id: string;
  tenant_id: string;
  name: string;
  token: string;
  permissions: string[];
  expires_at: string;
}

export interface MonitoringPrincipal {
  user_id: string;
  tenant_id: string;
  role: 'monitor';
  audience: 'school';
  session_id: string;
  permissions: string[];
  is_authenticated: true;
}

@Injectable()
export class MonitoringServiceAccountService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createToken(input: CreateMonitoringTokenInput): Promise<CreatedMonitoringToken> {
    const token = generateMonitoringToken();
    const permissions = normalizeReadOnlyPermissions(input.permissions ?? [...DEFAULT_MONITORING_PERMISSIONS]);
    const tokenHash = hashMonitoringToken(token);
    const result = await this.databaseService.query<MonitoringServiceAccountRow>(
      `
        INSERT INTO monitoring_service_accounts (
          tenant_id,
          name,
          token_hash,
          permissions,
          expires_at,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, tenant_id, name, token_hash, permissions, status, expires_at, last_used_at, created_by, created_at, updated_at
      `,
      [
        input.tenantId,
        input.name,
        tokenHash,
        permissions,
        input.expiresAt,
        input.createdBy ?? null,
      ],
    );
    const row = result.rows[0];

    await this.recordAudit(row.tenant_id, row.id, 'created', input.createdBy ?? null);

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      token,
      permissions: row.permissions,
      expires_at: formatTimestamp(row.expires_at),
    };
  }

  async verifyToken(rawToken: string, expectedTenantId?: string | null): Promise<MonitoringPrincipal> {
    if (!rawToken.startsWith(MONITORING_TOKEN_PREFIX)) {
      await this.recordValidationFailure(expectedTenantId ?? 'unknown', null);
      throw new UnauthorizedException('Invalid monitoring token');
    }

    const tokenHash = hashMonitoringToken(rawToken);
    const result = await this.databaseService.query<MonitoringServiceAccountRow>(
      `
        SELECT id, tenant_id, name, token_hash, permissions, status, expires_at, last_used_at, created_by, created_at, updated_at
        FROM monitoring_service_accounts
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );
    const row = result.rows[0];

    if (
      !row
      || row.status !== 'active'
      || Date.parse(formatTimestamp(row.expires_at)) <= Date.now()
      || (expectedTenantId && row.tenant_id !== expectedTenantId)
    ) {
      await this.recordValidationFailure(expectedTenantId ?? row?.tenant_id ?? 'unknown', row?.id ?? null);
      throw new UnauthorizedException('Invalid monitoring token');
    }

    await this.databaseService.query(
      `
        UPDATE monitoring_service_accounts
        SET last_used_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [row.id],
    );

    return {
      user_id: `monitor:${row.id}`,
      tenant_id: row.tenant_id,
      role: 'monitor',
      audience: 'school',
      session_id: `monitor:${row.id}`,
      permissions: normalizeReadOnlyPermissions(row.permissions),
      is_authenticated: true,
    };
  }

  async revokeToken(tokenId: string, actorUserId?: string | null): Promise<void> {
    const result = await this.databaseService.query<Pick<MonitoringServiceAccountRow, 'id' | 'tenant_id'>>(
      `
        UPDATE monitoring_service_accounts
        SET status = 'revoked', updated_at = NOW()
        WHERE id = $1
        RETURNING id, tenant_id
      `,
      [tokenId],
    );

    if (result.rows[0]) {
      await this.recordAudit(result.rows[0].tenant_id, tokenId, 'revoked', actorUserId ?? null);
    }
  }

  async rotateToken(tokenId: string, actorUserId?: string | null): Promise<CreatedMonitoringToken> {
    const token = generateMonitoringToken();
    const tokenHash = hashMonitoringToken(token);
    const result = await this.databaseService.query<MonitoringServiceAccountRow>(
      `
        UPDATE monitoring_service_accounts
        SET token_hash = $2, updated_at = NOW(), last_used_at = NULL
        WHERE id = $1
          AND status = 'active'
        RETURNING id, tenant_id, name, token_hash, permissions, status, expires_at, last_used_at, created_by, created_at, updated_at
      `,
      [tokenId, tokenHash],
    );
    const row = result.rows[0];

    if (!row) {
      throw new UnauthorizedException('Monitoring token cannot be rotated');
    }

    await this.recordAudit(row.tenant_id, tokenId, 'rotated', actorUserId ?? null);

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      token,
      permissions: row.permissions,
      expires_at: formatTimestamp(row.expires_at),
    };
  }

  private async recordAudit(
    tenantId: string,
    accountId: string | null,
    action: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO monitoring_service_account_audit_logs (
          tenant_id,
          account_id,
          action,
          actor_user_id
        )
        VALUES ($1, $2, $3, $4)
      `,
      [tenantId, accountId, action, actorUserId],
    );
  }

  private async recordValidationFailure(tenantId: string, accountId: string | null): Promise<void> {
    try {
      await this.recordAudit(tenantId, accountId, 'validation_failed', null);
    } catch {
      // Authentication must still fail with Unauthorized even if audit persistence is temporarily unavailable.
    }
  }
}

export function generateMonitoringToken(): string {
  return `${MONITORING_TOKEN_PREFIX}${randomUUID()}_${randomBytes(24).toString('base64url')}`;
}

export function hashMonitoringToken(rawToken: string): string {
  const pepper = process.env.SECURITY_PII_ENCRYPTION_KEY ?? '';

  return createHash('sha256').update(`${pepper}:${rawToken}`).digest('hex');
}

export function normalizeReadOnlyPermissions(permissions: readonly string[]): string[] {
  const normalized = permissions.map((permission) => permission.trim()).filter(Boolean);

  if (
    normalized.some((permission) =>
      permission === '*:*'
      || permission.endsWith(':write')
      || permission.endsWith(':create')
      || permission.endsWith(':delete')
      || permission.endsWith(':manage')
      || permission.endsWith(':*'),
    )
  ) {
    throw new UnauthorizedException('Monitoring service accounts may only receive read-only permissions');
  }

  return [...new Set(normalized)];
}

function formatTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
