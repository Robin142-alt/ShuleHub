import { Injectable } from '@nestjs/common';

import { IssueLibraryBookDto, ListLibraryQueryDto, ReturnLibraryBookDto } from '../dto/library-workflow.dto';
import { LibraryService } from '../library.service';

@Injectable()
export class BorrowingService {
  constructor(private readonly libraryService: LibraryService) {}

  listBorrowings(query: ListLibraryQueryDto) {
    return this.libraryService.listBorrowings(query);
  }

  issueBook(dto: IssueLibraryBookDto) {
    return this.libraryService.issueBook(dto);
  }

  listReturns(query: ListLibraryQueryDto) {
    return this.libraryService.listReturns(query);
  }

  returnBook(dto: ReturnLibraryBookDto) {
    return this.libraryService.returnBook(dto);
  }

  listOverdue(query: ListLibraryQueryDto) {
    return this.libraryService.listOverdue(query);
  }
}
