import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';

import {
  AUTH_ANONYMOUS_USER_ID,
  AUTH_GUEST_ROLE,
} from '../../../auth/auth.constants';
import { RequestContextService } from '../../../common/request-context/request-context.service';
import { DatabaseService } from '../../../database/database.service';
import { BillingService } from '../../billing/billing.service';
import { EventPublisherService } from '../../events/event-publisher.service';
import { AccountsRepository } from '../../finance/repositories/accounts.repository';
import { TransactionService } from '../../finance/transaction.service';
import { SloMetricsService } from '../../observability/slo-metrics.service';
import { FraudDetectionService } from '../../security/fraud-detection.service';
import { CallbackLogEntity } from '../entities/callback-log.entity';
import { PaymentIntentEntity } from '../entities/payment-intent.entity';
import {
  MPESA_DEFAULT_CURRENCY_CODE,
  MPESA_LEDGER_IDEMPOTENCY_PREFIX,
} from '../payments.constants';
import { ParsedMpesaCallback, ProcessMpesaCallbackJobPayload } from '../payments.types';
import {
  ProcessPaymentJobData,
  ProcessPaymentJobResult,
} from '../queue/payments-queue.types';
import { CallbackLogsRepository } from '../repositories/callback-logs.repository';
import { MpesaTransactionsRepository } from '../repositories/mpesa-transactions.repository';
import { PaymentIntentsRepository } from '../repositories/payment-intents.repository';
import { MpesaService } from './mpesa.service';

interface PaymentProcessingJobInput {
  tenant_id: string;
  checkout_request_id?: string | null;
  callback_log_id?: string | null;
  request_id: string;
  trace_id?: string;
  parent_span_id?: string | null;
  user_id?: string;
  role?: string | null;
  session_id?: string | null;
  enqueued_at?: string;
}

@Injectable()
export class MpesaCallbackProcessorService {
  private readonly logger = new Logger(MpesaCallbackProcessorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly mpesaService: MpesaService,
    private readonly callbackLogsRepository: CallbackLogsRepository,
    private readonly paymentIntentsRepository: PaymentIntentsRepository,
    private readonly mpesaTransactionsRepository: MpesaTransactionsRepository,
    private readonly eventPublisher: EventPublisherService,
    private readonly accountsRepository: AccountsRepository,
    private readonly transactionService: TransactionService,
    private readonly billingService: BillingService,
    private readonly fraudDetectionService: FraudDetectionService,
    @Optional() private readonly sloMetrics?: SloMetricsService,
  ) {}

  async process(jobPayload: ProcessMpesaCallbackJobPayload): Promise<void> {
    await this.processPaymentJobInternal(
      {
        tenant_id: jobPayload.tenant_id,
        callback_log_id: jobPayload.callback_log_id,
        request_id: jobPayload.request_id,
        trace_id: jobPayload.trace_id,
        parent_span_id: jobPayload.parent_span_id,
        user_id: jobPayload.user_id,
        role: jobPayload.role,
        session_id: jobPayload.session_id,
        enqueued_at: jobPayload.enqueued_at,
      },
      String(jobPayload.callback_log_id),
    );
  }

  async processPaymentJob(
    jobPayload: ProcessPaymentJobData,
    jobId: string,
  ): Promise<ProcessPaymentJobResult> {
    return this.processPaymentJobInternal(jobPayload, jobId);
  }

  private async processPaymentJobInternal(
    jobPayload: PaymentProcessingJobInput,
    jobId: string,
  ): Promise<ProcessPaymentJobResult> {
    const startedAt = performance.now();

    return this.requestContext.run(
      {
        request_id: jobPayload.request_id,
        trace_id: jobPayload.trace_id,
        parent_span_id: jobPayload.parent_span_id,
        tenant_id: jobPayload.tenant_id,
        user_id: jobPayload.user_id ?? AUTH_ANONYMOUS_USER_ID,
        role: jobPayload.role ?? AUTH_GUEST_ROLE,
        session_id: jobPayload.session_id ?? null,
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: null,
        user_agent: 'system:mpesa-callback-processor',
        method: 'WORKER',
        path: `/internal/payments/mpesa/${jobPayload.checkout_request_id ?? jobPayload.callback_log_id ?? jobId}`,
        started_at: new Date().toISOString(),
      },
      async () => {
        let resolvedCheckoutRequestId = jobPayload.checkout_request_id ?? null;
        let callbackLogId = jobPayload.callback_log_id ?? null;

        try {
          const { callbackLog, callback } = await this.resolveCallbackLogForProcessing(
            jobPayload.tenant_id,
            jobPayload,
          );
          resolvedCheckoutRequestId = callback.checkout_request_id;
          callbackLogId = callbackLog.id;

          await this.callbackLogsRepository.markProcessing(jobPayload.tenant_id, callbackLog.id);

          const result = await this.databaseService.withRequestTransaction(async () =>
            this.processLockedPayment(jobPayload.tenant_id, callbackLog, callback, startedAt, jobId),
          );

          await this.callbackLogsRepository.markProcessedByCheckoutRequestId(
            jobPayload.tenant_id,
            callback.checkout_request_id,
          );

          return result;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown MPESA callback processing error';

          this.logger.error(message);
          this.sloMetrics?.recordMpesaCallbackProcessing({
            outcome: 'failure',
            duration_ms: performance.now() - startedAt,
            tenant_id: jobPayload.tenant_id,
            payment_intent_id: null,
            checkout_request_id: null,
            callback_delay_ms: null,
            payment_status: null,
            error_message: message,
          });

          if (resolvedCheckoutRequestId) {
            await this.callbackLogsRepository.markFailedByCheckoutRequestId(
              jobPayload.tenant_id,
              resolvedCheckoutRequestId,
              message,
            );
          } else if (callbackLogId) {
            await this.callbackLogsRepository.markFailed(
              jobPayload.tenant_id,
              callbackLogId,
              message,
            );
          }

          throw error;
        }
      },
    );
  }

  private async getRequiredCallbackLog(
    tenantId: string,
    callbackLogId: string,
  ): Promise<CallbackLogEntity> {
    const callbackLog = await this.callbackLogsRepository.findById(tenantId, callbackLogId);

    if (!callbackLog) {
      throw new NotFoundException(`MPESA callback log "${callbackLogId}" was not found`);
    }

    return callbackLog;
  }

  private async getLatestCallbackLogByCheckoutRequestId(
    tenantId: string,
    checkoutRequestId: string,
  ): Promise<CallbackLogEntity> {
    const callbackLog = await this.callbackLogsRepository.findLatestByCheckoutRequestId(
      tenantId,
      checkoutRequestId,
    );

    if (!callbackLog) {
      throw new NotFoundException(
        `MPESA callback log for checkout request "${checkoutRequestId}" was not found`,
      );
    }

    return callbackLog;
  }

  private async resolveCallbackLogForProcessing(
    tenantId: string,
    jobPayload: PaymentProcessingJobInput,
  ): Promise<{ callbackLog: CallbackLogEntity; callback: ParsedMpesaCallback }> {
    const callbackLog = jobPayload.callback_log_id
      ? await this.getRequiredCallbackLog(tenantId, jobPayload.callback_log_id)
      : await this.getLatestCallbackLogByCheckoutRequestId(
          tenantId,
          this.requireCheckoutRequestId(jobPayload.checkout_request_id),
        );
    const callback = this.readCallbackPayload(callbackLog);

    if (
      jobPayload.checkout_request_id &&
      callback.checkout_request_id !== jobPayload.checkout_request_id
    ) {
      throw new BadRequestException(
        `Callback log "${callbackLog.id}" does not match checkout request "${jobPayload.checkout_request_id}"`,
      );
    }

    return { callbackLog, callback };
  }

  private readCallbackPayload(callbackLog: CallbackLogEntity): ParsedMpesaCallback {
    if (callbackLog.raw_payload) {
      return this.mpesaService.parseCallbackPayload(callbackLog.raw_payload);
    }

    try {
      return this.mpesaService.parseCallbackPayload(JSON.parse(callbackLog.raw_body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid callback payload';
      throw new BadRequestException(message);
    }
  }

  private async lockPaymentIntent(
    tenantId: string,
    callback: ParsedMpesaCallback,
  ): Promise<PaymentIntentEntity> {
    const paymentIntent = await this.paymentIntentsRepository.lockByCheckoutOrMerchantRequestId(
      tenantId,
      callback.checkout_request_id,
      callback.merchant_request_id,
    );

    if (!paymentIntent) {
      throw new NotFoundException(
        `Payment intent for checkout request "${callback.checkout_request_id}" was not found`,
      );
    }

    return paymentIntent;
  }

  private async assertCallbackMatchesIntent(
    paymentIntent: PaymentIntentEntity,
    callback: ParsedMpesaCallback,
  ): Promise<void> {
    if (callback.amount_minor && paymentIntent.amount_minor !== callback.amount_minor) {
      await this.fraudDetectionService.recordCallbackMismatch({
        tenant_id: paymentIntent.tenant_id,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        failure_type: 'amount_mismatch',
        expected_amount_minor: paymentIntent.amount_minor,
        received_amount_minor: callback.amount_minor,
        expected_phone_number: paymentIntent.phone_number,
        received_phone_number: callback.phone_number,
      });
      throw new BadRequestException(
        `M-PESA callback amount mismatch for checkout request "${callback.checkout_request_id}"`,
      );
    }

    if (callback.phone_number && paymentIntent.phone_number !== callback.phone_number) {
      await this.fraudDetectionService.recordCallbackMismatch({
        tenant_id: paymentIntent.tenant_id,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        failure_type: 'phone_mismatch',
        expected_amount_minor: paymentIntent.amount_minor,
        received_amount_minor: callback.amount_minor,
        expected_phone_number: paymentIntent.phone_number,
        received_phone_number: callback.phone_number,
      });
      throw new BadRequestException(
        `M-PESA callback phone number mismatch for checkout request "${callback.checkout_request_id}"`,
      );
    }
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key) ?? '';

    if (value.trim().length === 0) {
      throw new BadRequestException(`Missing MPESA configuration value "${key}"`);
    }

    return value;
  }

  private requireCheckoutRequestId(checkoutRequestId?: string | null): string {
    const normalizedValue = checkoutRequestId?.trim() ?? '';

    if (normalizedValue.length === 0) {
      throw new BadRequestException('checkout_request_id is required for payment processing');
    }

    return normalizedValue;
  }

  private isTerminalPaymentIntent(status: PaymentIntentEntity['status']): boolean {
    return (
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled' ||
      status === 'expired'
    );
  }

  private isNonCompletablePaymentIntent(status: PaymentIntentEntity['status']): boolean {
    return status === 'failed' || status === 'cancelled' || status === 'expired';
  }

  private computeCallbackDelayMs(
    paymentIntent: PaymentIntentEntity,
    callbackLog: CallbackLogEntity,
  ): number | null {
    if (!paymentIntent.stk_requested_at) {
      return null;
    }

    const callbackTimestamp = callbackLog.event_timestamp ?? callbackLog.created_at;

    if (!(callbackTimestamp instanceof Date) || Number.isNaN(callbackTimestamp.getTime())) {
      return null;
    }

    return callbackTimestamp.getTime() - paymentIntent.stk_requested_at.getTime();
  }

  private async publishPaymentCompletedEvent(
    paymentIntent: PaymentIntentEntity,
    callback: ParsedMpesaCallback,
    mpesaTransactionId: string,
    ledgerTransactionId: string,
  ): Promise<void> {
    await this.eventPublisher.publishPaymentCompleted({
      tenant_id: paymentIntent.tenant_id,
      payment_intent_id: paymentIntent.id,
      mpesa_transaction_id: mpesaTransactionId,
      checkout_request_id: callback.checkout_request_id,
      merchant_request_id: callback.merchant_request_id,
      ledger_transaction_id: ledgerTransactionId,
      amount_minor: callback.amount_minor ?? paymentIntent.amount_minor,
      currency_code: paymentIntent.currency_code,
      account_reference: paymentIntent.account_reference,
      external_reference: paymentIntent.external_reference,
      mpesa_receipt_number: callback.mpesa_receipt_number,
      phone_number: callback.phone_number,
      completed_at: new Date().toISOString(),
    });
  }

  private async processLockedPayment(
    tenantId: string,
    callbackLog: CallbackLogEntity,
    callback: ParsedMpesaCallback,
    startedAt: number,
    jobId: string,
  ): Promise<ProcessPaymentJobResult> {
    const paymentIntent = await this.lockPaymentIntent(tenantId, callback);
    const callbackDelayMs = this.computeCallbackDelayMs(paymentIntent, callbackLog);

    if (!this.isTerminalPaymentIntent(paymentIntent.status)) {
      await this.paymentIntentsRepository.markCallbackReceived(tenantId, paymentIntent.id);
    }

    const mpesaTransaction = await this.mpesaTransactionsRepository.upsertFromCallback({
      tenant_id: tenantId,
      payment_intent_id: paymentIntent.id,
      callback_log_id: callbackLog.id,
      callback,
      raw_payload: callbackLog.raw_payload,
    });

    if (callback.status === 'failed') {
      await this.fraudDetectionService.recordCallbackFailure({
        tenant_id: tenantId,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        reason: callback.result_desc,
        phone_number: callback.phone_number,
      });
      await this.paymentIntentsRepository.markFailed(
        tenantId,
        paymentIntent.id,
        callback.result_desc,
      );
      this.sloMetrics?.recordMpesaCallbackProcessing({
        outcome: 'success',
        duration_ms: performance.now() - startedAt,
        tenant_id: tenantId,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        callback_delay_ms: callbackDelayMs,
        payment_status: 'failed',
      });
      return this.buildJobResult(jobId, callback.checkout_request_id, callbackLog.id, {
        payment_intent_id: paymentIntent.id,
        mpesa_transaction_id: mpesaTransaction.id,
        ledger_transaction_id: null,
        status: 'failed',
        failure_reason: callback.result_desc,
      });
    }

    if (!callback.amount_minor) {
      throw new BadRequestException(
        `Successful M-PESA callback "${callback.checkout_request_id}" is missing amount metadata`,
      );
    }

    await this.assertCallbackMatchesIntent(paymentIntent, callback);

    if (mpesaTransaction.ledger_transaction_id) {
      if (paymentIntent.status !== 'completed') {
        await this.paymentIntentsRepository.markCompleted(
          tenantId,
          paymentIntent.id,
          mpesaTransaction.ledger_transaction_id,
        );
      }
      this.sloMetrics?.recordMpesaCallbackProcessing({
        outcome: 'ignored',
        duration_ms: performance.now() - startedAt,
        tenant_id: tenantId,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        callback_delay_ms: callbackDelayMs,
        payment_status: 'completed',
      });
      return this.buildJobResult(jobId, callback.checkout_request_id, callbackLog.id, {
        payment_intent_id: paymentIntent.id,
        mpesa_transaction_id: mpesaTransaction.id,
        ledger_transaction_id: mpesaTransaction.ledger_transaction_id,
        status: 'duplicate',
      });
    }

    if (paymentIntent.ledger_transaction_id) {
      await this.mpesaTransactionsRepository.attachLedgerTransaction(
        tenantId,
        callback.checkout_request_id,
        paymentIntent.ledger_transaction_id,
      );
      this.sloMetrics?.recordMpesaCallbackProcessing({
        outcome: 'ignored',
        duration_ms: performance.now() - startedAt,
        tenant_id: tenantId,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        callback_delay_ms: callbackDelayMs,
        payment_status: paymentIntent.status,
      });
      return this.buildJobResult(jobId, callback.checkout_request_id, callbackLog.id, {
        payment_intent_id: paymentIntent.id,
        mpesa_transaction_id: mpesaTransaction.id,
        ledger_transaction_id: paymentIntent.ledger_transaction_id,
        status: 'duplicate',
      });
    }

    if (this.isNonCompletablePaymentIntent(paymentIntent.status)) {
      this.sloMetrics?.recordMpesaCallbackProcessing({
        outcome: 'ignored',
        duration_ms: performance.now() - startedAt,
        tenant_id: tenantId,
        payment_intent_id: paymentIntent.id,
        checkout_request_id: callback.checkout_request_id,
        callback_delay_ms: callbackDelayMs,
        payment_status: paymentIntent.status,
      });
      return this.buildJobResult(jobId, callback.checkout_request_id, callbackLog.id, {
        payment_intent_id: paymentIntent.id,
        mpesa_transaction_id: mpesaTransaction.id,
        ledger_transaction_id: null,
        status: 'failed',
        failure_reason:
          paymentIntent.failure_reason ??
          `Payment intent is already ${paymentIntent.status} for checkout request "${callback.checkout_request_id}"`,
      });
    }

    await this.paymentIntentsRepository.markProcessing(tenantId, paymentIntent.id);

    const debitAccount = await this.accountsRepository.findByCode(
      tenantId,
      this.requireConfig('mpesa.ledgerDebitAccountCode'),
    );
    const creditAccount = await this.accountsRepository.findByCode(
      tenantId,
      this.requireConfig('mpesa.ledgerCreditAccountCode'),
    );

    if (!debitAccount || !creditAccount) {
      throw new NotFoundException(
        'Configured MPESA ledger accounts were not found in this tenant',
      );
    }

    const postedTransaction = await this.transactionService.postTransaction({
      idempotency_key: `${MPESA_LEDGER_IDEMPOTENCY_PREFIX}:${callback.checkout_request_id}`,
      reference: `MPESA-${callback.checkout_request_id}`,
      description: `M-PESA payment ${paymentIntent.external_reference ?? paymentIntent.account_reference}`,
      metadata: {
        source: 'mpesa',
        payment_intent_id: paymentIntent.id,
        student_id: paymentIntent.student_id,
        checkout_request_id: callback.checkout_request_id,
        merchant_request_id: callback.merchant_request_id,
        mpesa_receipt_number: callback.mpesa_receipt_number,
        external_reference: paymentIntent.external_reference,
      },
      entries: [
        {
          account_id: debitAccount.id,
          direction: 'debit',
          amount_minor: callback.amount_minor,
          currency_code: MPESA_DEFAULT_CURRENCY_CODE,
          description: `M-PESA funds received (${callback.checkout_request_id})`,
          metadata: {
            mpesa_receipt_number: callback.mpesa_receipt_number,
          },
        },
        {
          account_id: creditAccount.id,
          direction: 'credit',
          amount_minor: callback.amount_minor,
          currency_code: MPESA_DEFAULT_CURRENCY_CODE,
          description: `Customer deposit (${paymentIntent.account_reference})`,
          metadata: {
            payment_intent_id: paymentIntent.id,
            student_id: paymentIntent.student_id,
            account_reference: paymentIntent.account_reference,
          },
        },
      ],
    });

    await this.mpesaTransactionsRepository.attachLedgerTransaction(
      tenantId,
      callback.checkout_request_id,
      postedTransaction.transaction_id,
    );
    await this.paymentIntentsRepository.markCompleted(
      tenantId,
      paymentIntent.id,
      postedTransaction.transaction_id,
    );
    await this.billingService.handlePaymentIntentCompleted(
      tenantId,
      paymentIntent.id,
      callback.amount_minor,
    );
    await this.publishPaymentCompletedEvent(
      paymentIntent,
      callback,
      mpesaTransaction.id,
      postedTransaction.transaction_id,
    );
    this.sloMetrics?.recordMpesaCallbackProcessing({
      outcome: 'success',
      duration_ms: performance.now() - startedAt,
      tenant_id: tenantId,
      payment_intent_id: paymentIntent.id,
      checkout_request_id: callback.checkout_request_id,
      callback_delay_ms: callbackDelayMs,
      payment_status: 'completed',
    });

    return this.buildJobResult(jobId, callback.checkout_request_id, callbackLog.id, {
      payment_intent_id: paymentIntent.id,
      mpesa_transaction_id: mpesaTransaction.id,
      ledger_transaction_id: postedTransaction.transaction_id,
      status: 'completed',
    });
  }

  private buildJobResult(
    jobId: string,
    checkoutRequestId: string,
    callbackLogId: string,
    input: Omit<ProcessPaymentJobResult, 'job_id' | 'tenant_id' | 'checkout_request_id' | 'callback_log_id' | 'processed_at'> & {
      payment_intent_id: string | null;
      mpesa_transaction_id: string | null;
      ledger_transaction_id: string | null;
      status: 'completed' | 'failed' | 'duplicate';
      failure_reason?: string | null;
    },
  ): ProcessPaymentJobResult {
    return {
      job_id: jobId,
      tenant_id: this.requestContext.requireStore().tenant_id!,
      checkout_request_id: checkoutRequestId,
      callback_log_id: callbackLogId,
      payment_intent_id: input.payment_intent_id,
      mpesa_transaction_id: input.mpesa_transaction_id,
      ledger_transaction_id: input.ledger_transaction_id,
      status: input.status,
      processed_at: new Date().toISOString(),
      failure_reason: input.failure_reason ?? null,
    };
  }
}
