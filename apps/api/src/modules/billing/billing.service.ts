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
import { BulkGenerateFeeInvoicesDto } from './dto/bulk-generate-fee-invoices.dto';
import {
  BulkFeeInvoiceGenerationResponseDto,
  BulkFeeInvoiceSkippedStudentDto,
} from './dto/bulk-fee-invoice-generation-response.dto';
import { BillableFeeStudentResponseDto } from './dto/billable-fee-student-response.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { FeeStructureResponseDto } from './dto/fee-structure-response.dto';
import {
  FinanceReconciliationBucket,
  FinanceReconciliationMethodSummaryDto,
  FinanceReconciliationResponseDto,
  FinanceReconciliationRowDto,
  FinanceReconciliationTotalsDto,
} from './dto/finance-reconciliation-response.dto';
import { FinanceActivityResponseDto } from './dto/finance-activity-response.dto';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { StudentFeeBalanceResponseDto } from './dto/student-fee-balance-response.dto';
import {
  StudentFeeStatementEntryResponseDto,
  StudentFeeStatementResponseDto,
} from './dto/student-fee-statement-response.dto';
import { SubscriptionLifecycleResponseDto } from './dto/subscription-lifecycle-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { BillingNotificationResponseDto } from './dto/billing-notification-response.dto';
import { InvoiceEntity } from './entities/invoice.entity';
import {
  ManualFeePaymentEntity,
  ManualFeePaymentMethod,
  ManualFeePaymentStatus,
} from './entities/manual-fee-payment.entity';
import {
  FeeStructureEntity,
  FeeStructureLineItem,
} from './entities/fee-structure.entity';
import {
  type CompletedStudentFeePaymentIntent,
  StudentFeePaymentAllocationService,
} from './student-fee-payment-allocation.service';
import { SubscriptionEntity } from './entities/subscription.entity';
import { FeeStructuresRepository } from './repositories/fee-structures.repository';
import { InvoicesRepository } from './repositories/invoices.repository';
import { ManualFeePaymentsRepository } from './repositories/manual-fee-payments.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';

type BillingReportExportDefinition = {
  id: string;
  title: string;
  filename: string;
  headers: string[];
  rows: (repository: InvoicesRepository, tenantId: string) => Promise<ReportCsvValue[][]>;
};

type StudentBalanceAccumulator = {
  tenant_id: string;
  student_id: string;
  student_name: string | null;
  currency_code: string;
  invoiced_amount_minor: bigint;
  paid_amount_minor: bigint;
  credit_amount_minor: bigint;
  invoice_count: number;
  last_activity_at: Date | null;
};

type StudentStatementWorkingEntry = {
  id: string;
  kind: 'invoice' | 'receipt';
  source_id: string;
  invoice_id: string | null;
  reference: string;
  description: string;
  status: string;
  method: string;
  debit_amount_minor: bigint;
  credit_amount_minor: bigint;
  occurred_at: Date;
  ledger_transaction_id: string | null;
};

type FinanceReconciliationInput = {
  from?: string;
  to?: string;
  method?: ManualFeePaymentMethod | string | null;
};

type FinanceReconciliationPeriod = {
  from: Date;
  to: Date;
  payment_method: ManualFeePaymentMethod | null;
};

type FinanceReconciliationAccumulator = {
  transaction_count: number;
  total_amount_minor: bigint;
  cleared_count: number;
  cleared_amount_minor: bigint;
  pending_count: number;
  pending_amount_minor: bigint;
  exception_count: number;
  exception_amount_minor: bigint;
};

type NormalizedBulkFeeStudent = {
  student_id: string;
  student_name: string;
  admission_number: string | null;
  class_name: string | null;
  guardian_phone: string | null;
};

const MANUAL_FEE_PAYMENT_METHODS: ManualFeePaymentMethod[] = [
  'cash',
  'cheque',
  'bank_deposit',
  'eft',
  'mpesa_c2b',
];

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
    @Optional() private readonly manualFeePaymentsRepository?: ManualFeePaymentsRepository,
    @Optional() private readonly feeStructuresRepository?: FeeStructuresRepository,
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

  async createFeeStructure(
    dto: CreateFeeStructureDto,
  ): Promise<FeeStructureResponseDto> {
    const feeStructuresRepository = this.requireFeeStructuresRepository();
    const store = this.requestContext.requireStore();
    const tenantId = this.requireTenantId();
    const lineItems = this.normalizeFeeStructureLineItems(dto.line_items);
    const totalAmountMinor = lineItems
      .reduce((total, item) => total + BigInt(item.amount_minor), 0n)
      .toString();
    const feeStructure = await this.databaseService.withRequestTransaction(() =>
      feeStructuresRepository.create({
        tenant_id: tenantId,
        name: dto.name.trim(),
        academic_year: dto.academic_year.trim(),
        term: dto.term.trim(),
        grade_level: dto.grade_level.trim(),
        class_name: dto.class_name?.trim() || null,
        currency_code: BILLING_DEFAULT_CURRENCY_CODE,
        status: dto.status ?? 'active',
        due_days: dto.due_days ?? 14,
        line_items: lineItems,
        total_amount_minor: totalAmountMinor,
        metadata: dto.metadata ?? {},
        created_by_user_id: store.user_id ?? null,
      }),
    );

    return this.mapFeeStructure(feeStructure);
  }

  async listFeeStructures(): Promise<FeeStructureResponseDto[]> {
    const feeStructures = await this.requireFeeStructuresRepository().list(
      this.requireTenantId(),
    );

    return feeStructures.map((feeStructure) => this.mapFeeStructure(feeStructure));
  }

  async listBillableStudentsForFeeStructure(
    feeStructureId: string,
  ): Promise<BillableFeeStudentResponseDto[]> {
    const tenantId = this.requireTenantId();
    const feeStructuresRepository = this.requireFeeStructuresRepository();
    const feeStructure = await feeStructuresRepository.findById(tenantId, feeStructureId);

    if (!feeStructure) {
      throw new NotFoundException(
        `Fee structure "${feeStructureId}" was not found`,
      );
    }

    if (feeStructure.status !== 'active') {
      throw new ConflictException(
        `Fee structure cannot list billable students while status is "${feeStructure.status}"`,
      );
    }

    const rows = await feeStructuresRepository.listBillableStudentsForFeeStructure(
      tenantId,
      {
        grade_level: feeStructure.grade_level,
        class_name: feeStructure.class_name,
      },
    );

    return rows.map((row) =>
      Object.assign(new BillableFeeStudentResponseDto(), row),
    );
  }

  async archiveFeeStructure(
    feeStructureId: string,
  ): Promise<FeeStructureResponseDto> {
    const tenantId = this.requireTenantId();
    const archivedFeeStructure = await this.databaseService.withRequestTransaction(() =>
      this.requireFeeStructuresRepository().archive(tenantId, feeStructureId),
    );

    if (!archivedFeeStructure) {
      throw new NotFoundException(
        `Fee structure "${feeStructureId}" was not found`,
      );
    }

    await this.billingAccessService.invalidateTenant(tenantId);
    return this.mapFeeStructure(archivedFeeStructure);
  }

  async bulkGenerateFeeInvoices(
    dto: BulkGenerateFeeInvoicesDto,
  ): Promise<BulkFeeInvoiceGenerationResponseDto> {
    const feeStructuresRepository = this.requireFeeStructuresRepository();
    const feeStructureId = dto.fee_structure_id?.trim();

    if (!feeStructureId) {
      throw new BadRequestException('Fee structure id is required for bulk invoice generation');
    }

    const generated = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      await this.subscriptionsRepository.acquireTenantMutationLock(tenantId);
      const subscription = await this.requireBillableSubscription(tenantId);
      const feeStructure = await feeStructuresRepository.findById(
        tenantId,
        feeStructureId,
      );

      if (!feeStructure) {
        throw new NotFoundException(
          `Fee structure "${feeStructureId}" was not found`,
        );
      }

      if (feeStructure.status !== 'active') {
        throw new ConflictException(
          `Fee structure cannot generate invoices while status is "${feeStructure.status}"`,
        );
      }

      const students = this.normalizeBulkFeeStudents(dto.target_students);
      const existingInvoices = await this.invoicesRepository.listInvoices(tenantId);
      const activeInvoiceByStudent = new Map<string, InvoiceEntity>();

      for (const invoice of existingInvoices) {
        if (['void', 'uncollectible'].includes(invoice.status)) {
          continue;
        }

        if (
          this.readStringMetadata(invoice.metadata, 'fee_structure_id') !== feeStructure.id
        ) {
          continue;
        }

        const studentId = this.readStringMetadata(invoice.metadata, 'student_id');

        if (studentId && !activeInvoiceByStudent.has(studentId)) {
          activeInvoiceByStudent.set(studentId, invoice);
        }
      }

      const invoices: InvoiceResponseDto[] = [];
      const skipped: BulkFeeInvoiceSkippedStudentDto[] = [];
      const dueAt = dto.due_at
        ? this.resolveTimestamp(dto.due_at)
        : addDays(new Date(), feeStructure.due_days).toISOString();

      for (const student of students) {
        const existingInvoice = activeInvoiceByStudent.get(student.student_id);

        if (existingInvoice) {
          skipped.push(
            Object.assign(new BulkFeeInvoiceSkippedStudentDto(), {
              student_id: student.student_id,
              student_name: student.student_name,
              reason: 'active_invoice_exists',
              invoice_id: existingInvoice.id,
            }),
          );
          continue;
        }

        const invoice = await this.invoicesRepository.createInvoice({
          tenant_id: tenantId,
          subscription_id: subscription.id,
          invoice_number: this.generateInvoiceNumber(),
          status: 'open',
          currency_code: subscription.currency_code,
          description: `${feeStructure.name} - ${student.student_name}`,
          subtotal_amount_minor: feeStructure.total_amount_minor,
          tax_amount_minor: '0',
          total_amount_minor: feeStructure.total_amount_minor,
          billing_phone_number: student.guardian_phone ?? subscription.billing_phone_number,
          issued_at: new Date().toISOString(),
          due_at: dueAt,
          metadata: {
            ...(dto.metadata ?? {}),
            billing_reason: 'fee_structure_bulk_generation',
            fee_structure_id: feeStructure.id,
            idempotency_key: dto.idempotency_key.trim(),
            academic_year: feeStructure.academic_year,
            term: feeStructure.term,
            grade_level: feeStructure.grade_level,
            class_name: student.class_name ?? feeStructure.class_name,
            student_id: student.student_id,
            student_name: student.student_name,
            admission_number: student.admission_number,
            line_items: feeStructure.line_items,
          },
        });

        await this.subscriptionsRepository.markInvoiceIssued(tenantId, subscription.id, null);
        activeInvoiceByStudent.set(student.student_id, invoice);
        invoices.push(this.mapInvoice(invoice));
      }

      return {
        tenantId,
        response: Object.assign(new BulkFeeInvoiceGenerationResponseDto(), {
          fee_structure_id: feeStructure.id,
          idempotency_key: dto.idempotency_key.trim(),
          generated_count: invoices.length,
          skipped_count: skipped.length,
          invoices,
          skipped,
        }),
      };
    });

    if (generated.response.generated_count > 0) {
      await this.billingAccessService.invalidateTenant(generated.tenantId);
    }

    return generated.response;
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

  async listFinanceActivity(): Promise<FinanceActivityResponseDto[]> {
    const tenantId = this.requireTenantId();
    const [invoices, receipts] = await Promise.all([
      this.invoicesRepository.listInvoices(tenantId),
      this.manualFeePaymentsRepository?.list({ tenant_id: tenantId }) ?? [],
    ]);
    const invoiceRows = invoices.map((invoice) =>
      Object.assign(new FinanceActivityResponseDto(), {
        id: `invoice:${invoice.id}`,
        tenant_id: invoice.tenant_id,
        kind: 'invoice' as const,
        student_id: this.readStringMetadata(invoice.metadata, 'student_id'),
        student_name: this.readStringMetadata(invoice.metadata, 'student_name'),
        invoice_id: invoice.id,
        amount_minor: invoice.total_amount_minor,
        currency_code: invoice.currency_code,
        method: 'invoice',
        status: invoice.status,
        reference: invoice.invoice_number,
        occurred_at: invoice.issued_at.toISOString(),
        ledger_transaction_id: null,
        metadata: invoice.metadata,
      }),
    );
    const receiptRows = receipts.map((payment) =>
      Object.assign(new FinanceActivityResponseDto(), {
        id: `receipt:${payment.id}`,
        tenant_id: payment.tenant_id,
        kind: 'receipt' as const,
        student_id: payment.student_id,
        student_name:
          this.readStringMetadata(payment.metadata, 'student_name') ??
          payment.payer_name,
        invoice_id: payment.invoice_id,
        amount_minor: payment.amount_minor,
        currency_code: payment.currency_code,
        method: payment.payment_method,
        status: payment.status,
        reference:
          payment.external_reference ??
          payment.deposit_reference ??
          payment.cheque_number ??
          payment.receipt_number,
        occurred_at: (payment.cleared_at ?? payment.received_at).toISOString(),
        ledger_transaction_id: payment.ledger_transaction_id,
        metadata: payment.metadata,
      }),
    );

    return [...invoiceRows, ...receiptRows].sort((left, right) =>
      right.occurred_at.localeCompare(left.occurred_at),
    );
  }

  async listStudentBalances(): Promise<StudentFeeBalanceResponseDto[]> {
    const tenantId = this.requireTenantId();
    const [invoices, receipts] = await Promise.all([
      this.invoicesRepository.listInvoices(tenantId),
      this.manualFeePaymentsRepository?.list({ tenant_id: tenantId }) ?? [],
    ]);
    return this.buildStudentBalances(invoices, receipts);
  }

  async getStudentStatement(studentId: string): Promise<StudentFeeStatementResponseDto> {
    const normalizedStudentId = studentId.trim();

    if (!normalizedStudentId) {
      throw new BadRequestException('Student id is required for fee statements');
    }

    const tenantId = this.requireTenantId();
    const [invoices, receipts] = await Promise.all([
      this.invoicesRepository.listInvoices(tenantId),
      this.manualFeePaymentsRepository?.list({ tenant_id: tenantId }) ?? [],
    ]);
    const studentInvoices = invoices.filter(
      (invoice) =>
        this.readStringMetadata(invoice.metadata, 'student_id') === normalizedStudentId,
    );
    const invoiceIds = new Set(studentInvoices.map((invoice) => invoice.id));
    const studentReceipts = receipts.filter(
      (receipt) =>
        receipt.student_id === normalizedStudentId ||
        (receipt.invoice_id !== null && invoiceIds.has(receipt.invoice_id)),
    );
    const entries = this.buildStudentStatementEntries(studentInvoices, studentReceipts);

    if (entries.length === 0) {
      throw new NotFoundException(
        `No fee statement activity was found for student "${normalizedStudentId}"`,
      );
    }

    const summary =
      this.buildStudentBalances(studentInvoices, studentReceipts).find(
        (balance) => balance.student_id === normalizedStudentId,
      ) ??
      this.createEmptyStudentBalance(
        tenantId,
        normalizedStudentId,
        this.resolveStudentName(studentInvoices, studentReceipts),
      );

    return Object.assign(new StudentFeeStatementResponseDto(), {
      summary,
      entries,
    });
  }

  async exportStudentStatementCsv(studentId: string) {
    const statement = await this.getStudentStatement(studentId);

    return createCsvReportArtifact({
      reportId: `student-fee-statement-${statement.summary.student_id}`,
      title: `Student fee statement - ${statement.summary.student_name ?? statement.summary.student_id}`,
      filename: `student-fee-statement-${statement.summary.student_id}.csv`,
      headers: [
        'Date',
        'Type',
        'Reference',
        'Description',
        'Status',
        'Method',
        'Debit Minor',
        'Credit Minor',
        'Balance After Minor',
        'Ledger Transaction',
      ],
      rows: statement.entries.map((entry) => [
        entry.occurred_at,
        entry.kind,
        entry.reference,
        entry.description,
        entry.status,
        entry.method,
        entry.debit_amount_minor,
        entry.credit_amount_minor,
        entry.balance_after_minor,
        entry.ledger_transaction_id,
      ]),
    });
  }

  async listFinanceReconciliation(
    input: FinanceReconciliationInput = {},
  ): Promise<FinanceReconciliationResponseDto> {
    const tenantId = this.requireTenantId();
    const period = this.resolveFinanceReconciliationPeriod(input);
    const payments = await this.manualFeePaymentsRepository?.list({ tenant_id: tenantId }) ?? [];
    const rows = payments
      .map((payment) => this.toFinanceReconciliationRow(payment))
      .filter((row) => {
        const occurredAt = new Date(row.occurred_at);

        return (
          occurredAt >= period.from &&
          occurredAt <= period.to &&
          (!period.payment_method || row.payment_method === period.payment_method)
        );
      })
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at));
    const totals = this.createFinanceReconciliationAccumulator();
    const methodTotals = new Map(
      MANUAL_FEE_PAYMENT_METHODS.map((method) => [
        method,
        this.createFinanceReconciliationAccumulator(),
      ]),
    );

    for (const row of rows) {
      this.addFinanceReconciliationAmount(totals, row);
      this.addFinanceReconciliationAmount(
        methodTotals.get(row.payment_method) ?? totals,
        row,
      );
    }

    return Object.assign(new FinanceReconciliationResponseDto(), {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        payment_method: period.payment_method,
      },
      totals: this.toFinanceReconciliationTotalsDto(totals),
      method_summaries: MANUAL_FEE_PAYMENT_METHODS.map((method) =>
        this.toFinanceReconciliationMethodSummaryDto(
          method,
          methodTotals.get(method) ?? this.createFinanceReconciliationAccumulator(),
        ),
      ),
      rows,
    });
  }

  async exportFinanceReconciliationCsv(input: FinanceReconciliationInput = {}) {
    const report = await this.listFinanceReconciliation(input);
    const fromDate = report.period.from.slice(0, 10);
    const toDate = report.period.to.slice(0, 10);

    return createCsvReportArtifact({
      reportId: 'finance-reconciliation',
      title: 'Finance reconciliation',
      filename: `finance-reconciliation-${fromDate}-${toDate}.csv`,
      headers: [
        'Occurred At',
        'Receipt',
        'Method',
        'Status',
        'Bucket',
        'Amount Minor',
        'Reference',
        'Payer',
        'Student ID',
        'Invoice ID',
        'Ledger Transaction',
        'Reversal Transaction',
      ],
      rows: report.rows.map((row) => [
        row.occurred_at,
        row.receipt_number,
        row.payment_method,
        row.status,
        row.reconciliation_bucket,
        row.amount_minor,
        row.reference,
        row.payer_name,
        row.student_id,
        row.invoice_id,
        row.ledger_transaction_id,
        row.reversal_ledger_transaction_id,
      ]),
    });
  }

  private buildStudentBalances(
    invoices: InvoiceEntity[],
    receipts: ManualFeePaymentEntity[],
  ): StudentFeeBalanceResponseDto[] {
    const balances = new Map<string, StudentBalanceAccumulator>();

    for (const invoice of invoices) {
      const studentId = this.readStringMetadata(invoice.metadata, 'student_id');

      if (!studentId) {
        continue;
      }

      const balance = this.getOrCreateStudentBalance(balances, {
        tenant_id: invoice.tenant_id,
        student_id: studentId,
        student_name: this.readStringMetadata(invoice.metadata, 'student_name'),
        currency_code: invoice.currency_code,
      });

      balance.invoiced_amount_minor += this.toMinorBigInt(invoice.total_amount_minor);
      balance.paid_amount_minor += this.toMinorBigInt(invoice.amount_paid_minor);
      balance.invoice_count += 1;
      balance.last_activity_at = this.maxDate(balance.last_activity_at, invoice.issued_at);
    }

    for (const receipt of receipts) {
      if (
        receipt.status !== 'cleared' ||
        !receipt.student_id ||
        receipt.invoice_id
      ) {
        continue;
      }

      const balance = this.getOrCreateStudentBalance(balances, {
        tenant_id: receipt.tenant_id,
        student_id: receipt.student_id,
        student_name:
          this.readStringMetadata(receipt.metadata, 'student_name') ?? receipt.payer_name,
        currency_code: receipt.currency_code,
      });

      balance.credit_amount_minor += this.toMinorBigInt(receipt.amount_minor);
      balance.last_activity_at = this.maxDate(
        balance.last_activity_at,
        receipt.cleared_at ?? receipt.received_at,
      );
    }

    return [...balances.values()]
      .map((balance) => {
        const outstanding =
          balance.invoiced_amount_minor -
          balance.paid_amount_minor -
          balance.credit_amount_minor;

        return Object.assign(new StudentFeeBalanceResponseDto(), {
          tenant_id: balance.tenant_id,
          student_id: balance.student_id,
          student_name: balance.student_name,
          currency_code: balance.currency_code,
          invoiced_amount_minor: balance.invoiced_amount_minor.toString(),
          paid_amount_minor: balance.paid_amount_minor.toString(),
          credit_amount_minor: balance.credit_amount_minor.toString(),
          balance_amount_minor: (outstanding > 0n ? outstanding : 0n).toString(),
          invoice_count: balance.invoice_count,
          last_activity_at: balance.last_activity_at?.toISOString() ?? null,
        });
      })
      .sort((left, right) => {
        const leftBalance = BigInt(left.balance_amount_minor);
        const rightBalance = BigInt(right.balance_amount_minor);

        if (leftBalance !== rightBalance) {
          return rightBalance > leftBalance ? 1 : -1;
        }

        return (right.last_activity_at ?? '').localeCompare(left.last_activity_at ?? '');
      });
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

  private mapFeeStructure(feeStructure: FeeStructureEntity): FeeStructureResponseDto {
    return Object.assign(new FeeStructureResponseDto(), {
      id: feeStructure.id,
      tenant_id: feeStructure.tenant_id,
      name: feeStructure.name,
      academic_year: feeStructure.academic_year,
      term: feeStructure.term,
      grade_level: feeStructure.grade_level,
      class_name: feeStructure.class_name,
      currency_code: feeStructure.currency_code,
      status: feeStructure.status,
      due_days: feeStructure.due_days,
      line_items: feeStructure.line_items,
      total_amount_minor: feeStructure.total_amount_minor,
      metadata: feeStructure.metadata,
      created_by_user_id: feeStructure.created_by_user_id,
      created_at: feeStructure.created_at.toISOString(),
      updated_at: feeStructure.updated_at.toISOString(),
    });
  }

  private normalizeFeeStructureLineItems(
    items: Array<{ code: string; label: string; amount_minor: string }>,
  ): FeeStructureLineItem[] {
    const seenCodes = new Set<string>();

    return items.map((item) => {
      const code = item.code.trim().toLowerCase();
      const label = item.label.trim();
      const amountMinor = item.amount_minor.trim();

      if (!code || !label) {
        throw new BadRequestException('Fee structure line items require code and label');
      }

      if (!/^[1-9][0-9]*$/.test(amountMinor)) {
        throw new BadRequestException('Fee structure line item amounts must be positive minor units');
      }

      if (seenCodes.has(code)) {
        throw new ConflictException(`Duplicate fee line item code "${code}"`);
      }

      seenCodes.add(code);

      return {
        code,
        label,
        amount_minor: amountMinor,
      };
    });
  }

  private normalizeBulkFeeStudents(
    students: BulkGenerateFeeInvoicesDto['target_students'],
  ): NormalizedBulkFeeStudent[] {
    const seenStudentIds = new Set<string>();

    return students.map((student) => {
      const normalized: NormalizedBulkFeeStudent = {
        student_id: student.student_id.trim(),
        student_name: student.student_name.trim(),
        admission_number: student.admission_number?.trim() || null,
        class_name: student.class_name?.trim() || null,
        guardian_phone: student.guardian_phone?.trim() || null,
      };

      if (!normalized.student_id || !normalized.student_name) {
        throw new BadRequestException('Bulk invoice targets require student id and name');
      }

      if (seenStudentIds.has(normalized.student_id)) {
        throw new ConflictException(
          `Student "${normalized.student_id}" appears more than once in the bulk invoice request`,
        );
      }

      seenStudentIds.add(normalized.student_id);

      return normalized;
    });
  }

  private buildStudentStatementEntries(
    invoices: InvoiceEntity[],
    receipts: ManualFeePaymentEntity[],
  ): StudentFeeStatementEntryResponseDto[] {
    const clearedReceiptCreditsByInvoice = new Map<string, bigint>();
    const entries: StudentStatementWorkingEntry[] = [];

    for (const receipt of receipts) {
      if (receipt.status === 'cleared' && receipt.invoice_id) {
        clearedReceiptCreditsByInvoice.set(
          receipt.invoice_id,
          (clearedReceiptCreditsByInvoice.get(receipt.invoice_id) ?? 0n) +
            this.toMinorBigInt(receipt.amount_minor),
        );
      }
    }

    for (const invoice of invoices) {
      entries.push({
        id: `invoice:${invoice.id}`,
        kind: 'invoice',
        source_id: invoice.id,
        invoice_id: invoice.id,
        reference: invoice.invoice_number,
        description: invoice.description,
        status: invoice.status,
        method: 'invoice',
        debit_amount_minor: this.toMinorBigInt(invoice.total_amount_minor),
        credit_amount_minor: 0n,
        occurred_at: invoice.issued_at,
        ledger_transaction_id: null,
      });

      const paidMinor = this.toMinorBigInt(invoice.amount_paid_minor);
      const receiptCredits = clearedReceiptCreditsByInvoice.get(invoice.id) ?? 0n;
      const unrepresentedCredit = paidMinor - receiptCredits;

      if (unrepresentedCredit > 0n) {
        entries.push({
          id: `allocated-payment:${invoice.id}`,
          kind: 'receipt',
          source_id: invoice.id,
          invoice_id: invoice.id,
          reference: `ALLOC-${invoice.invoice_number}`,
          description: 'Allocated payment',
          status: 'cleared',
          method: 'allocated_payment',
          debit_amount_minor: 0n,
          credit_amount_minor: unrepresentedCredit,
          occurred_at: invoice.paid_at ?? invoice.updated_at,
          ledger_transaction_id: null,
        });
      }
    }

    for (const receipt of receipts) {
      entries.push({
        id: `receipt:${receipt.id}`,
        kind: 'receipt',
        source_id: receipt.id,
        invoice_id: receipt.invoice_id,
        reference: receipt.receipt_number,
        description: this.describeReceiptStatementEntry(receipt),
        status: receipt.status,
        method: receipt.payment_method,
        debit_amount_minor: 0n,
        credit_amount_minor:
          receipt.status === 'cleared' ? this.toMinorBigInt(receipt.amount_minor) : 0n,
        occurred_at:
          receipt.cleared_at ??
          receipt.deposited_at ??
          receipt.received_at,
        ledger_transaction_id: receipt.ledger_transaction_id,
      });
    }

    let runningBalance = 0n;

    return entries
      .sort((left, right) => {
        const timeDifference = left.occurred_at.getTime() - right.occurred_at.getTime();

        if (timeDifference !== 0) {
          return timeDifference;
        }

        return left.kind.localeCompare(right.kind);
      })
      .map((entry) => {
        runningBalance += entry.debit_amount_minor - entry.credit_amount_minor;

        return Object.assign(new StudentFeeStatementEntryResponseDto(), {
          id: entry.id,
          kind: entry.kind,
          source_id: entry.source_id,
          invoice_id: entry.invoice_id,
          reference: entry.reference,
          description: entry.description,
          status: entry.status,
          method: entry.method,
          debit_amount_minor: entry.debit_amount_minor.toString(),
          credit_amount_minor: entry.credit_amount_minor.toString(),
          balance_after_minor: runningBalance.toString(),
          occurred_at: entry.occurred_at.toISOString(),
          ledger_transaction_id: entry.ledger_transaction_id,
        });
      });
  }

  private describeReceiptStatementEntry(receipt: ManualFeePaymentEntity): string {
    if (receipt.status === 'cleared') {
      return `Cleared ${receipt.payment_method} receipt`;
    }

    if (receipt.status === 'bounced') {
      return `Bounced ${receipt.payment_method} receipt`;
    }

    if (receipt.status === 'reversed') {
      return `Reversed ${receipt.payment_method} receipt`;
    }

    return `Pending ${receipt.payment_method} receipt`;
  }

  private toFinanceReconciliationRow(
    payment: ManualFeePaymentEntity,
  ): FinanceReconciliationRowDto {
    return Object.assign(new FinanceReconciliationRowDto(), {
      payment_id: payment.id,
      receipt_number: payment.receipt_number,
      payment_method: payment.payment_method,
      status: payment.status,
      reconciliation_bucket: this.getFinanceReconciliationBucket(payment.status),
      amount_minor: payment.amount_minor,
      currency_code: payment.currency_code,
      occurred_at: this.getFinanceReconciliationOccurredAt(payment).toISOString(),
      reference:
        payment.external_reference ??
        payment.deposit_reference ??
        payment.cheque_number ??
        payment.ledger_transaction_id ??
        payment.reversal_ledger_transaction_id ??
        payment.receipt_number,
      payer_name: payment.payer_name,
      student_id: payment.student_id,
      invoice_id: payment.invoice_id,
      ledger_transaction_id: payment.ledger_transaction_id,
      reversal_ledger_transaction_id: payment.reversal_ledger_transaction_id,
    });
  }

  private getFinanceReconciliationOccurredAt(payment: ManualFeePaymentEntity): Date {
    if (payment.status === 'reversed') {
      return payment.reversed_at ?? payment.updated_at;
    }

    if (payment.status === 'bounced') {
      return payment.bounced_at ?? payment.updated_at;
    }

    if (payment.status === 'cleared') {
      return payment.cleared_at ?? payment.received_at;
    }

    if (payment.status === 'deposited') {
      return payment.deposited_at ?? payment.received_at;
    }

    return payment.received_at;
  }

  private getFinanceReconciliationBucket(
    status: ManualFeePaymentStatus,
  ): FinanceReconciliationBucket {
    if (status === 'cleared') {
      return 'cleared';
    }

    if (status === 'received' || status === 'deposited') {
      return 'pending';
    }

    return 'exception';
  }

  private createFinanceReconciliationAccumulator(): FinanceReconciliationAccumulator {
    return {
      transaction_count: 0,
      total_amount_minor: 0n,
      cleared_count: 0,
      cleared_amount_minor: 0n,
      pending_count: 0,
      pending_amount_minor: 0n,
      exception_count: 0,
      exception_amount_minor: 0n,
    };
  }

  private addFinanceReconciliationAmount(
    accumulator: FinanceReconciliationAccumulator,
    row: FinanceReconciliationRowDto,
  ): void {
    const amount = this.toMinorBigInt(row.amount_minor);

    accumulator.transaction_count += 1;
    accumulator.total_amount_minor += amount;

    if (row.reconciliation_bucket === 'cleared') {
      accumulator.cleared_count += 1;
      accumulator.cleared_amount_minor += amount;
      return;
    }

    if (row.reconciliation_bucket === 'pending') {
      accumulator.pending_count += 1;
      accumulator.pending_amount_minor += amount;
      return;
    }

    accumulator.exception_count += 1;
    accumulator.exception_amount_minor += amount;
  }

  private toFinanceReconciliationTotalsDto(
    accumulator: FinanceReconciliationAccumulator,
  ): FinanceReconciliationTotalsDto {
    return Object.assign(new FinanceReconciliationTotalsDto(), {
      transaction_count: accumulator.transaction_count,
      total_amount_minor: accumulator.total_amount_minor.toString(),
      cleared_count: accumulator.cleared_count,
      cleared_amount_minor: accumulator.cleared_amount_minor.toString(),
      pending_count: accumulator.pending_count,
      pending_amount_minor: accumulator.pending_amount_minor.toString(),
      exception_count: accumulator.exception_count,
      exception_amount_minor: accumulator.exception_amount_minor.toString(),
    });
  }

  private toFinanceReconciliationMethodSummaryDto(
    method: ManualFeePaymentMethod,
    accumulator: FinanceReconciliationAccumulator,
  ): FinanceReconciliationMethodSummaryDto {
    return Object.assign(new FinanceReconciliationMethodSummaryDto(), {
      payment_method: method,
      transaction_count: accumulator.transaction_count,
      total_amount_minor: accumulator.total_amount_minor.toString(),
      cleared_amount_minor: accumulator.cleared_amount_minor.toString(),
      pending_amount_minor: accumulator.pending_amount_minor.toString(),
      exception_amount_minor: accumulator.exception_amount_minor.toString(),
    });
  }

  private resolveFinanceReconciliationPeriod(
    input: FinanceReconciliationInput,
  ): FinanceReconciliationPeriod {
    const now = new Date();
    const from = input.from
      ? this.parseFinanceReconciliationBoundary(input.from, 'from')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const to = input.to
      ? this.parseFinanceReconciliationBoundary(input.to, 'to')
      : now;
    const paymentMethod = this.resolveFinanceReconciliationPaymentMethod(input.method);

    if (from > to) {
      throw new BadRequestException('Reconciliation start date cannot be after end date');
    }

    return {
      from,
      to,
      payment_method: paymentMethod,
    };
  }

  private parseFinanceReconciliationBoundary(value: string, side: 'from' | 'to'): Date {
    const trimmed = value.trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? side === 'from'
        ? `${trimmed}T00:00:00.000Z`
        : `${trimmed}T23:59:59.999Z`
      : trimmed;
    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid reconciliation ${side} date "${value}"`);
    }

    return parsed;
  }

  private resolveFinanceReconciliationPaymentMethod(
    method?: ManualFeePaymentMethod | string | null,
  ): ManualFeePaymentMethod | null {
    if (!method) {
      return null;
    }

    const normalized = method.trim() as ManualFeePaymentMethod;

    if (!MANUAL_FEE_PAYMENT_METHODS.includes(normalized)) {
      throw new BadRequestException(`Unknown reconciliation payment method "${method}"`);
    }

    return normalized;
  }

  private createEmptyStudentBalance(
    tenantId: string,
    studentId: string,
    studentName: string | null,
  ): StudentFeeBalanceResponseDto {
    return Object.assign(new StudentFeeBalanceResponseDto(), {
      tenant_id: tenantId,
      student_id: studentId,
      student_name: studentName,
      currency_code: BILLING_DEFAULT_CURRENCY_CODE,
      invoiced_amount_minor: '0',
      paid_amount_minor: '0',
      credit_amount_minor: '0',
      balance_amount_minor: '0',
      invoice_count: 0,
      last_activity_at: null,
    });
  }

  private resolveStudentName(
    invoices: InvoiceEntity[],
    receipts: ManualFeePaymentEntity[],
  ): string | null {
    for (const invoice of invoices) {
      const studentName = this.readStringMetadata(invoice.metadata, 'student_name');

      if (studentName) {
        return studentName;
      }
    }

    for (const receipt of receipts) {
      const studentName =
        this.readStringMetadata(receipt.metadata, 'student_name') ?? receipt.payer_name;

      if (studentName) {
        return studentName;
      }
    }

    return null;
  }

  private readStringMetadata(
    metadata: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = metadata[key];

    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private getOrCreateStudentBalance(
    balances: Map<string, StudentBalanceAccumulator>,
    input: {
      tenant_id: string;
      student_id: string;
      student_name: string | null;
      currency_code: string;
    },
  ): StudentBalanceAccumulator {
    const existing = balances.get(input.student_id);

    if (existing) {
      if (!existing.student_name && input.student_name) {
        existing.student_name = input.student_name;
      }

      return existing;
    }

    const created: StudentBalanceAccumulator = {
      tenant_id: input.tenant_id,
      student_id: input.student_id,
      student_name: input.student_name,
      currency_code: input.currency_code,
      invoiced_amount_minor: 0n,
      paid_amount_minor: 0n,
      credit_amount_minor: 0n,
      invoice_count: 0,
      last_activity_at: null,
    };

    balances.set(input.student_id, created);

    return created;
  }

  private toMinorBigInt(value: string): bigint {
    return /^[0-9]+$/.test(value) ? BigInt(value) : 0n;
  }

  private maxDate(current: Date | null, candidate: Date): Date {
    return !current || candidate > current ? candidate : current;
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

  private requireFeeStructuresRepository(): FeeStructuresRepository {
    if (!this.feeStructuresRepository) {
      throw new ConflictException('Fee structure repository is not configured');
    }

    return this.feeStructuresRepository;
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
