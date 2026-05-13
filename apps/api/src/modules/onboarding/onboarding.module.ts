import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingSchemaService } from './onboarding-schema.service';
import { OnboardingService } from './onboarding.service';
import { TenantsRepository } from './repositories/tenants.repository';

@Module({
  imports: [AuthModule, forwardRef(() => BillingModule)],
  controllers: [OnboardingController],
  providers: [OnboardingSchemaService, OnboardingService, TenantsRepository],
  exports: [OnboardingService, TenantsRepository],
})
export class OnboardingModule {}
