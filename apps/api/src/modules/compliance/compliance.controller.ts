import { Body, Controller, Delete, Get, Post } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { ComplianceService } from './compliance.service';
import { ConsentRecordResponseDto } from './dto/consent-record-response.dto';
import { DataExportResponseDto } from './dto/data-export-response.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { RecordConsentDto } from './dto/record-consent.dto';

@Controller('compliance/me')
@Permissions('auth:read')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('export')
  async exportMyData(): Promise<DataExportResponseDto> {
    return this.complianceService.exportMyData();
  }

  @Get('consents')
  async listMyConsents(): Promise<ConsentRecordResponseDto[]> {
    return this.complianceService.listMyConsents();
  }

  @Post('consents')
  async recordMyConsent(@Body() dto: RecordConsentDto): Promise<ConsentRecordResponseDto> {
    return this.complianceService.recordMyConsent(dto);
  }

  @Delete()
  async deleteMyAccount(): Promise<DeleteAccountResponseDto> {
    return this.complianceService.deleteMyAccount();
  }
}
