import { Injectable } from '@nestjs/common';

import { BILLING_DEFAULT_CURRENCY_CODE, BILLING_PLAN_CATALOG } from '../modules/billing/billing.constants';
import { SubscriptionsRepository } from '../modules/billing/repositories/subscriptions.repository';
import { LedgerService } from '../modules/finance/ledger.service';
import { PiiEncryptionService } from '../modules/security/pii-encryption.service';
import { DatabaseService } from '../database/database.service';
import { PaymentFactory } from './factories/payment.factory';
import { SeedRuntimeContext } from '../modules/seeder/seeder.types';

interface FeeStructureAmounts {
  tuition_amount_minor: bigint;
  transport_amount_minor: bigint;
  lunch_amount_minor: bigint;
  total_amount_minor: bigint;
}

@Injectable()
export class FinanceSeeder {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly ledgerService: LedgerService,
    private readonly piiEncryptionService: PiiEncryptionService,
    private readonly paymentFactory: PaymentFactory,
  ) {}

  async seed(context: SeedRuntimeContext): Promise<void> {
    await this.databaseService.withRequestTransaction(async () => {
      const subscriptionId = await this.ensureSubscription(context);
      await this.ensureAccounts(context);
      await this.ensureFeeStructures(context);
      await this.ensureInvoicesAndLedger(context, subscriptionId);
      await this.ensureCommunications(context);
      await this.ensureNotifications(context);

      context.summary.counts.accounts = context.registries.account_ids.size;
      context.summary.counts.fee_structures = context.registries.fee_structure_ids.size;
      context.summary.counts.invoices = context.registries.invoice_ids.size;
      context.summary.counts.transactions = await this.countRows('transactions', context.options.tenant);
      context.summary.counts.ledger_entries = await this.countRows('ledger_entries', context.options.tenant);
      context.summary.counts.communication_logs = await this.countRows('communication_logs', context.options.tenant);
      context.summary.counts.notifications = await this.countRows('notifications', context.options.tenant);
    });
  }

  private async ensureSubscription(context: SeedRuntimeContext): Promise<string> {
    const currentSubscription = await this.subscriptionsRepository.lockCurrentByTenant(
      context.options.tenant,
    );
    const plan = BILLING_PLAN_CATALOG[context.options.plan_code];

    if (currentSubscription) {
      await this.databaseService.query(
        `
          UPDATE subscriptions
          SET
            plan_code = $3,
            status = 'active',
            billing_phone_number = $4,
            currency_code = $5,
            features = $6::jsonb,
            limits = $7::jsonb,
            seats_allocated = GREATEST(seats_allocated, 12),
            activated_at = COALESCE(activated_at, NOW()),
            metadata = metadata || $8::jsonb,
            updated_at = NOW()
          WHERE tenant_id = $1
            AND id = $2::uuid
        `,
        [
          context.options.tenant,
          currentSubscription.id,
          plan.code,
          this.piiEncryptionService.encryptNullable(
            '0712345678',
            this.subscriptionBillingPhoneAad(context.options.tenant),
          ),
          BILLING_DEFAULT_CURRENCY_CODE,
          JSON.stringify(plan.features),
          JSON.stringify(plan.limits),
          JSON.stringify({
            seed_key: `${context.seed_key}:subscription`,
          }),
        ],
      );

      context.registries.subscription_id = currentSubscription.id;
      return currentSubscription.id;
    }

    const now = context.now;
    const subscription = await this.subscriptionsRepository.createSubscription({
      tenant_id: context.options.tenant,
      plan_code: plan.code,
      status: 'active',
      billing_phone_number: '0712345678',
      currency_code: BILLING_DEFAULT_CURRENCY_CODE,
      features: [...plan.features],
      limits: { ...plan.limits },
      seats_allocated: 12,
      current_period_start: now.toISOString(),
      current_period_end: new Date(
        now.getTime() + plan.period_days * 24 * 60 * 60 * 1000,
      ).toISOString(),
      trial_ends_at: null,
      activated_at: now.toISOString(),
      metadata: {
        seed_key: `${context.seed_key}:subscription`,
      },
    });

    context.registries.subscription_id = subscription.id;
    return subscription.id;
  }

  private async ensureAccounts(context: SeedRuntimeContext): Promise<void> {
    const accountSeeds = [
      {
        code: '1100-AR-FEES',
        name: 'Accounts Receivable - Student Fees',
        category: 'asset',
        normal_balance: 'debit',
      },
      {
        code: '1110-MPESA-CLEARING',
        name: 'M-Pesa Clearing',
        category: 'asset',
        normal_balance: 'debit',
      },
      {
        code: '4100-TUITION-REVENUE',
        name: 'Tuition Revenue',
        category: 'revenue',
        normal_balance: 'credit',
      },
      {
        code: '4110-TRANSPORT-REVENUE',
        name: 'Transport Revenue',
        category: 'revenue',
        normal_balance: 'credit',
      },
      {
        code: '4120-LUNCH-REVENUE',
        name: 'Lunch Revenue',
        category: 'revenue',
        normal_balance: 'credit',
      },
    ] as const;

    for (const account of accountSeeds) {
      const result = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO accounts (
            tenant_id,
            code,
            name,
            category,
            normal_balance,
            currency_code,
            allow_manual_entries,
            is_active,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, 'KES', TRUE, TRUE, $6::jsonb)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            normal_balance = EXCLUDED.normal_balance,
            currency_code = EXCLUDED.currency_code,
            allow_manual_entries = EXCLUDED.allow_manual_entries,
            is_active = TRUE,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          account.code,
          account.name,
          account.category,
          account.normal_balance,
          JSON.stringify({
            seed_key: `${context.seed_key}:account:${account.code}`,
          }),
        ],
      );

      context.registries.account_ids.set(account.code, result.rows[0].id);
    }
  }

  private async ensureFeeStructures(context: SeedRuntimeContext): Promise<void> {
    if (!context.registries.academic_year_id || !context.registries.active_term_id) {
      throw new Error('Academic year and active term are required before finance seeding');
    }

    for (const [classCode, classId] of context.registries.class_ids.entries()) {
      const amounts = this.feeAmountsForClass(classCode);
      const result = await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO fee_structures (
            tenant_id,
            academic_year_id,
            academic_term_id,
            school_class_id,
            name,
            currency_code,
            tuition_amount_minor,
            transport_amount_minor,
            lunch_amount_minor,
            total_amount_minor,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, 'KES', $6::bigint, $7::bigint, $8::bigint, $9::bigint, $10::jsonb)
          ON CONFLICT (tenant_id, academic_term_id, school_class_id)
          DO UPDATE SET
            name = EXCLUDED.name,
            tuition_amount_minor = EXCLUDED.tuition_amount_minor,
            transport_amount_minor = EXCLUDED.transport_amount_minor,
            lunch_amount_minor = EXCLUDED.lunch_amount_minor,
            total_amount_minor = EXCLUDED.total_amount_minor,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          context.registries.academic_year_id,
          context.registries.active_term_id,
          classId,
          `Term 1 Fee Structure - ${classCode}`,
          amounts.tuition_amount_minor.toString(),
          amounts.transport_amount_minor.toString(),
          amounts.lunch_amount_minor.toString(),
          amounts.total_amount_minor.toString(),
          JSON.stringify({
            seed_key: `${context.seed_key}:fee-structure:${classCode}`,
          }),
        ],
      );

      context.registries.fee_structure_ids.set(classCode, result.rows[0].id);
    }
  }

  private async ensureInvoicesAndLedger(
    context: SeedRuntimeContext,
    subscriptionId: string,
  ): Promise<void> {
    const receivableAccountId = this.requireAccountId(context, '1100-AR-FEES');
    const mpesaAccountId = this.requireAccountId(context, '1110-MPESA-CLEARING');
    const tuitionRevenueAccountId = this.requireAccountId(context, '4100-TUITION-REVENUE');
    const transportRevenueAccountId = this.requireAccountId(context, '4110-TRANSPORT-REVENUE');
    const lunchRevenueAccountId = this.requireAccountId(context, '4120-LUNCH-REVENUE');
    const sortedAdmissions = Array.from(context.registries.student_ids.keys()).sort((left, right) =>
      left.localeCompare(right),
    );

    for (let index = 0; index < sortedAdmissions.length; index += 1) {
      const admissionNumber = sortedAdmissions[index];
      const studentId = context.registries.student_ids.get(admissionNumber);
      const streamCode = context.registries.student_stream_codes.get(admissionNumber);
      const billingPhoneNumber = context.registries.student_primary_guardian_phones.get(
        admissionNumber,
      );

      if (!studentId || !streamCode || !billingPhoneNumber) {
        continue;
      }

      const classCode = context.registries.stream_class_codes.get(streamCode);
      const feeStructureId = classCode ? context.registries.fee_structure_ids.get(classCode) : undefined;

      if (!classCode || !feeStructureId) {
        continue;
      }

      const feeAmounts = this.feeAmountsForClass(classCode);
      const invoiceNumber = `FEE-2026-T1-${admissionNumber}`;
      const dueAt = '2026-02-15T17:00:00.000Z';
      const paymentScenario = this.paymentFactory.buildScenario({
        invoice_number: invoiceNumber,
        total_amount_minor: feeAmounts.total_amount_minor.toString(),
        due_at: dueAt,
        payment_phone_seed: billingPhoneNumber,
        ordinal: index,
      });

      await this.databaseService.query<{ id: string }>(
        `
          INSERT INTO invoices (
            tenant_id,
            subscription_id,
            student_id,
            fee_structure_id,
            invoice_number,
            status,
            currency_code,
            description,
            subtotal_amount_minor,
            tax_amount_minor,
            total_amount_minor,
            amount_paid_minor,
            billing_phone_number,
            issued_at,
            due_at,
            paid_at,
            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'KES',
            $7,
            $8::bigint,
            0,
            $9::bigint,
            $10::bigint,
            $11,
            '2026-01-10T09:00:00.000Z',
            $12::timestamptz,
            $13::timestamptz,
            $14::jsonb
          )
          ON CONFLICT (tenant_id, invoice_number)
          DO UPDATE SET
            subscription_id = EXCLUDED.subscription_id,
            student_id = EXCLUDED.student_id,
            fee_structure_id = EXCLUDED.fee_structure_id,
            status = EXCLUDED.status,
            description = EXCLUDED.description,
            subtotal_amount_minor = EXCLUDED.subtotal_amount_minor,
            total_amount_minor = EXCLUDED.total_amount_minor,
            amount_paid_minor = EXCLUDED.amount_paid_minor,
            billing_phone_number = EXCLUDED.billing_phone_number,
            due_at = EXCLUDED.due_at,
            paid_at = EXCLUDED.paid_at,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id
        `,
        [
          context.options.tenant,
          subscriptionId,
          studentId,
          feeStructureId,
          invoiceNumber,
          paymentScenario.status,
          `CBC fee invoice for ${admissionNumber} - Term 1`,
          feeAmounts.total_amount_minor.toString(),
          feeAmounts.total_amount_minor.toString(),
          paymentScenario.paid_amount_minor,
          this.piiEncryptionService.encryptNullable(
            billingPhoneNumber,
            this.invoiceBillingPhoneAad(context.options.tenant),
          ),
          dueAt,
          paymentScenario.status === 'paid' ? paymentScenario.paid_at : null,
          JSON.stringify({
            seed_key: `${context.seed_key}:invoice:${invoiceNumber}`,
            student_admission_number: admissionNumber,
            invoice_kind: 'student_fee',
            fee_breakdown: {
              tuition_amount_minor: feeAmounts.tuition_amount_minor.toString(),
              transport_amount_minor: feeAmounts.transport_amount_minor.toString(),
              lunch_amount_minor: feeAmounts.lunch_amount_minor.toString(),
            },
            payment_receipt_reference: paymentScenario.receipt_reference,
          }),
        ],
      );

      context.registries.invoice_ids.set(invoiceNumber, invoiceNumber);

      await this.ledgerService.createTransaction({
        reference: `seed:invoice:${invoiceNumber}`,
        description: `Seeded fee invoice ${invoiceNumber}`,
        effective_at: '2026-01-10T09:00:00.000Z',
        posted_at: '2026-01-10T09:00:00.000Z',
        metadata: {
          invoice_number: invoiceNumber,
          student_id: studentId,
          fee_structure_id: feeStructureId,
          seeded: true,
        },
        entries: [
          {
            account_id: receivableAccountId,
            debit: feeAmounts.total_amount_minor.toString(),
            description: `Accounts receivable for ${invoiceNumber}`,
          },
          {
            account_id: tuitionRevenueAccountId,
            credit: feeAmounts.tuition_amount_minor.toString(),
            description: `Tuition revenue for ${invoiceNumber}`,
          },
          {
            account_id: transportRevenueAccountId,
            credit: feeAmounts.transport_amount_minor.toString(),
            description: `Transport revenue for ${invoiceNumber}`,
          },
          {
            account_id: lunchRevenueAccountId,
            credit: feeAmounts.lunch_amount_minor.toString(),
            description: `Lunch revenue for ${invoiceNumber}`,
          },
        ],
      });

      if (BigInt(paymentScenario.paid_amount_minor) > 0n && paymentScenario.payment_reference) {
        await this.ledgerService.createTransaction({
          reference: paymentScenario.payment_reference,
          description: paymentScenario.payment_description ?? `Seeded payment for ${invoiceNumber}`,
          effective_at: paymentScenario.paid_at ?? '2026-02-12T16:00:00.000Z',
          posted_at: paymentScenario.paid_at ?? '2026-02-12T16:00:00.000Z',
          metadata: {
            invoice_number: invoiceNumber,
            student_id: studentId,
            receipt_reference: paymentScenario.receipt_reference,
            seeded: true,
          },
          entries: [
            {
              account_id: mpesaAccountId,
              debit: paymentScenario.paid_amount_minor,
              description: `M-Pesa receipt for ${invoiceNumber}`,
            },
            {
              account_id: receivableAccountId,
              credit: paymentScenario.paid_amount_minor,
              description: `Receivable settlement for ${invoiceNumber}`,
            },
          ],
        });
      }
    }
  }

  private async ensureCommunications(context: SeedRuntimeContext): Promise<void> {
    const overdueInvoices = await this.databaseService.query<{
      invoice_number: string;
      student_id: string;
      guardian_id: string | null;
      billing_phone_number: string | null;
    }>(
      `
        SELECT
          i.invoice_number,
          i.student_id::text,
          sg.guardian_id::text,
          i.billing_phone_number
        FROM invoices i
        LEFT JOIN student_guardians sg
          ON sg.tenant_id = i.tenant_id
         AND sg.student_id = i.student_id
         AND sg.is_primary = TRUE
        WHERE i.tenant_id = $1
          AND i.status IN ('open', 'pending_payment')
        ORDER BY i.invoice_number ASC
        LIMIT 12
      `,
      [context.options.tenant],
    );

    const senderStaffId = context.registries.staff_member_ids.get('FIN-001') ?? null;

    for (const row of overdueInvoices.rows) {
      await this.databaseService.query(
        `
          INSERT INTO communication_logs (
            tenant_id,
            external_reference,
            student_id,
            guardian_id,
            sender_staff_id,
            channel,
            direction,
            subject,
            body,
            status,
            sent_at,
            metadata
          )
          VALUES ($1, $2, $3::uuid, $4::uuid, $5::uuid, 'sms', 'outbound', $6, $7, 'delivered', '2026-04-28T16:30:00.000Z', $8::jsonb)
          ON CONFLICT (tenant_id, external_reference)
          DO UPDATE SET
            subject = EXCLUDED.subject,
            body = EXCLUDED.body,
            status = EXCLUDED.status,
            sent_at = EXCLUDED.sent_at,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `,
        [
          context.options.tenant,
          `seed:comm:${row.invoice_number}`,
          row.student_id,
          row.guardian_id,
          senderStaffId,
          `Fee reminder ${row.invoice_number}`,
          `Dear parent, please review outstanding school fees for invoice ${row.invoice_number}. You can settle via M-Pesa or contact the bursar for a payment plan.`,
          JSON.stringify({
            seed_key: `${context.seed_key}:communication:${row.invoice_number}`,
            invoice_number: row.invoice_number,
          }),
        ],
      );
    }
  }

  private async ensureNotifications(context: SeedRuntimeContext): Promise<void> {
    const ownerUserId = context.registries.owner_user_id;
    const bursarUserId = context.registries.staff_user_ids.get('FIN-001') ?? ownerUserId;

    const notifications = [
      {
        key: 'collections-queue',
        recipient_user_id: bursarUserId,
        type: 'finance.collections',
        title: 'Collections queue ready',
        body: 'The demo tenant has seeded open and partial invoices so the collections workflow has realistic backlog.',
      },
      {
        key: 'attendance-exceptions',
        recipient_user_id: ownerUserId,
        type: 'attendance.exceptions',
        title: 'Attendance exceptions available',
        body: 'Seed data includes late, excused, and absent attendance records for dashboard review.',
      },
      {
        key: 'reconciliation-watch',
        recipient_user_id: ownerUserId,
        type: 'finance.truth',
        title: 'Financial truth seeded',
        body: 'Invoices and payments were posted through the ledger only, keeping balances and revenue recognition intact.',
      },
    ];

    for (const notification of notifications) {
      await this.databaseService.query(
        `
          INSERT INTO notifications (
            tenant_id,
            notification_key,
            recipient_user_id,
            type,
            title,
            body,
            status,
            metadata
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6, 'unread', $7::jsonb)
          ON CONFLICT (tenant_id, notification_key)
          DO UPDATE SET
            recipient_user_id = EXCLUDED.recipient_user_id,
            type = EXCLUDED.type,
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `,
        [
          context.options.tenant,
          `seed:${notification.key}`,
          notification.recipient_user_id,
          notification.type,
          notification.title,
          notification.body,
          JSON.stringify({
            seed_key: `${context.seed_key}:notification:${notification.key}`,
          }),
        ],
      );
    }
  }

  private feeAmountsForClass(classCode: string): FeeStructureAmounts {
    const grade = Number(classCode.replace(/\D+/g, '')) || 1;
    const tuition = BigInt(1800000 + grade * 75000);
    const transport = BigInt(280000 + grade * 15000);
    const lunch = BigInt(220000 + grade * 12000);
    const total = tuition + transport + lunch;

    return {
      tuition_amount_minor: tuition,
      transport_amount_minor: transport,
      lunch_amount_minor: lunch,
      total_amount_minor: total,
    };
  }

  private requireAccountId(context: SeedRuntimeContext, accountCode: string): string {
    const accountId = context.registries.account_ids.get(accountCode);

    if (!accountId) {
      throw new Error(`Ledger account "${accountCode}" is missing during finance seeding`);
    }

    return accountId;
  }

  private async countRows(tableName: string, tenantId: string): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${tableName} WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(result.rows[0]?.total ?? '0');
  }

  private invoiceBillingPhoneAad(tenantId: string): string {
    return `invoices:${tenantId}:billing_phone_number`;
  }

  private subscriptionBillingPhoneAad(tenantId: string): string {
    return `subscriptions:${tenantId}:billing_phone_number`;
  }
}
