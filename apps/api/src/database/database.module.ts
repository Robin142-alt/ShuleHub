import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import { DATABASE_POOL } from './database.constants';
import { DatabaseSecurityService } from './database-security.service';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        const logger = new Logger('DatabasePool');
        const connectionString = configService.get<string>('database.url');
        const statementTimeoutMs = Number(configService.get<number>('database.statementTimeoutMs') ?? 5000);

        const pool = new Pool({
          connectionString,
          max: Number(configService.get<number>('database.maxConnections') ?? 20),
          idleTimeoutMillis: Number(configService.get<number>('database.idleTimeoutMs') ?? 10000),
          statement_timeout: statementTimeoutMs,
          application_name: 'shule-hub-api',
          keepAlive: true,
          ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
        });

        pool.on('connect', () => {
          logger.log('PostgreSQL client connected');
        });

        pool.on('error', (error) => {
          logger.error(`PostgreSQL pool error: ${error.message}`, error.stack);
        });

        pool.on('remove', () => {
          logger.warn('PostgreSQL client removed from pool');
        });

        return pool;
      },
    },
    DatabaseSecurityService,
    DatabaseService,
  ],
  exports: [DatabaseService, DatabaseSecurityService, DATABASE_POOL],
})
export class DatabaseModule {}
