import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { PoolClient } from 'pg';

import { RequestContextService } from '../common/request-context/request-context.service';
import { DatabaseService } from '../database/database.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
  ) {}

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    let client: PoolClient | null = null;

    try {
      const requestContext = this.requestContext.requireStore();
      const tenantId = this.tenantService.resolveTenantId(
        request.headers.host,
        request.headers['x-tenant-id'],
      );

      this.requestContext.setTenantId(tenantId);

      client = await this.databaseService.acquireClient();
      await this.databaseService.initializeRequestSession(client, {
        ...requestContext,
        tenant_id: tenantId,
      });

      this.requestContext.setDatabaseClient(client);
      this.bindTransactionLifecycle(response, client);

      next();
    } catch (error) {
      if (client) {
        await this.rollbackAndRelease(client);
      }

      next(error as Error);
    }
  }

  private bindTransactionLifecycle(response: Response, client: PoolClient): void {
    let settled = false;

    const finalize = async (rollback: boolean): Promise<void> => {
      if (settled) {
        return;
      }

      settled = true;
      response.removeListener('finish', onFinish);
      response.removeListener('close', onClose);

      try {
        await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown transaction error';
        this.logger.error(message);
      } finally {
        client.release();
      }
    };

    const onFinish = (): void => {
      void finalize(response.statusCode >= 400);
    };

    const onClose = (): void => {
      void finalize(true);
    };

    response.once('finish', onFinish);
    response.once('close', onClose);
  }

  private async rollbackAndRelease(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown rollback error';
      this.logger.error(message);
    } finally {
      client.release();
    }
  }
}

