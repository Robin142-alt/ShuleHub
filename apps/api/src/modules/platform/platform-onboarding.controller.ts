import { Body, Controller, Get, Post } from '@nestjs/common';

import { Roles } from '../../auth/decorators/roles.decorator';
import { SUPERADMIN_ROLE_OWNER } from '../../auth/auth.constants';
import { CreateSchoolDto, PlatformSchoolResponseDto } from './dto/create-school.dto';
import { PlatformOnboardingService } from './platform-onboarding.service';

@Controller('platform')
@Roles(SUPERADMIN_ROLE_OWNER)
export class PlatformOnboardingController {
  constructor(private readonly onboardingService: PlatformOnboardingService) {}

  @Get('schools')
  listSchools(): Promise<PlatformSchoolResponseDto[]> {
    return this.onboardingService.listSchools();
  }

  @Post('schools')
  createSchool(@Body() dto: CreateSchoolDto): Promise<PlatformSchoolResponseDto> {
    return this.onboardingService.createSchool(dto);
  }
}
