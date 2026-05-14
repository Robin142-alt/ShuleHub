import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Client } from 'pg';

import {
  DEFAULT_MONITORING_PERMISSIONS,
  generateMonitoringToken,
  hashMonitoringToken,
  normalizeReadOnlyPermissions,
} from '../auth/monitoring-service-account.service';

type SecretTarget = 'github' | 'railway' | 'file';

interface ScriptConfig {
  databaseUrl: string;
  tenantId: string;
  name: string;
  createdBy: string | null;
  expiresAt: string;
  secretTarget: SecretTarget;
  secretName: string;
  secretFilePath: string | null;
  permissions: string[];
}

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const rawToken = generateMonitoringToken();
  const tokenHash = hashMonitoringToken(rawToken);
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.role', 'system', true)");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [config.tenantId]);
    await client.query("SELECT set_config('app.user_id', 'system', true)");

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO monitoring_service_accounts (
          tenant_id,
          name,
          token_hash,
          permissions,
          expires_at,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        config.tenantId,
        config.name,
        tokenHash,
        config.permissions,
        config.expiresAt,
        config.createdBy,
      ],
    );
    const accountId = result.rows[0]?.id;

    if (!accountId) {
      throw new Error('Monitoring service account was not created.');
    }

    await client.query(
      `
        INSERT INTO monitoring_service_account_audit_logs (
          tenant_id,
          account_id,
          action,
          actor_user_id
        )
        VALUES ($1, $2, 'created', $3)
      `,
      [config.tenantId, accountId, config.createdBy ?? 'system'],
    );
    await client.query('COMMIT');

    writeSecret(config, rawToken);

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          account_id: accountId,
          tenant_id: config.tenantId,
          secret_target: config.secretTarget,
          secret_name: config.secretName,
          expires_at: config.expiresAt,
        },
        null,
        2,
      ),
    );
    process.stdout.write('\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function readConfig(env: NodeJS.ProcessEnv): ScriptConfig {
  const databaseUrl = readRequired(env, 'DATABASE_URL');
  readRequired(env, 'SECURITY_PII_ENCRYPTION_KEY');
  const tenantId = readRequired(env, 'MONITORING_SERVICE_ACCOUNT_TENANT_ID');
  const name = readRequired(env, 'MONITORING_SERVICE_ACCOUNT_NAME');
  const secretTarget = readSecretTarget(env.MONITORING_SERVICE_ACCOUNT_SECRET_TARGET);
  const secretName = env.MONITORING_SERVICE_ACCOUNT_SECRET_NAME?.trim() || 'PROD_MONITOR_ACCESS_TOKEN';
  const expiresAt = resolveExpiresAt(env.MONITORING_SERVICE_ACCOUNT_EXPIRES_AT, env.MONITORING_SERVICE_ACCOUNT_TTL_DAYS);
  const permissions = normalizeReadOnlyPermissions(
    env.MONITORING_SERVICE_ACCOUNT_PERMISSIONS
      ? env.MONITORING_SERVICE_ACCOUNT_PERMISSIONS.split(',').map((permission) => permission.trim())
      : [...DEFAULT_MONITORING_PERMISSIONS],
  );

  return {
    databaseUrl,
    tenantId,
    name,
    createdBy: env.MONITORING_SERVICE_ACCOUNT_CREATED_BY?.trim() || null,
    expiresAt,
    secretTarget,
    secretName,
    secretFilePath: env.MONITORING_SERVICE_ACCOUNT_SECRET_FILE?.trim() || null,
    permissions,
  };
}

function readRequired(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function readSecretTarget(value: string | undefined): SecretTarget {
  const target = value?.trim().toLowerCase();

  if (target === 'github' || target === 'railway' || target === 'file') {
    return target;
  }

  throw new Error('MONITORING_SERVICE_ACCOUNT_SECRET_TARGET must be github, railway, or file.');
}

function resolveExpiresAt(expiresAt: string | undefined, ttlDaysValue: string | undefined): string {
  if (expiresAt?.trim()) {
    const parsed = new Date(expiresAt);

    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new Error('MONITORING_SERVICE_ACCOUNT_EXPIRES_AT must be a future ISO timestamp.');
    }

    return parsed.toISOString();
  }

  const ttlDays = ttlDaysValue ? Number.parseInt(ttlDaysValue, 10) : 90;

  if (!Number.isFinite(ttlDays) || ttlDays < 1 || ttlDays > 365) {
    throw new Error('MONITORING_SERVICE_ACCOUNT_TTL_DAYS must be between 1 and 365.');
  }

  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

function writeSecret(config: ScriptConfig, rawToken: string): void {
  if (config.secretTarget === 'github') {
    setGitHubSecret(config.secretName, rawToken);
    return;
  }

  if (config.secretTarget === 'railway') {
    setRailwayVariable(config.secretName, rawToken);
    return;
  }

  if (!config.secretFilePath) {
    throw new Error('MONITORING_SERVICE_ACCOUNT_SECRET_FILE is required when target is file.');
  }

  writeFileSync(config.secretFilePath, `${rawToken}\n`, { encoding: 'utf8', mode: 0o600 });
}

function setGitHubSecret(secretName: string, rawToken: string): void {
  execFileSync('gh', ['secret', 'set', secretName], {
    input: rawToken,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

function setRailwayVariable(secretName: string, rawToken: string): void {
  const args = [
    '@railway/cli',
    'variables',
    'set',
    `${secretName}=${rawToken}`,
  ];
  const service = process.env.MONITORING_SERVICE_ACCOUNT_RAILWAY_SERVICE?.trim();
  const environment = process.env.MONITORING_SERVICE_ACCOUNT_RAILWAY_ENVIRONMENT?.trim();

  if (service) {
    args.push('--service', service);
  }

  if (environment) {
    args.push('--environment', environment);
  }

  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
