import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthSchemaService } from './auth-schema.service';

test('AuthSchemaService qualifies password recovery token columns inside the consume function', async () => {
  let bootstrapSql = '';
  const service = new AuthSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(
    bootstrapSql,
    /SELECT\s+token\.id,\s*token\.user_id,\s*token\.email,\s*token\.tenant_id[\s\S]+FROM auth_action_tokens token/,
  );
});

test('AuthSchemaService links accepted parent invitations to student guardian rows', async () => {
  let bootstrapSql = '';
  const service = new AuthSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(bootstrapSql, /UPDATE student_guardians/);
  assert.match(bootstrapSql, /user_id = invited_user_id/);
  assert.match(bootstrapSql, /lower\(email\) = lower\(invite_email\)/);
  assert.match(bootstrapSql, /status = 'active'/);
});

test('AuthSchemaService defines email verification token functions and route policies', async () => {
  let bootstrapSql = '';
  const service = new AuthSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(bootstrapSql, /CREATE OR REPLACE FUNCTION app\.create_email_verification_action/);
  assert.match(bootstrapSql, /CREATE OR REPLACE FUNCTION app\.consume_email_verification_action/);
  assert.match(bootstrapSql, /purpose = 'email_verification'/);
  assert.match(bootstrapSql, /\/auth\/email-verification\//);
});

test('AuthSchemaService does not grant broad public path access to auth token tables', async () => {
  let bootstrapSql = '';
  const service = new AuthSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  const authTokenPolicy = bootstrapSql.match(
    /CREATE POLICY auth_action_tokens_rls_policy[\s\S]+?CREATE POLICY auth_email_outbox_rls_policy/,
  )?.[0] ?? '';
  const emailOutboxPolicy = bootstrapSql.match(
    /CREATE POLICY auth_email_outbox_rls_policy[\s\S]+?DROP POLICY IF EXISTS auth_mfa_challenges_rls_policy/,
  )?.[0] ?? '';

  assert.match(authTokenPolicy, /app\.auth_action_token_operation/);
  assert.match(emailOutboxPolicy, /app\.auth_email_outbox_operation/);
  assert.doesNotMatch(authTokenPolicy, /app\.path/);
  assert.doesNotMatch(emailOutboxPolicy, /app\.path/);
});

test('AuthSchemaService returns auth security state from user lookup functions', async () => {
  let bootstrapSql = '';
  const service = new AuthSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(
    bootstrapSql,
    /app\.find_user_by_email_for_auth[\s\S]+email_verified_at timestamptz[\s\S]+mfa_enabled boolean[\s\S]+mfa_verified_at timestamptz/,
  );
  assert.match(
    bootstrapSql,
    /app\.create_global_user_from_invitation[\s\S]+users\.email_verified_at[\s\S]+users\.mfa_enabled[\s\S]+users\.mfa_verified_at/,
  );
});

test('AuthSchemaService creates MFA, trusted-device, and magic-link persistence', async () => {
  let bootstrapSql = '';
  const service = new AuthSchemaService({
    runSchemaBootstrap: async (sql: string) => {
      bootstrapSql = sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS auth_mfa_challenges/);
  assert.match(bootstrapSql, /CREATE TABLE IF NOT EXISTS auth_trusted_devices/);
  assert.match(bootstrapSql, /'magic_login'/);
  assert.match(bootstrapSql, /ALTER TABLE auth_mfa_challenges FORCE ROW LEVEL SECURITY/);
  assert.match(bootstrapSql, /ALTER TABLE auth_trusted_devices FORCE ROW LEVEL SECURITY/);
});
