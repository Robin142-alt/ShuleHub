import { Module } from '@nestjs/common';

import { BorrowingController } from './borrowing/borrowing.controller';
import { BorrowingService } from './borrowing/borrowing.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { FinesController } from './fines/fines.controller';
import { FinesService } from './fines/fines.service';
import { LibraryController } from './library.controller';
import { LibrarySchemaService } from './library-schema.service';
import { LibraryService } from './library.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { LibraryRepository } from './repositories/library.repository';

@Module({
  controllers: [
    LibraryController,
    CatalogController,
    BorrowingController,
    FinesController,
    ReportsController,
  ],
  providers: [
    LibrarySchemaService,
    LibraryService,
    CatalogService,
    BorrowingService,
    FinesService,
    ReportsService,
    LibraryRepository,
  ],
  exports: [LibraryService, LibraryRepository],
})
export class LibraryModule {}
