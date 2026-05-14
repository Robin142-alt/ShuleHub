import { Module } from '@nestjs/common';

import { AcademicsController } from './academics.controller';
import { AcademicsSchemaService } from './academics-schema.service';
import { AcademicsService } from './academics.service';
import { AcademicsRepository } from './repositories/academics.repository';

@Module({
  controllers: [AcademicsController],
  providers: [AcademicsSchemaService, AcademicsService, AcademicsRepository],
  exports: [AcademicsService, AcademicsRepository],
})
export class AcademicsModule {}
