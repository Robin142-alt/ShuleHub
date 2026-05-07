import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthModule } from '../../src/auth/auth.module';
import { AbacGuard } from '../../src/guards/abac.guard';
import { BillingFeatureGuard } from '../../src/guards/billing-feature.guard';
import { JwtAuthGuard } from '../../src/guards/jwt-auth.guard';
import { RbacGuard } from '../../src/guards/rbac.guard';
import { AuthContextMiddleware } from '../../src/middleware/auth-context.middleware';
import { BillingFeatureMiddleware } from '../../src/middleware/billing-feature.middleware';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware';
import { TenantMiddleware } from '../../src/middleware/tenant.middleware';
import { CommonModule } from '../../src/common/common.module';
import { DatabaseModule } from '../../src/database/database.module';
import { BillingAccessService } from '../../src/modules/billing/billing-access.service';
import { BillingController } from '../../src/modules/billing/billing.controller';
import { BillingMpesaService } from '../../src/modules/billing/billing-mpesa.service';
import { BillingSchemaService } from '../../src/modules/billing/billing-schema.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { InvoicesRepository } from '../../src/modules/billing/repositories/invoices.repository';
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { UsageRecordsRepository } from '../../src/modules/billing/repositories/usage-records.repository';
import { StudentEventsService } from '../../src/modules/events/student-events.service';
import { StudentsController } from '../../src/modules/students/students.controller';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { TenantModule } from '../../src/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
      load: [configuration],
    }),
    CommonModule,
    TenantModule,
    DatabaseModule,
    AuthModule,
  ],
  controllers: [StudentsController, BillingController],
  providers: [
    StudentsSchemaService,
    BillingSchemaService,
    StudentsService,
    BillingService,
    UsageMeterService,
    BillingAccessService,
    StudentsRepository,
    SubscriptionsRepository,
    InvoicesRepository,
    UsageRecordsRepository,
    PiiEncryptionService,
    {
      provide: StudentEventsService,
      useValue: {
        publishStudentCreated: async () => undefined,
      },
    },
    {
      provide: BillingMpesaService,
      useValue: {
        createInvoicePaymentIntent: async () => {
          throw new Error('Billing MPESA payment intent flow is not part of API consistency tests');
        },
      },
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BillingFeatureGuard,
    },
  ],
})
export class ApiConsistencyTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        RequestContextMiddleware,
        TenantMiddleware,
        AuthContextMiddleware,
        BillingFeatureMiddleware,
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
