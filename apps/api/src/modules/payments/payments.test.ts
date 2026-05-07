import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { AccountEntity } from '../finance/entities/account.entity';
import { CallbackLogEntity } from './entities/callback-log.entity';
import { PaymentIntentEntity } from './entities/payment-intent.entity';
import { MpesaCallbackController } from './controllers/mpesa-callback.controller';
import { MpesaCallbackProcessorService } from './services/mpesa-callback-processor.service';
import { MpesaService } from './services/mpesa.service';
import { MpesaSignatureService } from './services/mpesa-signature.service';
import { ParsedMpesaCallback } from './payments.types';

const makeAccount = (overrides: Partial<AccountEntity> = {}): AccountEntity =>
  Object.assign(new AccountEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000101',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    code: overrides.code ?? '1100-MPESA-CLEARING',
    name: overrides.name ?? 'M-PESA Clearing',
    category: overrides.category ?? 'asset',
    normal_balance: overrides.normal_balance ?? 'debit',
    currency_code: overrides.currency_code ?? 'KES',
    allow_manual_entries: overrides.allow_manual_entries ?? true,
    is_active: overrides.is_active ?? true,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
  });

const makePaymentIntent = (
  overrides: Partial<PaymentIntentEntity> = {},
): PaymentIntentEntity =>
  Object.assign(new PaymentIntentEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000201',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    idempotency_key_id: overrides.idempotency_key_id ?? '00000000-0000-0000-0000-000000000301',
    user_id: overrides.user_id ?? '00000000-0000-0000-0000-000000000401',
    student_id: overrides.student_id ?? '00000000-0000-0000-0000-000000000402',
    request_id: overrides.request_id ?? 'req-1',
    external_reference: overrides.external_reference ?? 'ORDER-123',
    account_reference: overrides.account_reference ?? 'ORDER-123',
    transaction_desc: overrides.transaction_desc ?? 'School fees payment',
    phone_number: overrides.phone_number ?? '254700000001',
    amount_minor: overrides.amount_minor ?? '10000',
    currency_code: overrides.currency_code ?? 'KES',
    status: overrides.status ?? 'stk_requested',
    merchant_request_id: overrides.merchant_request_id ?? 'merchant-1',
    checkout_request_id: overrides.checkout_request_id ?? 'checkout-1',
    response_code: overrides.response_code ?? '0',
    response_description: overrides.response_description ?? 'Accepted',
    customer_message: overrides.customer_message ?? 'Success',
    ledger_transaction_id: overrides.ledger_transaction_id ?? null,
    failure_reason: overrides.failure_reason ?? null,
    stk_requested_at: overrides.stk_requested_at ?? new Date(),
    callback_received_at: overrides.callback_received_at ?? null,
    completed_at: overrides.completed_at ?? null,
    expires_at: overrides.expires_at ?? null,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
  });

const makeCallbackLog = (callback: ParsedMpesaCallback): CallbackLogEntity =>
  Object.assign(new CallbackLogEntity(), {
    id: '00000000-0000-0000-0000-000000000501',
    tenant_id: 'tenant-a',
    merchant_request_id: callback.merchant_request_id,
    checkout_request_id: callback.checkout_request_id,
    delivery_id: 'delivery-1',
    request_fingerprint: 'fingerprint-1',
    event_timestamp: new Date(),
    signature: 'signature',
    signature_verified: true,
    headers: {},
    raw_body: JSON.stringify({
      Body: {
        stkCallback: {
          MerchantRequestID: callback.merchant_request_id,
          CheckoutRequestID: callback.checkout_request_id,
          ResultCode: callback.result_code,
          ResultDesc: callback.result_desc,
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 100 },
              { Name: 'MpesaReceiptNumber', Value: callback.mpesa_receipt_number },
              { Name: 'TransactionDate', Value: 20260426103045 },
              { Name: 'PhoneNumber', Value: callback.phone_number },
            ],
          },
        },
      },
    }),
    raw_payload: {
      Body: {
        stkCallback: {
          MerchantRequestID: callback.merchant_request_id,
          CheckoutRequestID: callback.checkout_request_id,
          ResultCode: callback.result_code,
          ResultDesc: callback.result_desc,
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 100 },
              { Name: 'MpesaReceiptNumber', Value: callback.mpesa_receipt_number },
              { Name: 'TransactionDate', Value: 20260426103045 },
              { Name: 'PhoneNumber', Value: callback.phone_number },
            ],
          },
        },
      },
    },
    source_ip: '127.0.0.1',
    processing_status: 'received',
    queue_job_id: null,
    failure_reason: null,
    queued_at: null,
    processed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

test('MpesaSignatureService validates the configured HMAC callback signature', () => {
  const service = new MpesaSignatureService({
    get: (key: string): string | number | undefined => {
      if (key === 'mpesa.callbackSecret') {
        return 'top-secret';
      }

      if (key === 'mpesa.callbackTimestampToleranceSeconds') {
        return 300;
      }

      return undefined;
    },
  } as never);
  const rawBody = JSON.stringify({ ok: true });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = service.computeSignature(rawBody, timestamp);

  const verification = service.verifyCallback(rawBody, {
    'x-mpesa-signature': signature,
    'x-mpesa-timestamp': timestamp,
  });

  assert.equal(verification.signature, signature);
});

test('MpesaService parses a successful STK callback payload', () => {
  const service = new MpesaService(
    {
      get: (): undefined => undefined,
    } as never,
    new RequestContextService(),
    {} as never,
    {} as never,
    {
      inspectPaymentIntentCreation: async (): Promise<void> => undefined,
    } as never,
    {} as never,
    {} as never,
  );

  const parsed = service.parseCallbackPayload({
    Body: {
      stkCallback: {
        MerchantRequestID: 'merchant-1',
        CheckoutRequestID: 'checkout-1',
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 100 },
            { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
            { Name: 'TransactionDate', Value: 20260426103045 },
            { Name: 'PhoneNumber', Value: 254700000001 },
          ],
        },
      },
    },
  });

  assert.deepEqual(parsed, {
    merchant_request_id: 'merchant-1',
    checkout_request_id: 'checkout-1',
    result_code: 0,
    result_desc: 'The service request is processed successfully.',
    status: 'succeeded',
    amount_minor: '10000',
    mpesa_receipt_number: 'NLJ7RT61SV',
    transaction_occurred_at: parsed.transaction_occurred_at,
    phone_number: '254700000001',
    metadata: {
      Amount: 100,
      MpesaReceiptNumber: 'NLJ7RT61SV',
      TransactionDate: 20260426103045,
      PhoneNumber: 254700000001,
    },
  });
  });

test('MpesaCallbackController stores raw payload and enqueues a payments job by checkout request id', async () => {
  const requestContext = new RequestContextService();
  const callback: ParsedMpesaCallback = {
    merchant_request_id: 'merchant-1',
    checkout_request_id: 'checkout-1',
    result_code: 0,
    result_desc: 'Completed',
    status: 'succeeded',
    amount_minor: '10000',
    mpesa_receipt_number: 'NLJ7RT61SV',
    transaction_occurred_at: new Date('2026-04-26T07:30:45.000Z').toISOString(),
    phone_number: '254700000001',
    metadata: {},
  };
  const callbackLog = makeCallbackLog(callback);
  let createdLogInput: Record<string, unknown> | null = null;
  let enqueuedPayload: Record<string, unknown> | null = null;
  let queuedJobId: string | null = null;

  const controller = new MpesaCallbackController(
    requestContext,
    {
      createLog: async (input: Record<string, unknown>) => {
        createdLogInput = input;
        return callbackLog;
      },
      markRejected: async (): Promise<void> => undefined,
      markFailed: async (): Promise<void> => undefined,
      markQueued: async (_tenantId: string, _callbackLogId: string, queueJobId: string) => {
        queuedJobId = queueJobId;
      },
      markProcessed: async (): Promise<void> => undefined,
      markReplayed: async (): Promise<void> => undefined,
    } as never,
    {
      parseCallbackPayload: (): ParsedMpesaCallback => callback,
    } as never,
    {
      inspectCallback: () => ({
        delivery_id: 'delivery-1',
        request_fingerprint: 'fingerprint-1',
        signature: 'signature-1',
        event_timestamp: new Date().toISOString(),
      }),
      verifyCallback: (): void => undefined,
    } as never,
    {
      registerDelivery: async (): Promise<boolean> => true,
    } as never,
    {
      enqueuePayment: async (payload: Record<string, unknown>) => {
        enqueuedPayload = payload;
        return {
          job_id: 'payments:tenant-a:checkout-1',
          queue_name: 'payments',
          tenant_id: 'tenant-a',
          checkout_request_id: 'checkout-1',
          deduplicated: false,
          state: 'waiting',
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'request-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000499',
      role: 'admin',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'payments-test',
      method: 'POST',
      path: '/mpesa/callback',
      started_at: new Date().toISOString(),
    },
    () =>
      controller.handleCallback({
        headers: {},
        body: {
          Body: {
            stkCallback: {
              MerchantRequestID: callback.merchant_request_id,
              CheckoutRequestID: callback.checkout_request_id,
              ResultCode: callback.result_code,
              ResultDesc: callback.result_desc,
            },
          },
        },
        rawBody: Buffer.from('{"Body":{"stkCallback":{"CheckoutRequestID":"checkout-1"}}}', 'utf8'),
        ip: '127.0.0.1',
      } as never),
  );

  assert.equal((createdLogInput as { checkout_request_id?: string } | null)?.checkout_request_id, 'checkout-1');
  assert.equal(
    (
      (createdLogInput as { raw_payload?: { Body?: { stkCallback?: { CheckoutRequestID?: string } } } } | null)
        ?.raw_payload?.Body?.stkCallback?.CheckoutRequestID
    ),
    'checkout-1',
  );
  assert.equal(
    (enqueuedPayload as { checkout_request_id?: string } | null)?.checkout_request_id,
    'checkout-1',
  );
  assert.equal(
    (enqueuedPayload as { callback_log_id?: string } | null)?.callback_log_id,
    callbackLog.id,
  );
  assert.equal(queuedJobId, 'payments:tenant-a:checkout-1');
  assert.equal(response.accepted, true);
  assert.equal(response.duplicate, false);
});

test('MpesaCallbackProcessorService writes successful callbacks to the ledger once', async () => {
  const requestContext = new RequestContextService();
  const paymentIntent = makePaymentIntent();
  const callback: ParsedMpesaCallback = {
    merchant_request_id: 'merchant-1',
    checkout_request_id: 'checkout-1',
    result_code: 0,
    result_desc: 'Completed',
    status: 'succeeded',
    amount_minor: '10000',
    mpesa_receipt_number: 'NLJ7RT61SV',
    transaction_occurred_at: new Date('2026-04-26T07:30:45.000Z').toISOString(),
    phone_number: '254700000001',
    metadata: {
      Amount: 100,
      MpesaReceiptNumber: 'NLJ7RT61SV',
    },
  };
  const callbackLog = makeCallbackLog(callback);
  let postedInput: Record<string, unknown> | null = null;
  let completedLedgerTransactionId: string | null = null;
  let publishedPaymentCompletedPayload: Record<string, unknown> | null = null;

  const processor = new MpesaCallbackProcessorService(
    {
      get: (key: string): string | undefined => {
        if (key === 'mpesa.ledgerDebitAccountCode') {
          return '1100-MPESA-CLEARING';
        }

        if (key === 'mpesa.ledgerCreditAccountCode') {
          return '2100-CUSTOMER-DEPOSITS';
        }

        return undefined;
      },
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
    } as never,
    {
      parseCallbackPayload: (): ParsedMpesaCallback => callback,
    } as never,
    {
      findById: async (): Promise<CallbackLogEntity> => callbackLog,
      findLatestByCheckoutRequestId: async (): Promise<CallbackLogEntity> => callbackLog,
      markProcessing: async (): Promise<void> => undefined,
      markProcessed: async (): Promise<void> => undefined,
      markProcessedByCheckoutRequestId: async (): Promise<void> => undefined,
      markFailed: async (): Promise<void> => undefined,
      markFailedByCheckoutRequestId: async (): Promise<void> => undefined,
    } as never,
    {
      lockByCheckoutOrMerchantRequestId: async (): Promise<PaymentIntentEntity> => paymentIntent,
      markCallbackReceived: async (): Promise<void> => undefined,
      markProcessing: async (): Promise<void> => undefined,
      markCompleted: async (_tenantId: string, _paymentIntentId: string, ledgerTransactionId: string): Promise<void> => {
        completedLedgerTransactionId = ledgerTransactionId;
      },
      markFailed: async (): Promise<void> => undefined,
    } as never,
    {
      upsertFromCallback: async () => ({
        id: 'mpesa-tx-1',
        tenant_id: 'tenant-a',
        payment_intent_id: paymentIntent.id,
        callback_log_id: callbackLog.id,
        checkout_request_id: callback.checkout_request_id,
        merchant_request_id: callback.merchant_request_id,
        result_code: 0,
        result_desc: callback.result_desc,
        status: 'succeeded',
        mpesa_receipt_number: callback.mpesa_receipt_number,
        amount_minor: callback.amount_minor,
        phone_number: callback.phone_number,
        raw_payload: callbackLog.raw_payload,
        transaction_occurred_at: new Date(callback.transaction_occurred_at ?? Date.now()),
        ledger_transaction_id: null,
        processed_at: null,
        metadata: callback.metadata,
        created_at: new Date(),
        updated_at: new Date(),
      }),
      attachLedgerTransaction: async (): Promise<void> => undefined,
    } as never,
    {
      publishPaymentCompleted: async (payload: Record<string, unknown>) => {
        publishedPaymentCompletedPayload = payload;
        return undefined;
      },
    } as never,
    {
      findByCode: async (_tenantId: string, accountCode: string): Promise<AccountEntity> =>
        makeAccount({
          code: accountCode,
          normal_balance:
            accountCode === '1100-MPESA-CLEARING' ? 'debit' : 'credit',
          category:
            accountCode === '1100-MPESA-CLEARING' ? 'asset' : 'liability',
        }),
    } as never,
    {
      postTransaction: async (input: Record<string, unknown>) => {
        postedInput = input;
        return {
          transaction_id: 'ledger-tx-1',
        };
      },
    } as never,
    {
      handlePaymentIntentCompleted: async (): Promise<void> => undefined,
    } as never,
    {
      recordCallbackFailure: async (): Promise<void> => undefined,
      recordCallbackMismatch: async (): Promise<void> => undefined,
    } as never,
  );

  const result = await processor.processPaymentJob(
    {
      callback_log_id: callbackLog.id,
      tenant_id: 'tenant-a',
      checkout_request_id: callback.checkout_request_id,
      request_id: 'job-req-1',
      enqueued_at: new Date().toISOString(),
    },
    'payments:tenant-a:checkout-1',
  );

  assert.equal(completedLedgerTransactionId, 'ledger-tx-1');
  assert.equal(result.status, 'completed');
  assert.equal(result.ledger_transaction_id, 'ledger-tx-1');
  assert.equal(result.checkout_request_id, 'checkout-1');
  assert.equal(
    (postedInput as { idempotency_key?: string } | null)?.idempotency_key,
    'mpesa:checkout:checkout-1',
  );
  assert.equal(
    (publishedPaymentCompletedPayload as { payment_intent_id?: string } | null)?.payment_intent_id,
    paymentIntent.id,
  );
});

test('MpesaCallbackProcessorService rejects amount mismatches before ledger posting', async () => {
  const requestContext = new RequestContextService();
  const paymentIntent = makePaymentIntent({ amount_minor: '10000' });
  const callback: ParsedMpesaCallback = {
    merchant_request_id: 'merchant-1',
    checkout_request_id: 'checkout-1',
    result_code: 0,
    result_desc: 'Completed',
    status: 'succeeded',
    amount_minor: '9000',
    mpesa_receipt_number: 'NLJ7RT61SV',
    transaction_occurred_at: new Date('2026-04-26T07:30:45.000Z').toISOString(),
    phone_number: '254700000001',
    metadata: {},
  };
  const callbackLog = makeCallbackLog(callback);

  const processor = new MpesaCallbackProcessorService(
    {
      get: (): undefined => undefined,
    } as never,
    requestContext,
    {
      withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
    } as never,
    {
      parseCallbackPayload: (): ParsedMpesaCallback => callback,
    } as never,
    {
      findById: async (): Promise<CallbackLogEntity> => callbackLog,
      findLatestByCheckoutRequestId: async (): Promise<CallbackLogEntity> => callbackLog,
      markProcessing: async (): Promise<void> => undefined,
      markProcessed: async (): Promise<void> => undefined,
      markProcessedByCheckoutRequestId: async (): Promise<void> => undefined,
      markFailed: async (): Promise<void> => undefined,
      markFailedByCheckoutRequestId: async (): Promise<void> => undefined,
    } as never,
    {
      lockByCheckoutOrMerchantRequestId: async (): Promise<PaymentIntentEntity> => paymentIntent,
      markCallbackReceived: async (): Promise<void> => undefined,
      markProcessing: async (): Promise<void> => undefined,
      markCompleted: async (): Promise<void> => undefined,
      markFailed: async (): Promise<void> => undefined,
    } as never,
    {
      upsertFromCallback: async () => ({
        id: 'mpesa-tx-1',
        tenant_id: 'tenant-a',
        payment_intent_id: paymentIntent.id,
        callback_log_id: callbackLog.id,
        checkout_request_id: callback.checkout_request_id,
        merchant_request_id: callback.merchant_request_id,
        result_code: 0,
        result_desc: callback.result_desc,
        status: 'succeeded',
        mpesa_receipt_number: callback.mpesa_receipt_number,
        amount_minor: callback.amount_minor,
        phone_number: callback.phone_number,
        raw_payload: callbackLog.raw_payload,
        transaction_occurred_at: new Date(callback.transaction_occurred_at ?? Date.now()),
        ledger_transaction_id: null,
        processed_at: null,
        metadata: callback.metadata,
        created_at: new Date(),
        updated_at: new Date(),
      }),
      attachLedgerTransaction: async (): Promise<void> => undefined,
    } as never,
    {
      publishPaymentCompleted: async (): Promise<void> => undefined,
    } as never,
    {
      findByCode: async (): Promise<AccountEntity> => makeAccount(),
    } as never,
    {
      postTransaction: async (): Promise<never> => {
        throw new Error('Ledger posting should not run for invalid callback amounts');
      },
    } as never,
    {
      handlePaymentIntentCompleted: async (): Promise<void> => undefined,
    } as never,
    {
      recordCallbackFailure: async (): Promise<void> => undefined,
      recordCallbackMismatch: async (): Promise<void> => undefined,
    } as never,
  );

  await assert.rejects(
    () =>
      processor.processPaymentJob({
        callback_log_id: callbackLog.id,
        tenant_id: 'tenant-a',
        checkout_request_id: callback.checkout_request_id,
        request_id: 'job-req-1',
        enqueued_at: new Date().toISOString(),
      }, 'payments:tenant-a:checkout-1'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message.includes('amount mismatch'),
  );
});
