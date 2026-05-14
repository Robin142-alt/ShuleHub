import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const ownerEmail = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase();

function requireConfiguration(): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  if (!ownerEmail) {
    throw new Error('SYSTEM_OWNER_EMAIL is required.');
  }
}

async function countRows(client: Client, tableName: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${tableName}`,
  );
  return Number(result.rows[0]?.count ?? '0');
}

async function main(): Promise<void> {
  requireConfiguration();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const ownerResult = await client.query<{
      id: string;
      email: string;
      tenant_id: string;
      user_type: string;
      status: string;
      email_verified: boolean;
      has_password_hash: boolean;
    }>(
      `
        SELECT
          id::text,
          email,
          tenant_id::text,
          user_type,
          status,
          email_verified_at IS NOT NULL AS email_verified,
          password_hash LIKE '$2%' AS has_password_hash
        FROM users
        WHERE lower(email) = $1
      `,
      [ownerEmail],
    );

    const usersCount = await countRows(client, 'public.users');
    const otherOwnersResult = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM users
        WHERE user_type = 'platform_owner'
          AND lower(email) <> $1
      `,
      [ownerEmail],
    );
    const otherOwnersCount = Number(otherOwnersResult.rows[0]?.count ?? '0');
    const owner = ownerResult.rows[0];
    const failures: string[] = [];

    if (!owner) {
      failures.push('Owner account is missing.');
    } else {
      if (owner.user_type !== 'platform_owner') failures.push('Owner user_type is not platform_owner.');
      if (owner.status !== 'active') failures.push('Owner account is not active.');
      if (owner.tenant_id !== 'global') failures.push('Owner tenant scope is not global.');
      if (!owner.email_verified) failures.push('Owner email is not marked verified.');
      if (!owner.has_password_hash) failures.push('Owner password hash is not bcrypt formatted.');
    }

    if (usersCount !== 1) {
      failures.push(`Expected exactly 1 user after cleanup, found ${usersCount}.`);
    }

    if (otherOwnersCount !== 0) {
      failures.push(`Expected 0 additional platform owners, found ${otherOwnersCount}.`);
    }

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
          'migrations',
          'users'
        )
      ORDER BY tablename;
    `);

    const nonEmptyTables: string[] = [];
    for (const row of tablesResult.rows) {
      const count = await countRows(client, row.qualified_name);
      if (count > 0) {
        nonEmptyTables.push(`${row.qualified_name} (${count})`);
      }
    }

    if (nonEmptyTables.length > 0) {
      failures.push(`Operational tables still contain rows: ${nonEmptyTables.join(', ')}.`);
    }

    if (failures.length > 0) {
      console.error('Production auth cleanup verification failed.');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('Production auth cleanup verification passed.');
    console.log('Verified one active global platform owner and no residual operational rows.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Production auth cleanup verification failed.';
  console.error(message);
  process.exitCode = 1;
});
