import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from '../../src/config/configuration';
import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import { DatabaseModule } from '../../src/database/database.module';
import { RedisModule } from '../../src/infrastructure/redis/redis.module';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { AuditLogsRepository } from '../../src/modules/events/repositories/audit-logs.repository';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { AuditLogService } from '../../src/modules/observability/audit-log.service';
import { StructuredLoggerService } from '../../src/modules/observability/structured-logger.service';
import { PaymentsSchemaService } from '../../src/modules/payments/payments-schema.service';
import { MpesaService } from '../../src/modules/payments/mpesa.service';
import { PaymentIntentIdempotencyRepository } from '../../src/modules/payments/repositories/payment-intent-idempotency.repository';
import { PaymentIntentsRepository } from '../../src/modules/payments/repositories/payment-intents.repository';
import { FraudDetectionService } from '../../src/modules/security/fraud-detection.service';
import { PiiEncryptionService } from '../../src/modules/security/pii-encryption.service';

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
    RedisModule,
  ],
  providers: [
    AuthSchemaService,
    FinanceSchemaService,
    PaymentsSchemaService,
    EventsSchemaService,
    PiiEncryptionService,
    StructuredLoggerService,
    AuditLogsRepository,
    AuditLogService,
    FraudDetectionService,
    PaymentIntentIdempotencyRepository,
    PaymentIntentsRepository,
    MpesaService,
  ],
})
export class FraudScenariosTestModule {}
