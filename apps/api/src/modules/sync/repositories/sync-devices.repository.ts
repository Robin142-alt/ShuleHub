import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';
import { SyncDeviceEntity } from '../entities/sync-device.entity';

interface SyncDeviceRow {
  id: string;
  tenant_id: string;
  device_id: string;
  platform: string;
  app_version: string | null;
  metadata: Record<string, unknown> | null;
  last_seen_at: Date;
  last_push_at: Date | null;
  last_pull_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UpsertSyncDeviceInput {
  tenant_id: string;
  device_id: string;
  platform: string;
  app_version: string | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class SyncDevicesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async upsertDevice(input: UpsertSyncDeviceInput): Promise<SyncDeviceEntity> {
    const result = await this.databaseService.query<SyncDeviceRow>(
      `
        INSERT INTO sync_devices (
          tenant_id,
          device_id,
          platform,
          app_version,
          metadata,
          last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
        ON CONFLICT (tenant_id, device_id)
        DO UPDATE SET
          platform = EXCLUDED.platform,
          app_version = EXCLUDED.app_version,
          metadata = EXCLUDED.metadata,
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          device_id,
          platform,
          app_version,
          metadata,
          last_seen_at,
          last_push_at,
          last_pull_at,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.device_id,
        input.platform,
        input.app_version,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async markPush(tenantId: string, deviceId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE sync_devices
        SET
          last_seen_at = NOW(),
          last_push_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND device_id = $2
      `,
      [tenantId, deviceId],
    );
  }

  async markPull(tenantId: string, deviceId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE sync_devices
        SET
          last_seen_at = NOW(),
          last_pull_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND device_id = $2
      `,
      [tenantId, deviceId],
    );
  }

  private mapRow(row: SyncDeviceRow): SyncDeviceEntity {
    return Object.assign(new SyncDeviceEntity(), {
      ...row,
      metadata: row.metadata ?? {},
    });
  }
}
