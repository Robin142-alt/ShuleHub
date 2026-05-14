import { Module } from '@nestjs/common';

import { LibraryController } from './library.controller';
import { LibrarySchemaService } from './library-schema.service';
import { LibraryService } from './library.service';
import { LibraryRepository } from './repositories/library.repository';

@Module({
  controllers: [LibraryController],
  providers: [
    LibrarySchemaService,
    LibraryService,
    LibraryRepository,
  ],
  exports: [LibraryService, LibraryRepository],
})
export class LibraryModule {}
