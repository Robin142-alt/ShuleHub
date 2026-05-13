import { Module } from '@nestjs/common';

import { SupportRepository } from './repositories/support.repository';
import { SupportAttachmentStorageService } from './storage/support-attachment-storage.service';
import { SupportController } from './support.controller';
import { SupportSchemaService } from './support-schema.service';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController],
  providers: [
    SupportSchemaService,
    SupportService,
    SupportRepository,
    SupportAttachmentStorageService,
  ],
  exports: [SupportService, SupportRepository],
})
export class SupportModule {}
