import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';

import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { CreateLibraryBookDto, CreateLibraryCategoryDto, ListLibraryBooksQueryDto, UpdateLibraryBookDto } from '../dto/catalog.dto';
import { CatalogService } from './catalog.service';

@Controller('library/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  @Permissions('library:view')
  listCategories() {
    return this.catalogService.listCategories();
  }

  @Post('categories')
  @Permissions('library:catalog.manage')
  createCategory(@Body() dto: CreateLibraryCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Get('books')
  @Permissions('library:view')
  listBooks(@Query() query: ListLibraryBooksQueryDto) {
    return this.catalogService.listBooks(query);
  }

  @Post('books')
  @Permissions('library:catalog.manage')
  createBook(@Body() dto: CreateLibraryBookDto) {
    return this.catalogService.createBook(dto);
  }

  @Patch('books/:bookId')
  @Permissions('library:catalog.manage')
  updateBook(
    @Param('bookId', new ParseUUIDPipe()) bookId: string,
    @Body() dto: UpdateLibraryBookDto,
  ) {
    return this.catalogService.updateBook(bookId, dto);
  }
}
