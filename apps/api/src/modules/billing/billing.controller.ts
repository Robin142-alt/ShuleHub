import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { FeatureGate } from './decorators/feature-gate.decorator';
import { BILLING_MPESA_FEATURE } from './billing.constants';
import { CreateBillingPaymentIntentDto } from './dto/create-billing-payment-intent.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { BillingNotificationResponseDto } from './dto/billing-notification-response.dto';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { RecordUsageDto } from './dto/record-usage.dto';
import { SubscriptionLifecycleResponseDto } from './dto/subscription-lifecycle-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { UsageRecordResponseDto } from './dto/usage-record-response.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';
import { BillingMpesaService } from './billing-mpesa.service';
import { BillingService } from './billing.service';
import { UsageMeterService } from './usage-meter.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly usageMeterService: UsageMeterService,
    private readonly billingMpesaService: BillingMpesaService,
  ) {}

  @Post('subscriptions')
  @Permissions('billing:write')
  async createSubscription(
    @Body() dto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.billingService.createSubscription(dto);
  }

  @Get('subscriptions/current')
  @Permissions('billing:read')
  async getCurrentSubscription(): Promise<SubscriptionResponseDto> {
    return this.billingService.getCurrentSubscription();
  }

  @Get('subscriptions/current/lifecycle')
  @Permissions('billing:read')
  async getCurrentLifecycle(): Promise<SubscriptionLifecycleResponseDto> {
    return this.billingService.getCurrentLifecycle();
  }

  @Get('subscriptions/current/notifications')
  @Permissions('billing:read')
  async listCurrentNotifications(): Promise<BillingNotificationResponseDto[]> {
    return this.billingService.listCurrentNotifications();
  }

  @Post('subscriptions/current/renewal-invoice')
  @Permissions('billing:write')
  async ensureRenewalInvoice(): Promise<InvoiceResponseDto> {
    return this.billingService.ensureRenewalInvoice();
  }

  @Post('usage')
  @Permissions('billing:write')
  async recordUsage(@Body() dto: RecordUsageDto): Promise<UsageRecordResponseDto> {
    return this.usageMeterService.recordUsage(dto);
  }

  @Get('usage/summary')
  @Permissions('billing:read')
  async getUsageSummary(): Promise<UsageSummaryResponseDto> {
    return this.usageMeterService.getCurrentUsageSummary();
  }

  @Post('invoices')
  @Permissions('billing:write')
  async createInvoice(@Body() dto: CreateInvoiceDto): Promise<InvoiceResponseDto> {
    return this.billingService.createInvoice(dto);
  }

  @Get('invoices')
  @Permissions('billing:read')
  async listInvoices(@Query() query: ListInvoicesQueryDto): Promise<InvoiceResponseDto[]> {
    return this.billingService.listInvoices(query);
  }

  @Get('invoices/:invoiceId')
  @Permissions('billing:read')
  async getInvoice(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
  ): Promise<InvoiceResponseDto> {
    return this.billingService.getInvoice(invoiceId);
  }

  @Post('subscriptions/current/renewal-payment-intents')
  @FeatureGate(BILLING_MPESA_FEATURE)
  @Permissions('billing:write')
  async createRenewalPaymentIntent(
    @Body() dto: CreateBillingPaymentIntentDto,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.billingService.ensureRenewalInvoice();
    return this.billingMpesaService.createInvoicePaymentIntent(invoice.id, dto);
  }

  @Post('invoices/:invoiceId/mpesa-payment-intents')
  @FeatureGate(BILLING_MPESA_FEATURE)
  @Permissions('billing:write')
  async createInvoicePaymentIntent(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: CreateBillingPaymentIntentDto,
  ): Promise<InvoiceResponseDto> {
    return this.billingMpesaService.createInvoicePaymentIntent(invoiceId, dto);
  }
}
