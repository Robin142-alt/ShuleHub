import { Module } from '@nestjs/common';

import { PlatformOnboardingController } from './platform-onboarding.controller';
import { PlatformOnboardingSchemaService } from './platform-onboarding.schema';
import { PlatformOnboardingService } from './platform-onboarding.service';

@Module({
  controllers: [PlatformOnboardingController],
  providers: [
    PlatformOnboardingSchemaService,
    PlatformOnboardingService,
  ],
  exports: [PlatformOnboardingService],
})
export class PlatformModule {}
