import { Module } from '@nestjs/common';

import { AttendanceSyncConflictResolverService } from './conflict-resolvers/attendance-sync-conflict-resolver.service';
import { FinanceSyncConflictResolverService } from './conflict-resolvers/finance-sync-conflict-resolver.service';
import { SyncController } from './sync.controller';
import { SyncOperationLogService } from './sync-operation-log.service';
import { SyncSchemaService } from './sync-schema.service';
import { SyncService } from './sync.service';
import { AttendanceRecordsRepository } from './repositories/attendance-records.repository';
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
    AttendanceRecordsRepository,
    AttendanceSyncConflictResolverService,
    FinanceSyncConflictResolverService,
  ],
  exports: [SyncOperationLogService, SyncService, AttendanceRecordsRepository],
})
export class SyncModule {}
