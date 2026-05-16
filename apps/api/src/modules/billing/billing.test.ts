import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { BillingLifecycleGuard } from '../../guards/billing-lifecycle.guard';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingMpesaService } from './billing-mpesa.service';
import { BillingService } from './billing.service';
import { InvoiceEntity } from './entities/invoice.entity';
import { ManualFeePaymentEntity } from './entities/manual-fee-payment.entity';
import { ManualFeePaymentService } from './manual-fee-payment.service';
import { StudentFeePaymentAllocationService } from './student-fee-payment-allocation.service';
import { UsageMeterService } from './usage-meter.service';

const makeManualFeePayment = (
  overrides: Partial<ManualFeePaymentEntity> = {},
): ManualFeePaymentEntity =>
  Object.assign(new ManualFeePaymentEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000700',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    receipt_number: overrides.receipt_number ?? 'RCT-20260515-ABC12345',
    payment_method: overrides.payment_method ?? 'cash',
    status: overrides.status ?? 'cleared',
    student_id: overrides.student_id ?? null,
    invoice_id: overrides.invoice_id ?? null,
    amount_minor: overrides.amount_minor ?? '10000',
    currency_code: overrides.currency_code ?? 'KES',
    payer_name: overrides.payer_name ?? null,
    received_at: overrides.received_at ?? new Date('2026-05-15T08:00:00.000Z'),
    deposited_at: overrides.deposited_at ?? null,
    cleared_at: overrides.cleared_at ?? null,
    bounced_at: overrides.bounced_at ?? null,
    reversed_at: overrides.reversed_at ?? null,
    cheque_number: overrides.cheque_number ?? null,
    drawer_bank: overrides.drawer_bank ?? null,
    deposit_reference: overrides.deposit_reference ?? null,
    external_reference: overrides.external_reference ?? null,
    asset_account_code: overrides.asset_account_code ?? '1120-BANK-CLEARING',
    fee_control_account_code: overrides.fee_control_account_code ?? '1100-AR-FEES',
    ledger_transaction_id: overrides.ledger_transaction_id ?? null,
    reversal_ledger_transaction_id: overrides.reversal_ledger_transaction_id ?? null,
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? {},
    created_by_user_id: overrides.created_by_user_id ?? '00000000-0000-0000-0000-000000000010',
    created_at: overrides.created_at ?? new Date('2026-05-15T08:00:00.000Z'),
    updated_at: overrides.updated_at ?? new Date('2026-05-15T08:00:00.000Z'),
  });

const makeInvoice = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  Object.assign(new InvoiceEntity(), {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000600',
    tenant_id: overrides.tenant_id ?? 'tenant-a',
    subscription_id: overrides.subscription_id ?? '00000000-0000-0000-0000-000000000601',
    invoice_number: overrides.invoice_number ?? 'INV-20260515-000001',
    status: overrides.status ?? 'open',
    currency_code: overrides.currency_code ?? 'KES',
    description: overrides.description ?? 'Term 2 fees',
    subtotal_amount_minor: overrides.subtotal_amount_minor ?? '125000',
    tax_amount_minor: overrides.tax_amount_minor ?? '0',
    total_amount_minor: overrides.total_amount_minor ?? '125000',
    amount_paid_minor: overrides.amount_paid_minor ?? '0',
    billing_phone_number: overrides.billing_phone_number ?? null,
    payment_intent_id: overrides.payment_intent_id ?? null,
    issued_at: overrides.issued_at ?? new Date('2026-05-15T07:00:00.000Z'),
    due_at: overrides.due_at ?? new Date('2026-05-22T07:00:00.000Z'),
    paid_at: overrides.paid_at ?? null,
    voided_at: overrides.voided_at ?? null,
    metadata: overrides.metadata ?? {
      student_id: '00000000-0000-0000-0000-000000000802',
      student_name: 'Jane Learner',
    },
    created_at: overrides.created_at ?? new Date('2026-05-15T07:00:00.000Z'),
    updated_at: overrides.updated_at ?? new Date('2026-05-15T07:00:00.000Z'),
  });

test('BillingService provisions a plan-backed subscription', async () => {
  const requestContext = new RequestContextService();
  let expiredTenantId: string | null = null;
  const databaseServiceStub = {
    withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
  };

  const service = new BillingService(
    requestContext,
    databaseServiceStub as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({
        lifecycle_state: 'TRIAL',
        access_mode: 'full',
        warning_starts_at: new Date('2026-04-20T00:00:00.000Z').toISOString(),
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        renewal_required: false,
      }),
      ensureCurrentLifecycle: async () => ({
        subscription: null,
        overview: null,
      }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {
      acquireTenantMutationLock: async (): Promise<void> => undefined,
      expireCurrentSubscriptions: async (tenantId: string): Promise<void> => {
        expiredTenantId = tenantId;
      },
      createSubscription: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000101',
        tenant_id: 'tenant-a',
        plan_code: input.plan_code,
        status: input.status,
        billing_phone_number: input.billing_phone_number,
        currency_code: input.currency_code,
        features: input.features,
        limits: input.limits,
        seats_allocated: input.seats_allocated,
        current_period_start: new Date(String(input.current_period_start)),
        current_period_end: new Date(String(input.current_period_end)),
        trial_ends_at: input.trial_ends_at ? new Date(String(input.trial_ends_at)) : null,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        activated_at: null,
        canceled_at: null,
        last_invoice_at: null,
        metadata: input.metadata,
        created_at: new Date('2026-04-26T10:00:00.000Z'),
        updated_at: new Date('2026-04-26T10:00:00.000Z'),
      }),
      findCurrentByTenant: async () => null,
      lockCurrentByTenant: async () => null,
      findById: async () => null,
      markPastDue: async (): Promise<void> => undefined,
      markInvoiceIssued: async (): Promise<void> => undefined,
      restoreRenewedSubscription: async () => ({
        id: '00000000-0000-0000-0000-000000000101',
      }),
      markInvoicePaid: async (): Promise<void> => undefined,
    } as never,
    {} as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-bill-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/subscriptions',
      started_at: '2026-04-26T00:00:00.000Z',
    },
    () =>
      service.createSubscription({
        plan_code: 'trial',
        billing_phone_number: '254700000001',
        seats_allocated: 3,
        metadata: { source: 'test' },
      }),
  );

  assert.equal(expiredTenantId, 'tenant-a');
  assert.equal(response.plan_code, 'trial');
  assert.equal(response.status, 'trialing');
  assert.equal(response.lifecycle_state, 'TRIAL');
  assert.ok(response.features.includes('students'));
});

test('UsageMeterService records usage against the current subscription period', async () => {
  const requestContext = new RequestContextService();
  const databaseServiceStub = {
    withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
  };
  const activeSubscription = {
    id: '00000000-0000-0000-0000-000000000201',
    tenant_id: 'tenant-a',
    plan_code: 'starter',
    status: 'active',
    billing_phone_number: null,
    currency_code: 'KES',
    features: ['students', 'billing.mpesa'],
    limits: {},
    seats_allocated: 1,
    current_period_start: new Date('2026-04-01T00:00:00.000Z'),
    current_period_end: new Date('2026-05-01T00:00:00.000Z'),
    trial_ends_at: null,
    grace_period_ends_at: null,
    restricted_at: null,
    suspended_at: null,
    suspension_reason: null,
    activated_at: new Date('2026-04-01T00:00:00.000Z'),
    canceled_at: null,
    last_invoice_at: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  const accessService = {
    resolveForTenant: async () => ({
      subscription_id: activeSubscription.id,
      plan_code: activeSubscription.plan_code,
      status: activeSubscription.status,
      lifecycle_state: 'ACTIVE',
      access_mode: 'full',
      features: activeSubscription.features,
      limits: activeSubscription.limits,
      current_period_start: activeSubscription.current_period_start.toISOString(),
      current_period_end: activeSubscription.current_period_end.toISOString(),
      warning_starts_at: null,
      grace_period_ends_at: null,
      restricted_at: null,
      suspended_at: null,
      suspension_reason: null,
      renewal_required: false,
      is_active: true,
    }),
    hasFeature: (_access: unknown, feature: string) =>
      activeSubscription.features.includes(feature),
  };

  const service = new UsageMeterService(
    requestContext,
    databaseServiceStub as never,
    accessService as never,
    {
      findCurrentByTenant: async () => activeSubscription,
      lockCurrentByTenant: async () => activeSubscription,
    } as never,
    {
      findByIdempotencyKey: async () => null,
      createUsageRecord: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000301',
        tenant_id: input.tenant_id,
        subscription_id: input.subscription_id,
        feature_key: input.feature_key,
        quantity: input.quantity,
        unit: input.unit,
        idempotency_key: input.idempotency_key,
        recorded_at: new Date(String(input.recorded_at)),
        period_start: new Date(String(input.period_start)),
        period_end: new Date(String(input.period_end)),
        metadata: input.metadata,
        created_at: new Date('2026-04-26T10:05:00.000Z'),
        updated_at: new Date('2026-04-26T10:05:00.000Z'),
      }),
      summarizeUsage: async () => [],
      getTotalQuantity: async () => '0',
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-bill-2',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/usage',
      started_at: '2026-04-26T00:00:00.000Z',
      billing: {
        subscription_id: activeSubscription.id,
        plan_code: activeSubscription.plan_code,
        status: activeSubscription.status,
        lifecycle_state: 'ACTIVE',
        access_mode: 'full',
        features: activeSubscription.features,
        limits: activeSubscription.limits,
        current_period_start: activeSubscription.current_period_start.toISOString(),
        current_period_end: activeSubscription.current_period_end.toISOString(),
        warning_starts_at: null,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        renewal_required: false,
        is_active: true,
      },
    },
    () =>
      service.recordUsage({
        feature_key: 'students.created',
        quantity: '1',
        idempotency_key: 'usage-1',
        metadata: { student_id: 'student-1' },
      }),
  );

  assert.equal(response.feature_key, 'students.created');
  assert.equal(response.subscription_id, activeSubscription.id);
});

test('BillingMpesaService creates a separate MPESA payment intent for an invoice', async () => {
  const requestContext = new RequestContextService();
  let requestedMpesaPayload: Record<string, unknown> | null = null;
  const databaseServiceStub = {
    withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
  };

  const service = new BillingMpesaService(
    requestContext,
    databaseServiceStub as never,
    {
      resolveForTenant: async () => ({
        subscription_id: '00000000-0000-0000-0000-000000000201',
        plan_code: 'starter',
        status: 'active',
        lifecycle_state: 'ACTIVE',
        access_mode: 'full',
        features: ['students', 'billing.mpesa'],
        limits: {},
        current_period_start: new Date('2026-04-01T00:00:00.000Z').toISOString(),
        current_period_end: new Date('2026-05-01T00:00:00.000Z').toISOString(),
        warning_starts_at: null,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        renewal_required: false,
        is_active: true,
      }),
      hasFeature: (_access: unknown, feature: string) => feature === 'billing.mpesa',
    } as never,
    {
      lockById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        subscription_id: '00000000-0000-0000-0000-000000000201',
        invoice_number: 'INV-20260426-ABCD1234',
        status: 'open',
        currency_code: 'KES',
        description: 'Starter plan April 2026',
        subtotal_amount_minor: '150000',
        tax_amount_minor: '0',
        total_amount_minor: '150000',
        amount_paid_minor: '0',
        billing_phone_number: '254700000001',
        payment_intent_id: null,
        issued_at: new Date('2026-04-26T00:00:00.000Z'),
        due_at: new Date('2026-05-03T00:00:00.000Z'),
        paid_at: null,
        voided_at: null,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      }),
      markPaymentInitiated: async (
        _tenantId: string,
        _invoiceId: string,
        paymentIntentId: string,
      ) => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        subscription_id: '00000000-0000-0000-0000-000000000201',
        invoice_number: 'INV-20260426-ABCD1234',
        status: 'pending_payment',
        currency_code: 'KES',
        description: 'Starter plan April 2026',
        subtotal_amount_minor: '150000',
        tax_amount_minor: '0',
        total_amount_minor: '150000',
        amount_paid_minor: '0',
        billing_phone_number: '254700000001',
        payment_intent_id: paymentIntentId,
        issued_at: new Date('2026-04-26T00:00:00.000Z'),
        due_at: new Date('2026-05-03T00:00:00.000Z'),
        paid_at: null,
        voided_at: null,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      }),
    } as never,
    {
      createPlatformPaymentIntent: async (payload: Record<string, unknown>) => {
        requestedMpesaPayload = payload;
        return {
          payment_intent_id: '00000000-0000-0000-0000-000000000501',
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-bill-3',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['*:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/invoices/payment-intents',
      started_at: '2026-04-26T00:00:00.000Z',
      billing: {
        subscription_id: '00000000-0000-0000-0000-000000000201',
        plan_code: 'starter',
        status: 'active',
        lifecycle_state: 'ACTIVE',
        access_mode: 'full',
        features: ['students', 'billing.mpesa'],
        limits: {},
        current_period_start: new Date('2026-04-01T00:00:00.000Z').toISOString(),
        current_period_end: new Date('2026-05-01T00:00:00.000Z').toISOString(),
        warning_starts_at: null,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        renewal_required: false,
        is_active: true,
      },
    },
    () =>
      service.createInvoicePaymentIntent(
        '00000000-0000-0000-0000-000000000401',
        {
          idempotency_key: 'invoice-pay-1',
          phone_number: '254700000001',
        },
      ),
  );

  assert.equal(response.status, 'pending_payment');
  assert.equal(response.payment_intent_id, '00000000-0000-0000-0000-000000000501');
  assert.ok(requestedMpesaPayload);
  const mpesaPayload = requestedMpesaPayload as { external_reference: string };
  assert.equal(
    mpesaPayload.external_reference,
    '00000000-0000-0000-0000-000000000401',
  );
});

test('BillingService delegates completed student-fee payment intents to the allocation service', async () => {
  const requestContext = new RequestContextService();
  let allocatedInput: Record<string, unknown> | null = null;
  let legacyInvoiceLookupCount = 0;
  const allocationService = {
    allocateConfirmedPayment: async (input: Record<string, unknown>) => {
      allocatedInput = input;
      return {
        duplicate: false,
        allocated_amount_minor: '10000',
        credit_amount_minor: '0',
        invoice_allocations: [{ invoice_id: 'invoice-1', amount_minor: '10000' }],
      };
    },
  } as unknown as StudentFeePaymentAllocationService;

  const service = new BillingService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback() } as never,
    { invalidateTenant: async (): Promise<void> => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      lockByPaymentIntentId: async () => {
        legacyInvoiceLookupCount += 1;
        return null;
      },
    } as never,
    allocationService,
  );

  await service.handlePaymentIntentCompleted(
    'tenant-a',
    'payment-intent-1',
    '10000',
    {
      id: 'payment-intent-1',
      tenant_id: 'tenant-a',
      student_id: 'student-1',
      user_id: 'parent-1',
      external_reference: 'invoice-1',
      account_reference: 'INV-001',
      amount_minor: '10000',
      ledger_transaction_id: 'ledger-1',
      metadata: { parent_user_id: 'parent-1' },
    },
    'ledger-1',
  );

  assert.equal(
    (allocatedInput as { paymentIntent?: { student_id?: string } } | null)?.paymentIntent?.student_id,
    'student-1',
  );
  assert.equal(legacyInvoiceLookupCount, 0);
});

test('ManualFeePaymentService keeps cheque receipts pending until the accountant clears them', async () => {
  const requestContext = new RequestContextService();
  let transactionPostCount = 0;
  let allocationCount = 0;

  const service = new ManualFeePaymentService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback() } as never,
    {
      create: async (input: Record<string, unknown>) =>
        makeManualFeePayment({
          id: '00000000-0000-0000-0000-000000000701',
          tenant_id: String(input.tenant_id),
          student_id: String(input.student_id),
          payment_method: 'cheque',
          status: 'received',
          amount_minor: String(input.amount_minor),
          cheque_number: String(input.cheque_number),
          drawer_bank: String(input.drawer_bank),
          receipt_number: String(input.receipt_number),
        }),
      list: async () => [],
      findById: async () => null,
      lockById: async () => null,
      markDeposited: async () => makeManualFeePayment(),
      markCleared: async () => makeManualFeePayment(),
      markBounced: async () => makeManualFeePayment(),
      markReversed: async () => makeManualFeePayment(),
      createAllocation: async () => {
        allocationCount += 1;
        return { id: 'allocation-1' };
      },
      listAllocations: async () => [],
    } as never,
    {
      findStudentFeeInvoicesForAllocation: async () => [],
      applyManualFeeInvoicePayment: async () => {
        allocationCount += 1;
        return {};
      },
      reverseManualFeeInvoicePayment: async () => ({}),
    } as never,
    {
      findByCode: async () => {
        throw new Error('cheque creation must not look up ledger accounts');
      },
    } as never,
    {
      postTransaction: async () => {
        transactionPostCount += 1;
        return { transaction_id: 'ledger-1' };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-manual-cheque-received',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-manual',
      permissions: ['billing:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/manual-fee-payments',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () =>
      service.createManualFeePayment({
        idempotency_key: 'cheque-receipt-1',
        payment_method: 'cheque',
        amount_minor: '125000',
        student_id: '00000000-0000-0000-0000-000000000801',
        cheque_number: '000231',
        drawer_bank: 'KCB Bank',
        payer_name: 'Parent One',
        notes: 'Term 2 fees by cheque',
      }),
  );

  assert.equal(response.status, 'received');
  assert.equal(response.payment_method, 'cheque');
  assert.equal(response.ledger_transaction_id, null);
  assert.equal(transactionPostCount, 0);
  assert.equal(allocationCount, 0);
});

test('ManualFeePaymentService clears a cheque once, posts the ledger, and allocates the student invoice', async () => {
  const requestContext = new RequestContextService();
  const bankAccount = {
    id: '00000000-0000-0000-0000-000000000901',
    code: '1120-BANK-CLEARING',
    name: 'Bank clearing',
    currency_code: 'KES',
  };
  const feesAccount = {
    id: '00000000-0000-0000-0000-000000000902',
    code: '1100-AR-FEES',
    name: 'Fees receivable',
    currency_code: 'KES',
  };
  let ledgerReference: string | null = null;
  let appliedInvoiceAmount: string | null = null;
  let allocationPaymentId: string | null = null;

  const existingPayment = makeManualFeePayment({
    id: '00000000-0000-0000-0000-000000000702',
    tenant_id: 'tenant-a',
    student_id: '00000000-0000-0000-0000-000000000802',
    payment_method: 'cheque',
    status: 'deposited',
    amount_minor: '125000',
    receipt_number: 'RCT-20260515-CHEQUE1',
    cheque_number: '000232',
    drawer_bank: 'Equity Bank',
  });

  const service = new ManualFeePaymentService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback() } as never,
    {
      create: async () => existingPayment,
      list: async () => [],
      findById: async () => existingPayment,
      lockById: async () => existingPayment,
      markDeposited: async () => existingPayment,
      markCleared: async (_tenantId: string, _paymentId: string, input: Record<string, unknown>) =>
        makeManualFeePayment({
          ...existingPayment,
          status: 'cleared',
          ledger_transaction_id: String(input.ledger_transaction_id),
          cleared_at: new Date('2026-05-15T09:00:00.000Z'),
        }),
      markBounced: async () => existingPayment,
      markReversed: async () => existingPayment,
      createAllocation: async (input: Record<string, unknown>) => {
        allocationPaymentId = String(input.manual_payment_id);
        return { id: 'allocation-1' };
      },
      listAllocations: async () => [],
    } as never,
    {
      findStudentFeeInvoicesForAllocation: async () => [
        {
          id: '00000000-0000-0000-0000-000000000811',
          tenant_id: 'tenant-a',
          status: 'open',
          total_amount_minor: '125000',
          amount_paid_minor: '0',
          metadata: { student_id: '00000000-0000-0000-0000-000000000802' },
        },
      ],
      applyManualFeeInvoicePayment: async (input: { amountMinor: string; nextStatus: string }) => {
        appliedInvoiceAmount = input.amountMinor;
        assert.equal(input.nextStatus, 'paid');
        return {};
      },
      reverseManualFeeInvoicePayment: async () => ({}),
    } as never,
    {
      findByCode: async (_tenantId: string, accountCode: string) =>
        accountCode === bankAccount.code ? bankAccount : feesAccount,
    } as never,
    {
      postTransaction: async (input: { reference: string; entries: Array<{ direction: string; amount_minor: string }> }) => {
        ledgerReference = input.reference;
        assert.deepEqual(
          input.entries.map((entry) => [entry.direction, entry.amount_minor]),
          [
            ['debit', '125000'],
            ['credit', '125000'],
          ],
        );
        return { transaction_id: '00000000-0000-0000-0000-000000000920' };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-manual-cheque-clear',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-manual-clear',
      permissions: ['billing:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/manual-fee-payments/00000000-0000-0000-0000-000000000702/clear',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () =>
      service.clearManualFeePayment('00000000-0000-0000-0000-000000000702', {
        occurred_at: '2026-05-15T09:00:00.000Z',
        deposit_reference: 'DEP-7788',
      }),
  );

  assert.equal(response.status, 'cleared');
  assert.equal(response.ledger_transaction_id, '00000000-0000-0000-0000-000000000920');
  assert.equal(ledgerReference, 'MANUAL-RCT-20260515-CHEQUE1');
  assert.equal(appliedInvoiceAmount, '125000');
  assert.equal(allocationPaymentId, '00000000-0000-0000-0000-000000000702');
});

test('ManualFeePaymentService reverses a cleared cheque and restores the invoice balance', async () => {
  const requestContext = new RequestContextService();
  const bankAccount = {
    id: '00000000-0000-0000-0000-000000000931',
    code: '1120-BANK-CLEARING',
    name: 'Bank clearing',
    currency_code: 'KES',
  };
  const feesAccount = {
    id: '00000000-0000-0000-0000-000000000932',
    code: '1100-AR-FEES',
    name: 'Fees receivable',
    currency_code: 'KES',
  };
  let reversedInvoicePayment: string | null = null;
  let reversalReference: string | null = null;
  const clearedPayment = makeManualFeePayment({
    id: '00000000-0000-0000-0000-000000000703',
    tenant_id: 'tenant-a',
    student_id: '00000000-0000-0000-0000-000000000803',
    payment_method: 'cheque',
    status: 'cleared',
    amount_minor: '90000',
    receipt_number: 'RCT-20260515-CHEQUE2',
    ledger_transaction_id: '00000000-0000-0000-0000-000000000933',
  });

  const service = new ManualFeePaymentService(
    requestContext,
    { withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback() } as never,
    {
      create: async () => clearedPayment,
      list: async () => [],
      findById: async () => clearedPayment,
      lockById: async () => clearedPayment,
      markDeposited: async () => clearedPayment,
      markCleared: async () => clearedPayment,
      markBounced: async () => clearedPayment,
      markReversed: async (_tenantId: string, _paymentId: string, input: Record<string, unknown>) =>
        makeManualFeePayment({
          ...clearedPayment,
          status: 'reversed',
          reversal_ledger_transaction_id: String(input.reversal_ledger_transaction_id),
        }),
      createAllocation: async () => ({ id: 'allocation-1' }),
      listAllocations: async () => [
        {
          id: 'allocation-1',
          invoice_id: '00000000-0000-0000-0000-000000000812',
          amount_minor: '90000',
          allocation_type: 'invoice',
        },
      ],
    } as never,
    {
      findStudentFeeInvoicesForAllocation: async () => [],
      applyManualFeeInvoicePayment: async () => ({}),
      reverseManualFeeInvoicePayment: async (input: { amountMinor: string; nextStatus: string }) => {
        reversedInvoicePayment = input.amountMinor;
        assert.equal(input.nextStatus, 'open');
        return {};
      },
    } as never,
    {
      findByCode: async (_tenantId: string, accountCode: string) =>
        accountCode === bankAccount.code ? bankAccount : feesAccount,
    } as never,
    {
      postTransaction: async (input: { reference: string; entries: Array<{ direction: string; amount_minor: string }> }) => {
        reversalReference = input.reference;
        assert.deepEqual(
          input.entries.map((entry) => [entry.direction, entry.amount_minor]),
          [
            ['debit', '90000'],
            ['credit', '90000'],
          ],
        );
        return { transaction_id: '00000000-0000-0000-0000-000000000934' };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-manual-cheque-reverse',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-manual-reverse',
      permissions: ['billing:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/manual-fee-payments/00000000-0000-0000-0000-000000000703/reverse',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () =>
      service.reverseManualFeePayment('00000000-0000-0000-0000-000000000703', {
        occurred_at: '2026-05-15T10:00:00.000Z',
        notes: 'Cheque returned unpaid by bank',
      }),
  );

  assert.equal(response.status, 'reversed');
  assert.equal(response.reversal_ledger_transaction_id, '00000000-0000-0000-0000-000000000934');
  assert.equal(reversedInvoicePayment, '90000');
  assert.equal(reversalReference, 'REV-MANUAL-RCT-20260515-CHEQUE2');
});

test('BillingService creates an active fee structure with computed line item totals', async () => {
  const requestContext = new RequestContextService();
  let createdInput: Record<string, unknown> | null = null;

  const service = new BillingService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    {
      create: async (input: Record<string, unknown>) => {
        createdInput = input;
        return {
          id: '00000000-0000-0000-0000-000000000901',
          ...input,
          created_at: new Date('2026-05-15T09:00:00.000Z'),
          updated_at: new Date('2026-05-15T09:00:00.000Z'),
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-create-fee-structure',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-create-fee-structure',
      permissions: ['billing:write'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/billing/fee-structures',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () =>
      service.createFeeStructure({
        name: 'Grade 8 Term 2 Fees',
        academic_year: '2026',
        term: 'Term 2',
        grade_level: 'Grade 8',
        class_name: 'Unity',
        due_days: 21,
        status: 'active',
        line_items: [
          { code: 'tuition', label: 'Tuition', amount_minor: '100000' },
          { code: 'activity', label: 'Activity fee', amount_minor: '25000' },
        ],
        metadata: { board_approved: true },
      }),
  );

  assert.equal(response.id, '00000000-0000-0000-0000-000000000901');
  assert.equal(response.total_amount_minor, '125000');
  assert.equal(response.status, 'active');
  assert.equal(response.line_items.length, 2);
  const persistedFeeStructureInput = createdInput as unknown as Record<string, unknown>;
  assert.deepEqual(
    {
      tenant_id: persistedFeeStructureInput.tenant_id,
      currency_code: persistedFeeStructureInput.currency_code,
      created_by_user_id: persistedFeeStructureInput.created_by_user_id,
      total_amount_minor: persistedFeeStructureInput.total_amount_minor,
    },
    {
      tenant_id: 'tenant-a',
      currency_code: 'KES',
      created_by_user_id: '00000000-0000-0000-0000-000000000010',
      total_amount_minor: '125000',
    },
  );
});

test('BillingService lists billable roster students for an active fee structure', async () => {
  const requestContext = new RequestContextService();
  const feeStructure = {
    id: '00000000-0000-0000-0000-000000000912',
    tenant_id: 'tenant-a',
    name: 'Grade 8 Term 2 Fees',
    academic_year: '2026',
    term: 'Term 2',
    grade_level: 'Grade 8',
    class_name: 'Unity',
    currency_code: 'KES',
    status: 'active',
    due_days: 14,
    line_items: [{ code: 'tuition', label: 'Tuition', amount_minor: '100000' }],
    total_amount_minor: '100000',
    metadata: {},
    created_by_user_id: '00000000-0000-0000-0000-000000000010',
    created_at: new Date('2026-05-15T09:00:00.000Z'),
    updated_at: new Date('2026-05-15T09:00:00.000Z'),
  };
  let listedScope: Record<string, unknown> | null = null;

  const service = new BillingService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    {
      findById: async () => feeStructure,
      listBillableStudentsForFeeStructure: async (
        tenantId: string,
        scope: Record<string, unknown>,
      ) => {
        listedScope = { tenantId, ...scope };
        return [
          {
            student_id: '00000000-0000-0000-0000-000000000a11',
            student_name: 'Alice Learner',
            admission_number: 'ADM-801',
            grade_level: 'Grade 8',
            class_name: 'Unity',
            guardian_phone: '+254700000001',
          },
          {
            student_id: '00000000-0000-0000-0000-000000000b22',
            student_name: 'Brian Learner',
            admission_number: 'ADM-802',
            grade_level: 'Grade 8',
            class_name: 'Unity',
            guardian_phone: null,
          },
        ];
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-list-billable-students',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-list-billable-students',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: `/billing/fee-structures/${feeStructure.id}/billable-students`,
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.listBillableStudentsForFeeStructure(feeStructure.id),
  );

  assert.deepEqual(listedScope, {
    tenantId: 'tenant-a',
    grade_level: 'Grade 8',
    class_name: 'Unity',
  });
  assert.deepEqual(
    response.map((student) => ({
      student_id: student.student_id,
      student_name: student.student_name,
      admission_number: student.admission_number,
      grade_level: student.grade_level,
      class_name: student.class_name,
      guardian_phone: student.guardian_phone,
    })),
    [
      {
        student_id: '00000000-0000-0000-0000-000000000a11',
        student_name: 'Alice Learner',
        admission_number: 'ADM-801',
        grade_level: 'Grade 8',
        class_name: 'Unity',
        guardian_phone: '+254700000001',
      },
      {
        student_id: '00000000-0000-0000-0000-000000000b22',
        student_name: 'Brian Learner',
        admission_number: 'ADM-802',
        grade_level: 'Grade 8',
        class_name: 'Unity',
        guardian_phone: null,
      },
    ],
  );
});

test('BillingService archives fee structures so corrected class billing can replace them', async () => {
  const requestContext = new RequestContextService();
  const archivedFeeStructure = {
    id: '00000000-0000-0000-0000-000000000913',
    tenant_id: 'tenant-a',
    name: 'Grade 8 Term 2 Fees',
    academic_year: '2026',
    term: 'Term 2',
    grade_level: 'Grade 8',
    class_name: 'Unity',
    currency_code: 'KES',
    status: 'archived',
    due_days: 14,
    line_items: [{ code: 'tuition', label: 'Tuition', amount_minor: '100000' }],
    total_amount_minor: '100000',
    metadata: { archived_reason: 'Wrong transport amount' },
    created_by_user_id: '00000000-0000-0000-0000-000000000010',
    created_at: new Date('2026-05-15T09:00:00.000Z'),
    updated_at: new Date('2026-05-15T09:20:00.000Z'),
  };
  let archivedTenantId: string | null = null;
  let archivedStructureId: string | null = null;
  let invalidatedTenant: string | null = null;

  const service = new BillingService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      invalidateTenant: async (tenantId: string): Promise<void> => {
        invalidatedTenant = tenantId;
      },
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    {
      archive: async (tenantId: string, feeStructureId: string) => {
        archivedTenantId = tenantId;
        archivedStructureId = feeStructureId;
        return archivedFeeStructure;
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-archive-fee-structure',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-archive-fee-structure',
      permissions: ['billing:write'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: `/billing/fee-structures/${archivedFeeStructure.id}/archive`,
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.archiveFeeStructure(archivedFeeStructure.id),
  );

  assert.equal(archivedTenantId, 'tenant-a');
  assert.equal(archivedStructureId, archivedFeeStructure.id);
  assert.equal(invalidatedTenant, 'tenant-a');
  assert.equal(response.status, 'archived');
  assert.equal(response.id, archivedFeeStructure.id);
});

test('BillingService bulk-generates fee invoices and skips duplicate active student billing', async () => {
  const requestContext = new RequestContextService();
  const studentA = '00000000-0000-0000-0000-000000000a01';
  const studentB = '00000000-0000-0000-0000-000000000b02';
  const feeStructure = {
    id: '00000000-0000-0000-0000-000000000902',
    tenant_id: 'tenant-a',
    name: 'Grade 8 Term 2 Fees',
    academic_year: '2026',
    term: 'Term 2',
    grade_level: 'Grade 8',
    class_name: 'Unity',
    currency_code: 'KES',
    status: 'active',
    due_days: 14,
    line_items: [
      { code: 'tuition', label: 'Tuition', amount_minor: '100000' },
      { code: 'activity', label: 'Activity fee', amount_minor: '25000' },
    ],
    total_amount_minor: '125000',
    metadata: {},
    created_by_user_id: '00000000-0000-0000-0000-000000000010',
    created_at: new Date('2026-05-15T09:00:00.000Z'),
    updated_at: new Date('2026-05-15T09:00:00.000Z'),
  };
  const existingInvoice = makeInvoice({
    id: '00000000-0000-0000-0000-000000000903',
    metadata: {
      billing_reason: 'fee_structure_bulk_generation',
      fee_structure_id: feeStructure.id,
      student_id: studentB,
      student_name: 'Brian Learner',
    },
  });
  const createdInputs: Record<string, unknown>[] = [];
  let lockCount = 0;
  let markedInvoiceIssued = 0;
  let invalidatedTenant: string | null = null;

  const service = new BillingService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      invalidateTenant: async (tenantId: string): Promise<void> => {
        invalidatedTenant = tenantId;
      },
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {
      acquireTenantMutationLock: async (): Promise<void> => {
        lockCount += 1;
      },
      lockCurrentByTenant: async () => ({
        id: '00000000-0000-0000-0000-000000000904',
        tenant_id: 'tenant-a',
        plan_code: 'growth',
        status: 'active',
        billing_phone_number: '+254700000001',
        currency_code: 'KES',
        features: [],
        limits: {},
        seats_allocated: 1,
        current_period_start: new Date('2026-05-01T00:00:00.000Z'),
        current_period_end: new Date('2026-05-31T00:00:00.000Z'),
        trial_ends_at: null,
        grace_period_ends_at: null,
        restricted_at: null,
        suspended_at: null,
        suspension_reason: null,
        activated_at: new Date('2026-05-01T00:00:00.000Z'),
        canceled_at: null,
        last_invoice_at: null,
        metadata: {},
        created_at: new Date('2026-05-01T00:00:00.000Z'),
        updated_at: new Date('2026-05-01T00:00:00.000Z'),
      }),
      markInvoiceIssued: async (): Promise<void> => {
        markedInvoiceIssued += 1;
      },
    } as never,
    {
      listInvoices: async () => [existingInvoice],
      createInvoice: async (input: Record<string, unknown>) => {
        createdInputs.push(input);
        return makeInvoice({
          id: '00000000-0000-0000-0000-000000000905',
          subscription_id: String(input.subscription_id),
          invoice_number: String(input.invoice_number),
          description: String(input.description),
          subtotal_amount_minor: String(input.subtotal_amount_minor),
          total_amount_minor: String(input.total_amount_minor),
          billing_phone_number: input.billing_phone_number
            ? String(input.billing_phone_number)
            : null,
          issued_at: new Date(String(input.issued_at)),
          due_at: new Date(String(input.due_at)),
          metadata: input.metadata as Record<string, unknown>,
        });
      },
    } as never,
    undefined,
    undefined,
    {
      findById: async () => feeStructure,
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-bulk-fee-invoices',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-bulk-fee-invoices',
      permissions: ['billing:write'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: `/billing/fee-structures/${feeStructure.id}/generate-invoices`,
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () =>
      service.bulkGenerateFeeInvoices({
        fee_structure_id: feeStructure.id,
        idempotency_key: 'term-2-grade-8-unity',
        due_at: '2026-06-01T00:00:00.000Z',
        target_students: [
          {
            student_id: studentA,
            student_name: 'Alice Learner',
            admission_number: 'ADM-001',
          },
          {
            student_id: studentB,
            student_name: 'Brian Learner',
            admission_number: 'ADM-002',
          },
        ],
      }),
  );

  assert.equal(lockCount, 1);
  assert.equal(markedInvoiceIssued, 1);
  assert.equal(invalidatedTenant, 'tenant-a');
  assert.equal(response.generated_count, 1);
  assert.equal(response.skipped_count, 1);
  assert.equal(response.invoices[0].metadata.student_id, studentA);
  assert.equal(response.invoices[0].metadata.fee_structure_id, feeStructure.id);
  assert.equal(response.invoices[0].metadata.idempotency_key, 'term-2-grade-8-unity');
  assert.equal(response.invoices[0].total_amount_minor, '125000');
  assert.deepEqual(
    response.skipped.map((row) => ({
      student_id: row.student_id,
      student_name: row.student_name,
      reason: row.reason,
      invoice_id: row.invoice_id,
    })),
    [
      {
        student_id: studentB,
        student_name: 'Brian Learner',
        reason: 'active_invoice_exists',
        invoice_id: existingInvoice.id,
      },
    ],
  );
  assert.equal(createdInputs.length, 1);
  assert.deepEqual(
    (createdInputs[0].metadata as Record<string, unknown>).line_items,
    feeStructure.line_items,
  );
});

test('BillingService lists persisted finance activity from invoices and fee receipts', async () => {
  const requestContext = new RequestContextService();
  const invoice = makeInvoice({
    invoice_number: 'INV-20260515-000001',
    issued_at: new Date('2026-05-15T07:00:00.000Z'),
    metadata: {
      student_id: '00000000-0000-0000-0000-000000000802',
      student_name: 'Jane Learner',
    },
  });
  const receipt = makeManualFeePayment({
    receipt_number: 'RCT-20260515-MPESA001',
    payment_method: 'mpesa_c2b',
    status: 'cleared',
    student_id: '00000000-0000-0000-0000-000000000802',
    invoice_id: invoice.id,
    amount_minor: '50000',
    received_at: new Date('2026-05-15T09:00:00.000Z'),
    external_reference: 'QF12345678',
    ledger_transaction_id: '00000000-0000-0000-0000-000000000804',
  });

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async () => [invoice],
    } as never,
    undefined,
    {
      list: async () => [receipt],
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-finance-activity',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-finance-activity',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/billing/finance-activity',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.listFinanceActivity(),
  );

  assert.equal(response.length, 2);
  assert.equal(response[0].kind, 'receipt');
  assert.equal(response[0].reference, 'QF12345678');
  assert.equal(response[0].method, 'mpesa_c2b');
  assert.equal(response[0].ledger_transaction_id, '00000000-0000-0000-0000-000000000804');
  assert.equal(response[1].kind, 'invoice');
  assert.equal(response[1].reference, 'INV-20260515-000001');
  assert.equal(response[1].student_name, 'Jane Learner');
});

test('BillingService computes student balances from persisted invoices and unapplied credits', async () => {
  const requestContext = new RequestContextService();
  const studentId = '00000000-0000-0000-0000-000000000802';
  const invoice = makeInvoice({
    id: '00000000-0000-0000-0000-000000000611',
    total_amount_minor: '125000',
    amount_paid_minor: '50000',
    issued_at: new Date('2026-05-15T07:00:00.000Z'),
    metadata: {
      student_id: studentId,
      student_name: 'Jane Learner',
    },
  });
  const unappliedCredit = makeManualFeePayment({
    id: '00000000-0000-0000-0000-000000000712',
    payment_method: 'cash',
    status: 'cleared',
    student_id: studentId,
    invoice_id: null,
    amount_minor: '10000',
    received_at: new Date('2026-05-16T07:00:00.000Z'),
    ledger_transaction_id: '00000000-0000-0000-0000-000000000812',
  });

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async () => [invoice],
    } as never,
    undefined,
    {
      list: async () => [unappliedCredit],
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-student-balances',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-student-balances',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/billing/student-balances',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.listStudentBalances(),
  );

  assert.equal(response.length, 1);
  assert.equal(response[0].student_id, studentId);
  assert.equal(response[0].student_name, 'Jane Learner');
  assert.equal(response[0].invoiced_amount_minor, '125000');
  assert.equal(response[0].paid_amount_minor, '50000');
  assert.equal(response[0].credit_amount_minor, '10000');
  assert.equal(response[0].balance_amount_minor, '65000');
  assert.equal(response[0].invoice_count, 1);
});

test('BillingService builds a student fee statement with running balances and pending receipts', async () => {
  const requestContext = new RequestContextService();
  const studentId = '00000000-0000-0000-0000-000000000802';
  const invoice = makeInvoice({
    id: '00000000-0000-0000-0000-000000000621',
    invoice_number: 'INV-20260515-000021',
    total_amount_minor: '125000',
    amount_paid_minor: '40000',
    issued_at: new Date('2026-05-15T07:00:00.000Z'),
    metadata: {
      student_id: studentId,
      student_name: 'Jane Learner',
    },
  });
  const clearedReceipt = makeManualFeePayment({
    id: '00000000-0000-0000-0000-000000000721',
    receipt_number: 'RCT-20260516-CLEARED1',
    payment_method: 'cash',
    status: 'cleared',
    student_id: studentId,
    invoice_id: invoice.id,
    amount_minor: '40000',
    received_at: new Date('2026-05-16T07:00:00.000Z'),
    cleared_at: new Date('2026-05-16T09:00:00.000Z'),
    ledger_transaction_id: '00000000-0000-0000-0000-000000000821',
  });
  const pendingCheque = makeManualFeePayment({
    id: '00000000-0000-0000-0000-000000000722',
    receipt_number: 'RCT-20260517-PENDING1',
    payment_method: 'cheque',
    status: 'deposited',
    student_id: studentId,
    invoice_id: null,
    amount_minor: '30000',
    received_at: new Date('2026-05-17T07:00:00.000Z'),
    deposited_at: new Date('2026-05-17T08:00:00.000Z'),
    ledger_transaction_id: null,
  });

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async () => [invoice],
    } as never,
    undefined,
    {
      list: async () => [clearedReceipt, pendingCheque],
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-student-statement',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-student-statement',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: `/billing/student-balances/${studentId}/statement`,
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.getStudentStatement(studentId),
  );

  assert.equal(response.summary.student_id, studentId);
  assert.equal(response.summary.balance_amount_minor, '85000');
  assert.equal(response.entries.length, 3);
  assert.deepEqual(
    response.entries.map((entry) => ({
      kind: entry.kind,
      reference: entry.reference,
      debit: entry.debit_amount_minor,
      credit: entry.credit_amount_minor,
      balance: entry.balance_after_minor,
    })),
    [
      {
        kind: 'invoice',
        reference: 'INV-20260515-000021',
        debit: '125000',
        credit: '0',
        balance: '125000',
      },
      {
        kind: 'receipt',
        reference: 'RCT-20260516-CLEARED1',
        debit: '0',
        credit: '40000',
        balance: '85000',
      },
      {
        kind: 'receipt',
        reference: 'RCT-20260517-PENDING1',
        debit: '0',
        credit: '0',
        balance: '85000',
      },
    ],
  );
  assert.equal(response.entries[1].ledger_transaction_id, '00000000-0000-0000-0000-000000000821');
  assert.equal(response.entries[2].description, 'Pending cheque receipt');
});

test('BillingService exports a student fee statement as CSV with a checksum', async () => {
  const requestContext = new RequestContextService();
  const studentId = '00000000-0000-0000-0000-000000000802';
  const invoice = makeInvoice({
    id: '00000000-0000-0000-0000-000000000622',
    invoice_number: 'INV-20260515-000022',
    total_amount_minor: '90000',
    amount_paid_minor: '0',
    issued_at: new Date('2026-05-15T07:00:00.000Z'),
    metadata: {
      student_id: studentId,
      student_name: 'Jane Learner',
    },
  });
  const receipt = makeManualFeePayment({
    id: '00000000-0000-0000-0000-000000000723',
    receipt_number: 'RCT-20260516-CREDIT1',
    payment_method: 'mpesa_c2b',
    status: 'cleared',
    student_id: studentId,
    invoice_id: invoice.id,
    amount_minor: '25000',
    received_at: new Date('2026-05-16T07:00:00.000Z'),
    cleared_at: new Date('2026-05-16T09:00:00.000Z'),
    external_reference: 'QF12345678',
  });

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async () => [invoice],
    } as never,
    undefined,
    {
      list: async () => [receipt],
    } as never,
  );

  const artifact = await requestContext.run(
    {
      request_id: 'req-student-statement-export',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-student-statement-export',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: `/billing/student-balances/${studentId}/statement/export`,
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.exportStudentStatementCsv(studentId),
  );

  assert.equal(artifact.report_id, `student-fee-statement-${studentId}`);
  assert.equal(artifact.filename, `student-fee-statement-${studentId}.csv`);
  assert.equal(artifact.row_count, 2);
  assert.equal(
    artifact.csv,
    'Date,Type,Reference,Description,Status,Method,Debit Minor,Credit Minor,Balance After Minor,Ledger Transaction\r\n2026-05-15T07:00:00.000Z,invoice,INV-20260515-000022,Term 2 fees,open,invoice,90000,0,90000,\r\n2026-05-16T09:00:00.000Z,receipt,RCT-20260516-CREDIT1,Cleared mpesa_c2b receipt,cleared,mpesa_c2b,0,25000,65000,\r\n',
  );
  assert.equal(
    artifact.checksum_sha256,
    createHash('sha256').update(artifact.csv).digest('hex'),
  );
});

test('BillingService builds a finance reconciliation report by date and payment method', async () => {
  const requestContext = new RequestContextService();
  const payments = [
    makeManualFeePayment({
      id: '00000000-0000-0000-0000-000000000731',
      receipt_number: 'RCT-CASH-001',
      payment_method: 'cash',
      status: 'cleared',
      amount_minor: '10000',
      received_at: new Date('2026-05-15T08:00:00.000Z'),
      cleared_at: new Date('2026-05-15T08:05:00.000Z'),
      deposit_reference: 'CASH-DAY-1',
      ledger_transaction_id: '00000000-0000-0000-0000-000000000831',
    }),
    makeManualFeePayment({
      id: '00000000-0000-0000-0000-000000000732',
      receipt_number: 'RCT-CHEQUE-001',
      payment_method: 'cheque',
      status: 'deposited',
      amount_minor: '30000',
      received_at: new Date('2026-05-14T08:00:00.000Z'),
      deposited_at: new Date('2026-05-16T11:00:00.000Z'),
      cheque_number: 'CHQ-001',
      drawer_bank: 'KCB',
    }),
    makeManualFeePayment({
      id: '00000000-0000-0000-0000-000000000733',
      receipt_number: 'RCT-MPESA-001',
      payment_method: 'mpesa_c2b',
      status: 'cleared',
      amount_minor: '40000',
      received_at: new Date('2026-05-16T09:00:00.000Z'),
      cleared_at: new Date('2026-05-16T09:01:00.000Z'),
      external_reference: 'QF12345678',
      ledger_transaction_id: '00000000-0000-0000-0000-000000000833',
    }),
    makeManualFeePayment({
      id: '00000000-0000-0000-0000-000000000734',
      receipt_number: 'RCT-EFT-001',
      payment_method: 'eft',
      status: 'reversed',
      amount_minor: '50000',
      received_at: new Date('2026-05-15T07:00:00.000Z'),
      cleared_at: new Date('2026-05-15T07:05:00.000Z'),
      reversed_at: new Date('2026-05-16T12:00:00.000Z'),
      deposit_reference: 'EFT-REV-1',
      ledger_transaction_id: '00000000-0000-0000-0000-000000000834',
      reversal_ledger_transaction_id: '00000000-0000-0000-0000-000000000835',
    }),
    makeManualFeePayment({
      id: '00000000-0000-0000-0000-000000000735',
      receipt_number: 'RCT-BANK-OUTSIDE',
      payment_method: 'bank_deposit',
      status: 'cleared',
      amount_minor: '70000',
      received_at: new Date('2026-05-17T07:00:00.000Z'),
      cleared_at: new Date('2026-05-17T07:01:00.000Z'),
    }),
  ];

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async () => [],
    } as never,
    undefined,
    {
      list: async () => payments,
    } as never,
  );

  const report = await requestContext.run(
    {
      request_id: 'req-finance-reconciliation',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-finance-reconciliation',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/billing/reconciliation?from=2026-05-15&to=2026-05-16',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () => service.listFinanceReconciliation({ from: '2026-05-15', to: '2026-05-16' }),
  );

  assert.equal(report.period.from, '2026-05-15T00:00:00.000Z');
  assert.equal(report.period.to, '2026-05-16T23:59:59.999Z');
  assert.equal(report.totals.transaction_count, 4);
  assert.equal(report.totals.cleared_amount_minor, '50000');
  assert.equal(report.totals.pending_amount_minor, '30000');
  assert.equal(report.totals.exception_amount_minor, '50000');
  assert.deepEqual(
    report.method_summaries.map((summary) => [
      summary.payment_method,
      summary.transaction_count,
      summary.cleared_amount_minor,
      summary.pending_amount_minor,
      summary.exception_amount_minor,
    ]),
    [
      ['cash', 1, '10000', '0', '0'],
      ['cheque', 1, '0', '30000', '0'],
      ['bank_deposit', 0, '0', '0', '0'],
      ['eft', 1, '0', '0', '50000'],
      ['mpesa_c2b', 1, '40000', '0', '0'],
    ],
  );
  assert.deepEqual(
    report.rows.map((row) => [row.receipt_number, row.status, row.reconciliation_bucket, row.reference]),
    [
      ['RCT-EFT-001', 'reversed', 'exception', 'EFT-REV-1'],
      ['RCT-CHEQUE-001', 'deposited', 'pending', 'CHQ-001'],
      ['RCT-MPESA-001', 'cleared', 'cleared', 'QF12345678'],
      ['RCT-CASH-001', 'cleared', 'cleared', 'CASH-DAY-1'],
    ],
  );
});

test('BillingService exports finance reconciliation as CSV', async () => {
  const requestContext = new RequestContextService();
  const payments = [
    makeManualFeePayment({
      id: '00000000-0000-0000-0000-000000000736',
      receipt_number: 'RCT-MPESA-CSV',
      payment_method: 'mpesa_c2b',
      status: 'cleared',
      amount_minor: '40000',
      received_at: new Date('2026-05-16T09:00:00.000Z'),
      cleared_at: new Date('2026-05-16T09:01:00.000Z'),
      external_reference: 'QFCSV001',
      ledger_transaction_id: '00000000-0000-0000-0000-000000000836',
    }),
  ];

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async () => [],
    } as never,
    undefined,
    {
      list: async () => payments,
    } as never,
  );

  const artifact = await requestContext.run(
    {
      request_id: 'req-finance-reconciliation-export',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'bursar',
      session_id: 'session-finance-reconciliation-export',
      permissions: ['billing:read'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/billing/reconciliation/export?from=2026-05-16&to=2026-05-16&method=mpesa_c2b',
      started_at: '2026-05-15T00:00:00.000Z',
    },
    () =>
      service.exportFinanceReconciliationCsv({
        from: '2026-05-16',
        to: '2026-05-16',
        method: 'mpesa_c2b',
      }),
  );

  assert.equal(artifact.report_id, 'finance-reconciliation');
  assert.equal(artifact.filename, 'finance-reconciliation-2026-05-16-2026-05-16.csv');
  assert.equal(artifact.row_count, 1);
  assert.equal(
    artifact.csv,
    'Occurred At,Receipt,Method,Status,Bucket,Amount Minor,Reference,Payer,Student ID,Invoice ID,Ledger Transaction,Reversal Transaction\r\n2026-05-16T09:01:00.000Z,RCT-MPESA-CSV,mpesa_c2b,cleared,cleared,40000,QFCSV001,,,,00000000-0000-0000-0000-000000000836,\r\n',
  );
  assert.equal(
    artifact.checksum_sha256,
    createHash('sha256').update(artifact.csv).digest('hex'),
  );
});

test('BillingService exports invoices as a server-side CSV artifact with checksum', async () => {
  const requestContext = new RequestContextService();
  let tenantUsed: string | null = null;
  let statusUsed: string | undefined;

  const service = new BillingService(
    requestContext,
    {} as never,
    {
      invalidateTenant: async (): Promise<void> => undefined,
    } as never,
    {
      buildOverview: () => ({}),
      ensureCurrentLifecycle: async () => ({ subscription: null, overview: null }),
      getNextRenewalWindow: () => ({
        start_at: new Date('2026-05-01T00:00:00.000Z'),
        end_at: new Date('2026-05-31T00:00:00.000Z'),
      }),
      toResponse: () => ({}),
    } as never,
    {
      listSubscriptionNotifications: async () => [],
    } as never,
    {} as never,
    {
      listInvoices: async (tenantId: string, status?: string) => {
        tenantUsed = tenantId;
        statusUsed = status;
        return [
          {
            id: '00000000-0000-0000-0000-000000000401',
            tenant_id: tenantId,
            subscription_id: '00000000-0000-0000-0000-000000000201',
            invoice_number: 'INV-20260514-001',
            status: 'open',
            currency_code: 'KES',
            description: 'Growth renewal, May',
            subtotal_amount_minor: '250000',
            tax_amount_minor: '0',
            total_amount_minor: '250000',
            amount_paid_minor: '0',
            billing_phone_number: '+254700000001',
            payment_intent_id: null,
            issued_at: new Date('2026-05-14T08:00:00.000Z'),
            due_at: new Date('2026-05-21T08:00:00.000Z'),
            paid_at: null,
            voided_at: null,
            metadata: {},
            created_at: new Date('2026-05-14T08:00:00.000Z'),
            updated_at: new Date('2026-05-14T08:00:00.000Z'),
          },
        ];
      },
    } as never,
  );

  const artifact = await requestContext.run(
    {
      request_id: 'req-billing-report-export',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'owner',
      session_id: 'session-1',
      permissions: ['billing:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/billing/reports/invoices/export',
      started_at: '2026-05-14T00:00:00.000Z',
    },
    () => service.exportReportCsv('invoices'),
  );

  assert.equal(tenantUsed, 'tenant-a');
  assert.equal(statusUsed, undefined);
  assert.equal(artifact.report_id, 'invoices');
  assert.equal(artifact.filename, 'billing-invoices.csv');
  assert.equal(artifact.content_type, 'text/csv; charset=utf-8');
  assert.equal(artifact.row_count, 1);
  assert.equal(
    artifact.csv,
    'Invoice No,Description,Status,Currency,Total Minor,Paid Minor,Issued At,Due At,Paid At\r\nINV-20260514-001,"Growth renewal, May",open,KES,250000,0,2026-05-14T08:00:00.000Z,2026-05-21T08:00:00.000Z,\r\n',
  );
  assert.equal(
    artifact.checksum_sha256,
    createHash('sha256').update(artifact.csv).digest('hex'),
  );
});

test('BillingService rejects unknown server-side report exports', async () => {
  const requestContext = new RequestContextService();
  const service = new BillingService(
    requestContext,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      listInvoices: async () => {
        throw new Error('invoices should not be loaded for an unknown export');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-billing-report-export-missing',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'owner',
          session_id: 'session-1',
          permissions: ['billing:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'GET',
          path: '/billing/reports/unknown/export',
          started_at: '2026-05-14T00:00:00.000Z',
        },
        () => service.exportReportCsv('unknown'),
      ),
    /Unknown billing report export/,
  );
});

test('BillingLifecycleService computes restricted access after grace period lapses', async () => {
  const lifecycleService = new BillingLifecycleService(
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {} as never,
    {
      queueLifecycleNotifications: async (): Promise<void> => undefined,
    } as never,
    {
      logEvent: (): void => undefined,
    } as never,
  );

  const overview = lifecycleService.buildOverview(
    {
      id: '00000000-0000-0000-0000-000000000601',
      tenant_id: 'tenant-a',
      plan_code: 'starter',
      status: 'restricted',
      billing_phone_number: null,
      currency_code: 'KES',
      features: ['students'],
      limits: {},
      seats_allocated: 1,
      current_period_start: new Date('2026-03-01T00:00:00.000Z'),
      current_period_end: new Date('2026-04-01T00:00:00.000Z'),
      trial_ends_at: null,
      grace_period_ends_at: new Date('2026-04-08T00:00:00.000Z'),
      restricted_at: new Date('2026-04-09T00:00:00.000Z'),
      suspended_at: new Date('2026-04-16T00:00:00.000Z'),
      suspension_reason: 'renewal_required',
      activated_at: new Date('2026-03-01T00:00:00.000Z'),
      canceled_at: null,
      last_invoice_at: new Date('2026-03-25T00:00:00.000Z'),
      metadata: {},
      created_at: new Date('2026-03-01T00:00:00.000Z'),
      updated_at: new Date('2026-04-09T00:00:00.000Z'),
    } as never,
    new Date('2026-04-10T00:00:00.000Z'),
  );

  assert.equal(overview.lifecycle_state, 'RESTRICTED');
  assert.equal(overview.access_mode, 'read_only');
  assert.equal(overview.renewal_required, true);
});

test('BillingLifecycleGuard blocks writes in restricted mode but allows billing routes', async () => {
  const requestContext = new RequestContextService();
  const guard = new BillingLifecycleGuard(requestContext);

  const restrictedContext = {
    request_id: 'req-bill-4',
    tenant_id: 'tenant-a',
    user_id: '00000000-0000-0000-0000-000000000001',
    role: 'owner',
    session_id: 'session-1',
    permissions: ['*:*'],
    is_authenticated: true,
    client_ip: '127.0.0.1',
    user_agent: 'test-suite',
    method: 'POST',
    path: '/students',
    started_at: '2026-04-26T00:00:00.000Z',
    billing: {
      subscription_id: '00000000-0000-0000-0000-000000000201',
      plan_code: 'starter',
      status: 'restricted',
      lifecycle_state: 'RESTRICTED',
      access_mode: 'read_only' as const,
      features: ['students'],
      limits: {},
      current_period_start: '2026-04-01T00:00:00.000Z',
      current_period_end: '2026-05-01T00:00:00.000Z',
      warning_starts_at: '2026-04-26T00:00:00.000Z',
      grace_period_ends_at: '2026-05-08T00:00:00.000Z',
      restricted_at: '2026-05-09T00:00:00.000Z',
      suspended_at: '2026-05-16T00:00:00.000Z',
      suspension_reason: 'renewal_required',
      renewal_required: true,
      is_active: true,
    },
  };

  assert.throws(() =>
    requestContext.run(restrictedContext, () =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ method: 'POST', path: '/students' }),
        }),
      } as never),
    ),
  );

  const allowed = requestContext.run(
    {
      ...restrictedContext,
      method: 'POST',
      path: '/billing/subscriptions/current/renewal-invoice',
    },
    () =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            path: '/billing/subscriptions/current/renewal-invoice',
          }),
        }),
      } as never),
  );

  assert.equal(allowed, true);

  const supportAllowed = requestContext.run(
    {
      ...restrictedContext,
      method: 'POST',
      path: '/support/tickets',
    },
    () =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            path: '/support/tickets',
          }),
        }),
      } as never),
  );

  assert.equal(supportAllowed, true);

  const platformAllowed = requestContext.run(
    {
      ...restrictedContext,
      method: 'POST',
      path: '/platform/schools',
    },
    () =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            path: '/platform/schools',
          }),
        }),
      } as never),
  );

  assert.equal(platformAllowed, true);

  const opsAllowed = requestContext.run(
    {
      ...restrictedContext,
      method: 'GET',
      path: '/ops',
    },
    () =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            path: '/ops',
          }),
        }),
      } as never),
  );

  assert.equal(opsAllowed, true);
});
