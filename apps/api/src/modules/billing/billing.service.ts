import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createCsvReportArtifact,
  type ReportCsvValue,
} from '../../common/reports/report-csv-artifact';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import {
  BILLING_DEFAULT_CURRENCY_CODE,
  BILLING_INVOICE_NUMBER_PREFIX,
  BILLING_MUTABLE_SUBSCRIPTION_STATUSES,
  BILLING_PLAN_CATALOG,
  BILLING_RENEWAL_INVOICE_METADATA_KEY,
} from './billing.constants';
import { BillingAccessService } from './billing-access.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingNotificationService } from './billing-notification.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { SubscriptionLifecycleResponseDto } from './dto/subscription-lifecycle-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { BillingNotificationResponseDto } from './dto/billing-notification-response.dto';
import { InvoiceEntity } from './entities/invoice.entity';
import {
  type CompletedStudentFeePaymentIntent,
  StudentFeePaymentAllocationService,
} from './student-fee-payment-allocation.service';
import { SubscriptionEntity } from './entities/subscription.entity';
import { InvoicesRepository } from './repositories/invoices.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';

type BillingReportExportDefinition = {
  id: string;
  title: string;
  filename: string;
  headers: string[];
  rows: (repository: InvoicesRepository, tenantId: string) => Promise<ReportCsvValue[][]>;
};

const BILLING_REPORT_EXPORTS = new Map<string, BillingReportExportDefinition>([
  [
    'invoices',
    {
      id: 'invoices',
      title: 'Billing invoices',
      filename: 'billing-invoices.csv',
      headers: [
        'Invoice No',
        'Description',
        'Status',
        'Currency',
        'Total Minor',
        'Paid Minor',
        'Issued At',
        'Due At',
        'Paid At',
      ],
      rows: async (repository, tenantId) =>
        (await repository.listInvoices(tenantId)).map((invoice) => [
          invoice.invoice_number,
          invoice.description,
          invoice.status,
          invoice.currency_code,
          invoice.total_amount_minor,
          invoice.amount_paid_minor,
          invoice.issued_at,
          invoice.due_at,
          invoice.paid_at,
        ]),
    },
  ],
]);

@Injectable()
export class BillingService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly billingAccessService: BillingAccessService,
    private readonly billingLifecycleService: BillingLifecycleService,
    private readonly billingNotificationService: BillingNotificationService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly invoicesRepository: InvoicesRepository,
    @Optional() private readonly studentFeePaymentAllocation?: StudentFeePaymentAllocationService,
  ) {}

  async createSubscription(dto: CreateSubscriptionDto): Promise<SubscriptionResponseDto> {
    const response = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const plan = BILLING_PLAN_CATALOG[dto.plan_code];
      const now = new Date();
      const currentPeriodStart = now.toISOString();
      const currentPeriodEnd = addDays(now, plan.period_days).toISOString();
      const status = dto.status ?? plan.default_status;
      const trialEndsAt =
        status === 'trialing'
          ? addDays(now, plan.period_days).toISOString()
          : null;

      await this.subscriptionsRepository.acquireTenantMutationLock(tenantId);
      await this.subscriptionsRepository.expireCurrentSubscriptions(tenantId);
      const subscription = await this.subscriptionsRepository.createSubscription({
        tenant_id: tenantId,
        plan_code: plan.code,
        status,
        billing_phone_number: dto.billing_phone_number?.trim() || null,
        currency_code: BILLING_DEFAULT_CURRENCY_CODE,
        features: [...plan.features],
        limits: { ...plan.limits },
        seats_allocated: dto.seats_allocated ?? 1,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        trial_ends_at: trialEndsAt,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        activated_at: status === 'active' ? now.toISOString() : null,
        metadata: {
          ...dto.metadata,
          provisioned_by_request_id: this.requestContext.requireStore().request_id,
        },
      });

      return this.mapSubscription(subscription);
    });

    await this.billingAccessService.invalidateTenant(response.tenant_id);
    return response;
  }

  async getCurrentSubscription(): Promise<SubscriptionResponseDto> {
    const tenantId = this.requireTenantId();
    const lifecycle = await this.billingLifecycleService.ensureCurrentLifecycle(tenantId);

    if (!lifecycle.subscription || !lifecycle.overview) {
      throw new NotFoundException('No subscription exists for this tenant');
    }

    return this.mapSubscription(lifecycle.subscription, lifecycle.overview);
  }

  async getCurrentLifecycle(): Promise<SubscriptionLifecycleResponseDto> {
    const tenantId = this.requireTenantId();
    const lifecycle = await this.billingLifecycleService.ensureCurrentLifecycle(tenantId);

    if (!lifecycle.subscription || !lifecycle.overview) {
      throw new NotFoundException('No subscription exists for this tenant');
    }

    return this.billingLifecycleService.toResponse(
      lifecycle.subscription,
      lifecycle.overview,
    );
  }

  async listCurrentNotifications(): Promise<BillingNotificationResponseDto[]> {
    const tenantId = this.requireTenantId();
    const lifecycle = await this.billingLifecycleService.ensureCurrentLifecycle(tenantId);

    if (!lifecycle.subscription) {
      return [];
    }

    return this.billingNotificationService.listSubscriptionNotifications(
      tenantId,
      lifecycle.subscription.id,
    );
  }

  async createInvoice(dto: CreateInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const subscription = await this.requireBillableSubscription(tenantId);
      const dueAt = dto.due_at
        ? this.resolveTimestamp(dto.due_at)
        : addDays(new Date(), 7).toISOString();
      const invoice = await this.invoicesRepository.createInvoice({
        tenant_id: tenantId,
        subscription_id: subscription.id,
        invoice_number: this.generateInvoiceNumber(),
        status: 'open',
        currency_code: subscription.currency_code,
        description: dto.description.trim(),
        subtotal_amount_minor: dto.total_amount_minor.trim(),
        tax_amount_minor: '0',
        total_amount_minor: dto.total_amount_minor.trim(),
        billing_phone_number:
          dto.billing_phone_number?.trim() || subscription.billing_phone_number,
        issued_at: new Date().toISOString(),
        due_at: dueAt,
        metadata: dto.metadata ?? {},
      });

      await this.subscriptionsRepository.markInvoiceIssued(tenantId, subscription.id, null);
      return this.mapInvoice(invoice);
    });

    await this.billingAccessService.invalidateTenant(invoice.tenant_id);
    return invoice;
  }

  async ensureRenewalInvoice(): Promise<InvoiceResponseDto> {
    const invoice = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      await this.subscriptionsRepository.acquireTenantMutationLock(tenantId);
      const subscription = await this.requireBillableSubscription(tenantId);
      const renewalWindow = this.billingLifecycleService.getNextRenewalWindow(subscription);
      const renewalWindowKey = renewalWindow.start_at.toISOString().slice(0, 10);
      const existingInvoice = await this.invoicesRepository.findLatestRenewalInvoice(
        tenantId,
        subscription.id,
        renewalWindowKey,
      );

      if (
        existingInvoice
        && ['open', 'pending_payment', 'paid'].includes(existingInvoice.status)
      ) {
        return this.mapInvoice(existingInvoice);
      }

      const invoice = await this.invoicesRepository.createInvoice({
        tenant_id: tenantId,
        subscription_id: subscription.id,
        invoice_number: this.generateInvoiceNumber(),
        status: 'open',
        currency_code: subscription.currency_code,
        description: `${subscription.plan_code} renewal`,
        subtotal_amount_minor: this.resolveRenewalAmountMinor(subscription),
        tax_amount_minor: '0',
        total_amount_minor: this.resolveRenewalAmountMinor(subscription),
        billing_phone_number: subscription.billing_phone_number,
        issued_at: new Date().toISOString(),
        due_at: renewalWindow.end_at.toISOString(),
        metadata: {
          billing_reason: 'subscription_renewal',
          [BILLING_RENEWAL_INVOICE_METADATA_KEY]: renewalWindowKey,
          renewal_window_start_at: renewalWindow.start_at.toISOString(),
          renewal_window_end_at: renewalWindow.end_at.toISOString(),
        },
      });

      await this.subscriptionsRepository.markInvoiceIssued(tenantId, subscription.id, null);
      return this.mapInvoice(invoice);
    });

    await this.billingAccessService.invalidateTenant(invoice.tenant_id);
    return invoice;
  }

  async listInvoices(query: ListInvoicesQueryDto): Promise<InvoiceResponseDto[]> {
    const invoices = await this.invoicesRepository.listInvoices(
      this.requireTenantId(),
      query.status,
    );
    return invoices.map((invoice) => this.mapInvoice(invoice));
  }

  async getInvoice(invoiceId: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoicesRepository.findById(this.requireTenantId(), invoiceId);

    if (!invoice) {
      throw new NotFoundException(`Invoice "${invoiceId}" was not found`);
    }

    return this.mapInvoice(invoice);
  }

  async exportReportCsv(reportId: string) {
    const normalizedReportId = reportId.trim().toLowerCase();
    const definition = BILLING_REPORT_EXPORTS.get(normalizedReportId);

    if (!definition) {
      throw new BadRequestException(`Unknown billing report export "${reportId}"`);
    }

    return createCsvReportArtifact({
      reportId: definition.id,
      title: definition.title,
      filename: definition.filename,
      headers: definition.headers,
      rows: await definition.rows(this.invoicesRepository, this.requireTenantId()),
    });
  }

  async handlePaymentIntentCompleted(
    tenantId: string,
    paymentIntentId: string,
    amountPaidMinor: string,
    paymentIntent?: CompletedStudentFeePaymentIntent,
    ledgerTransactionId?: string | null,
  ): Promise<void> {
    if (paymentIntent?.student_id && this.studentFeePaymentAllocation) {
      await this.studentFeePaymentAllocation.allocateConfirmedPayment({
        tenantId,
        paymentIntent,
        amountPaidMinor,
        ledgerTransactionId,
      });
      await this.billingAccessService.invalidateTenant(tenantId);
      return;
    }

    await this.databaseService.withRequestTransaction(async () => {
      const invoice = await this.invoicesRepository.lockByPaymentIntentId(
        tenantId,
        paymentIntentId,
      );

      if (!invoice || invoice.status === 'paid') {
        return;
      }

      await this.invoicesRepository.markPaid(tenantId, invoice.id, amountPaidMinor);
      const subscription = await this.subscriptionsRepository.lockCurrentByTenant(tenantId);

      if (!subscription || subscription.id !== invoice.subscription_id) {
        return;
      }

      const renewalWindow = this.billingLifecycleService.getNextRenewalWindow(subscription);
      await this.subscriptionsRepository.restoreRenewedSubscription(tenantId, subscription.id, {
        current_period_start: renewalWindow.start_at.toISOString(),
        current_period_end: renewalWindow.end_at.toISOString(),
        activated_at: new Date().toISOString(),
      });
    });

    await this.billingAccessService.invalidateTenant(tenantId);
  }

  private async requireBillableSubscription(tenantId: string): Promise<SubscriptionEntity> {
    const subscription = await this.subscriptionsRepository.lockCurrentByTenant(tenantId);

    if (!subscription) {
      throw new NotFoundException('No subscription exists for this tenant');
    }

    if (!BILLING_MUTABLE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      throw new ConflictException(
        `Subscription is not billable while status is "${subscription.status}"`,
      );
    }

    return subscription;
  }

  private mapSubscription(
    subscription: SubscriptionEntity,
    overview = this.billingLifecycleService.buildOverview(subscription),
  ): SubscriptionResponseDto {
    return Object.assign(new SubscriptionResponseDto(), {
      id: subscription.id,
      tenant_id: subscription.tenant_id,
      plan_code: subscription.plan_code,
      status: subscription.status,
      billing_phone_number: subscription.billing_phone_number,
      currency_code: subscription.currency_code,
      features: subscription.features,
      limits: subscription.limits,
      seats_allocated: subscription.seats_allocated,
      current_period_start: subscription.current_period_start.toISOString(),
      current_period_end: subscription.current_period_end.toISOString(),
      trial_ends_at: subscription.trial_ends_at?.toISOString() ?? null,
      grace_period_ends_at: subscription.grace_period_ends_at?.toISOString() ?? null,
      restricted_at: subscription.restricted_at?.toISOString() ?? null,
      suspended_at: subscription.suspended_at?.toISOString() ?? null,
      suspension_reason: subscription.suspension_reason ?? null,
      activated_at: subscription.activated_at?.toISOString() ?? null,
      canceled_at: subscription.canceled_at?.toISOString() ?? null,
      last_invoice_at: subscription.last_invoice_at?.toISOString() ?? null,
      lifecycle_state: overview.lifecycle_state,
      access_mode: overview.access_mode,
      renewal_required: overview.renewal_required,
      metadata: subscription.metadata,
      created_at: subscription.created_at.toISOString(),
      updated_at: subscription.updated_at.toISOString(),
    });
  }

  private mapInvoice(invoice: InvoiceEntity): InvoiceResponseDto {
    return Object.assign(new InvoiceResponseDto(), {
      id: invoice.id,
      tenant_id: invoice.tenant_id,
      subscription_id: invoice.subscription_id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      currency_code: invoice.currency_code,
      description: invoice.description,
      subtotal_amount_minor: invoice.subtotal_amount_minor,
      tax_amount_minor: invoice.tax_amount_minor,
      total_amount_minor: invoice.total_amount_minor,
      amount_paid_minor: invoice.amount_paid_minor,
      billing_phone_number: invoice.billing_phone_number,
      payment_intent_id: invoice.payment_intent_id,
      issued_at: invoice.issued_at.toISOString(),
      due_at: invoice.due_at.toISOString(),
      paid_at: invoice.paid_at?.toISOString() ?? null,
      voided_at: invoice.voided_at?.toISOString() ?? null,
      metadata: invoice.metadata,
      created_at: invoice.created_at.toISOString(),
      updated_at: invoice.updated_at.toISOString(),
    });
  }

  private resolveRenewalAmountMinor(subscription: SubscriptionEntity): string {
    const plan = BILLING_PLAN_CATALOG[
      subscription.plan_code as keyof typeof BILLING_PLAN_CATALOG
    ] ?? BILLING_PLAN_CATALOG.starter;

    return plan.code === 'enterprise'
      ? '750000'
      : plan.code === 'growth'
        ? '250000'
        : '150000';
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant context is required for billing operations',
      );
    }

    return tenantId;
  }

  private resolveTimestamp(value: string): string {
    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new ConflictException(`Invalid timestamp "${value}"`);
    }

    return parsedValue.toISOString();
  }

  private generateInvoiceNumber(): string {
    return `${BILLING_INVOICE_NUMBER_PREFIX}-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

const addDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
