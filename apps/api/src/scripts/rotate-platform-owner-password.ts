import bcrypt from 'bcrypt';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const ownerEmail = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase();
const ownerPassword = resolveOwnerPassword();

function resolveOwnerPassword(): string {
  const directPassword = process.env.SYSTEM_OWNER_PASSWORD;

  if (directPassword?.trim()) {
    return directPassword;
  }

  const encodedPassword = process.env.SYSTEM_OWNER_PASSWORD_B64;

  if (encodedPassword?.trim()) {
    return Buffer.from(encodedPassword.trim(), 'base64').toString('utf8');
  }

  return '';
}

function requireConfiguration(): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  if (!ownerEmail) {
    throw new Error('SYSTEM_OWNER_EMAIL is required.');
  }

  if (!ownerPassword.trim()) {
    throw new Error('SYSTEM_OWNER_PASSWORD or SYSTEM_OWNER_PASSWORD_B64 is required.');
  }
}

async function main(): Promise<void> {
  requireConfiguration();

  const passwordHash = await bcrypt.hash(
    ownerPassword,
    Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'member';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));
    `);

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO users (
          tenant_id,
          email,
          password_hash,
          display_name,
          user_type,
          status,
          email_verified_at,
          mfa_enabled,
          password_changed_at
        )
        VALUES ('global', $1, $2, 'System Owner', 'platform_owner', 'active', NOW(), FALSE, NOW())
        ON CONFLICT ((lower(email)))
        DO UPDATE SET
          tenant_id = 'global',
          password_hash = EXCLUDED.password_hash,
          user_type = 'platform_owner',
          status = 'active',
          email_verified_at = COALESCE(users.email_verified_at, NOW()),
          password_changed_at = NOW(),
          updated_at = NOW()
        RETURNING id::text
      `,
      [ownerEmail, passwordHash],
    );

    if (!result.rows[0]) {
      throw new Error('Owner account was not updated.');
    }

    await client.query(
      `
        UPDATE users
        SET status = 'disabled', user_type = 'member', updated_at = NOW()
        WHERE user_type = 'platform_owner'
          AND lower(email) <> $1
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

  console.log('Platform owner password rotated.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Platform owner password rotation failed.';
  console.error(message);
  process.exitCode = 1;
});
