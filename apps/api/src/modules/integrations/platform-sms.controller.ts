import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  AdjustSchoolSmsWalletDto,
  CreatePlatformSmsProviderDto,
  UpdatePlatformSmsProviderDto,
} from './dto/integrations.dto';
import { PlatformSmsService } from './platform-sms.service';
import { SchoolSmsWalletRepository } from './school-sms-wallet.repository';

@Controller('platform')
export class PlatformSmsController {
  constructor(
    private readonly platformSmsService: PlatformSmsService,
    private readonly schoolSmsWalletRepository: SchoolSmsWalletRepository,
  ) {}

  @Get('sms/providers')
  @Permissions('*:*')
  listProviders() {
    return this.platformSmsService.listProviders();
  }

  @Post('sms/providers')
  @Permissions('*:*')
  createProvider(@Body() dto: CreatePlatformSmsProviderDto) {
    return this.platformSmsService.createProvider(dto);
  }

  @Patch('sms/providers/:providerId')
  @Permissions('*:*')
  updateProvider(
    @Param('providerId') providerId: string,
    @Body() dto: UpdatePlatformSmsProviderDto,
  ) {
    return this.platformSmsService.updateProvider(providerId, dto);
  }

  @Post('sms/providers/:providerId/test')
  @Permissions('*:*')
  testProvider(@Param('providerId') providerId: string) {
    return this.platformSmsService.testProvider(providerId);
  }

  @Post('sms/providers/:providerId/set-default')
  @Permissions('*:*')
  setDefaultProvider(@Param('providerId') providerId: string) {
    return this.platformSmsService.setDefaultProvider(providerId);
  }

  @Post('sms/school-wallets/:tenantId/adjust')
  @Permissions('*:*')
  adjustSchoolWallet(
    @Param('tenantId') tenantId: string,
    @Body() dto: AdjustSchoolSmsWalletDto,
  ) {
    return this.schoolSmsWalletRepository.adjustWallet({
      tenant_id: tenantId,
      quantity: dto.quantity,
      reason: dto.reason,
      reference: dto.reference ?? null,
    });
  }
}
