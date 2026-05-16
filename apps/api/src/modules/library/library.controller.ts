import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  IssueLibraryByScanDto,
  IssueLibraryCopyDto,
  ReserveLibraryCopyDto,
  ReturnLibraryByScanDto,
  ReturnLibraryCopyDto,
} from './dto/library.dto';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post('issues')
  @Permissions('library:write')
  issueCopy(@Body() dto: IssueLibraryCopyDto) {
    return this.libraryService.issueCopy(dto);
  }

  @Post('circulation/issue')
  @Permissions('library:write')
  issueByScan(@Body() dto: IssueLibraryByScanDto) {
    return this.libraryService.issueByScan(dto);
  }

  @Post('reservations')
  @Permissions('library:write')
  reserveCopy(@Body() dto: ReserveLibraryCopyDto) {
    return this.libraryService.reserveCopy(dto);
  }

  @Post('returns')
  @Permissions('library:write')
  returnCopy(@Body() dto: ReturnLibraryCopyDto) {
    return this.libraryService.returnCopy(dto);
  }

  @Post('circulation/return')
  @Permissions('library:write')
  returnByScan(@Body() dto: ReturnLibraryByScanDto) {
    return this.libraryService.returnByScan(dto);
  }

  @Get('circulation')
  @Permissions('library:read')
  listCirculation(@Query() query: Record<string, string | undefined>) {
    return this.libraryService.listCirculation(query);
  }
}
