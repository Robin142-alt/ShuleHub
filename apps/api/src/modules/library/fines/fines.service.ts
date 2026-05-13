import { Injectable } from '@nestjs/common';

import { ListLibraryQueryDto, UpdateLibraryFineDto } from '../dto/library-workflow.dto';
import { LibraryService } from '../library.service';

@Injectable()
export class FinesService {
  constructor(private readonly libraryService: LibraryService) {}

  listFines(query: ListLibraryQueryDto) {
    return this.libraryService.listFines(query);
  }

  updateFineStatus(fineId: string, dto: UpdateLibraryFineDto) {
    return this.libraryService.updateFineStatus(fineId, dto);
  }
}
