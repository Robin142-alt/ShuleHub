import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { ResilienceModule } from './infrastructure/resilience/resilience.module';
import { LifecycleModule } from './infrastructure/lifecycle/lifecycle.module';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { EventsModule } from './modules/events/events.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SyncModule } from './modules/sync/sync.module';
import { StudentsModule } from './modules/students/students.module';
import { AuthContextMiddleware } from './middleware/auth-context.middleware';
import { BillingFeatureMiddleware } from './middleware/billing-feature.middleware';
import { CompressionMiddleware } from './middleware/compression.middleware';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { RequestContextMiddleware } from './middleware/request-context.middleware';
import { RequestLoggingMiddleware } from './middleware/request-logging.middleware';
import { TenantMiddleware } from './middleware/tenant.middleware';
import { RequestIdInterceptor } from './interceptors/request-id.interceptor';
import { TenantModule } from './tenant/tenant.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { AbacGuard } from './guards/abac.guard';
import { BillingModule } from './modules/billing/billing.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { SecurityModule } from './modules/security/security.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { SupportModule } from './modules/support/support.module';
import { PlatformModule } from './modules/platform/platform.module';
import { AcademicsModule } from './modules/academics/academics.module';
import { ExamsModule } from './modules/exams/exams.module';
import { HrModule } from './modules/hr/hr.module';
import { LibraryModule } from './modules/library/library.module';
import { TimetableModule } from './modules/timetable/timetable.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      load: [configuration],
      validate: validateEnv,
    }),
    CommonModule,
    AuthModule,
    TenantModule,
    DatabaseModule,
    RedisModule,
    ResilienceModule,
    LifecycleModule,
    QueueModule,
    HealthModule,
    EventsModule,
    ObservabilityModule,
    SecurityModule,
    InventoryModule,
    AdmissionsModule,
    SupportModule,
    PlatformModule,
    AcademicsModule,
    ExamsModule,
    HrModule,
    LibraryModule,
    TimetableModule,
    IntegrationsModule,
    FinanceModule,
    SyncModule,
    StudentsModule,
    PaymentsModule,
    BillingModule,
    ComplianceModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        CompressionMiddleware,
        RequestContextMiddleware,
        TenantMiddleware,
        AuthContextMiddleware,
        RequestLoggingMiddleware,
        RateLimitMiddleware,
        BillingFeatureMiddleware,
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
