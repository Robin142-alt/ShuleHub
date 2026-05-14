import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { DatabaseService } from '../../database/database.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { SloMetricsService } from '../observability/slo-metrics.service';
import { DeviceRegistrationResponseDto } from './dto/device-registration-response.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { SyncPullResponseDto } from './dto/sync-pull-response.dto';
import { SyncPullDto } from './dto/sync-pull.dto';
import { SyncPushResponseDto } from './dto/sync-push-response.dto';
import { SyncPushDto } from './dto/sync-push.dto';
import {
  SYNC_DEFAULT_PULL_LIMIT,
  SYNC_SUPPORTED_ENTITIES,
} from './sync.constants';
import { FinanceSyncConflictResolverService } from './conflict-resolvers/finance-sync-conflict-resolver.service';
import { SyncEntity, SyncOperationLog, SyncPushOperationInput } from './sync.types';
import { SyncCursorsRepository } from './repositories/sync-cursors.repository';
import { SyncDevicesRepository } from './repositories/sync-devices.repository';
import { SyncOperationLogsRepository } from './repositories/sync-operation-logs.repository';
import { SyncOperationLogService } from './sync-operation-log.service';

@Injectable()
export class SyncService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly syncDevicesRepository: SyncDevicesRepository,
    private readonly syncCursorsRepository: SyncCursorsRepository,
    private readonly syncOperationLogsRepository: SyncOperationLogsRepository,
    private readonly syncOperationLogService: SyncOperationLogService,
    private readonly financeResolver: FinanceSyncConflictResolverService,
    @Optional() private readonly sloMetrics?: SloMetricsService,
  ) {}

  async registerDevice(dto: RegisterDeviceDto): Promise<DeviceRegistrationResponseDto> {
    const startedAt = performance.now();

    try {
      const result = await this.databaseService.withRequestTransaction(async () => {
        const device = await this.syncDevicesRepository.upsertDevice({
          tenant_id: this.requireTenantId(),
          device_id: dto.device_id.trim(),
          platform: dto.platform.trim(),
          app_version: dto.app_version?.trim() || null,
          metadata: dto.metadata ?? {},
        });

        return this.mapDevice(device);
      });

      this.recordSyncMetric('sync_register', 'success', startedAt, {
        device_id: dto.device_id.trim(),
      });
      return result;
    } catch (error) {
      this.recordSyncMetric('sync_register', 'failure', startedAt, {
        device_id: dto.device_id.trim(),
      });
      throw error;
    }
  }

  async push(dto: SyncPushDto): Promise<SyncPushResponseDto> {
    const startedAt = performance.now();

    try {
      const result = await this.databaseService.withRequestTransaction(async () => {
        const tenantId = this.requireTenantId();
        const device = await this.syncDevicesRepository.upsertDevice({
          tenant_id: tenantId,
          device_id: dto.device_id.trim(),
          platform: dto.platform.trim(),
          app_version: dto.app_version?.trim() || null,
          metadata: dto.metadata ?? {},
        });

        await this.acknowledgeCursors(tenantId, dto.device_id, dto.cursors);

        const results = [];

        for (const operation of dto.operations) {
          this.syncOperationLogService.ensureSupportedEntity(operation.entity);
          const existingOperation = await this.syncOperationLogsRepository.findByOpId(
            tenantId,
            operation.op_id,
          );

          if (existingOperation) {
            results.push({
              op_id: operation.op_id,
              entity: operation.entity,
              status: 'duplicate' as const,
              client_version: operation.version,
              server_version: existingOperation.version,
              reason: 'Operation has already been applied',
              conflict_policy: 'server-authoritative' as const,
              server_state: null,
            });
            continue;
          }

          const operationInput = {
            op_id: operation.op_id,
            entity: operation.entity,
            payload: operation.payload as unknown as SyncPushOperationInput['payload'],
            version: operation.version,
          };

          results.push(
            await this.financeResolver.applyOperation(
              operationInput as SyncPushOperationInput<'finance'>,
            ),
          );
        }

        await this.syncDevicesRepository.markPush(tenantId, dto.device_id);

        return Object.assign(new SyncPushResponseDto(), {
          device: this.mapDevice(device),
          results,
          cursors: await this.syncOperationLogService.getLatestCursors(
            tenantId,
            [...SYNC_SUPPORTED_ENTITIES],
          ),
        });
      });

      this.recordSyncMetric('sync_push', 'success', startedAt, {
        device_id: dto.device_id.trim(),
        results: this.summarizePushResults(result.results),
      });
      return result;
    } catch (error) {
      this.recordSyncMetric('sync_push', 'failure', startedAt, {
        device_id: dto.device_id.trim(),
      });
      throw error;
    }
  }

  async pull(dto: SyncPullDto): Promise<SyncPullResponseDto> {
    const startedAt = performance.now();

    try {
      const result = await this.databaseService.withRequestTransaction(async () => {
        const tenantId = this.requireTenantId();
        await this.syncDevicesRepository.upsertDevice({
          tenant_id: tenantId,
          device_id: dto.device_id.trim(),
          platform: dto.platform.trim(),
          app_version: dto.app_version?.trim() || null,
          metadata: dto.metadata ?? {},
        });

        await this.acknowledgeCursors(tenantId, dto.device_id, dto.cursors);

        const entities = this.normalizeEntities(dto.entities);
        const storedCursorMap = await this.syncCursorsRepository.getCursorMap(
          tenantId,
          dto.device_id,
          entities,
        );
        const providedCursorMap = this.toCursorMap(dto.cursors);
        const effectiveCursorMap = new Map<SyncEntity, string>();

        for (const entity of entities) {
          effectiveCursorMap.set(
            entity,
            this.maxVersion(
              storedCursorMap.get(entity) ?? '0',
              providedCursorMap.get(entity) ?? '0',
            ),
          );
        }

        const limit = dto.limit ?? SYNC_DEFAULT_PULL_LIMIT;
        const operationSets = await Promise.all(
          entities.map(async (entity) =>
            this.syncOperationLogsRepository.fetchByEntitySinceVersion(
              tenantId,
              entity,
              effectiveCursorMap.get(entity) ?? '0',
              limit + 1,
            ),
          ),
        );

        const mergedOperations = operationSets
          .flat()
          .sort((left, right) => this.compareVersions(left.version, right.version));
        const hasMore =
          mergedOperations.length > limit ||
          operationSets.some((operationSet) => operationSet.length > limit);
        const operations = mergedOperations.slice(0, limit);
        const nextCursorMap = new Map(effectiveCursorMap);

        for (const operation of operations) {
          nextCursorMap.set(operation.entity, operation.version);
        }

        await this.syncDevicesRepository.markPull(tenantId, dto.device_id);

        return Object.assign(new SyncPullResponseDto(), {
          operations: operations.map((operation) => this.mapOperation(operation)),
          cursors: entities.map((entity) => ({
            entity,
            last_version: nextCursorMap.get(entity) ?? '0',
          })),
          has_more: hasMore,
        });
      });

      this.recordSyncMetric('sync_pull', 'success', startedAt, {
        device_id: dto.device_id.trim(),
        results: {
          operation_count: result.operations.length,
          has_more: result.has_more,
        },
      });
      return result;
    } catch (error) {
      this.recordSyncMetric('sync_pull', 'failure', startedAt, {
        device_id: dto.device_id.trim(),
      });
      throw error;
    }
  }

  private async acknowledgeCursors(
    tenantId: string,
    deviceId: string,
    cursors?: Array<{ entity: string; last_version: string }>,
  ): Promise<void> {
    if (!cursors || cursors.length === 0) {
      return;
    }

    for (const cursor of cursors) {
      this.syncOperationLogService.ensureSupportedEntity(cursor.entity);
      await this.syncCursorsRepository.upsertCursor(
        tenantId,
        deviceId,
        cursor.entity,
        cursor.last_version,
      );
    }
  }

  private normalizeEntities(entities?: string[]): SyncEntity[] {
    if (!entities || entities.length === 0) {
      return [...SYNC_SUPPORTED_ENTITIES];
    }

    return entities.map((entity) => {
      this.syncOperationLogService.ensureSupportedEntity(entity);
      return entity;
    });
  }

  private toCursorMap(
    cursors?: Array<{ entity: string; last_version: string }>,
  ): Map<SyncEntity, string> {
    const cursorMap = new Map<SyncEntity, string>();

    for (const cursor of cursors ?? []) {
      this.syncOperationLogService.ensureSupportedEntity(cursor.entity);
      cursorMap.set(
        cursor.entity,
        this.maxVersion(cursorMap.get(cursor.entity) ?? '0', cursor.last_version),
      );
    }

    return cursorMap;
  }

  private maxVersion(left: string, right: string): string {
    return this.compareVersions(left, right) >= 0 ? left : right;
  }

  private compareVersions(left: string, right: string): number {
    const leftVersion = BigInt(left);
    const rightVersion = BigInt(right);

    if (leftVersion === rightVersion) {
      return 0;
    }

    return leftVersion > rightVersion ? 1 : -1;
  }

  private mapDevice(device: {
    id: string;
    tenant_id: string;
    device_id: string;
    platform: string;
    app_version: string | null;
    metadata: Record<string, unknown>;
    last_seen_at: Date;
    last_push_at: Date | null;
    last_pull_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): DeviceRegistrationResponseDto {
    return Object.assign(new DeviceRegistrationResponseDto(), {
      id: device.id,
      tenant_id: device.tenant_id,
      device_id: device.device_id,
      platform: device.platform,
      app_version: device.app_version,
      metadata: device.metadata,
      last_seen_at: device.last_seen_at.toISOString(),
      last_push_at: device.last_push_at?.toISOString() ?? null,
      last_pull_at: device.last_pull_at?.toISOString() ?? null,
      created_at: device.created_at.toISOString(),
      updated_at: device.updated_at.toISOString(),
    });
  }

  private mapOperation(operation: SyncOperationLog): {
    op_id: string;
    tenant_id: string;
    device_id: string;
    entity: string;
    payload: Record<string, unknown>;
    version: string;
    created_at: string;
    updated_at: string;
  } {
    return {
      op_id: operation.op_id,
      tenant_id: operation.tenant_id,
      device_id: operation.device_id,
      entity: operation.entity,
      payload: operation.payload as unknown as Record<string, unknown>,
      version: operation.version,
      created_at: operation.created_at,
      updated_at: operation.updated_at,
    };
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for sync operations');
    }

    return tenantId;
  }

  private recordSyncMetric(
    operation: 'sync_register' | 'sync_push' | 'sync_pull',
    outcome: 'success' | 'failure',
    startedAt: number,
    input: {
      device_id?: string | null;
      results?: Record<string, unknown>;
    },
  ): void {
    this.sloMetrics?.recordSyncOperation({
      operation,
      outcome,
      duration_ms: performance.now() - startedAt,
      tenant_id: this.requestContext.getStore()?.tenant_id ?? null,
      device_id: input.device_id ?? null,
      results: input.results,
    });
  }

  private summarizePushResults(
    results: Array<{
      status: 'applied' | 'duplicate' | 'rejected';
    }>,
  ): Record<string, unknown> {
    return {
      operation_count: results.length,
      applied_count: results.filter((result) => result.status === 'applied').length,
      duplicate_count: results.filter((result) => result.status === 'duplicate').length,
      rejected_count: results.filter((result) => result.status === 'rejected').length,
    };
  }
}
