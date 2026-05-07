import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import format from 'pg-format';
import { Pool } from 'pg';

import { DATABASE_POOL } from './database.constants';
import { retryDatabaseOperation } from './database-retry';

interface CurrentRoleState {
  current_user: string;
  session_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

@Injectable()
export class DatabaseSecurityService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSecurityService.name);
  private runtimeRoleName: string | null = null;
  private currentUserName: string | null = null;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await retryDatabaseOperation(
      this.logger,
      'Database security bootstrap',
      Number(this.configService.get<number>('database.connectMaxRetries') ?? 10),
      Number(this.configService.get<number>('database.connectRetryDelayMs') ?? 2000),
      async () => {
        await this.pool.query('CREATE SCHEMA IF NOT EXISTS app');

        const currentRoleState = await this.getCurrentRoleState();
        this.currentUserName = currentRoleState.current_user;

        if (!currentRoleState.rolbypassrls) {
          this.logger.log(
            `Database role "${currentRoleState.current_user}" does not bypass RLS; runtime role delegation is not required`,
          );
          return;
        }

        const configuredRuntimeRole =
          this.configService.get<string>('database.runtimeRole')?.trim() || 'shule_hub_runtime';

        await this.ensureRuntimeRole(configuredRuntimeRole, currentRoleState.current_user);
        await this.grantRuntimeRolePrivileges(configuredRuntimeRole);

        this.runtimeRoleName = configuredRuntimeRole;
        this.logger.warn(
          `Database role "${currentRoleState.current_user}" bypasses RLS; request transactions will assume runtime role "${configuredRuntimeRole}"`,
        );
      },
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.runtimeRoleName) {
      return;
    }

    await this.grantRuntimeRolePrivileges(this.runtimeRoleName);
  }

  getRuntimeRoleName(): string | null {
    if (!this.runtimeRoleName || this.runtimeRoleName === this.currentUserName) {
      return null;
    }

    return this.runtimeRoleName;
  }

  private async ensureRuntimeRole(runtimeRoleName: string, currentUserName: string): Promise<void> {
    const existingRole = await this.pool.query<{ rolname: string }>(
      `
        SELECT rolname
        FROM pg_roles
        WHERE rolname = $1
        LIMIT 1
      `,
      [runtimeRoleName],
    );

    if (!existingRole.rows[0]) {
      await this.pool.query(format('CREATE ROLE %I NOLOGIN NOBYPASSRLS', runtimeRoleName));
    }

    await this.pool.query(format('ALTER ROLE %I NOBYPASSRLS NOLOGIN', runtimeRoleName));
    await this.pool.query(format('GRANT %I TO %I', runtimeRoleName, currentUserName));
  }

  private async grantRuntimeRolePrivileges(runtimeRoleName: string): Promise<void> {
    await this.pool.query(format('GRANT USAGE ON SCHEMA public TO %I', runtimeRoleName));
    await this.pool.query(format('GRANT USAGE ON SCHEMA app TO %I', runtimeRoleName));
    await this.pool.query(
      format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', runtimeRoleName),
    );
    await this.pool.query(
      format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', runtimeRoleName),
    );
    await this.pool.query(
      format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO %I', runtimeRoleName),
    );
    await this.pool.query(
      format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', runtimeRoleName),
    );
    await this.pool.query(
      format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        this.currentUserName ?? 'current_user',
        runtimeRoleName,
      ),
    );
    await this.pool.query(
      format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
        this.currentUserName ?? 'current_user',
        runtimeRoleName,
      ),
    );
    await this.pool.query(
      format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO %I',
        this.currentUserName ?? 'current_user',
        runtimeRoleName,
      ),
    );
    await this.pool.query(
      format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I',
        this.currentUserName ?? 'current_user',
        runtimeRoleName,
      ),
    );
  }

  private async getCurrentRoleState(): Promise<CurrentRoleState> {
    const result = await this.pool.query<CurrentRoleState>(`
      SELECT
        current_user AS current_user,
        session_user AS session_user,
        r.rolsuper,
        r.rolbypassrls
      FROM pg_roles r
      WHERE r.rolname = current_user
      LIMIT 1
    `);

    const currentRoleState = result.rows[0];

    if (!currentRoleState) {
      throw new Error('Unable to determine current PostgreSQL role state');
    }

    return currentRoleState;
  }
}
