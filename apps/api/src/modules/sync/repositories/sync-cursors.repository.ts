import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { SyncEntity } from '../sync.types';

interface SyncCursorRow {
  tenant_id: string;
  device_id: string;
  entity: SyncEntity;
  last_version: string;
  updated_at: Date;
}

@Injectable()
export class SyncCursorsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async upsertCursor(
    tenantId: string,
    deviceId: string,
    entity: SyncEntity,
    lastVersion: string,
  ): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO sync_cursors (
          tenant_id,
          device_id,
          entity,
          last_version
        )
        VALUES ($1, $2, $3, $4::bigint)
        ON CONFLICT (tenant_id, device_id, entity)
        DO UPDATE SET
          last_version = GREATEST(sync_cursors.last_version, EXCLUDED.last_version),
          updated_at = NOW()
      `,
      [tenantId, deviceId, entity, lastVersion],
    );
  }

  async getCursorMap(
    tenantId: string,
    deviceId: string,
    entities: SyncEntity[],
  ): Promise<Map<SyncEntity, string>> {
    if (entities.length === 0) {
      return new Map();
    }

    const result = await this.databaseService.query<SyncCursorRow>(
      `
        SELECT
          tenant_id,
          device_id,
          entity,
          last_version::text,
          updated_at
        FROM sync_cursors
        WHERE tenant_id = $1
          AND device_id = $2
          AND entity = ANY($3::text[])
      `,
      [tenantId, deviceId, entities],
    );

    return new Map(result.rows.map((row) => [row.entity, row.last_version]));
  }
}
