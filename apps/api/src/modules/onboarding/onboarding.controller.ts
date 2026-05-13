import { Body, Controller, Post } from '@nestjs/common';

import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { OnboardedTenantResult, OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('tenants')
  @Roles('platform_owner', 'superadmin')
  async createTenant(@Body() dto: CreateTenantDto): Promise<OnboardedTenantResult> {
    return this.onboardingService.createSchoolTenant(dto);
  }
}
