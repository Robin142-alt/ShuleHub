import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CreateLibraryMemberDto, ListLibraryQueryDto } from './dto/library-workflow.dto';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get('dashboard')
  @Permissions('library:view')
  getDashboard() {
    return this.libraryService.getDashboard();
  }

  @Get('members')
  @Permissions('library:view')
  listMembers(@Query() query: ListLibraryQueryDto) {
    return this.libraryService.listMembers(query);
  }

  @Post('members')
  @Permissions('library:catalog.manage')
  createMember(@Body() dto: CreateLibraryMemberDto) {
    return this.libraryService.createMember(dto);
  }

  @Get('activity')
  @Permissions('library:view')
  listActivity(@Query() query: ListLibraryQueryDto) {
    return this.libraryService.listActivity(query);
  }
}
