import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';

interface CreateAuditLogInput {
  tenant_id: string;
  actor_user_id: string | null;
  request_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AuditLogsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO audit_logs (
          tenant_id,
          actor_user_id,
          request_id,
          action,
          resource_type,
          resource_id,
          ip_address,
          user_agent,
          metadata
        )
        VALUES (
          $1,
          $2::uuid,
          $3,
          $4,
          $5,
          $6::uuid,
          $7::inet,
          $8,
          $9::jsonb
        )
      `,
      [
        input.tenant_id,
        input.actor_user_id,
        input.request_id,
        input.action,
        input.resource_type,
        input.resource_id,
        input.ip_address ?? null,
        input.user_agent ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
