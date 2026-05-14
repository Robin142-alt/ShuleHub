import { Module } from '@nestjs/common';

import { TimetableRepository } from './repositories/timetable.repository';
import { TimetableController } from './timetable.controller';
import { TimetableSchemaService } from './timetable-schema.service';
import { TimetableService } from './timetable.service';

@Module({
  controllers: [TimetableController],
  providers: [
    TimetableSchemaService,
    TimetableService,
    TimetableRepository,
  ],
  exports: [TimetableService, TimetableRepository],
})
export class TimetableModule {}
