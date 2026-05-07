import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AUTH_ANONYMOUS_USER_ID, AUTH_SYSTEM_ROLE } from '../../auth/auth.constants';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { LedgerService } from '../finance/ledger.service';
import { AcademicSeeder } from '../../seeders/academic.seeder';
import { FinanceSeeder } from '../../seeders/finance.seeder';
import { StudentSeeder } from '../../seeders/student.seeder';
import { TenantSeeder } from '../../seeders/tenant.seeder';
import { UserSeeder } from '../../seeders/user.seeder';
import { SeedRegistries, SeederModuleName, SeedRunOptions, SeedRuntimeContext, SeedSummary } from './seeder.types';
import { SeederSchemaService } from './seeder-schema.service';

@Injectable()
export class SeederService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly ledgerService: LedgerService,
    private readonly seederSchemaService: SeederSchemaService,
    private readonly tenantSeeder: TenantSeeder,
    private readonly userSeeder: UserSeeder,
    private readonly academicSeeder: AcademicSeeder,
    private readonly studentSeeder: StudentSeeder,
    private readonly financeSeeder: FinanceSeeder,
  ) {}

  async runAll(options: SeedRunOptions): Promise<SeedSummary> {
    return this.executePlan(this.resolveExecutionPlan('finance'), options);
  }

  async runByModule(name: SeederModuleName, options: SeedRunOptions): Promise<SeedSummary> {
    return this.executePlan(this.resolveExecutionPlan(name), options);
  }

  private async executePlan(
    modules: SeederModuleName[],
    options: SeedRunOptions,
  ): Promise<SeedSummary> {
    await this.seederSchemaService.ensureSchema();

    const normalizedOptions = this.normalizeOptions(options);
    const startedAt = new Date();
    const context = this.buildRuntimeContext(normalizedOptions, modules, startedAt);

    await this.requestContext.run(
      {
        request_id: context.request_id,
        tenant_id: normalizedOptions.tenant,
        user_id: AUTH_ANONYMOUS_USER_ID,
        role: AUTH_SYSTEM_ROLE,
        session_id: null,
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: null,
        user_agent: 'seed-cli',
        method: 'SEED',
        path: '/internal/seed',
        started_at: startedAt.toISOString(),
      },
      async () => {
        for (const moduleName of modules) {
          await this.executeModule(moduleName, context);
        }

        await this.validate(context);
      },
    );

    context.summary.completed_at = new Date().toISOString();
    return context.summary;
  }

  private async executeModule(
    moduleName: SeederModuleName,
    context: SeedRuntimeContext,
  ): Promise<void> {
    switch (moduleName) {
      case 'tenant':
        await this.tenantSeeder.seed(context);
        return;
      case 'user':
        await this.userSeeder.seed(context);
        return;
      case 'academic':
        await this.academicSeeder.seed(context);
        return;
      case 'student':
        await this.studentSeeder.seed(context);
        return;
      case 'finance':
        await this.financeSeeder.seed(context);
        return;
      default:
        throw new Error(`Unsupported seeder module "${String(moduleName)}"`);
    }
  }

  private resolveExecutionPlan(target: SeederModuleName): SeederModuleName[] {
    const orderedModules: SeederModuleName[] = ['tenant', 'user', 'academic', 'student', 'finance'];
    return orderedModules.slice(0, orderedModules.indexOf(target) + 1);
  }

  private normalizeOptions(options: SeedRunOptions): Required<SeedRunOptions> {
    const tenant = (options.tenant || 'demo')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');

    return {
      tenant,
      school_name:
        options.school_name?.trim()
        || `${tenant
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ')} Academy`,
      owner_password: options.owner_password?.trim() || 'Demo@12345',
      plan_code: options.plan_code ?? 'starter',
      student_count_per_stream: options.student_count_per_stream ?? 2,
    };
  }

  private buildRuntimeContext(
    options: Required<SeedRunOptions>,
    modules: SeederModuleName[],
    startedAt: Date,
  ): SeedRuntimeContext {
    return {
      options,
      request_id: randomUUID(),
      seed_key: `seed:${options.tenant}`,
      now: startedAt,
      summary: {
        tenant: options.tenant,
        school_name: options.school_name,
        executed_modules: modules,
        started_at: startedAt.toISOString(),
        counts: {},
        validations: [],
      },
      registries: this.buildRegistries(),
    };
  }

  private buildRegistries(): SeedRegistries {
    return {
      class_ids: new Map<string, string>(),
      stream_ids: new Map<string, string>(),
      stream_class_codes: new Map<string, string>(),
      staff_user_ids: new Map<string, string>(),
      staff_member_ids: new Map<string, string>(),
      staff_subject_codes: new Map<string, string[]>(),
      subject_ids: new Map<string, string>(),
      assignment_ids: new Map<string, string>(),
      student_ids: new Map<string, string>(),
      student_stream_codes: new Map<string, string>(),
      student_primary_guardian_phones: new Map<string, string>(),
      guardian_ids: new Map<string, string>(),
      fee_structure_ids: new Map<string, string>(),
      account_ids: new Map<string, string>(),
      invoice_ids: new Map<string, string>(),
    };
  }

  private async validate(context: SeedRuntimeContext): Promise<void> {
    const tenantId = context.options.tenant;
    const executedModules = new Set(context.summary.executed_modules);

    if (executedModules.has('tenant')) {
      const tenantCount = await this.countTenantRows('tenants', tenantId);

      if (tenantCount < 1) {
        throw new Error('Seed validation failed: tenant row was not created');
      }

      context.summary.validations.push('tenant-exists');
    }

    if (executedModules.has('user')) {
      const membershipCount = await this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM tenant_memberships
          WHERE tenant_id = $1
            AND status = 'active'
        `,
        [tenantId],
      );

      if (Number(membershipCount.rows[0]?.total ?? '0') < 1) {
        throw new Error('Seed validation failed: no active tenant memberships exist');
      }

      context.summary.validations.push('active-memberships-exist');
    }

    if (executedModules.has('academic')) {
      const classCount = await this.countTenantRows('school_classes', tenantId);

      if (classCount < 1) {
        throw new Error('Seed validation failed: no academic classes exist for the tenant');
      }

      context.summary.validations.push('academic-structure-exists');
    }

    if (executedModules.has('student') || executedModules.has('finance')) {
      const studentCount = await this.countTenantRows('students', tenantId);

      if (studentCount < 1) {
        throw new Error('Seed validation failed: no students exist for the tenant');
      }

      context.summary.validations.push('students-exist');
    }

    if (executedModules.has('finance')) {
      const invoiceCount = await this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM invoices
          WHERE tenant_id = $1
            AND student_id IS NOT NULL
        `,
        [tenantId],
      );
      const imbalanceCount = await this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM (
            SELECT transaction_id
            FROM ledger_entries
            WHERE tenant_id = $1
            GROUP BY transaction_id
            HAVING
              COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_minor ELSE 0 END), 0)
              <> COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE 0 END), 0)
          ) imbalances
        `,
        [tenantId],
      );

      if (Number(invoiceCount.rows[0]?.total ?? '0') < 1) {
        throw new Error('Seed validation failed: no student invoices exist for the tenant');
      }

      if (Number(imbalanceCount.rows[0]?.total ?? '0') !== 0) {
        throw new Error('Seed validation failed: one or more ledger transactions are unbalanced');
      }

      const receivableAccountId = context.registries.account_ids.get('1100-AR-FEES');

      if (!receivableAccountId) {
        throw new Error('Seed validation failed: receivable account missing');
      }

      const receivableBalance = await this.ledgerService.getAccountBalance(receivableAccountId);
      const outstandingInvoiceAmount = await this.databaseService.query<{ total: string }>(
        `
          SELECT COALESCE(SUM(total_amount_minor - amount_paid_minor), 0)::text AS total
          FROM invoices
          WHERE tenant_id = $1
            AND student_id IS NOT NULL
        `,
        [tenantId],
      );

      if (
        receivableBalance.balance_minor !== (outstandingInvoiceAmount.rows[0]?.total ?? '0')
      ) {
        throw new Error('Seed validation failed: receivables ledger does not match invoice outstanding balance');
      }

      context.summary.validations.push(
        'invoices-exist',
        'ledger-balanced',
        'receivable-balance-matches-open-invoices',
      );
    }

    const isolatedStudentCount = await this.requestContext.run(
      {
        request_id: randomUUID(),
        tenant_id: `${tenantId}-isolation-check`,
        user_id: AUTH_ANONYMOUS_USER_ID,
        role: AUTH_SYSTEM_ROLE,
        session_id: null,
        permissions: ['*:*'],
        is_authenticated: true,
        client_ip: null,
        user_agent: 'seed-cli',
        method: 'SEED',
        path: '/internal/seed/validation',
        started_at: new Date().toISOString(),
      },
      async () => {
        const result = await this.databaseService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM students
          `,
        );
        return Number(result.rows[0]?.total ?? '0');
      },
    );

    if (isolatedStudentCount !== 0) {
      throw new Error('Seed validation failed: tenant isolation check returned seeded student data');
    }

    context.summary.validations.push('tenant-isolation-intact');
  }

  private async countTenantRows(tableName: string, tenantId: string): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ${tableName} WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(result.rows[0]?.total ?? '0');
  }
}
