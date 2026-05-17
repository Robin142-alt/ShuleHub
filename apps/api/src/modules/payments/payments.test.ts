import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { AccountEntity } from '../finance/entities/account.entity';
import { CallbackLogEntity } from './entities/callback-log.entity';
import { PaymentIntentEntity } from './entities/payment-intent.entity';
import { MpesaCallbackController } from './controllers/mpesa-callback.controller';
import { MpesaC2bController } from './controllers/mpesa-c2b.controller';
import { MpesaC2bService } from './services/mpesa-c2b.service';
import { MpesaCallbackProcessorService } from './services/mpesa-callback-processor.service';
import { MpesaService } from './services/mpesa.service';
import { MpesaSignatureService } from './services/mpesa-signature.service';
import { ParsedMpesaCallback } from './payments.types';
import { TenantFinanceConfigService } from '../tenant-finance/tenant-finance-config.service';
import { MpesaC2bPaymentEntity } from './entities/mpesa-c2b-payment.entity';

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
    payment_owner: overrides.payment_owner ?? 'tenant',
    mpesa_config_id: overrides.mpesa_config_id ?? '00000000-0000-0000-0000-000000000901',
    payment_channel_id: overrides.payment_channel_id ?? '00000000-0000-0000-0000-000000000902',
    mpesa_short_code: overrides.mpesa_short_code ?? '247247',
    payment_channel_type: overrides.payment_channel_type ?? 'mpesa_paybill',
    ledger_debit_account_code: overrides.ledger_debit_account_code ?? '1110-MPESA-CLEARING',
    ledger_credit_account_code: overrides.ledger_credit_account_code ?? '1100-AR-FEES',
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

const makeC2bPayment = (
  overrides: Partial<MpesaC2bPaymentEntity> = {},
): MpesaC2bPaymentEntity =>
  Object.assign(new MpesaC2bPaymentEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000701',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    mpesa_config_id: overrides.mpesa_config_id ?? '00000000-0000-0000-0000-000000000901',
    payment_channel_id: overrides.payment_channel_id ?? '00000000-0000-0000-0000-000000000902',
    trans_id: overrides.trans_id ?? 'QF12345678',
    transaction_type: overrides.transaction_type ?? 'Pay Bill',
    business_short_code: overrides.business_short_code ?? '247247',
    bill_ref_number: overrides.bill_ref_number ?? 'INV-2026-001',
    invoice_number: overrides.invoice_number ?? null,
    amount_minor: overrides.amount_minor ?? '125000',
    currency_code: overrides.currency_code ?? 'KES',
    phone_number: overrides.phone_number ?? '254700000001',
    payer_name: overrides.payer_name ?? 'Jane Parent',
    org_account_balance: overrides.org_account_balance ?? null,
    third_party_trans_id: overrides.third_party_trans_id ?? null,
    status: overrides.status ?? 'pending_review',
    matched_invoice_id: overrides.matched_invoice_id ?? null,
    matched_student_id: overrides.matched_student_id ?? null,
    manual_fee_payment_id: overrides.manual_fee_payment_id ?? null,
    ledger_transaction_id: overrides.ledger_transaction_id ?? null,
    received_at: overrides.received_at ?? new Date('2026-05-15T09:30:45.000Z'),
    matched_at: overrides.matched_at ?? null,
    raw_payload: overrides.raw_payload ?? {},
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
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

test('MpesaC2bController rejects unsigned callbacks when callback secret is missing', async () => {
  let validationCalled = false;
  const controller = new MpesaC2bController(
    {
      validatePayment: async () => {
        validationCalled = true;
        return { ResultCode: 0, ResultDesc: 'Accepted' };
      },
    } as never,
    undefined,
    {
      get: (): string => '',
    } as never,
  );

  await assert.rejects(
    () =>
      controller.validate(
        {
          headers: {},
          body: {},
          rawBody: Buffer.from('{}', 'utf8'),
        } as never,
        {} as never,
      ),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === 'MPESA callback secret is not configured',
  );
  assert.equal(validationCalled, false);
});

test('MpesaC2bController verifies callback signatures before validation', async () => {
  const config = {
    get: (key: string): string | number | undefined => {
      if (key === 'mpesa.callbackSecret') {
        return 'top-secret';
      }

      if (key === 'mpesa.callbackTimestampToleranceSeconds') {
        return 300;
      }

      return undefined;
    },
  };
  const signatureService = new MpesaSignatureService(config as never);
  const rawBody = JSON.stringify({
    TransactionType: 'Pay Bill',
    TransID: 'QF12345678',
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signatureService.computeSignature(rawBody, timestamp);
  let validationCalled = false;
  const controller = new MpesaC2bController(
    {
      validatePayment: async () => {
        validationCalled = true;
        return { ResultCode: 0, ResultDesc: 'Accepted' };
      },
    } as never,
    signatureService,
    config as never,
  );

  const response = await controller.validate(
    {
      headers: {
        'x-mpesa-signature': signature,
        'x-mpesa-timestamp': timestamp,
      },
      body: JSON.parse(rawBody),
      rawBody: Buffer.from(rawBody, 'utf8'),
    } as never,
    JSON.parse(rawBody),
  );

  assert.equal(validationCalled, true);
  assert.deepEqual(response, { ResultCode: 0, ResultDesc: 'Accepted' });
});

test('MpesaService parses a successful STK callback payload', () => {
  const service = new MpesaService(
    {
      get: (): undefined => undefined,
    } as never,
    new RequestContextService(),
    {
      resolveMpesaConfigByShortcode: async () => ({
        owner: 'tenant',
        tenant_id: 'tenant-a',
        mpesa_config_id: '00000000-0000-0000-0000-000000000901',
        payment_channel_id: '00000000-0000-0000-0000-000000000902',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        base_url: 'https://sandbox.safaricom.co.ke',
        callback_url: 'https://green-valley.example.com/payments/mpesa/c2b/confirmation',
        transaction_type: 'CustomerPayBillOnline',
        ledger_debit_account_code: '1110-MPESA-CLEARING',
        ledger_credit_account_code: '1100-AR-FEES',
      }),
    } as never,
    {
      resolveMpesaConfigByShortcode: async () => ({
        owner: 'tenant',
        tenant_id: 'tenant-a',
        mpesa_config_id: '00000000-0000-0000-0000-000000000901',
        payment_channel_id: '00000000-0000-0000-0000-000000000902',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        base_url: 'https://sandbox.safaricom.co.ke',
        callback_url: 'https://green-valley.example.com/payments/mpesa/c2b/confirmation',
        transaction_type: 'CustomerPayBillOnline',
        ledger_debit_account_code: '1110-MPESA-CLEARING',
        ledger_credit_account_code: '1100-AR-FEES',
      }),
    } as never,
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

test('MpesaC2bService parses a direct Paybill confirmation into tenant-safe money fields', () => {
  const service = new MpesaC2bService(
    new RequestContextService(),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const parsed = service.parseC2bPayload({
    TransactionType: 'Pay Bill',
    TransID: 'QF12345678',
    TransTime: '20260515123045',
    TransAmount: '1250',
    BusinessShortCode: '247247',
    BillRefNumber: 'INV-2026-001',
    OrgAccountBalance: '30000',
    MSISDN: '254700000001',
    FirstName: 'Jane',
    MiddleName: '',
    LastName: 'Parent',
  });

  assert.deepEqual(parsed, {
    transaction_type: 'Pay Bill',
    trans_id: 'QF12345678',
    transaction_occurred_at: '2026-05-15T09:30:45.000Z',
    amount_minor: '125000',
    business_short_code: '247247',
    bill_ref_number: 'INV-2026-001',
    invoice_number: null,
    org_account_balance: '30000',
    third_party_trans_id: null,
    phone_number: '254700000001',
    payer_name: 'Jane Parent',
    metadata: {},
  });
});

test('MpesaC2bService posts a matched direct Paybill payment through manual fee allocation', async () => {
  const requestContext = new RequestContextService();
  const c2bPayment = makeC2bPayment();
  const matchedC2bPayment = makeC2bPayment({
    status: 'matched',
    matched_invoice_id: '00000000-0000-0000-0000-000000000801',
    matched_student_id: '00000000-0000-0000-0000-000000000802',
    manual_fee_payment_id: '00000000-0000-0000-0000-000000000803',
    ledger_transaction_id: '00000000-0000-0000-0000-000000000804',
    matched_at: new Date('2026-05-15T09:31:00.000Z'),
  });
  let manualPaymentInput: Record<string, unknown> | null = null;
  let markedMatchedInput: Record<string, unknown> | null = null;

  const service = new MpesaC2bService(
    requestContext,
    {
      withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
      query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
    } as never,
    {
      resolveMpesaConfigByShortcode: async () => ({
        owner: 'tenant',
        tenant_id: 'tenant-a',
        mpesa_config_id: '00000000-0000-0000-0000-000000000901',
        payment_channel_id: '00000000-0000-0000-0000-000000000902',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        base_url: 'https://sandbox.safaricom.co.ke',
        callback_url: 'https://green-valley.example.com/payments/mpesa/c2b/confirmation',
        transaction_type: 'CustomerPayBillOnline',
        ledger_debit_account_code: '1110-MPESA-CLEARING',
        ledger_credit_account_code: '1100-AR-FEES',
      }),
    } as never,
    {
      findByTenantAndTransId: async (): Promise<MpesaC2bPaymentEntity | null> => null,
      createReceived: async () => ({ payment: c2bPayment, inserted: true }),
      markMatched: async (input: Record<string, unknown>) => {
        markedMatchedInput = input;
        return matchedC2bPayment;
      },
      markPendingReview: async (): Promise<MpesaC2bPaymentEntity> => c2bPayment,
    } as never,
    {
      findManualFeeInvoiceTargetByReference: async () => ({
        id: '00000000-0000-0000-0000-000000000801',
        tenant_id: 'tenant-a',
        status: 'open',
        total_amount_minor: '125000',
        amount_paid_minor: '0',
        metadata: {
          student_id: '00000000-0000-0000-0000-000000000802',
        },
      }),
    } as never,
    {
      createManualFeePayment: async (input: Record<string, unknown>) => {
        manualPaymentInput = input;
        return {
          id: '00000000-0000-0000-0000-000000000803',
          ledger_transaction_id: '00000000-0000-0000-0000-000000000804',
          status: 'cleared',
        };
      },
    } as never,
  );

  const result = await service.processConfirmation({
    TransactionType: 'Pay Bill',
    TransID: 'QF12345678',
    TransTime: '20260515123045',
    TransAmount: '1250',
    BusinessShortCode: '247247',
    BillRefNumber: 'INV-2026-001',
    MSISDN: '254700000001',
    FirstName: 'Jane',
    LastName: 'Parent',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.status, 'matched');
  assert.equal((manualPaymentInput as { payment_method?: string } | null)?.payment_method, 'mpesa_c2b');
  assert.equal((manualPaymentInput as { invoice_id?: string } | null)?.invoice_id, '00000000-0000-0000-0000-000000000801');
  assert.equal((manualPaymentInput as { student_id?: string } | null)?.student_id, '00000000-0000-0000-0000-000000000802');
  assert.equal((manualPaymentInput as { asset_account_code?: string } | null)?.asset_account_code, '1110-MPESA-CLEARING');
  assert.equal((manualPaymentInput as { external_reference?: string } | null)?.external_reference, 'QF12345678');
  assert.equal((markedMatchedInput as { manual_fee_payment_id?: string } | null)?.manual_fee_payment_id, '00000000-0000-0000-0000-000000000803');
  assert.equal((markedMatchedInput as { ledger_transaction_id?: string } | null)?.ledger_transaction_id, '00000000-0000-0000-0000-000000000804');
});

test('MpesaC2bService keeps unmatched direct Paybill payments for accountant review', async () => {
  const requestContext = new RequestContextService();
  const c2bPayment = makeC2bPayment({
    bill_ref_number: 'UNKNOWN-ADM',
  });
  let manualPaymentCreated = false;
  let pendingReviewInput: Record<string, unknown> | null = null;

  const service = new MpesaC2bService(
    requestContext,
    {
      withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
      query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
    } as never,
    {
      resolveMpesaConfigByShortcode: async () => ({
        owner: 'tenant',
        tenant_id: 'tenant-a',
        mpesa_config_id: '00000000-0000-0000-0000-000000000901',
        payment_channel_id: '00000000-0000-0000-0000-000000000902',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        base_url: 'https://sandbox.safaricom.co.ke',
        callback_url: 'https://green-valley.example.com/payments/mpesa/c2b/confirmation',
        transaction_type: 'CustomerPayBillOnline',
        ledger_debit_account_code: '1110-MPESA-CLEARING',
        ledger_credit_account_code: '1100-AR-FEES',
      }),
    } as never,
    {
      findByTenantAndTransId: async (): Promise<MpesaC2bPaymentEntity | null> => null,
      createReceived: async () => ({ payment: c2bPayment, inserted: true }),
      markMatched: async (): Promise<never> => {
        throw new Error('Unmatched C2B payment must not be marked matched');
      },
      markPendingReview: async (input: Record<string, unknown>) => {
        pendingReviewInput = input;
        return c2bPayment;
      },
    } as never,
    {
      findManualFeeInvoiceTargetByReference: async () => null,
    } as never,
    {
      createManualFeePayment: async (): Promise<never> => {
        manualPaymentCreated = true;
        throw new Error('Unmatched C2B payment must not post a fee receipt');
      },
    } as never,
  );

  const result = await service.processConfirmation({
    TransactionType: 'Pay Bill',
    TransID: 'QF12345678',
    TransTime: '20260515123045',
    TransAmount: '1250',
    BusinessShortCode: '247247',
    BillRefNumber: 'UNKNOWN-ADM',
    MSISDN: '254700000001',
    FirstName: 'Jane',
    LastName: 'Parent',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, 'pending_review');
  assert.equal(manualPaymentCreated, false);
  assert.equal((pendingReviewInput as { reason?: string } | null)?.reason, 'no_invoice_or_student_match');
});

test('MpesaC2bService treats duplicate direct Paybill confirmations as idempotent', async () => {
  const requestContext = new RequestContextService();
  let createReceivedCalled = false;
  let manualPaymentCreated = false;

  const service = new MpesaC2bService(
    requestContext,
    {
      withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
      query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
    } as never,
    {
      resolveMpesaConfigByShortcode: async () => ({
        owner: 'tenant',
        tenant_id: 'tenant-a',
        mpesa_config_id: '00000000-0000-0000-0000-000000000901',
        payment_channel_id: '00000000-0000-0000-0000-000000000902',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        base_url: 'https://sandbox.safaricom.co.ke',
        callback_url: 'https://green-valley.example.com/payments/mpesa/c2b/confirmation',
        transaction_type: 'CustomerPayBillOnline',
        ledger_debit_account_code: '1110-MPESA-CLEARING',
        ledger_credit_account_code: '1100-AR-FEES',
      }),
    } as never,
    {
      findByTenantAndTransId: async (): Promise<MpesaC2bPaymentEntity | null> =>
        makeC2bPayment({
          status: 'matched',
          manual_fee_payment_id: '00000000-0000-0000-0000-000000000803',
          ledger_transaction_id: '00000000-0000-0000-0000-000000000804',
        }),
      createReceived: async (): Promise<never> => {
        createReceivedCalled = true;
        throw new Error('Duplicate C2B payment must not be inserted again');
      },
      markMatched: async (): Promise<never> => {
        throw new Error('Duplicate C2B payment must not be matched again');
      },
      markPendingReview: async (): Promise<never> => {
        throw new Error('Duplicate C2B payment must not be changed');
      },
    } as never,
    {
      findManualFeeInvoiceTargetByReference: async (): Promise<never> => {
        throw new Error('Duplicate C2B payment must not resolve allocation targets again');
      },
    } as never,
    {
      createManualFeePayment: async (): Promise<never> => {
        manualPaymentCreated = true;
        throw new Error('Duplicate C2B payment must not post a fee receipt');
      },
    } as never,
  );

  const result = await service.processConfirmation({
    TransactionType: 'Pay Bill',
    TransID: 'QF12345678',
    TransTime: '20260515123045',
    TransAmount: '1250',
    BusinessShortCode: '247247',
    BillRefNumber: 'INV-2026-001',
    MSISDN: '254700000001',
    FirstName: 'Jane',
    LastName: 'Parent',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.status, 'matched');
  assert.equal(createReceivedCalled, false);
  assert.equal(manualPaymentCreated, false);
});

test('MpesaC2bService reconciles a pending direct Paybill payment from accountant review', async () => {
  const requestContext = new RequestContextService();
  const pendingPayment = makeC2bPayment({
    id: '00000000-0000-0000-0000-000000000711',
    status: 'pending_review',
    bill_ref_number: 'UNKNOWN-ADM',
    manual_fee_payment_id: null,
    ledger_transaction_id: null,
  });
  const matchedPayment = makeC2bPayment({
    ...pendingPayment,
    status: 'matched',
    matched_invoice_id: '00000000-0000-0000-0000-000000000801',
    matched_student_id: '00000000-0000-0000-0000-000000000802',
    manual_fee_payment_id: '00000000-0000-0000-0000-000000000803',
    ledger_transaction_id: '00000000-0000-0000-0000-000000000804',
  });
  let manualPaymentInput: Record<string, unknown> | null = null;

  const service = new MpesaC2bService(
    requestContext,
    {
      withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
      query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
    } as never,
    {
      resolveMpesaConfigByShortcode: async () => ({
        owner: 'tenant',
        tenant_id: 'tenant-a',
        mpesa_config_id: '00000000-0000-0000-0000-000000000901',
        payment_channel_id: '00000000-0000-0000-0000-000000000902',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        base_url: 'https://sandbox.safaricom.co.ke',
        callback_url: 'https://green-valley.example.com/payments/mpesa/c2b/confirmation',
        transaction_type: 'CustomerPayBillOnline',
        ledger_debit_account_code: '1110-MPESA-CLEARING',
        ledger_credit_account_code: '1100-AR-FEES',
      }),
    } as never,
    {
      lockById: async (): Promise<MpesaC2bPaymentEntity | null> => pendingPayment,
      markMatched: async () => matchedPayment,
    } as never,
    {
      lockManualFeeInvoiceForAllocation: async () => ({
        id: '00000000-0000-0000-0000-000000000801',
        tenant_id: 'tenant-a',
        status: 'open',
        total_amount_minor: '125000',
        amount_paid_minor: '0',
        metadata: {
          student_id: '00000000-0000-0000-0000-000000000802',
        },
      }),
    } as never,
    {
      createManualFeePayment: async (input: Record<string, unknown>) => {
        manualPaymentInput = input;
        return {
          id: '00000000-0000-0000-0000-000000000803',
          ledger_transaction_id: '00000000-0000-0000-0000-000000000804',
          status: 'cleared',
        };
      },
    } as never,
  );

  const result = await requestContext.run(
    {
      request_id: 'request-tenant-a',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000499',
      role: 'accountant',
      session_id: 'session-tenant-a',
      permissions: ['billing:update'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'payments-test',
      method: 'POST',
      path: '/payments/mpesa/c2b/payments/00000000-0000-0000-0000-000000000711/reconcile',
      started_at: new Date().toISOString(),
    },
    () =>
      service.reconcilePendingPayment('00000000-0000-0000-0000-000000000711', {
        invoice_id: '00000000-0000-0000-0000-000000000801',
        notes: 'Matched after accountant checked bank slip reference.',
      }),
  );

  assert.equal(result.status, 'matched');
  assert.equal((manualPaymentInput as { payment_method?: string } | null)?.payment_method, 'mpesa_c2b');
  assert.equal((manualPaymentInput as { invoice_id?: string } | null)?.invoice_id, '00000000-0000-0000-0000-000000000801');
  assert.equal((manualPaymentInput as { student_id?: string } | null)?.student_id, '00000000-0000-0000-0000-000000000802');
  assert.equal((manualPaymentInput as { external_reference?: string } | null)?.external_reference, 'QF12345678');
});

test('TenantFinanceConfigService resolves only the active tenant-owned MPESA config', async () => {
  const service = new TenantFinanceConfigService(
    {
      findActiveMpesaConfigForTenant: async (tenantId: string) => ({
        id: '00000000-0000-0000-0000-000000000901',
        tenant_id: tenantId,
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        consumer_key: 'school-consumer-key',
        consumer_secret: 'school-consumer-secret',
        passkey: 'school-passkey',
        initiator_name: 'school-api',
        environment: 'sandbox',
        callback_url: 'https://green-valley.example.com/payments/mpesa/callback',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }),
      findFinancialAccountsForTenant: async (tenantId: string) => ({
        tenant_id: tenantId,
        mpesa_clearing_account_code: '1110-MPESA-CLEARING',
        fee_control_account_code: '1100-AR-FEES',
        currency_code: 'KES',
      }),
      findActivePaymentChannelForMpesaConfig: async () => ({
        id: '00000000-0000-0000-0000-000000000902',
        channel_type: 'mpesa_paybill',
        status: 'active',
      }),
    } as never,
    {
      get: (key: string): string | undefined => {
        if (key === 'mpesa.baseUrl') {
          return 'https://sandbox.safaricom.co.ke';
        }

        return undefined;
      },
    } as never,
  );

  const config = await service.resolveMpesaConfigForTenant('tenant-a');

  assert.equal(config.tenant_id, 'tenant-a');
  assert.equal(config.shortcode, '247247');
  assert.equal(config.consumer_key, 'school-consumer-key');
  assert.equal(config.consumer_secret, 'school-consumer-secret');
  assert.equal(config.passkey, 'school-passkey');
  assert.equal(config.transaction_type, 'CustomerPayBillOnline');
  assert.equal(config.ledger_debit_account_code, '1110-MPESA-CLEARING');
  assert.equal(config.ledger_credit_account_code, '1100-AR-FEES');
});

test('TenantFinanceConfigService returns masked summary after saving MPESA config', async () => {
  const captured: Record<string, unknown> = {};
  const now = new Date('2026-05-16T10:00:00.000Z');
  const summary = {
    tenant_id: 'tenant-a',
    mpesa_configs: [
      {
        id: '00000000-0000-0000-0000-000000000901',
        tenant_id: 'tenant-a',
        shortcode: '247247',
        paybill_number: '247247',
        till_number: null,
        initiator_name: 'school-api',
        environment: 'sandbox',
        callback_url: 'https://green-valley.example.com/payments/mpesa/callback',
        status: 'active',
        created_at: now,
        updated_at: now,
        consumer_key_masked: '****-key',
        consumer_secret_masked: '****-secret',
        passkey_masked: '****-passkey',
      },
    ],
    bank_accounts: [],
    payment_channels: [],
    financial_accounts: null,
    dashboard: {
      todays_collections_minor: '0',
      pending_reconciliations: 0,
      failed_callbacks: 0,
      unmatched_payments: 0,
      mpesa_status: 'active',
      reconciliation_status: 'balanced',
    },
  };
  const service = new TenantFinanceConfigService(
    {
      upsertMpesaConfig: async (input: Record<string, unknown>) => {
        captured.upsert = input;
        return {
          id: '00000000-0000-0000-0000-000000000901',
          tenant_id: input.tenant_id,
          shortcode: input.shortcode,
          paybill_number: input.paybill_number,
          till_number: input.till_number,
          consumer_key: input.consumer_key,
          consumer_secret: input.consumer_secret,
          passkey: input.passkey,
          initiator_name: input.initiator_name,
          environment: input.environment,
          callback_url: input.callback_url,
          status: input.status,
          created_at: now,
          updated_at: now,
        };
      },
      ensureMpesaPaymentChannel: async (input: Record<string, unknown>) => {
        captured.channel = input;
        return { id: '00000000-0000-0000-0000-000000000902' };
      },
      getSummary: async (tenantId: string) => {
        assert.equal(tenantId, 'tenant-a');
        return summary;
      },
    } as never,
    { get: () => undefined } as never,
  );

  const result = await service.upsertMpesaConfig('tenant-a', {
    shortcode: '247247',
    paybill_number: '247247',
    consumer_key: 'school-consumer-key',
    consumer_secret: 'school-consumer-secret',
    passkey: 'school-passkey',
    initiator_name: 'school-api',
    environment: 'sandbox',
    callback_url: 'https://green-valley.example.com/payments/mpesa/callback',
  });

  assert.equal((captured.upsert as Record<string, unknown>).consumer_secret, 'school-consumer-secret');
  assert.equal(JSON.stringify(result).includes('school-consumer-secret'), false);
  assert.equal(JSON.stringify(result).includes('school-passkey'), false);
  assert.equal(result.mpesa_configs[0]?.consumer_secret_masked, '****-secret');
});

test('MpesaService sends STK push with the resolved school shortcode and credentials', async () => {
  const requestContext = new RequestContextService();
  const paymentIntent = makePaymentIntent({
    status: 'pending',
    merchant_request_id: null,
    checkout_request_id: null,
  });
  const fetchCalls: Array<{ url: string; authorization: string | null; body: Record<string, unknown> | null }> = [];
  const previousFetch = global.fetch;

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({
      url: String(url),
      authorization:
        init?.headers && typeof init.headers === 'object'
          ? String((init.headers as Record<string, unknown>).Authorization ?? '')
          : null,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });

    if (String(url).includes('/oauth/v1/generate')) {
      return new Response(JSON.stringify({ access_token: 'tenant-token', expires_in: 3599 }), {
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({
        MerchantRequestID: 'school-merchant-1',
        CheckoutRequestID: 'school-checkout-1',
        ResponseCode: '0',
        ResponseDescription: 'Accepted',
        CustomerMessage: 'STK pushed',
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const service = new MpesaService(
      {
        get: (key: string): string | number | undefined => {
          if (key === 'finance.idempotencyTtlSeconds') {
            return 86400;
          }

          if (key === 'mpesa.paymentIntentExpirySeconds') {
            return 1800;
          }

          if (key === 'mpesa.requestTimeoutMs') {
            return 15000;
          }

          return undefined;
        },
      } as never,
      requestContext,
      {
        withRequestTransaction: async <T>(callbackFn: () => Promise<T>): Promise<T> => callbackFn(),
      } as never,
      {
        getClient: () => ({
          get: async (): Promise<string | null> => null,
          set: async (): Promise<void> => undefined,
        }),
      } as never,
      {
        inspectPaymentIntentCreation: async (): Promise<void> => undefined,
      } as never,
      {
        createPending: async (): Promise<PaymentIntentEntity> => paymentIntent,
        markStkRequested: async (
          _tenantId: string,
          _paymentIntentId: string,
          response: {
            merchant_request_id: string;
            checkout_request_id: string;
            response_code: string;
            response_description: string;
            customer_message: string;
          },
        ): Promise<PaymentIntentEntity> =>
          makePaymentIntent({
            ...paymentIntent,
            status: 'stk_requested',
            merchant_request_id: response.merchant_request_id,
            checkout_request_id: response.checkout_request_id,
            response_code: response.response_code,
            response_description: response.response_description,
            customer_message: response.customer_message,
          }),
      } as never,
      {
        lockRequest: async () => ({
          id: '00000000-0000-0000-0000-000000000301',
          tenant_id: 'tenant-a',
          user_id: null,
          scope: 'mpesa.payment_intent',
          idempotency_key: 'idem-tenant-a',
          request_method: 'POST',
          request_path: '/payments/mpesa/payment-intents',
          request_hash: 'hash',
          status: 'in_progress',
          response_status_code: null,
          response_body: null,
          locked_at: null,
          completed_at: null,
          expires_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        markCompleted: async (): Promise<void> => undefined,
      } as never,
      undefined,
      {
        resolveMpesaConfigForTenant: async () => ({
          owner: 'tenant',
          tenant_id: 'tenant-a',
          mpesa_config_id: '00000000-0000-0000-0000-000000000901',
          payment_channel_id: '00000000-0000-0000-0000-000000000902',
          shortcode: '247247',
          paybill_number: '247247',
          till_number: null,
          consumer_key: 'school-consumer-key',
          consumer_secret: 'school-consumer-secret',
          passkey: 'school-passkey',
          initiator_name: 'school-api',
          environment: 'sandbox',
          base_url: 'https://sandbox.safaricom.co.ke',
          callback_url: 'https://green-valley.example.com/payments/mpesa/callback',
          transaction_type: 'CustomerPayBillOnline',
          ledger_debit_account_code: '1110-MPESA-CLEARING',
          ledger_credit_account_code: '1100-AR-FEES',
        }),
      } as never,
    );

    const response = await requestContext.run(
      {
        request_id: 'request-tenant-a',
        tenant_id: 'tenant-a',
        user_id: '00000000-0000-0000-0000-000000000499',
        role: 'admin',
        session_id: 'session-tenant-a',
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: '127.0.0.1',
        user_agent: 'payments-test',
        method: 'POST',
        path: '/payments/mpesa/payment-intents',
        started_at: new Date().toISOString(),
      },
      () =>
        service.createPaymentIntent({
          idempotency_key: 'idem-tenant-a',
          amount_minor: '10000',
          phone_number: '0712345678',
          account_reference: 'ADM-2025-001',
          transaction_desc: 'School fees',
        }),
    );

    const oauthCall = fetchCalls.find((call) => call.url.includes('/oauth/v1/generate'));
    const stkCall = fetchCalls.find((call) => call.url.includes('/mpesa/stkpush/v1/processrequest'));

    assert.equal(response.checkout_request_id, 'school-checkout-1');
    assert.equal(
      oauthCall?.authorization,
      `Basic ${Buffer.from('school-consumer-key:school-consumer-secret').toString('base64')}`,
    );
    assert.equal(stkCall?.body?.BusinessShortCode, '247247');
    assert.equal(stkCall?.body?.PartyB, '247247');
    assert.equal(stkCall?.body?.CallBackURL, 'https://green-valley.example.com/payments/mpesa/callback');
    assert.equal(stkCall?.body?.TransactionType, 'CustomerPayBillOnline');
  } finally {
    global.fetch = previousFetch;
  }
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
