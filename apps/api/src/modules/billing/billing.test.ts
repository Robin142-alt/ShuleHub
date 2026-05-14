import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { BillingLifecycleGuard } from '../../guards/billing-lifecycle.guard';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingMpesaService } from './billing-mpesa.service';
import { BillingService } from './billing.service';
import { StudentFeePaymentAllocationService } from './student-fee-payment-allocation.service';
import { UsageMeterService } from './usage-meter.service';

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
      createPaymentIntent: async (payload: Record<string, unknown>) => {
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
