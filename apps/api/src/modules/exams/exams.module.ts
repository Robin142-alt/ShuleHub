import { Module } from '@nestjs/common';

import { ExamsController } from './exams.controller';
import { ExamsSchemaService } from './exams-schema.service';
import { ExamsService } from './exams.service';
import { ExamsRepository } from './repositories/exams.repository';

@Module({
  controllers: [ExamsController],
  providers: [ExamsSchemaService, ExamsService, ExamsRepository],
  exports: [ExamsService, ExamsRepository],
})
export class ExamsModule {}
