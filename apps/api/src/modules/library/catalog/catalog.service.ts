import { Injectable } from '@nestjs/common';

import { CreateLibraryBookDto, CreateLibraryCategoryDto, ListLibraryBooksQueryDto, UpdateLibraryBookDto } from '../dto/catalog.dto';
import { LibraryService } from '../library.service';

@Injectable()
export class CatalogService {
  constructor(private readonly libraryService: LibraryService) {}

  listCategories() {
    return this.libraryService.listCategories();
  }

  createCategory(dto: CreateLibraryCategoryDto) {
    return this.libraryService.createCategory(dto);
  }

  listBooks(query: ListLibraryBooksQueryDto) {
    return this.libraryService.listBooks(query);
  }

  createBook(dto: CreateLibraryBookDto) {
    return this.libraryService.createBook(dto);
  }

  updateBook(bookId: string, dto: UpdateLibraryBookDto) {
    return this.libraryService.updateBook(bookId, dto);
  }
}
