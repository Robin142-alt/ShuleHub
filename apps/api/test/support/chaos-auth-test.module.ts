import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../../src/auth/auth.module';
import { CommonModule } from '../../src/common/common.module';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware';
import { TenantMiddleware } from '../../src/middleware/tenant.middleware';
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
})
export class ChaosAuthTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
