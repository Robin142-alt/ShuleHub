import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { EventsModule } from '../events/events.module';
import { StudentsController } from './students.controller';
import { StudentsSchemaService } from './students-schema.service';
import { StudentsService } from './students.service';
import { StudentsRepository } from './repositories/students.repository';

@Module({
  imports: [EventsModule, BillingModule],
  controllers: [StudentsController],
  providers: [
    StudentsSchemaService,
    StudentsService,
    StudentsRepository,
  ],
  exports: [StudentsSchemaService, StudentsService, StudentsRepository],
})
export class StudentsModule {}
