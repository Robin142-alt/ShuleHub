import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { BillingAccessService } from './billing-access.service';
import { BILLING_MPESA_FEATURE } from './billing.constants';
import { CreateBillingPaymentIntentDto } from './dto/create-billing-payment-intent.dto';
import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { InvoicesRepository } from './repositories/invoices.repository';
import { MpesaService } from '../payments/services/mpesa.service';

@Injectable()
export class BillingMpesaService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly billingAccessService: BillingAccessService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly mpesaService: MpesaService,
  ) {}

  async createInvoicePaymentIntent(
    invoiceId: string,
    dto: CreateBillingPaymentIntentDto,
  ): Promise<InvoiceResponseDto> {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const access = this.requestContext.requireStore().billing
        ?? (await this.billingAccessService.resolveForTenant(tenantId));

      if (!this.billingAccessService.hasFeature(access, BILLING_MPESA_FEATURE)) {
        throw new ConflictException('The current subscription does not include MPESA billing');
      }

      const invoice = await this.invoicesRepository.lockById(tenantId, invoiceId);

      if (!invoice) {
        throw new NotFoundException(`Invoice "${invoiceId}" was not found`);
      }

      if (!['open', 'pending_payment'].includes(invoice.status)) {
        throw new ConflictException(`Invoice "${invoice.invoice_number}" is not payable in status "${invoice.status}"`);
      }

      const phoneNumber = dto.phone_number?.trim() || invoice.billing_phone_number;

      if (!phoneNumber) {
        throw new ConflictException('A billing phone number is required to initiate MPESA payment');
      }

      const paymentIntent = await this.mpesaService.createPaymentIntent({
        idempotency_key: dto.idempotency_key.trim(),
        amount_minor: invoice.total_amount_minor,
        phone_number: phoneNumber,
        account_reference: invoice.invoice_number,
        transaction_desc: `Subscription invoice ${invoice.invoice_number}`,
        external_reference: invoice.id,
        metadata: {
          billing_type: 'subscription_invoice',
          invoice_id: invoice.id,
          subscription_id: invoice.subscription_id,
        },
      });
      const updatedInvoice = await this.invoicesRepository.markPaymentInitiated(
        tenantId,
        invoice.id,
        paymentIntent.payment_intent_id,
        phoneNumber,
      );

      return Object.assign(new InvoiceResponseDto(), {
        id: updatedInvoice.id,
        tenant_id: updatedInvoice.tenant_id,
        subscription_id: updatedInvoice.subscription_id,
        invoice_number: updatedInvoice.invoice_number,
        status: updatedInvoice.status,
        currency_code: updatedInvoice.currency_code,
        description: updatedInvoice.description,
        subtotal_amount_minor: updatedInvoice.subtotal_amount_minor,
        tax_amount_minor: updatedInvoice.tax_amount_minor,
        total_amount_minor: updatedInvoice.total_amount_minor,
        amount_paid_minor: updatedInvoice.amount_paid_minor,
        billing_phone_number: updatedInvoice.billing_phone_number,
        payment_intent_id: updatedInvoice.payment_intent_id,
        issued_at: updatedInvoice.issued_at.toISOString(),
        due_at: updatedInvoice.due_at.toISOString(),
        paid_at: updatedInvoice.paid_at?.toISOString() ?? null,
        voided_at: updatedInvoice.voided_at?.toISOString() ?? null,
        metadata: updatedInvoice.metadata,
        created_at: updatedInvoice.created_at.toISOString(),
        updated_at: updatedInvoice.updated_at.toISOString(),
      });
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.requireStore().tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for billing MPESA flows');
    }

    return tenantId;
  }
}
