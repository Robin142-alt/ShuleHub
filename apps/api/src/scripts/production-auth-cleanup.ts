import bcrypt from 'bcrypt';
import { Client } from 'pg';

const confirmation = process.env.CONFIRM_PRODUCTION_DATA_PURGE;
const databaseUrl = process.env.DATABASE_URL;
const ownerEmail = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase();
const ownerDisplayName = process.env.SYSTEM_OWNER_DISPLAY_NAME?.trim() || 'System Owner';
const ownerRecoveryEmail = process.env.SYSTEM_OWNER_RECOVERY_EMAIL?.trim().toLowerCase() || null;
const ownerPassword = process.env.SYSTEM_OWNER_PASSWORD;
const ownerPasswordHash = process.env.SYSTEM_OWNER_PASSWORD_HASH;

async function resolvePasswordHash(): Promise<string> {
  if (ownerPasswordHash?.trim()) {
    return ownerPasswordHash.trim();
  }

  if (ownerPassword?.trim()) {
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    return bcrypt.hash(ownerPassword, saltRounds);
  }

  throw new Error(
    'SYSTEM_OWNER_PASSWORD_HASH or one-time SYSTEM_OWNER_PASSWORD is required for owner bootstrap.',
  );
}

function requireConfiguration(): void {
  if (confirmation !== 'REMOVE_ALL_DEMO_DATA') {
    throw new Error(
      'Refusing to purge data without CONFIRM_PRODUCTION_DATA_PURGE=REMOVE_ALL_DEMO_DATA.',
    );
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  if (!ownerEmail) {
    throw new Error('SYSTEM_OWNER_EMAIL is required.');
  }
}

async function main(): Promise<void> {
  requireConfiguration();

  const passwordHash = await resolvePasswordHash();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'member';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));
    `);

    const tablesResult = await client.query<{ qualified_name: string }>(`
      SELECT format('%I.%I', schemaname, tablename) AS qualified_name
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN (
          'roles',
          'permissions',
          'role_permissions',
          'support_categories',
          'schema_migrations',
          'migrations'
        )
      ORDER BY tablename;
    `);

    if (tablesResult.rows.length > 0) {
      await client.query(`TRUNCATE TABLE ${tablesResult.rows.map((row) => row.qualified_name).join(', ')} CASCADE`);
    }

    await client.query(
      `
        INSERT INTO users (
          tenant_id,
          email,
          password_hash,
          display_name,
          user_type,
          status,
          email_verified_at,
          recovery_email,
          mfa_enabled,
          password_changed_at
        )
        VALUES ('global', $1, $2, $3, 'platform_owner', 'active', NOW(), $4, FALSE, NOW())
        ON CONFLICT ((lower(email)))
        DO UPDATE SET
          tenant_id = 'global',
          password_hash = EXCLUDED.password_hash,
          display_name = EXCLUDED.display_name,
          user_type = 'platform_owner',
          status = 'active',
          email_verified_at = COALESCE(users.email_verified_at, NOW()),
          recovery_email = EXCLUDED.recovery_email,
          password_changed_at = NOW(),
          updated_at = NOW()
      `,
      [ownerEmail, passwordHash, ownerDisplayName, ownerRecoveryEmail],
    );

    await client.query(
      `
        UPDATE users
        SET status = 'disabled', user_type = 'member', updated_at = NOW()
        WHERE lower(email) <> $1
          AND user_type = 'platform_owner'
      `,
      [ownerEmail],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log('Production auth cleanup completed. One platform owner account remains.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Production auth cleanup failed.';
  console.error(message);
  process.exitCode = 1;
});
