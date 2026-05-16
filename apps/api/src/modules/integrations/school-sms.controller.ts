import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateSmsPurchaseRequestDto,
  SendSmsDto,
} from './dto/integrations.dto';
import { SchoolSmsWalletService } from './school-sms-wallet.service';

@Controller()
export class SchoolSmsController {
  constructor(private readonly schoolSmsWalletService: SchoolSmsWalletService) {}

  @Get('school/sms/wallet')
  @Permissions('school_sms:read')
  getWallet() {
    return this.schoolSmsWalletService.getWallet();
  }

  @Get('school/sms/logs')
  @Permissions('school_sms:read')
  listLogs(@Query('limit') limit?: string) {
    return this.schoolSmsWalletService.listLogs(limit ? Number(limit) : undefined);
  }

  @Post('school/sms/purchase-requests')
  @Permissions('school_sms:purchase')
  createPurchaseRequest(@Body() dto: CreateSmsPurchaseRequestDto) {
    return this.schoolSmsWalletService.createPurchaseRequest(dto);
  }

  @Post('sms/send')
  @Permissions('school_sms:send')
  sendSms(@Body() dto: SendSmsDto) {
    return this.schoolSmsWalletService.sendSms(dto);
  }
}
