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
import {
  ReportExportQueueService,
  type QueueReportExportRequest,
} from '../../common/reports/report-export-queue';
import { FeatureGate } from './decorators/feature-gate.decorator';
import { BILLING_MPESA_FEATURE } from './billing.constants';
import { BillableFeeStudentResponseDto } from './dto/billable-fee-student-response.dto';
import { BulkGenerateFeeInvoicesDto } from './dto/bulk-generate-fee-invoices.dto';
import { BulkFeeInvoiceGenerationResponseDto } from './dto/bulk-fee-invoice-generation-response.dto';
import { CreateBillingPaymentIntentDto } from './dto/create-billing-payment-intent.dto';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateManualFeePaymentDto } from './dto/create-manual-fee-payment.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { BillingNotificationResponseDto } from './dto/billing-notification-response.dto';
import { FinanceReconciliationResponseDto } from './dto/finance-reconciliation-response.dto';
import { FinanceActivityResponseDto } from './dto/finance-activity-response.dto';
import { FeeStructureResponseDto } from './dto/fee-structure-response.dto';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { ManualFeePaymentResponseDto } from './dto/manual-fee-payment-response.dto';
import { RecordUsageDto } from './dto/record-usage.dto';
import { StudentFeeBalanceResponseDto } from './dto/student-fee-balance-response.dto';
import { StudentFeeStatementResponseDto } from './dto/student-fee-statement-response.dto';
import { SubscriptionLifecycleResponseDto } from './dto/subscription-lifecycle-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { UpdateManualFeePaymentStatusDto } from './dto/update-manual-fee-payment-status.dto';
import { UsageRecordResponseDto } from './dto/usage-record-response.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';
import { BillingMpesaService } from './billing-mpesa.service';
import { BillingService } from './billing.service';
import { ManualFeePaymentService } from './manual-fee-payment.service';
import { UsageMeterService } from './usage-meter.service';
import { ManualFeePaymentStatus } from './entities/manual-fee-payment.entity';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly usageMeterService: UsageMeterService,
    private readonly billingMpesaService: BillingMpesaService,
    private readonly manualFeePaymentService: ManualFeePaymentService,
    private readonly reportExportQueueService: ReportExportQueueService,
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

  @Get('finance-activity')
  @Permissions('billing:read')
  async listFinanceActivity(): Promise<FinanceActivityResponseDto[]> {
    return this.billingService.listFinanceActivity();
  }

  @Post('fee-structures')
  @Permissions('billing:write')
  async createFeeStructure(
    @Body() dto: CreateFeeStructureDto,
  ): Promise<FeeStructureResponseDto> {
    return this.billingService.createFeeStructure(dto);
  }

  @Get('fee-structures')
  @Permissions('billing:read')
  async listFeeStructures(): Promise<FeeStructureResponseDto[]> {
    return this.billingService.listFeeStructures();
  }

  @Get('fee-structures/:feeStructureId/billable-students')
  @Permissions('billing:read')
  async listBillableStudentsForFeeStructure(
    @Param('feeStructureId', new ParseUUIDPipe()) feeStructureId: string,
  ): Promise<BillableFeeStudentResponseDto[]> {
    return this.billingService.listBillableStudentsForFeeStructure(feeStructureId);
  }

  @Post('fee-structures/:feeStructureId/archive')
  @Permissions('billing:write')
  async archiveFeeStructure(
    @Param('feeStructureId', new ParseUUIDPipe()) feeStructureId: string,
  ): Promise<FeeStructureResponseDto> {
    return this.billingService.archiveFeeStructure(feeStructureId);
  }

  @Post('fee-structures/:feeStructureId/generate-invoices')
  @Permissions('billing:write')
  async bulkGenerateFeeInvoices(
    @Param('feeStructureId', new ParseUUIDPipe()) feeStructureId: string,
    @Body() dto: BulkGenerateFeeInvoicesDto,
  ): Promise<BulkFeeInvoiceGenerationResponseDto> {
    return this.billingService.bulkGenerateFeeInvoices({
      ...dto,
      fee_structure_id: feeStructureId,
    });
  }

  @Get('student-balances')
  @Permissions('billing:read')
  async listStudentBalances(): Promise<StudentFeeBalanceResponseDto[]> {
    return this.billingService.listStudentBalances();
  }

  @Get('reconciliation')
  @Permissions('billing:read')
  async listFinanceReconciliation(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('method') method?: string,
  ): Promise<FinanceReconciliationResponseDto> {
    return this.billingService.listFinanceReconciliation({ from, to, method });
  }

  @Get('reconciliation/export')
  @Permissions('billing:read')
  async exportFinanceReconciliation(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('method') method?: string,
  ) {
    return this.billingService.exportFinanceReconciliationCsv({ from, to, method });
  }

  @Get('student-balances/:studentId/statement')
  @Permissions('billing:read')
  async getStudentStatement(
    @Param('studentId') studentId: string,
  ): Promise<StudentFeeStatementResponseDto> {
    return this.billingService.getStudentStatement(studentId);
  }

  @Get('student-balances/:studentId/statement/export')
  @Permissions('billing:read')
  async exportStudentStatement(@Param('studentId') studentId: string) {
    return this.billingService.exportStudentStatementCsv(studentId);
  }

  @Post('reports/:reportId/export-jobs')
  @Permissions('billing:read')
  async queueReportExport(
    @Param('reportId') reportId: string,
    @Body() body: QueueReportExportRequest = {},
  ) {
    return this.reportExportQueueService.enqueueCurrentRequestReportExport({
      module: 'billing',
      report_id: reportId,
      format: body.format ?? 'csv',
      filters: body.filters,
      estimated_rows: body.estimated_rows,
    });
  }

  @Get('reports/:reportId/export')
  @Permissions('billing:read')
  async exportReport(@Param('reportId') reportId: string) {
    return this.billingService.exportReportCsv(reportId);
  }

  @Get('invoices/:invoiceId')
  @Permissions('billing:read')
  async getInvoice(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
  ): Promise<InvoiceResponseDto> {
    return this.billingService.getInvoice(invoiceId);
  }

  @Post('manual-fee-payments')
  @Permissions('billing:write')
  async createManualFeePayment(
    @Body() dto: CreateManualFeePaymentDto,
  ): Promise<ManualFeePaymentResponseDto> {
    return this.manualFeePaymentService.createManualFeePayment(dto);
  }

  @Get('manual-fee-payments')
  @Permissions('billing:read')
  async listManualFeePayments(
    @Query('status') status?: ManualFeePaymentStatus,
  ): Promise<ManualFeePaymentResponseDto[]> {
    return this.manualFeePaymentService.listManualFeePayments({ status });
  }

  @Get('manual-fee-payments/:paymentId')
  @Permissions('billing:read')
  async getManualFeePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
  ): Promise<ManualFeePaymentResponseDto> {
    return this.manualFeePaymentService.getManualFeePayment(paymentId);
  }

  @Post('manual-fee-payments/:paymentId/deposit')
  @Permissions('billing:write')
  async depositManualFeePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    return this.manualFeePaymentService.depositManualFeePayment(paymentId, dto);
  }

  @Post('manual-fee-payments/:paymentId/clear')
  @Permissions('billing:write')
  async clearManualFeePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    return this.manualFeePaymentService.clearManualFeePayment(paymentId, dto);
  }

  @Post('manual-fee-payments/:paymentId/bounce')
  @Permissions('billing:write')
  async bounceManualFeePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    return this.manualFeePaymentService.bounceManualFeePayment(paymentId, dto);
  }

  @Post('manual-fee-payments/:paymentId/reverse')
  @Permissions('billing:write')
  async reverseManualFeePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    return this.manualFeePaymentService.reverseManualFeePayment(paymentId, dto);
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
