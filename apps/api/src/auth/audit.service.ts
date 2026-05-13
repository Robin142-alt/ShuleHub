import { Injectable } from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';

export interface AuditRecordInput {
  tenant_id?: string | null;
  actor_user_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const context = this.requestContext.getStore();
    const tenantId = input.tenant_id ?? context?.tenant_id ?? null;

    if (!tenantId || tenantId === 'global') {
      return;
    }

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
        VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb)
      `,
      [
        tenantId,
        input.actor_user_id ?? (context?.user_id === 'anonymous' ? null : context?.user_id ?? null),
        context?.request_id ?? null,
        input.action,
        input.resource_type,
        input.resource_id ?? null,
        context?.client_ip ?? null,
        context?.user_agent ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
