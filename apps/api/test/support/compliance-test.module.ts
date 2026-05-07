import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthModule } from '../../src/auth/auth.module';
import { CommonModule } from '../../src/common/common.module';
import { DatabaseModule } from '../../src/database/database.module';
import { JwtAuthGuard } from '../../src/guards/jwt-auth.guard';
import { AuthContextMiddleware } from '../../src/middleware/auth-context.middleware';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware';
import { TenantMiddleware } from '../../src/middleware/tenant.middleware';
import { ComplianceModule } from '../../src/modules/compliance/compliance.module';
import { StudentsSchemaService } from '../../src/modules/students/students-schema.service';
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
    ComplianceModule,
  ],
  providers: [
    StudentsSchemaService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class ComplianceTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, TenantMiddleware, AuthContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
