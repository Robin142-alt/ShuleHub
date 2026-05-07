import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import {
  ClaimedOutboxEvent,
  DomainEvent,
  OutboxEventStatus,
  PublishDomainEventInput,
} from '../events.types';

interface OutboxEventRow {
  id: string;
  tenant_id: string;
  event_key: string;
  event_name: DomainEvent['event_name'];
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  headers: Record<string, unknown> | null;
  status: OutboxEventStatus;
  attempt_count: number;
  available_at: Date;
  published_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ClaimedOutboxEventRow {
  id: string;
  tenant_id: string;
  request_id: string;
  trace_id: string;
  span_id: string | null;
  user_id: string;
  role: string | null;
  session_id: string | null;
}

@Injectable()
export class OutboxEventsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createEvent<TName extends DomainEvent['event_name']>(
    input: PublishDomainEventInput<TName>,
  ): Promise<DomainEvent<TName>> {
    const result = await this.databaseService.query<OutboxEventRow>(
      `
        INSERT INTO outbox_events (
          tenant_id,
          event_key,
          event_name,
          aggregate_type,
          aggregate_id,
          payload,
          headers,
          status,
          available_at
        )
        VALUES ($1, $2, $3, $4, $5::uuid, $6::jsonb, $7::jsonb, 'pending', COALESCE($8::timestamptz, NOW()))
        ON CONFLICT (tenant_id, event_key)
        DO UPDATE SET
          headers = COALESCE(outbox_events.headers, '{}'::jsonb) || EXCLUDED.headers
        RETURNING
          id,
          tenant_id,
          event_key,
          event_name,
          aggregate_type,
          aggregate_id,
          payload,
          headers,
          status,
          attempt_count,
          available_at,
          published_at,
          last_error,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.event_key,
        input.event_name,
        input.aggregate_type,
        input.aggregate_id,
        JSON.stringify(input.payload),
        JSON.stringify(input.headers ?? {}),
        input.available_at ?? null,
      ],
    );

    return this.mapRow(result.rows[0]) as DomainEvent<TName>;
  }

  async lockPendingBatch(
    batchSize: number,
    staleProcessingAfterMs: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const result = await this.databaseService.query<ClaimedOutboxEventRow>(
      `
        SELECT
          id,
          tenant_id,
          request_id,
          trace_id,
          span_id,
          user_id,
          role,
          session_id
        FROM app.claim_outbox_events($1::integer, $2::integer)
      `,
      [batchSize, staleProcessingAfterMs],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      request_id: row.request_id,
      trace_id: row.trace_id,
      span_id: row.span_id,
      user_id: row.user_id,
      role: row.role,
      session_id: row.session_id,
    }));
  }

  async findById(tenantId: string, outboxEventId: string, forUpdate = false): Promise<DomainEvent | null> {
    const result = await this.databaseService.query<OutboxEventRow>(
      `
        SELECT
          id,
          tenant_id,
          event_key,
          event_name,
          aggregate_type,
          aggregate_id,
          payload,
          headers,
          status,
          attempt_count,
          available_at,
          published_at,
          last_error,
          created_at,
          updated_at
        FROM outbox_events
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        ${forUpdate ? 'FOR UPDATE' : ''}
      `,
      [tenantId, outboxEventId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async markPublished(tenantId: string, outboxEventId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE outbox_events
        SET
          status = 'published',
          published_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, outboxEventId],
    );
  }

  async markFailed(
    tenantId: string,
    outboxEventId: string,
    errorMessage: string,
    retryDelayMs: number,
    maxAttempts: number,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE outbox_events
        SET
          status = CASE
            WHEN attempt_count >= $4 THEN 'discarded'
            ELSE 'failed'
          END,
          available_at = CASE
            WHEN attempt_count >= $4 THEN NOW()
            ELSE NOW() + ($3 * INTERVAL '1 millisecond')
          END,
          last_error = $5,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, outboxEventId, retryDelayMs, maxAttempts, errorMessage],
    );
  }

  private mapRow(row: OutboxEventRow): DomainEvent {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      event_key: row.event_key,
      event_name: row.event_name,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      payload: row.payload as unknown as DomainEvent['payload'],
      headers: row.headers ?? {},
      status: row.status,
      attempt_count: row.attempt_count,
      available_at: row.available_at.toISOString(),
      published_at: row.published_at?.toISOString() ?? null,
      last_error: row.last_error,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
