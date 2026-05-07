import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import format from 'pg-format';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { RequestContextService } from '../common/request-context/request-context.service';
import { RequestContextState } from '../common/request-context/request-context.types';
import { SloMetricsService } from '../modules/observability/slo-metrics.service';
import { StructuredLoggerService } from '../modules/observability/structured-logger.service';
import { DATABASE_POOL } from './database.constants';
import { retryDatabaseOperation } from './database-retry';
import { DatabaseSecurityService } from './database-security.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private static readonly SCHEMA_BOOTSTRAP_LOCK_KEY = 'shule_hub_schema_bootstrap';
  private structuredLoggerRef: StructuredLoggerService | null | undefined;
  private sloMetricsRef: SloMetricsService | null | undefined;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly requestContext: RequestContextService,
    private readonly databaseSecurityService: DatabaseSecurityService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    await retryDatabaseOperation(
      this.logger,
      'PostgreSQL connection initialization',
      this.getConnectMaxRetries(),
      this.getConnectRetryDelayMs(),
      async () => {
        await this.pool.query('SELECT 1');
      },
    );
    this.logger.log('PostgreSQL connection pool initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async acquireClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async initializeRequestSession(client: PoolClient, context: RequestContextState): Promise<void> {
    await client.query('BEGIN');
    await this.applySessionConfig(client, context);
  }

  async synchronizeRequestSession(context: RequestContextState): Promise<void> {
    const client = context.db_client;

    if (!client) {
      return;
    }

    await this.applySessionConfig(client, context);
  }

  private async applySessionConfig(client: PoolClient, context: RequestContextState): Promise<void> {
    const runtimeRoleName = this.databaseSecurityService.getRuntimeRoleName();

    // Batch all SET LOCAL statements into a single SQL call to eliminate per-statement round-trips.
    // At 10K concurrent users this saves ~10 round-trips per request.
    const statements: string[] = [];

    if (runtimeRoleName) {
      statements.push(format('SET LOCAL ROLE %I', runtimeRoleName));
    }

    statements.push(
      format('SET LOCAL app.tenant_id = %L', context.tenant_id ?? ''),
      format('SET LOCAL app.user_id = %L', context.user_id),
      format('SET LOCAL app.request_id = %L', context.request_id),
      format('SET LOCAL app.role = %L', context.role ?? ''),
      format('SET LOCAL app.session_id = %L', context.session_id ?? ''),
      format('SET LOCAL app.method = %L', context.method ?? ''),
      format('SET LOCAL app.path = %L', context.path ?? ''),
      format('SET LOCAL app.client_ip = %L', context.client_ip ?? ''),
      format('SET LOCAL app.user_agent = %L', context.user_agent ?? ''),
      format('SET LOCAL app.started_at = %L', context.started_at ?? ''),
      format('SET LOCAL app.is_authenticated = %L', context.is_authenticated ? 'true' : 'false'),
    );

    await client.query(statements.join('; '));
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const requestContext = this.requestContext.getStore();

    if (requestContext?.db_client) {
      return this.executeObservedQuery(text, values, () =>
        requestContext.db_client!.query<T>(text, values),
      );
    }

    if (requestContext) {
      return this.executeInScopedRequestSession(requestContext, (client) =>
        this.executeObservedQuery(text, values, () => client.query<T>(text, values)),
      );
    }

    return this.executeObservedQuery(text, values, () => this.pool.query<T>(text, values));
  }

  async runSchemaBootstrap(sql: string): Promise<void> {
    const client = await this.acquireClient();

    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [DatabaseService.SCHEMA_BOOTSTRAP_LOCK_KEY],
      );
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withRequestTransaction<T>(callback: () => Promise<T>): Promise<T> {
    const requestContext = this.requestContext.requireStore();

    if (requestContext.db_client) {
      return callback();
    }

    const client = await this.acquireClient();

    try {
      await this.initializeRequestSession(client, requestContext);
      this.requestContext.setDatabaseClient(client);

      const result = await callback();
      await client.query('COMMIT');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      this.requestContext.setDatabaseClient(undefined);
      client.release();
    }
  }

  async withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const requestContext = this.requestContext.getStore();
    const existingClient = requestContext?.db_client;

    if (existingClient) {
      return callback(existingClient);
    }

    if (requestContext) {
      return this.executeInScopedRequestSession(requestContext, callback);
    }

    const client = await this.acquireClient();

    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async ping(): Promise<'up'> {
    await this.query('SELECT 1');
    return 'up';
  }

  getPoolMetrics(): {
    total_connections: number;
    idle_connections: number;
    active_connections: number;
    waiting_requests: number;
  } {
    const totalConnections = this.pool.totalCount;
    const idleConnections = this.pool.idleCount;
    const waitingRequests = this.pool.waitingCount;

    return {
      total_connections: totalConnections,
      idle_connections: idleConnections,
      active_connections: Math.max(0, totalConnections - idleConnections),
      waiting_requests: waitingRequests,
    };
  }

  private async executeInScopedRequestSession<T>(
    context: RequestContextState,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.acquireClient();
    const previousClient = context.db_client;

    try {
      await this.initializeRequestSession(client, context);
      this.requestContext.setDatabaseClient(client);

      const result = await callback(client);
      await client.query('COMMIT');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      this.requestContext.setDatabaseClient(previousClient);
      client.release();
    }
  }

  private async executeObservedQuery<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[],
    callback: () => Promise<QueryResult<T>>,
  ): Promise<QueryResult<T>> {
    const startedAt = performance.now();
    const statementType = extractStatementType(text);
    const queryFingerprint = createQueryFingerprint(text);

    try {
      const result = await callback();
      const durationMs = performance.now() - startedAt;
      const shouldLogSuccess = !this.isInternalSeedRequest();

      this.getSloMetricsService()?.recordDatabaseQuery({
        outcome: 'success',
        duration_ms: durationMs,
        statement_type: statementType,
        query_fingerprint: queryFingerprint,
        row_count: result.rowCount ?? result.rows.length,
      });
      if (shouldLogSuccess) {
        this.getStructuredLoggerService()?.logEvent(
          'db.query.completed',
          {
            db_statement_type: statementType,
            db_query_fingerprint: queryFingerprint,
            duration_ms: Number(durationMs.toFixed(2)),
            parameter_count: values.length,
            row_count: result.rowCount ?? result.rows.length,
          },
          'debug',
        );
      }

      return result;
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);

      this.getSloMetricsService()?.recordDatabaseQuery({
        outcome: 'failure',
        duration_ms: durationMs,
        statement_type: statementType,
        query_fingerprint: queryFingerprint,
        error_message: message,
      });
      this.getStructuredLoggerService()?.logEvent(
        'db.query.failed',
        {
          db_statement_type: statementType,
          db_query_fingerprint: queryFingerprint,
          duration_ms: Number(durationMs.toFixed(2)),
          parameter_count: values.length,
          error_message: message,
        },
        'error',
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  private getStructuredLoggerService(): StructuredLoggerService | undefined {
    if (this.structuredLoggerRef === undefined) {
      try {
        this.structuredLoggerRef =
          this.moduleRef.get(StructuredLoggerService, { strict: false }) ?? null;
      } catch {
        this.structuredLoggerRef = null;
      }
    }

    return this.structuredLoggerRef ?? undefined;
  }

  private getSloMetricsService(): SloMetricsService | undefined {
    if (this.sloMetricsRef === undefined) {
      try {
        this.sloMetricsRef = this.moduleRef.get(SloMetricsService, { strict: false }) ?? null;
      } catch {
        this.sloMetricsRef = null;
      }
    }

    return this.sloMetricsRef ?? undefined;
  }

  private getConnectMaxRetries(): number {
    return Number(
      this.moduleRef.get(ConfigService, { strict: false }).get<number>(
        'database.connectMaxRetries',
      ) ?? 10,
    );
  }

  private getConnectRetryDelayMs(): number {
    return Number(
      this.moduleRef.get(ConfigService, { strict: false }).get<number>(
        'database.connectRetryDelayMs',
      ) ?? 2000,
    );
  }

  private isInternalSeedRequest(): boolean {
    return this.requestContext.getStore()?.path === '/internal/seed';
  }
}

const extractStatementType = (sql: string): string => {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    return 'UNKNOWN';
  }

  return normalized.split(' ')[0]!.toUpperCase();
};

const createQueryFingerprint = (sql: string): string => {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
};
