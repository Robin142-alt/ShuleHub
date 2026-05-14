import { Body, Controller, Post } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { DeviceRegistrationResponseDto } from './dto/device-registration-response.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { SyncPullResponseDto } from './dto/sync-pull-response.dto';
import { SyncPullDto } from './dto/sync-pull.dto';
import { SyncPushResponseDto } from './dto/sync-push-response.dto';
import { SyncPushDto } from './dto/sync-push.dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('devices/register')
  @Permissions('auth:read')
  async registerDevice(
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceRegistrationResponseDto> {
    return this.syncService.registerDevice(dto);
  }

  @Post('push')
  @Permissions('finance:write')
  async push(@Body() dto: SyncPushDto): Promise<SyncPushResponseDto> {
    return this.syncService.push(dto);
  }

  @Post('pull')
  @Permissions('finance:read')
  async pull(@Body() dto: SyncPullDto): Promise<SyncPullResponseDto> {
    return this.syncService.pull(dto);
  }
}
