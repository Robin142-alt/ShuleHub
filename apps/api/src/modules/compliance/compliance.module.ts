import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { CommonModule } from '../../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceSchemaService } from './compliance-schema.service';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [CommonModule, DatabaseModule, AuthModule],
  controllers: [ComplianceController],
  providers: [ComplianceSchemaService, ComplianceService],
  exports: [ComplianceSchemaService, ComplianceService],
})
export class ComplianceModule {}
