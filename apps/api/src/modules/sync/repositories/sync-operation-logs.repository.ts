import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { SyncEntity, SyncOperationLog } from '../sync.types';

interface SyncOperationLogRow {
  op_id: string;
  tenant_id: string;
  device_id: string;
  entity: SyncEntity;
  payload: Record<string, unknown> | null;
  version: string;
  created_at: Date;
  updated_at: Date;
}

interface CreateSyncOperationLogInput<TEntity extends SyncEntity = SyncEntity> {
  op_id?: string;
  tenant_id: string;
  device_id: string;
  entity: TEntity;
  payload: Record<string, unknown>;
}

@Injectable()
export class SyncOperationLogsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByOpId(
    tenantId: string,
    opId: string,
  ): Promise<SyncOperationLog | null> {
    const result = await this.databaseService.query<SyncOperationLogRow>(
      `
        SELECT
          op_id,
          tenant_id,
          device_id,
          entity,
          payload,
          version::text,
          created_at,
          updated_at
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND op_id = $2::uuid
        LIMIT 1
      `,
      [tenantId, opId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async createOperation<TEntity extends SyncEntity>(
    input: CreateSyncOperationLogInput<TEntity>,
  ): Promise<SyncOperationLog<TEntity>> {
    const result = await this.databaseService.query<SyncOperationLogRow>(
      `
        INSERT INTO sync_operation_logs (
          op_id,
          tenant_id,
          device_id,
          entity,
          payload
        )
        VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
        RETURNING
          op_id,
          tenant_id,
          device_id,
          entity,
          payload,
          version::text,
          created_at,
          updated_at
      `,
      [
        input.op_id ?? randomUUID(),
        input.tenant_id,
        input.device_id,
        input.entity,
        JSON.stringify(input.payload),
      ],
    );

    return this.mapRow(result.rows[0]) as SyncOperationLog<TEntity>;
  }

  async fetchByEntitySinceVersion(
    tenantId: string,
    entity: SyncEntity,
    afterVersion: string,
    limit: number,
  ): Promise<SyncOperationLog[]> {
    const result = await this.databaseService.query<SyncOperationLogRow>(
      `
        SELECT
          op_id,
          tenant_id,
          device_id,
          entity,
          payload,
          version::text,
          created_at,
          updated_at
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND entity = $2
          AND version > $3::bigint
        ORDER BY version ASC
        LIMIT $4
      `,
      [tenantId, entity, afterVersion, limit],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getLatestVersionByEntities(
    tenantId: string,
    entities: SyncEntity[],
  ): Promise<Map<SyncEntity, string>> {
    if (entities.length === 0) {
      return new Map();
    }

    const result = await this.databaseService.query<{ entity: SyncEntity; version: string }>(
      `
        SELECT entity, MAX(version)::text AS version
        FROM sync_operation_logs
        WHERE tenant_id = $1
          AND entity = ANY($2::text[])
        GROUP BY entity
      `,
      [tenantId, entities],
    );

    return new Map(result.rows.map((row) => [row.entity, row.version]));
  }

  private mapRow(row: SyncOperationLogRow): SyncOperationLog {
    return {
      op_id: row.op_id,
      tenant_id: row.tenant_id,
      device_id: row.device_id,
      entity: row.entity,
      payload: (row.payload ?? {}) as unknown as SyncOperationLog['payload'],
      version: row.version,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
