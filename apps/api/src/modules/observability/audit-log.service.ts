import { BadRequestException, Injectable } from '@nestjs/common';

import { AUTH_ANONYMOUS_USER_ID } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { PostedFinancialTransaction } from '../finance/finance.types';
import { AuditLogsRepository } from '../events/repositories/audit-logs.repository';

interface RecordAuditLogInput {
  tenant_id?: string;
  actor_user_id?: string | null;
  request_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    const requestContext = this.requestContext.getStore();
    const tenantId = input.tenant_id ?? requestContext?.tenant_id;

    if (!tenantId) {
      throw new BadRequestException('Tenant context is required for audit logging');
    }

    const actorUserId = input.actor_user_id ?? this.resolveActorUserId(requestContext?.user_id);
    const requestId = input.request_id ?? requestContext?.request_id ?? null;

    await this.auditLogsRepository.createAuditLog({
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      request_id: requestId,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id ?? null,
      ip_address: input.ip_address ?? requestContext?.client_ip ?? null,
      user_agent: input.user_agent ?? requestContext?.user_agent ?? null,
      metadata: input.metadata ?? {},
    });
  }

  async recordFinanceTransactionPosted(input: {
    transaction: PostedFinancialTransaction;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record({
      action: 'finance.transaction.posted',
      resource_type: 'finance_transaction',
      resource_id: input.transaction.transaction_id,
      metadata: {
        reference: input.transaction.reference,
        description: input.transaction.description,
        currency_code: input.transaction.currency_code,
        total_amount_minor: input.transaction.total_amount_minor,
        entry_count: input.transaction.entry_count,
        balances: input.transaction.balances,
        entries: input.transaction.entries,
        ...input.metadata,
      },
    });
  }

  async recordSecurityEvent(input: {
    tenant_id?: string;
    action: string;
    resource_type: string;
    resource_id?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record({
      tenant_id: input.tenant_id,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id ?? null,
      metadata: input.metadata ?? {},
    });
  }

  private resolveActorUserId(userId: string | undefined): string | null {
    if (!userId || userId === AUTH_ANONYMOUS_USER_ID) {
      return null;
    }

    return userId;
  }
}
