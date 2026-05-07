import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { SYNC_SERVER_DEVICE_ID } from './sync.constants';
import { SyncEntity, SyncOperationLog, SyncPayloadMap } from './sync.types';
import { SyncOperationLogsRepository } from './repositories/sync-operation-logs.repository';

@Injectable()
export class SyncOperationLogService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly syncOperationLogsRepository: SyncOperationLogsRepository,
  ) {}

  async recordServerOperation<TEntity extends SyncEntity>(
    entity: TEntity,
    payload: SyncPayloadMap[TEntity],
    tenantId?: string,
    opId?: string,
  ): Promise<SyncOperationLog<TEntity>> {
    const resolvedTenantId = tenantId ?? this.requestContext.getStore()?.tenant_id;

    if (!resolvedTenantId) {
      throw new UnauthorizedException('Tenant context is required for sync operation logging');
    }

    return this.syncOperationLogsRepository.createOperation({
      op_id: opId,
      tenant_id: resolvedTenantId,
      device_id: SYNC_SERVER_DEVICE_ID,
      entity,
      payload: payload as Record<string, unknown>,
    }) as Promise<SyncOperationLog<TEntity>>;
  }

  async getLatestCursors(
    tenantId: string,
    entities: SyncEntity[],
  ): Promise<Array<{ entity: SyncEntity; last_version: string }>> {
    const latestVersions = await this.syncOperationLogsRepository.getLatestVersionByEntities(
      tenantId,
      entities,
    );

    return entities.map((entity) => ({
      entity,
      last_version: latestVersions.get(entity) ?? '0',
    }));
  }

  ensureSupportedEntity(entity: string): asserts entity is SyncEntity {
    if (entity !== 'attendance' && entity !== 'finance') {
      throw new BadRequestException(`Unsupported sync entity "${entity}"`);
    }
  }
}
