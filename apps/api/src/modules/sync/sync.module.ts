import { Module } from '@nestjs/common';

import { FinanceSyncConflictResolverService } from './conflict-resolvers/finance-sync-conflict-resolver.service';
import { SyncController } from './sync.controller';
import { SyncOperationLogService } from './sync-operation-log.service';
import { SyncSchemaService } from './sync-schema.service';
import { SyncService } from './sync.service';
import { SyncCursorsRepository } from './repositories/sync-cursors.repository';
import { SyncDevicesRepository } from './repositories/sync-devices.repository';
import { SyncOperationLogsRepository } from './repositories/sync-operation-logs.repository';

@Module({
  controllers: [SyncController],
  providers: [
    SyncSchemaService,
    SyncService,
    SyncOperationLogService,
    SyncDevicesRepository,
    SyncCursorsRepository,
    SyncOperationLogsRepository,
    FinanceSyncConflictResolverService,
  ],
  exports: [SyncOperationLogService, SyncService],
})
export class SyncModule {}
