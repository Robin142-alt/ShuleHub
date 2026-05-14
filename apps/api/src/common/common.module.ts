import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { RequestContextService } from './request-context/request-context.service';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import { DashboardSummaryRepository } from './dashboard/dashboard-summary.repository';
import { DashboardSummarySchemaService } from './dashboard/dashboard-summary-schema.service';
import { DatabaseFileStorageService } from './uploads/database-file-storage.service';
import { S3CompatibleObjectStorageService } from './uploads/s3-object-storage.service';
import { StreamingUploadService } from './uploads/streaming-upload.service';
import { UploadMalwareScanService } from './uploads/upload-malware-scan.service';
import { ReportExportQueueService } from './reports/report-export-queue';
import { ReportExportJobsController } from './reports/report-export-jobs.controller';
import { ReportExportWorkerService } from './reports/report-export.worker';
import { ReportArtifactStorageService } from './reports/report-artifact-storage.service';
import { ReportSnapshotRepository } from './reports/report-snapshot.repository';
import { ReportSnapshotSchemaService } from './reports/report-snapshot-schema.service';

@Global()
@Module({
  controllers: [ReportExportJobsController],
  providers: [
    RequestContextService,
    DashboardSummaryRepository,
    DashboardSummarySchemaService,
    DatabaseFileStorageService,
    S3CompatibleObjectStorageService,
    UploadMalwareScanService,
    {
      provide: StreamingUploadService,
      useFactory: (
        storage: DatabaseFileStorageService,
        scanService: UploadMalwareScanService,
      ) =>
        new StreamingUploadService({
          storage,
          scanService,
        }),
      inject: [DatabaseFileStorageService, UploadMalwareScanService],
    },
    ReportExportQueueService,
    ReportExportWorkerService,
    ReportArtifactStorageService,
    ReportSnapshotRepository,
    ReportSnapshotSchemaService,
    ResponseEnvelopeInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
  exports: [
    RequestContextService,
    DashboardSummaryRepository,
    DashboardSummarySchemaService,
    DatabaseFileStorageService,
    S3CompatibleObjectStorageService,
    UploadMalwareScanService,
    StreamingUploadService,
    ReportExportQueueService,
    ReportExportWorkerService,
    ReportArtifactStorageService,
    ReportSnapshotRepository,
    ReportSnapshotSchemaService,
    ResponseEnvelopeInterceptor,
  ],
})
export class CommonModule {}
