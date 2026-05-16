import { Module } from '@nestjs/common';

import { DisciplineController } from './discipline.controller';
import { CounsellingController } from './counselling.controller';
import { CounsellingNoteEncryptionService } from './counselling-note-encryption.service';
import { CounsellingRepository } from './repositories/counselling.repository';
import { DisciplineRepository } from './repositories/discipline.repository';
import { DisciplineDocumentService } from './discipline-document.service';
import { DisciplineNotificationService } from './discipline-notification.service';
import { DisciplineSchemaService } from './discipline-schema.service';
import { CounsellingService } from './counselling.service';
import { DisciplineService } from './discipline.service';
import { DisciplineAttachmentStorageService } from './storage/discipline-attachment-storage.service';

@Module({
  controllers: [DisciplineController, CounsellingController],
  providers: [
    DisciplineSchemaService,
    DisciplineRepository,
    CounsellingRepository,
    CounsellingNoteEncryptionService,
    DisciplineAttachmentStorageService,
    DisciplineNotificationService,
    DisciplineDocumentService,
    DisciplineService,
    CounsellingService,
  ],
  exports: [DisciplineService, CounsellingService],
})
export class DisciplineModule {}
