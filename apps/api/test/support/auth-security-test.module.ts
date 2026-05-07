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
import { SubscriptionsRepository } from '../../src/modules/billing/repositories/subscriptions.repository';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { UsageMeterService } from '../../src/modules/billing/usage-meter.service';
import { StudentEventsService } from '../../src/modules/events/student-events.service';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { StudentsController } from '../../src/modules/students/students.controller';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
import { StudentsService } from '../../src/modules/students/students.service';
import { StudentsRepository } from '../../src/modules/students/repositories/students.repository';
import { TenantModule } from '../../src/tenant/tenant.module';
import { SecurityProbeController } from './security-probe.controller';

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
  controllers: [StudentsController, SecurityProbeController],
  providers: [
    StudentsSchemaService,
    EventsSchemaService,
    StudentsService,
    StudentsRepository,
    PiiEncryptionService,
    {
      provide: BillingAccessService,
      useValue: {
        resolveForTenant: async (tenantId: string) => ({
          subscription_id: `integration-subscription:${tenantId}`,
          plan_code: 'integration',
          status: 'active',
          features: ['*'],
          limits: {},
          current_period_start: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          current_period_end: new Date('2027-01-01T00:00:00.000Z').toISOString(),
          is_active: true,
        }),
        hasFeature: () => true,
      },
    },
    {
      provide: SubscriptionsRepository,
      useValue: {
        lockCurrentByTenant: async () => null,
      },
    },
    {
      provide: StudentEventsService,
      useValue: {
        publishStudentCreated: async () => undefined,
      },
    },
    {
      provide: UsageMeterService,
      useValue: {
        recordUsage: async () => undefined,
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
export class AuthSecurityTestModule implements NestModule {
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
