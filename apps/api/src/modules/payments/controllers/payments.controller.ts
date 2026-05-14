import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { GenerateMpesaReconciliationReportDto } from '../dto/generate-mpesa-reconciliation-report.dto';
import { PaymentIntentResponseDto } from '../dto/payment-intent-response.dto';
import { MpesaReconciliationReport } from '../payments.types';
import { MpesaReconciliationService } from '../services/mpesa-reconciliation.service';
import { MpesaService } from '../services/mpesa.service';

@Controller('payments/mpesa')
export class PaymentsController {
  constructor(
    private readonly mpesaService: MpesaService,
    private readonly mpesaReconciliationService: MpesaReconciliationService,
  ) {}

  @Post('payment-intents')
  @Permissions('payments:create')
  async createPaymentIntent(
    @Body() dto: CreatePaymentIntentDto,
  ): Promise<PaymentIntentResponseDto> {
    return this.mpesaService.createPaymentIntent(dto);
  }

  @Get('reconciliation/daily')
  @Permissions('billing:read')
  async getDailyReconciliationReport(
    @Query() query: GenerateMpesaReconciliationReportDto,
  ): Promise<MpesaReconciliationReport> {
    return this.mpesaReconciliationService.generateDailyReport(query);
  }
}
