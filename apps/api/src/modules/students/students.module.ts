import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { EventsModule } from '../events/events.module';
import { SyncModule } from '../sync/sync.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { StudentsController } from './students.controller';
import { StudentsSchemaService } from './students-schema.service';
import { StudentsService } from './students.service';
import { StudentsRepository } from './repositories/students.repository';

@Module({
  imports: [EventsModule, SyncModule, BillingModule],
  controllers: [StudentsController, AttendanceController],
  providers: [
    StudentsSchemaService,
    StudentsService,
    AttendanceService,
    StudentsRepository,
  ],
  exports: [StudentsSchemaService, StudentsService, AttendanceService, StudentsRepository],
})
export class StudentsModule {}
