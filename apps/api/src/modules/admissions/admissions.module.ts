import { Module } from '@nestjs/common';

import { StudentsModule } from '../students/students.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsSchemaService } from './admissions-schema.service';
import { AdmissionsService } from './admissions.service';
import { AdmissionsRepository } from './repositories/admissions.repository';
import { LocalDocumentStorageService } from './storage/local-document-storage.service';

@Module({
  imports: [StudentsModule],
  controllers: [AdmissionsController],
  providers: [
    AdmissionsSchemaService,
    AdmissionsService,
    AdmissionsRepository,
    LocalDocumentStorageService,
  ],
  exports: [AdmissionsService, AdmissionsRepository],
})
export class AdmissionsModule {}
