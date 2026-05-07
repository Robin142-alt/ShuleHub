import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { FinanceModule } from '../finance/finance.module';
import { SecurityModule } from '../security/security.module';
import { StudentsModule } from '../students/students.module';
import { AcademicSeeder } from '../../seeders/academic.seeder';
import { FinanceSeeder } from '../../seeders/finance.seeder';
import { StudentSeeder } from '../../seeders/student.seeder';
import { TenantSeeder } from '../../seeders/tenant.seeder';
import { UserSeeder } from '../../seeders/user.seeder';
import { PaymentFactory } from '../../seeders/factories/payment.factory';
import { StudentFactory } from '../../seeders/factories/student.factory';
import { UserFactory } from '../../seeders/factories/user.factory';
import { SeederSchemaService } from './seeder-schema.service';
import { SeederService } from './seeder.service';

@Module({
  imports: [AuthModule, FinanceModule, BillingModule, StudentsModule, SecurityModule],
  providers: [
    SeederSchemaService,
    SeederService,
    TenantSeeder,
    UserSeeder,
    AcademicSeeder,
    StudentSeeder,
    FinanceSeeder,
    UserFactory,
    StudentFactory,
    PaymentFactory,
  ],
  exports: [SeederService],
})
export class SeederModule {}
