import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { SaveDarajaIntegrationDto } from './dto/integrations.dto';
import { DarajaIntegrationService } from './daraja-integration.service';

@Controller('integrations/daraja')
export class DarajaIntegrationController {
  constructor(private readonly darajaIntegrationService: DarajaIntegrationService) {}

  @Get()
  @Permissions('daraja:read')
  getSettings(@Query('environment') environment?: string) {
    return this.darajaIntegrationService.getDarajaSettings(environment);
  }

  @Put()
  @Permissions('daraja:write')
  saveSettings(@Body() dto: SaveDarajaIntegrationDto) {
    return this.darajaIntegrationService.saveDarajaSettings(dto);
  }

  @Post('test')
  @Permissions('daraja:test')
  testConnection(@Query('environment') environment?: string) {
    return this.darajaIntegrationService.testConnection(environment);
  }

  @Post(':integrationId/activate')
  @Permissions('daraja:write')
  activate(@Param('integrationId') integrationId: string) {
    return this.darajaIntegrationService.setActive(integrationId, true);
  }

  @Post(':integrationId/deactivate')
  @Permissions('daraja:write')
  deactivate(@Param('integrationId') integrationId: string) {
    return this.darajaIntegrationService.setActive(integrationId, false);
  }
}
