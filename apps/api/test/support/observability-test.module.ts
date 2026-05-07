import { Injectable, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthSchemaService } from '../../src/auth/auth-schema.service';
import { CommonModule } from '../../src/common/common.module';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { DatabaseService } from '../../src/database/database.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { RequestContextMiddleware } from '../../src/middleware/request-context.middleware';
import { RequestLoggingMiddleware } from '../../src/middleware/request-logging.middleware';
import { TenantMiddleware } from '../../src/middleware/tenant.middleware';
import { EventsSchemaService } from '../../src/modules/events/events-schema.service';
import { AuditLogsRepository } from '../../src/modules/events/repositories/audit-logs.repository';
import { FinanceSchemaService } from '../../src/modules/finance/finance-schema.service';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { TransactionService } from '../../src/modules/finance/transaction.service';
import { AccountsRepository } from '../../src/modules/finance/repositories/accounts.repository';
import { IdempotencyKeysRepository } from '../../src/modules/finance/repositories/idempotency-keys.repository';
import { LedgerEntriesRepository } from '../../src/modules/finance/repositories/ledger-entries.repository';
import { TransactionsRepository } from '../../src/modules/finance/repositories/transactions.repository';
import { HealthController } from '../../src/modules/health/health.controller';
import { AuditLogService } from '../../src/modules/observability/audit-log.service';
import { GradesAuditService } from '../../src/modules/observability/grades-audit.service';
import { ObservabilityController } from '../../src/modules/observability/observability.controller';
import { SloMetricsService } from '../../src/modules/observability/slo-metrics.service';
import { SloMonitoringService } from '../../src/modules/observability/slo-monitoring.service';
import { StructuredLoggerService } from '../../src/modules/observability/structured-logger.service';
import { SyncOperationLogService } from '../../src/modules/sync/sync-operation-log.service';
import { QueueService } from '../../src/queue/queue.service';
import { TenantModule } from '../../src/tenant/tenant.module';
import { CapturingStructuredLoggerService } from './capturing-structured-logger.service';
import { TraceQueueProbeService } from './trace-queue-probe.service';
import { TraceProbeController } from './trace-probe.controller';

@Injectable()
export class ObservabilityRedisProbeService {
  private status: 'up' | 'down' = 'up';

  async ping(): Promise<'up'> {
    if (this.status === 'down') {
      throw new Error('Redis probe failure');
    }

    return 'up';
  }

  setStatus(status: 'up' | 'down'): void {
    this.status = status;
  }

  reset(): void {
    this.status = 'up';
  }
}

@Injectable()
export class ObservabilityQueueProbeService {
  private countsByQueue = new Map<
    string,
    {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      completed: number;
    }
  >();
  private failingQueues = new Set<string>();

  async getJobCounts(queueName: string): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  }> {
    if (this.failingQueues.has(queueName)) {
      throw new Error(`Queue probe failure for ${queueName}`);
    }

    return (
      this.countsByQueue.get(queueName) ?? {
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
      }
    );
  }

  async getQueueLagSnapshot(_queueName: string): Promise<{
    oldest_waiting_age_ms: number | null;
    oldest_delayed_age_ms: number | null;
  }> {
    return {
      oldest_waiting_age_ms: null,
      oldest_delayed_age_ms: null,
    };
  }

  setCounts(
    queueName: string,
    counts: {
      waiting?: number;
      active?: number;
      delayed?: number;
      failed?: number;
      completed?: number;
    },
  ): void {
    this.countsByQueue.set(queueName, {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    });
  }

  setFailure(queueName: string, failing: boolean): void {
    if (failing) {
      this.failingQueues.add(queueName);
      return;
    }

    this.failingQueues.delete(queueName);
  }

  reset(): void {
    this.countsByQueue.clear();
    this.failingQueues.clear();
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
      load: [configuration],
    }),
    CommonModule,
    TenantModule,
    DatabaseModule,
  ],
  controllers: [TraceProbeController, ObservabilityController, HealthController],
  providers: [
    AuthSchemaService,
    EventsSchemaService,
    FinanceSchemaService,
    LedgerService,
    TransactionService,
    AccountsRepository,
    TransactionsRepository,
    LedgerEntriesRepository,
    IdempotencyKeysRepository,
    AuditLogsRepository,
    AuditLogService,
    GradesAuditService,
    SloMetricsService,
    SloMonitoringService,
    ObservabilityRedisProbeService,
    ObservabilityQueueProbeService,
    TraceQueueProbeService,
    {
      provide: RedisService,
      useExisting: ObservabilityRedisProbeService,
    },
    {
      provide: QueueService,
      useExisting: ObservabilityQueueProbeService,
    },
    CapturingStructuredLoggerService,
    {
      provide: StructuredLoggerService,
      useExisting: CapturingStructuredLoggerService,
    },
    {
      provide: SyncOperationLogService,
      useValue: {
        async recordServerOperation(): Promise<void> {
          return undefined;
        },
      },
    },
  ],
})
export class ObservabilityTestModule implements NestModule {
  constructor(private readonly databaseService: DatabaseService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, TenantMiddleware, RequestLoggingMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
