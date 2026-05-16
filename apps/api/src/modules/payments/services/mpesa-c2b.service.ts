import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { AUTH_ANONYMOUS_USER_ID } from '../../../auth/auth.constants';
import { RequestContextService } from '../../../common/request-context/request-context.service';
import { DatabaseService } from '../../../database/database.service';
import { ManualFeePaymentService } from '../../billing/manual-fee-payment.service';
import {
  InvoicesRepository,
  StudentFeeInvoiceForAllocation,
} from '../../billing/repositories/invoices.repository';
import { ResolvedTenantMpesaConfig } from '../../tenant-finance/tenant-finance.types';
import { TenantFinanceConfigService } from '../../tenant-finance/tenant-finance-config.service';
import { ReconcileMpesaC2bPaymentDto } from '../dto/reconcile-mpesa-c2b-payment.dto';
import { MpesaC2bPaymentEntity } from '../entities/mpesa-c2b-payment.entity';
import {
  MpesaC2bConfirmationResult,
  MpesaC2bGatewayResponse,
  MpesaC2bPayload,
  ParsedMpesaC2bPayment,
} from '../payments.types';
import { MpesaC2bPaymentsRepository } from '../repositories/mpesa-c2b-payments.repository';

const DEFAULT_CURRENCY_CODE = 'KES';
const DEFAULT_C2B_ASSET_ACCOUNT_CODE = '1110-MPESA-CLEARING';
const DEFAULT_FEE_CONTROL_ACCOUNT_CODE = '1100-AR-FEES';
const C2B_ACCEPTED_RESPONSE: MpesaC2bGatewayResponse = {
  ResultCode: 0,
  ResultDesc: 'Accepted',
};
const C2B_REJECTED_RESPONSE: MpesaC2bGatewayResponse = {
  ResultCode: 'C2B00011',
  ResultDesc: 'Rejected',
};

@Injectable()
export class MpesaC2bService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly tenantFinanceConfigService: TenantFinanceConfigService,
    private readonly mpesaC2bPaymentsRepository: MpesaC2bPaymentsRepository,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly manualFeePaymentService: ManualFeePaymentService,
  ) {}

  parseC2bPayload(payload: MpesaC2bPayload): ParsedMpesaC2bPayment {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('M-PESA C2B payload must be an object');
    }

    const transactionType = this.requireText(payload.TransactionType, 'TransactionType');
    const transId = this.requireText(payload.TransID, 'TransID');
    const transTime = this.requireText(payload.TransTime, 'TransTime');
    const amountMinor = this.parseAmountMinor(payload.TransAmount);
    const businessShortCode = this.requireText(payload.BusinessShortCode, 'BusinessShortCode');
    const firstName = this.optionalText(payload.FirstName);
    const middleName = this.optionalText(payload.MiddleName);
    const lastName = this.optionalText(payload.LastName);
    const payerName = [firstName, middleName, lastName].filter(Boolean).join(' ') || null;

    return {
      transaction_type: transactionType,
      trans_id: transId,
      transaction_occurred_at: this.parseSafaricomTimestamp(transTime),
      amount_minor: amountMinor,
      business_short_code: businessShortCode,
      bill_ref_number: this.optionalText(payload.BillRefNumber),
      invoice_number: this.optionalText(payload.InvoiceNumber),
      org_account_balance: this.optionalText(payload.OrgAccountBalance),
      third_party_trans_id: this.optionalText(payload.ThirdPartyTransID),
      phone_number: this.optionalText(payload.MSISDN),
      payer_name: payerName,
      metadata: this.extractExtraMetadata(payload),
    };
  }

  async validatePayment(payload: MpesaC2bPayload): Promise<MpesaC2bGatewayResponse> {
    try {
      const parsed = this.parseC2bPayload(payload);
      await this.tenantFinanceConfigService.resolveMpesaConfigByShortcode(
        parsed.business_short_code,
      );

      return C2B_ACCEPTED_RESPONSE;
    } catch {
      return C2B_REJECTED_RESPONSE;
    }
  }

  async processConfirmation(
    payload: MpesaC2bPayload,
  ): Promise<MpesaC2bConfirmationResult> {
    const parsed = this.parseC2bPayload(payload);
    const mpesaConfig = await this.tenantFinanceConfigService.resolveMpesaConfigByShortcode(
      parsed.business_short_code,
    );
    const tenantId = mpesaConfig.tenant_id;

    return this.runInTenantContext(tenantId, parsed.trans_id, () =>
      this.databaseService.withRequestTransaction(async () => {
        const existingPayment =
          await this.mpesaC2bPaymentsRepository.findByTenantAndTransId(
            tenantId,
            parsed.trans_id,
          );

        if (existingPayment) {
          return {
            accepted: true,
            duplicate: true,
            status: existingPayment.status,
            tenant_id: tenantId,
            mpesa_c2b_payment_id: existingPayment.id,
            manual_fee_payment_id: existingPayment.manual_fee_payment_id,
            ledger_transaction_id: existingPayment.ledger_transaction_id,
          };
        }

        const created = await this.mpesaC2bPaymentsRepository.createReceived({
          tenant_id: tenantId,
          mpesa_config_id: mpesaConfig.mpesa_config_id,
          payment_channel_id: mpesaConfig.payment_channel_id,
          trans_id: parsed.trans_id,
          transaction_type: parsed.transaction_type,
          business_short_code: parsed.business_short_code,
          bill_ref_number: parsed.bill_ref_number,
          invoice_number: parsed.invoice_number,
          amount_minor: parsed.amount_minor,
          currency_code: DEFAULT_CURRENCY_CODE,
          phone_number: parsed.phone_number,
          payer_name: parsed.payer_name,
          org_account_balance: parsed.org_account_balance,
          third_party_trans_id: parsed.third_party_trans_id,
          received_at: parsed.transaction_occurred_at,
          raw_payload: payload as Record<string, unknown>,
          metadata: parsed.metadata,
        });

        if (!created.inserted) {
          return {
            accepted: true,
            duplicate: true,
            status: created.payment.status,
            tenant_id: tenantId,
            mpesa_c2b_payment_id: created.payment.id,
            manual_fee_payment_id: created.payment.manual_fee_payment_id,
            ledger_transaction_id: created.payment.ledger_transaction_id,
          };
        }

        const target = await this.resolveAllocationTarget(tenantId, parsed);

        if (!target.invoice_id && !target.student_id) {
          const pendingPayment = await this.mpesaC2bPaymentsRepository.markPendingReview({
            tenant_id: tenantId,
            payment_id: created.payment.id,
            reason: 'no_invoice_or_student_match',
            metadata: {
              bill_ref_number: parsed.bill_ref_number,
              invoice_number: parsed.invoice_number,
            },
          });

          return {
            accepted: true,
            duplicate: false,
            status: pendingPayment.status,
            tenant_id: tenantId,
            mpesa_c2b_payment_id: pendingPayment.id,
            manual_fee_payment_id: null,
            ledger_transaction_id: null,
          };
        }

        const manualPayment = await this.manualFeePaymentService.createManualFeePayment({
          idempotency_key: `mpesa-c2b:${tenantId}:${parsed.trans_id}`,
          payment_method: 'mpesa_c2b',
          amount_minor: parsed.amount_minor,
          student_id: target.student_id ?? undefined,
          invoice_id: target.invoice_id ?? undefined,
          payer_name: parsed.payer_name ?? parsed.phone_number ?? undefined,
          received_at: parsed.transaction_occurred_at,
          deposit_reference: parsed.trans_id,
          external_reference: parsed.trans_id,
          asset_account_code:
            mpesaConfig.ledger_debit_account_code || DEFAULT_C2B_ASSET_ACCOUNT_CODE,
          fee_control_account_code:
            mpesaConfig.ledger_credit_account_code || DEFAULT_FEE_CONTROL_ACCOUNT_CODE,
          notes: `M-PESA Paybill ${parsed.business_short_code} payment ${parsed.trans_id}`,
          metadata: {
            source: 'mpesa_c2b',
            mpesa_c2b_payment_id: created.payment.id,
            business_short_code: parsed.business_short_code,
            bill_ref_number: parsed.bill_ref_number,
            invoice_number: parsed.invoice_number,
            phone_number: parsed.phone_number,
          },
        });

        const matchedPayment = await this.mpesaC2bPaymentsRepository.markMatched({
          tenant_id: tenantId,
          payment_id: created.payment.id,
          matched_invoice_id: target.invoice_id,
          matched_student_id: target.student_id,
          manual_fee_payment_id: manualPayment.id,
          ledger_transaction_id: manualPayment.ledger_transaction_id,
          metadata: {
            matching_strategy: target.matching_strategy,
          },
        });

        return {
          accepted: true,
          duplicate: false,
          status: matchedPayment.status,
          tenant_id: tenantId,
          mpesa_c2b_payment_id: matchedPayment.id,
          manual_fee_payment_id: matchedPayment.manual_fee_payment_id,
          ledger_transaction_id: matchedPayment.ledger_transaction_id,
        };
      }),
    );
  }

  async listC2bPayments(input: {
    status?: 'pending_review' | 'matched' | 'rejected' | null;
  } = {}): Promise<MpesaC2bPaymentEntity[]> {
    return this.mpesaC2bPaymentsRepository.list({
      tenant_id: this.requireTenantId(),
      status: input.status ?? null,
    });
  }

  async reconcilePendingPayment(
    paymentId: string,
    dto: ReconcileMpesaC2bPaymentDto,
  ): Promise<MpesaC2bPaymentEntity> {
    const tenantId = this.requireTenantId();

    return this.databaseService.withRequestTransaction(async () => {
      const payment = await this.mpesaC2bPaymentsRepository.lockById(tenantId, paymentId);

      if (!payment) {
        throw new NotFoundException(`M-PESA C2B payment "${paymentId}" was not found`);
      }

      if (payment.status === 'matched') {
        return payment;
      }

      if (payment.status !== 'pending_review') {
        throw new ConflictException(
          `M-PESA C2B payment cannot be reconciled while status is "${payment.status}"`,
        );
      }

      if (!dto.invoice_id && !dto.student_id) {
        throw new BadRequestException('Reconciliation requires an invoice or student target');
      }

      let invoiceId = dto.invoice_id ?? null;
      let studentId = dto.student_id ?? null;

      if (invoiceId) {
        const invoice = await this.invoicesRepository.lockManualFeeInvoiceForAllocation(
          tenantId,
          invoiceId,
        );

        if (!invoice) {
          throw new NotFoundException(`Invoice "${invoiceId}" was not found or has no balance`);
        }

        const invoiceStudentId = this.readStudentId(invoice);

        if (studentId && invoiceStudentId && studentId !== invoiceStudentId) {
          throw new BadRequestException('Selected student does not match the selected invoice');
        }

        studentId = studentId ?? invoiceStudentId;
      }

      const mpesaConfig = await this.tenantFinanceConfigService.resolveMpesaConfigByShortcode(
        payment.business_short_code,
      );

      if (mpesaConfig.tenant_id !== tenantId) {
        throw new BadRequestException('M-PESA C2B payment shortcode does not belong to this tenant');
      }

      const manualPayment = await this.manualFeePaymentService.createManualFeePayment({
        idempotency_key: `mpesa-c2b:${tenantId}:${payment.trans_id}`,
        payment_method: 'mpesa_c2b',
        amount_minor: payment.amount_minor,
        student_id: studentId ?? undefined,
        invoice_id: invoiceId ?? undefined,
        payer_name: payment.payer_name ?? payment.phone_number ?? undefined,
        received_at: payment.received_at.toISOString(),
        deposit_reference: payment.trans_id,
        external_reference: payment.trans_id,
        asset_account_code:
          mpesaConfig.ledger_debit_account_code || DEFAULT_C2B_ASSET_ACCOUNT_CODE,
        fee_control_account_code:
          mpesaConfig.ledger_credit_account_code || DEFAULT_FEE_CONTROL_ACCOUNT_CODE,
        notes:
          dto.notes?.trim() ||
          `M-PESA Paybill ${payment.business_short_code} payment ${payment.trans_id}`,
        metadata: {
          source: 'mpesa_c2b_manual_reconciliation',
          mpesa_c2b_payment_id: payment.id,
          business_short_code: payment.business_short_code,
          bill_ref_number: payment.bill_ref_number,
          invoice_number: payment.invoice_number,
          phone_number: payment.phone_number,
        },
      });

      return this.mpesaC2bPaymentsRepository.markMatched({
        tenant_id: tenantId,
        payment_id: payment.id,
        matched_invoice_id: invoiceId,
        matched_student_id: studentId,
        manual_fee_payment_id: manualPayment.id,
        ledger_transaction_id: manualPayment.ledger_transaction_id,
        metadata: {
          matching_strategy: 'manual_accountant_review',
        },
      });
    });
  }

  private async resolveAllocationTarget(
    tenantId: string,
    parsed: ParsedMpesaC2bPayment,
  ): Promise<{
    invoice_id: string | null;
    student_id: string | null;
    matching_strategy: string;
  }> {
    const reference =
      parsed.bill_ref_number?.trim() || parsed.invoice_number?.trim() || null;

    if (!reference) {
      return {
        invoice_id: null,
        student_id: null,
        matching_strategy: 'missing_reference',
      };
    }

    const invoice = await this.invoicesRepository.findManualFeeInvoiceTargetByReference(
      tenantId,
      reference,
    );

    if (invoice) {
      return {
        invoice_id: invoice.id,
        student_id: this.readStudentId(invoice),
        matching_strategy: 'invoice_reference',
      };
    }

    const student = await this.findStudentByAdmissionNumber(tenantId, reference);

    if (student) {
      return {
        invoice_id: null,
        student_id: student.id,
        matching_strategy: 'student_admission_number',
      };
    }

    return {
      invoice_id: null,
      student_id: null,
      matching_strategy: 'unmatched_reference',
    };
  }

  private async findStudentByAdmissionNumber(
    tenantId: string,
    reference: string,
  ): Promise<{ id: string } | null> {
    const result = await this.databaseService.query<{ id: string }>(
      `
        SELECT id
        FROM students
        WHERE tenant_id = $1
          AND admission_number = $2
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, reference],
    );

    return result.rows[0] ?? null;
  }

  private runInTenantContext<T>(
    tenantId: string,
    transId: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    const currentContext = this.requestContext.snapshot();

    return this.requestContext.run(
      {
        request_id: currentContext?.request_id ?? `mpesa-c2b:${transId}`,
        tenant_id: tenantId,
        user_id: currentContext?.user_id ?? AUTH_ANONYMOUS_USER_ID,
        role: currentContext?.role ?? 'mpesa',
        session_id: currentContext?.session_id ?? null,
        permissions: currentContext?.permissions ?? [],
        is_authenticated: currentContext?.is_authenticated ?? false,
        client_ip: currentContext?.client_ip ?? null,
        user_agent: currentContext?.user_agent ?? 'safaricom-mpesa-c2b',
        method: currentContext?.method ?? 'POST',
        path: currentContext?.path ?? '/payments/mpesa/c2b/confirmation',
        started_at: currentContext?.started_at ?? new Date().toISOString(),
        trace_id: currentContext?.trace_id,
        parent_span_id: currentContext?.span_id ?? null,
      },
      callback,
    );
  }

  private readStudentId(invoice: StudentFeeInvoiceForAllocation): string | null {
    const value = invoice.metadata?.student_id;

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for M-PESA C2B payments');
    }

    return tenantId;
  }

  private parseSafaricomTimestamp(value: string): string {
    if (!/^\d{14}$/.test(value)) {
      throw new BadRequestException('TransTime must use Safaricom yyyyMMddHHmmss format');
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));
    const timestamp = Date.UTC(year, month - 1, day, hour - 3, minute, second);

    return new Date(timestamp).toISOString();
  }

  private parseAmountMinor(value: unknown): string {
    const normalized = this.requireText(value, 'TransAmount').replace(/,/g, '');

    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(normalized)) {
      throw new BadRequestException('TransAmount must be a positive monetary amount');
    }

    const [major, fractional = ''] = normalized.split('.');
    const amountMinor =
      BigInt(major) * 100n + BigInt((fractional + '00').slice(0, 2));

    if (amountMinor <= 0n) {
      throw new BadRequestException('TransAmount must be greater than zero');
    }

    return amountMinor.toString();
  }

  private requireText(value: unknown, field: string): string {
    const normalized = this.optionalText(value);

    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private optionalText(value: unknown): string | null {
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();

      return normalized.length > 0 ? normalized : null;
    }

    return null;
  }

  private extractExtraMetadata(payload: MpesaC2bPayload): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    const coreKeys = new Set([
      'TransactionType',
      'TransID',
      'TransTime',
      'TransAmount',
      'BusinessShortCode',
      'BillRefNumber',
      'InvoiceNumber',
      'OrgAccountBalance',
      'ThirdPartyTransID',
      'MSISDN',
      'FirstName',
      'MiddleName',
      'LastName',
    ]);

    for (const [key, value] of Object.entries(payload)) {
      if (!coreKeys.has(key)) {
        metadata[key] = value;
      }
    }

    return metadata;
  }
}
