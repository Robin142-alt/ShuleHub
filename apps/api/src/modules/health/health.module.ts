import { Module } from '@nestjs/common';

import { SupportModule } from '../support/support.module';
import { HealthController } from './health.controller';
import { SystemController } from './system.controller';

@Module({
  imports: [SupportModule],
  controllers: [SystemController, HealthController],
})
export class HealthModule {}
