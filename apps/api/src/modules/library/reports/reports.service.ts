import { Injectable } from '@nestjs/common';

import { LibraryService } from '../library.service';

@Injectable()
export class ReportsService {
  constructor(private readonly libraryService: LibraryService) {}

  getReports() {
    return this.libraryService.getReports();
  }
}
