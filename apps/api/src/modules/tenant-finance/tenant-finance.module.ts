import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SecurityModule } from '../security/security.module';
import { TenantFinanceConfigRepository } from './tenant-finance-config.repository';
import { TenantFinanceConfigService } from './tenant-finance-config.service';
import { TenantFinanceController } from './tenant-finance.controller';
import { TenantFinanceSchemaService } from './tenant-finance-schema.service';

@Module({
  imports: [AuthModule, ObservabilityModule, SecurityModule],
  controllers: [TenantFinanceController],
  providers: [
    TenantFinanceSchemaService,
    TenantFinanceConfigRepository,
    TenantFinanceConfigService,
  ],
  exports: [
    TenantFinanceSchemaService,
    TenantFinanceConfigRepository,
    TenantFinanceConfigService,
  ],
})
export class TenantFinanceModule {}
