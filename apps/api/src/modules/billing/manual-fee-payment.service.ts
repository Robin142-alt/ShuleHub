import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AUTH_ANONYMOUS_USER_ID } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { AccountsRepository } from '../finance/repositories/accounts.repository';
import { TransactionService } from '../finance/transaction.service';
import { CreateManualFeePaymentDto } from './dto/create-manual-fee-payment.dto';
import { ManualFeePaymentResponseDto } from './dto/manual-fee-payment-response.dto';
import { UpdateManualFeePaymentStatusDto } from './dto/update-manual-fee-payment-status.dto';
import {
  ManualFeePaymentAllocationEntity,
  ManualFeePaymentEntity,
  ManualFeePaymentMethod,
  ManualFeePaymentStatus,
} from './entities/manual-fee-payment.entity';
import { InvoicesRepository, StudentFeeInvoiceForAllocation } from './repositories/invoices.repository';
import { ManualFeePaymentsRepository } from './repositories/manual-fee-payments.repository';

const DEFAULT_CURRENCY_CODE = 'KES';
const DEFAULT_FEE_CONTROL_ACCOUNT_CODE = '1100-AR-FEES';

const DEFAULT_ASSET_ACCOUNT_BY_METHOD: Record<ManualFeePaymentMethod, string> = {
  cash: '1010-CASH-ON-HAND',
  cheque: '1120-BANK-CLEARING',
  bank_deposit: '1120-BANK-CLEARING',
  eft: '1120-BANK-CLEARING',
  mpesa_c2b: '1110-MPESA-CLEARING',
};

@Injectable()
export class ManualFeePaymentService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly manualFeePaymentsRepository: ManualFeePaymentsRepository,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly accountsRepository: AccountsRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async createManualFeePayment(
    dto: CreateManualFeePaymentDto,
  ): Promise<ManualFeePaymentResponseDto> {
    const tenantId = this.requireTenantId();
    const requestContext = this.requestContext.requireStore();
    const payment = await this.databaseService.withRequestTransaction(async () => {
      this.assertHasAllocationTarget(dto.student_id ?? null, dto.invoice_id ?? null);
      this.assertMethodRequirements(dto);

      const createdPayment = await this.manualFeePaymentsRepository.create({
        tenant_id: tenantId,
        idempotency_key: dto.idempotency_key.trim(),
        receipt_number: this.generateReceiptNumber(),
        payment_method: dto.payment_method,
        status: 'received',
        student_id: dto.student_id ?? null,
        invoice_id: dto.invoice_id ?? null,
        amount_minor: this.normalizeMinorAmount(dto.amount_minor),
        currency_code: DEFAULT_CURRENCY_CODE,
        payer_name: dto.payer_name?.trim() || null,
        received_at: this.resolveTimestamp(dto.received_at),
        cheque_number: dto.cheque_number?.trim() || null,
        drawer_bank: dto.drawer_bank?.trim() || null,
        deposit_reference: dto.deposit_reference?.trim() || null,
        external_reference: dto.external_reference?.trim() || null,
        asset_account_code: this.resolveAssetAccountCode(dto.payment_method, dto.asset_account_code),
        fee_control_account_code:
          dto.fee_control_account_code?.trim() || DEFAULT_FEE_CONTROL_ACCOUNT_CODE,
        notes: dto.notes?.trim() || null,
        metadata: dto.metadata ?? {},
        created_by_user_id:
          requestContext.user_id && requestContext.user_id !== AUTH_ANONYMOUS_USER_ID
            ? requestContext.user_id
            : null,
      });

      if (createdPayment.status === 'cleared' || createdPayment.status === 'reversed') {
        return createdPayment;
      }

      if (createdPayment.payment_method === 'cheque') {
        return createdPayment;
      }

      return this.clearLockedPayment(createdPayment, {
        occurred_at: dto.received_at,
        deposit_reference: dto.deposit_reference,
        notes: dto.notes,
        metadata: { cleared_on_create: true },
      });
    });

    return this.toResponse(payment);
  }

  async listManualFeePayments(input: {
    status?: ManualFeePaymentStatus | null;
  } = {}): Promise<ManualFeePaymentResponseDto[]> {
    const payments = await this.manualFeePaymentsRepository.list({
      tenant_id: this.requireTenantId(),
      status: input.status ?? null,
    });

    return payments.map((payment) => this.toResponse(payment));
  }

  async getManualFeePayment(paymentId: string): Promise<ManualFeePaymentResponseDto> {
    const payment = await this.manualFeePaymentsRepository.findById(
      this.requireTenantId(),
      paymentId,
    );

    if (!payment) {
      throw new NotFoundException(`Manual fee payment "${paymentId}" was not found`);
    }

    return this.toResponse(payment);
  }

  async depositManualFeePayment(
    paymentId: string,
    dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    const payment = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const lockedPayment = await this.requireLockedPayment(tenantId, paymentId);

      if (lockedPayment.payment_method !== 'cheque') {
        throw new BadRequestException('Only cheque receipts can be marked as deposited');
      }

      if (lockedPayment.status !== 'received') {
        throw new ConflictException(
          `Cheque receipt cannot be deposited while status is "${lockedPayment.status}"`,
        );
      }

      return this.manualFeePaymentsRepository.markDeposited({
        tenant_id: tenantId,
        payment_id: paymentId,
        deposited_at: this.resolveTimestamp(dto.occurred_at),
        deposit_reference: dto.deposit_reference?.trim() || null,
        notes: dto.notes?.trim() || null,
        metadata: dto.metadata,
      });
    });

    return this.toResponse(payment);
  }

  async clearManualFeePayment(
    paymentId: string,
    dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    const payment = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const lockedPayment = await this.requireLockedPayment(tenantId, paymentId);

      return this.clearLockedPayment(lockedPayment, dto);
    });

    return this.toResponse(payment);
  }

  async bounceManualFeePayment(
    paymentId: string,
    dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    const payment = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const lockedPayment = await this.requireLockedPayment(tenantId, paymentId);

      if (lockedPayment.payment_method !== 'cheque') {
        throw new BadRequestException('Only cheque receipts can bounce');
      }

      if (!['received', 'deposited'].includes(lockedPayment.status)) {
        throw new ConflictException(
          `Cheque receipt cannot bounce while status is "${lockedPayment.status}"`,
        );
      }

      return this.manualFeePaymentsRepository.markBounced({
        tenant_id: tenantId,
        payment_id: paymentId,
        bounced_at: this.resolveTimestamp(dto.occurred_at),
        notes: dto.notes?.trim() || null,
        metadata: dto.metadata,
      });
    });

    return this.toResponse(payment);
  }

  async reverseManualFeePayment(
    paymentId: string,
    dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentResponseDto> {
    const payment = await this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const lockedPayment = await this.requireLockedPayment(tenantId, paymentId);

      if (lockedPayment.status !== 'cleared') {
        throw new ConflictException(
          `Only cleared manual payments can be reversed; current status is "${lockedPayment.status}"`,
        );
      }

      const reversalTransaction = await this.postReversalTransaction(lockedPayment, dto);
      const allocations = await this.manualFeePaymentsRepository.listAllocations(
        tenantId,
        lockedPayment.id,
      );

      for (const allocation of allocations) {
        if (allocation.allocation_type !== 'invoice' || !allocation.invoice_id) {
          continue;
        }

        await this.invoicesRepository.reverseManualFeeInvoicePayment({
          tenantId,
          invoiceId: allocation.invoice_id,
          amountMinor: allocation.amount_minor,
          nextStatus: 'open',
        });
      }

      return this.manualFeePaymentsRepository.markReversed(tenantId, lockedPayment.id, {
        reversal_ledger_transaction_id: reversalTransaction.transaction_id,
        reversed_at: this.resolveTimestamp(dto.occurred_at),
        notes: dto.notes?.trim() || null,
        metadata: dto.metadata,
      });
    });

    return this.toResponse(payment);
  }

  private async clearLockedPayment(
    payment: ManualFeePaymentEntity,
    dto: UpdateManualFeePaymentStatusDto,
  ): Promise<ManualFeePaymentEntity> {
    if (payment.status === 'cleared') {
      return payment;
    }

    if (!['received', 'deposited'].includes(payment.status)) {
      throw new ConflictException(
        `Manual payment cannot be cleared while status is "${payment.status}"`,
      );
    }

    if (payment.payment_method === 'cheque' && payment.status === 'received') {
      // Some schools clear immediately from received; still allowed when the bank confirms.
    }

    const ledgerTransaction = await this.postReceiptTransaction(payment, dto);
    const allocations = await this.allocateClearedPayment(payment);

    return this.manualFeePaymentsRepository.markCleared(payment.tenant_id, payment.id, {
      ledger_transaction_id: ledgerTransaction.transaction_id,
      cleared_at: this.resolveTimestamp(dto.occurred_at),
      deposit_reference: dto.deposit_reference?.trim() || null,
      notes: dto.notes?.trim() || null,
      metadata: {
        ...(dto.metadata ?? {}),
        allocation_count: allocations.length,
      },
    });
  }

  private async allocateClearedPayment(
    payment: ManualFeePaymentEntity,
  ): Promise<ManualFeePaymentAllocationEntity[]> {
    const invoices = await this.resolveInvoicesForAllocation(payment);
    let remaining = BigInt(payment.amount_minor);
    const allocations: ManualFeePaymentAllocationEntity[] = [];

    for (const invoice of invoices) {
      if (remaining <= 0n) {
        break;
      }

      const total = BigInt(invoice.total_amount_minor);
      const paid = BigInt(invoice.amount_paid_minor);
      const balance = total - paid;

      if (balance <= 0n) {
        continue;
      }

      const applied = remaining < balance ? remaining : balance;
      const nextPaid = paid + applied;
      const nextStatus = nextPaid >= total ? 'paid' : 'pending_payment';

      await this.invoicesRepository.applyManualFeeInvoicePayment({
        tenantId: payment.tenant_id,
        invoiceId: invoice.id,
        amountMinor: applied.toString(),
        nextAmountPaidMinor: nextPaid.toString(),
        nextStatus,
      });
      const allocation = await this.manualFeePaymentsRepository.createAllocation({
        tenant_id: payment.tenant_id,
        manual_payment_id: payment.id,
        invoice_id: invoice.id,
        student_id: payment.student_id ?? this.readStudentId(invoice),
        allocation_type: 'invoice',
        amount_minor: applied.toString(),
        metadata: {
          receipt_number: payment.receipt_number,
          invoice_status: nextStatus,
        },
      });

      allocations.push({
        id: allocation.id,
        tenant_id: payment.tenant_id,
        manual_payment_id: payment.id,
        invoice_id: invoice.id,
        student_id: payment.student_id ?? this.readStudentId(invoice),
        allocation_type: 'invoice',
        amount_minor: applied.toString(),
        metadata: {},
        created_at: new Date(),
      });
      remaining -= applied;
    }

    if (remaining > 0n) {
      const allocation = await this.manualFeePaymentsRepository.createAllocation({
        tenant_id: payment.tenant_id,
        manual_payment_id: payment.id,
        invoice_id: null,
        student_id: payment.student_id,
        allocation_type: 'credit',
        amount_minor: remaining.toString(),
        metadata: {
          receipt_number: payment.receipt_number,
          reason: 'manual_payment_overage',
        },
      });

      allocations.push({
        id: allocation.id,
        tenant_id: payment.tenant_id,
        manual_payment_id: payment.id,
        invoice_id: null,
        student_id: payment.student_id,
        allocation_type: 'credit',
        amount_minor: remaining.toString(),
        metadata: {},
        created_at: new Date(),
      });
    }

    return allocations;
  }

  private async resolveInvoicesForAllocation(
    payment: ManualFeePaymentEntity,
  ): Promise<StudentFeeInvoiceForAllocation[]> {
    if (payment.invoice_id) {
      const invoice = await this.invoicesRepository.lockManualFeeInvoiceForAllocation(
        payment.tenant_id,
        payment.invoice_id,
      );

      if (!invoice) {
        throw new NotFoundException(`Invoice "${payment.invoice_id}" was not found`);
      }

      if (payment.student_id && this.readStudentId(invoice) !== payment.student_id) {
        throw new BadRequestException('Manual payment student does not match invoice student');
      }

      return [invoice];
    }

    if (!payment.student_id) {
      throw new BadRequestException('Manual fee allocation requires a student or invoice');
    }

    return this.invoicesRepository.findStudentFeeInvoicesForAllocation({
      tenantId: payment.tenant_id,
      studentId: payment.student_id,
      explicitInvoiceId: null,
    });
  }

  private async postReceiptTransaction(
    payment: ManualFeePaymentEntity,
    dto: UpdateManualFeePaymentStatusDto,
  ) {
    const assetAccount = await this.requireAccount(payment.tenant_id, payment.asset_account_code);
    const feeControlAccount = await this.requireAccount(
      payment.tenant_id,
      payment.fee_control_account_code,
    );

    return this.transactionService.postTransaction({
      idempotency_key: `manual-fee-payment:${payment.id}:clear`,
      reference: `MANUAL-${payment.receipt_number}`,
      description: `Manual ${payment.payment_method.replace('_', ' ')} fee receipt ${payment.receipt_number}`,
      effective_at: this.resolveTimestamp(dto.occurred_at ?? payment.received_at.toISOString()),
      metadata: {
        source: 'manual_fee_payment',
        manual_payment_id: payment.id,
        receipt_number: payment.receipt_number,
        payment_method: payment.payment_method,
        student_id: payment.student_id,
        invoice_id: payment.invoice_id,
      },
      entries: [
        {
          account_id: assetAccount.id,
          direction: 'debit',
          amount_minor: payment.amount_minor,
          currency_code: payment.currency_code,
          description: `Manual receipt ${payment.receipt_number}`,
          metadata: {
            payment_method: payment.payment_method,
            deposit_reference: dto.deposit_reference ?? payment.deposit_reference,
          },
        },
        {
          account_id: feeControlAccount.id,
          direction: 'credit',
          amount_minor: payment.amount_minor,
          currency_code: payment.currency_code,
          description: `Fee balance settled by ${payment.receipt_number}`,
          metadata: {
            student_id: payment.student_id,
            invoice_id: payment.invoice_id,
          },
        },
      ],
    });
  }

  private async postReversalTransaction(
    payment: ManualFeePaymentEntity,
    dto: UpdateManualFeePaymentStatusDto,
  ) {
    const assetAccount = await this.requireAccount(payment.tenant_id, payment.asset_account_code);
    const feeControlAccount = await this.requireAccount(
      payment.tenant_id,
      payment.fee_control_account_code,
    );

    return this.transactionService.postTransaction({
      idempotency_key: `manual-fee-payment:${payment.id}:reverse`,
      reference: `REV-MANUAL-${payment.receipt_number}`,
      description: `Reversal for manual fee receipt ${payment.receipt_number}`,
      effective_at: this.resolveTimestamp(dto.occurred_at),
      metadata: {
        source: 'manual_fee_payment_reversal',
        manual_payment_id: payment.id,
        original_ledger_transaction_id: payment.ledger_transaction_id,
        receipt_number: payment.receipt_number,
        reason: dto.notes ?? null,
      },
      entries: [
        {
          account_id: feeControlAccount.id,
          direction: 'debit',
          amount_minor: payment.amount_minor,
          currency_code: payment.currency_code,
          description: `Reverse fee settlement ${payment.receipt_number}`,
          metadata: {
            manual_payment_id: payment.id,
          },
        },
        {
          account_id: assetAccount.id,
          direction: 'credit',
          amount_minor: payment.amount_minor,
          currency_code: payment.currency_code,
          description: `Reverse received funds ${payment.receipt_number}`,
          metadata: {
            manual_payment_id: payment.id,
          },
        },
      ],
    });
  }

  private async requireAccount(tenantId: string, accountCode: string) {
    const account = await this.accountsRepository.findByCode(tenantId, accountCode);

    if (!account) {
      throw new NotFoundException(
        `Finance account "${accountCode}" is required before manual payments can be posted`,
      );
    }

    return account;
  }

  private async requireLockedPayment(
    tenantId: string,
    paymentId: string,
  ): Promise<ManualFeePaymentEntity> {
    const payment = await this.manualFeePaymentsRepository.lockById(tenantId, paymentId);

    if (!payment) {
      throw new NotFoundException(`Manual fee payment "${paymentId}" was not found`);
    }

    return payment;
  }

  private assertMethodRequirements(dto: CreateManualFeePaymentDto): void {
    if (dto.payment_method === 'cheque') {
      if (!dto.cheque_number?.trim()) {
        throw new BadRequestException('Cheque number is required for cheque payments');
      }

      if (!dto.drawer_bank?.trim()) {
        throw new BadRequestException('Drawer bank is required for cheque payments');
      }
    }
  }

  private assertHasAllocationTarget(studentId: string | null, invoiceId: string | null): void {
    if (!studentId && !invoiceId) {
      throw new BadRequestException('Manual fee payment requires a student or invoice target');
    }
  }

  private resolveAssetAccountCode(
    paymentMethod: ManualFeePaymentMethod,
    inputAccountCode?: string,
  ): string {
    return inputAccountCode?.trim() || DEFAULT_ASSET_ACCOUNT_BY_METHOD[paymentMethod];
  }

  private readStudentId(invoice: StudentFeeInvoiceForAllocation): string | null {
    const value = invoice.metadata?.student_id;

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private normalizeMinorAmount(value: string): string {
    const normalizedValue = value.trim();

    if (!/^[1-9][0-9]*$/.test(normalizedValue)) {
      throw new BadRequestException('Manual fee amount must be a positive integer in minor units');
    }

    return normalizedValue;
  }

  private resolveTimestamp(value?: string): string {
    if (!value) {
      return new Date().toISOString();
    }

    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      throw new BadRequestException(`Invalid timestamp "${value}"`);
    }

    return parsedValue.toISOString();
  }

  private generateReceiptNumber(): string {
    return `RCT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for manual fee payments');
    }

    return tenantId;
  }

  private toResponse(payment: ManualFeePaymentEntity): ManualFeePaymentResponseDto {
    return Object.assign(new ManualFeePaymentResponseDto(), {
      id: payment.id,
      tenant_id: payment.tenant_id,
      receipt_number: payment.receipt_number,
      payment_method: payment.payment_method,
      status: payment.status,
      student_id: payment.student_id,
      invoice_id: payment.invoice_id,
      amount_minor: payment.amount_minor,
      currency_code: payment.currency_code,
      payer_name: payment.payer_name,
      received_at: payment.received_at.toISOString(),
      deposited_at: payment.deposited_at?.toISOString() ?? null,
      cleared_at: payment.cleared_at?.toISOString() ?? null,
      bounced_at: payment.bounced_at?.toISOString() ?? null,
      reversed_at: payment.reversed_at?.toISOString() ?? null,
      cheque_number: payment.cheque_number,
      drawer_bank: payment.drawer_bank,
      deposit_reference: payment.deposit_reference,
      external_reference: payment.external_reference,
      asset_account_code: payment.asset_account_code,
      fee_control_account_code: payment.fee_control_account_code,
      ledger_transaction_id: payment.ledger_transaction_id,
      reversal_ledger_transaction_id: payment.reversal_ledger_transaction_id,
      notes: payment.notes,
      metadata: payment.metadata,
      created_by_user_id: payment.created_by_user_id,
      created_at: payment.created_at.toISOString(),
      updated_at: payment.updated_at.toISOString(),
    });
  }
}
