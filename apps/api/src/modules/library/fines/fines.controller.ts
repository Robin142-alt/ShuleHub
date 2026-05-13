import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';

import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { ListLibraryQueryDto, UpdateLibraryFineDto } from '../dto/library-workflow.dto';
import { FinesService } from './fines.service';

@Controller('library/fines')
export class FinesController {
  constructor(private readonly finesService: FinesService) {}

  @Get()
  @Permissions('library:view')
  listFines(@Query() query: ListLibraryQueryDto) {
    return this.finesService.listFines(query);
  }

  @Patch(':fineId')
  @Permissions('library:return')
  updateFineStatus(
    @Param('fineId', new ParseUUIDPipe()) fineId: string,
    @Body() dto: UpdateLibraryFineDto,
  ) {
    return this.finesService.updateFineStatus(fineId, dto);
  }
}
