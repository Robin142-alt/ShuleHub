import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { DatabaseModule } from '../../src/database/database.module';
import { DatabaseService } from '../../src/database/database.service';
import { AuditLogService } from '../../src/modules/observability/audit-log.service';
import { BillingService } from '../../src/modules/billing/billing.service';
import { EventPublisherService } from '../../src/modules/events/event-publisher.service';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { AccountsRepository } from '../../src/modules/finance/repositories/accounts.repository';
import { IdempotencyKeysRepository } from '../../src/modules/finance/repositories/idempotency-keys.repository';
import { LedgerEntriesRepository } from '../../src/modules/finance/repositories/ledger-entries.repository';
import { TransactionsRepository } from '../../src/modules/finance/repositories/transactions.repository';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { MpesaCallbackProcessorService } from '../../src/modules/payments/mpesa-callback-processor.service';
import { MpesaService } from '../../src/modules/payments/mpesa.service';
import { CallbackLogsRepository } from '../../src/modules/payments/repositories/callback-logs.repository';
import { MpesaTransactionsRepository } from '../../src/modules/payments/repositories/mpesa-transactions.repository';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { FraudDetectionService } from '../../src/modules/security/fraud-detection.service';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';
import { SyncSchemaService } from '../../src/modules/sync/sync-schema.service';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
      load: [configuration],
    }),
    CommonModule,
    DatabaseModule,
  ],
  providers: [
    AuthSchemaService,
    FinanceSchemaService,
    PaymentsSchemaService,
    SyncSchemaService,
    PiiEncryptionService,
    LedgerService,
    TransactionService,
    AccountsRepository,
    TransactionsRepository,
    LedgerEntriesRepository,
    IdempotencyKeysRepository,
    PaymentIntentsRepository,
    CallbackLogsRepository,
    MpesaTransactionsRepository,
    MpesaCallbackProcessorService,
    {
      provide: AuditLogService,
      useValue: {
        shouldFail: false,
        async recordFinanceTransactionPosted(): Promise<void> {
          if (this.shouldFail) {
            throw new Error('Injected audit log failure');
          }
        },
      },
    },
    {
      provide: SyncOperationLogService,
      useValue: {
        async recordServerOperation(): Promise<void> {
          return undefined;
        },
      },
    },
    {
      provide: EventPublisherService,
      useValue: {
        async publishPaymentCompleted(): Promise<void> {
          return undefined;
        },
      },
    },
    {
      provide: BillingService,
      useValue: {
        async handlePaymentIntentCompleted(): Promise<void> {
          return undefined;
        },
      },
    },
    {
      provide: FraudDetectionService,
      useValue: {
        async recordCallbackFailure(): Promise<void> {
          return undefined;
        },
        async recordCallbackMismatch(): Promise<void> {
          return undefined;
        },
      },
    },
    {
      provide: MpesaService,
      inject: [ConfigService, RequestContextService, DatabaseService],
      useFactory: (
        configService: ConfigService,
        requestContextService: RequestContextService,
        databaseService: DatabaseService,
      ): MpesaService =>
        new MpesaService(
          configService,
          requestContextService,
          databaseService,
          {
            getClient: () => ({
              get: async (): Promise<string | null> => null,
              set: async (): Promise<'OK'> => 'OK',
            }),
          } as never,
          {
            inspectPaymentIntentCreation: async (): Promise<void> => undefined,
          } as never,
          {} as never,
          {} as never,
        ),
    },
  ],
})
export class FinanceIntegrityTestModule {}
