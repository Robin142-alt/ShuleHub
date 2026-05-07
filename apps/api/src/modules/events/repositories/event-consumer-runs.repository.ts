import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { EventConsumerRunRecord, EventConsumerRunStatus } from '../events.types';

interface EventConsumerRunRow {
  id: string;
  tenant_id: string;
  outbox_event_id: string;
  event_key: string;
  consumer_name: string;
  status: EventConsumerRunStatus;
  attempt_count: number;
  last_error: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class EventConsumerRunsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async acquireRun(
    tenantId: string,
    outboxEventId: string,
    eventKey: string,
    consumerName: string,
  ): Promise<EventConsumerRunRecord> {
    await this.databaseService.query(
      `
        INSERT INTO event_consumer_runs (
          tenant_id,
          outbox_event_id,
          event_key,
          consumer_name,
          status,
          attempt_count
        )
        VALUES ($1, $2::uuid, $3, $4, 'processing', 0)
        ON CONFLICT (tenant_id, outbox_event_id, consumer_name)
        DO NOTHING
      `,
      [tenantId, outboxEventId, eventKey, consumerName],
    );

    const result = await this.databaseService.query<EventConsumerRunRow>(
      `
        SELECT
          id,
          tenant_id,
          outbox_event_id,
          event_key,
          consumer_name,
          status,
          attempt_count,
          last_error,
          processed_at,
          created_at,
          updated_at
        FROM event_consumer_runs
        WHERE tenant_id = $1
          AND outbox_event_id = $2::uuid
          AND consumer_name = $3
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, outboxEventId, consumerName],
    );

    return this.mapRow(result.rows[0]);
  }

  async markAttempt(tenantId: string, runId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE event_consumer_runs
        SET
          status = 'processing',
          attempt_count = attempt_count + 1,
          last_error = NULL,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, runId],
    );
  }

  async markCompleted(tenantId: string, runId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE event_consumer_runs
        SET
          status = 'completed',
          processed_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, runId],
    );
  }

  async markFailed(tenantId: string, runId: string, errorMessage: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE event_consumer_runs
        SET
          status = 'failed',
          last_error = $3,
          updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, runId, errorMessage],
    );
  }

  private mapRow(row: EventConsumerRunRow): EventConsumerRunRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      outbox_event_id: row.outbox_event_id,
      event_key: row.event_key,
      consumer_name: row.consumer_name,
      status: row.status,
      attempt_count: row.attempt_count,
      last_error: row.last_error,
      processed_at: row.processed_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
