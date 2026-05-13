import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { IssueLibraryBookDto, ListLibraryQueryDto, ReturnLibraryBookDto } from '../dto/library-workflow.dto';
import { BorrowingService } from './borrowing.service';

@Controller('library')
export class BorrowingController {
  constructor(private readonly borrowingService: BorrowingService) {}

  @Get('borrowings')
  @Permissions('library:view')
  listBorrowings(@Query() query: ListLibraryQueryDto) {
    return this.borrowingService.listBorrowings(query);
  }

  @Post('borrowings')
  @Permissions('library:borrow')
  issueBook(@Body() dto: IssueLibraryBookDto) {
    return this.borrowingService.issueBook(dto);
  }

  @Get('returns')
  @Permissions('library:view')
  listReturns(@Query() query: ListLibraryQueryDto) {
    return this.borrowingService.listReturns(query);
  }

  @Post('returns')
  @Permissions('library:return')
  returnBook(@Body() dto: ReturnLibraryBookDto) {
    return this.borrowingService.returnBook(dto);
  }

  @Get('overdue')
  @Permissions('library:view')
  listOverdue(@Query() query: ListLibraryQueryDto) {
    return this.borrowingService.listOverdue(query);
  }
}
