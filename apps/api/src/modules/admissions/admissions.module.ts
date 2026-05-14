import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { StudentsModule } from '../students/students.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsSchemaService } from './admissions-schema.service';
import { AdmissionsService } from './admissions.service';
import { AdmissionsRepository } from './repositories/admissions.repository';
import { AdmissionDocumentStorageService } from './storage/local-document-storage.service';

@Module({
  imports: [EventsModule, StudentsModule],
  controllers: [AdmissionsController],
  providers: [
    AdmissionsSchemaService,
    AdmissionsService,
    AdmissionsRepository,
    AdmissionDocumentStorageService,
  ],
  exports: [AdmissionsService, AdmissionsRepository],
})
export class AdmissionsModule {}
