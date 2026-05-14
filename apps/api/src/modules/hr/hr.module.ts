import { Module } from '@nestjs/common';

import { HrController } from './hr.controller';
import { HrSchemaService } from './hr-schema.service';
import { HrService } from './hr.service';
import { HrRepository } from './repositories/hr.repository';

@Module({
  controllers: [HrController],
  providers: [
    HrSchemaService,
    HrService,
    HrRepository,
  ],
  exports: [HrService, HrRepository],
})
export class HrModule {}
