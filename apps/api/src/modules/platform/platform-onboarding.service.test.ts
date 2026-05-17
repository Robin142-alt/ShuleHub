import assert from 'node:assert/strict';
import test from 'node:test';

import { PlatformOnboardingService } from './platform-onboarding.service';

test('PlatformOnboardingService creates a school and sends an invite without exposing the token', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const baselines: string[] = [];
  const sentInvites: Array<{ to: string; inviteUrl: string }> = [];

  const service = new PlatformOnboardingService(
    {
      withRequestTransaction: async (callback: () => Promise<unknown>) => callback(),
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });

        if (text.includes('INSERT INTO tenants')) {
          return {
            rows: [
              {
                tenant_id: 'green-valley',
                name: 'Green Valley School',
                subdomain: 'green-valley',
                status: 'active',
                created_at: new Date('2026-05-11T00:00:00.000Z'),
              },
            ],
          };
        }

        if (text.includes('INSERT INTO auth_action_tokens')) {
          return { rows: [{ id: '00000000-0000-0000-0000-000000000801' }] };
        }

        if (text.includes('INSERT INTO auth_email_outbox')) {
          return { rows: [{ id: '00000000-0000-0000-0000-000000000901' }] };
        }

        return { rows: [] };
      },
    } as never,
    {
      ensureTenantAuthorizationBaseline: async (tenantId: string) => {
        baselines.push(tenantId);
      },
    } as never,
    {
      assertTransactionalEmailConfigured: () => undefined,
      sendInvitationEmail: async (input: { to: string; inviteUrl: string }) => {
        sentInvites.push(input);
      },
    } as never,
    { get: (key: string) => (key === 'email.publicAppUrl' ? 'https://shule-hub-erp.vercel.app' : undefined) } as never,
    {
      getStore: () => ({
        user_id: 'platform-owner',
      }),
    } as never,
  );

  const response = await service.createSchool({
    school_name: 'Green Valley School',
    tenant_id: 'Green Valley',
    admin_email: 'Principal@Example.test',
    admin_name: 'Principal User',
  });

  assert.deepEqual(baselines, ['green-valley']);
  assert.equal(sentInvites.length, 1);
  assert.equal(sentInvites[0]?.to, 'principal@example.test');
  assert.match(sentInvites[0]?.inviteUrl ?? '', /^https:\/\/shule-hub-erp\.vercel\.app\/invite\/accept\?token=/);
  assert.equal(response.tenant_id, 'green-valley');
  assert.equal(response.invitation_sent, true);
  assert.equal(JSON.stringify(response).includes('token='), false);
  const tokenInsert = queries.find((query) => query.text.includes('INSERT INTO auth_action_tokens'));
  assert.match(String(tokenInsert?.values[3]), /^[a-f0-9]{64}$/);
  assert.equal(String(tokenInsert?.values[2]), 'principal@example.test');
  const outboxInsert = queries.find((query) => query.text.includes('INSERT INTO auth_email_outbox'));
  assert.doesNotMatch(String(outboxInsert?.values[3] ?? ''), /token=|invite_url/);
});

test('PlatformOnboardingService rejects duplicate school URL slugs without sending an invite', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const baselines: string[] = [];
  const sentInvites: Array<{ to: string; inviteUrl: string }> = [];

  const service = new PlatformOnboardingService(
    {
      withRequestTransaction: async (callback: () => Promise<unknown>) => callback(),
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });

        if (text.includes('INSERT INTO tenants')) {
          return { rows: [] };
        }

        throw new Error(`Unexpected query after duplicate tenant: ${text}`);
      },
    } as never,
    {
      ensureTenantAuthorizationBaseline: async (tenantId: string) => {
        baselines.push(tenantId);
      },
    } as never,
    {
      assertTransactionalEmailConfigured: () => undefined,
      sendInvitationEmail: async (input: { to: string; inviteUrl: string }) => {
        sentInvites.push(input);
      },
    } as never,
    { get: (key: string) => (key === 'email.publicAppUrl' ? 'https://shule-hub-erp.vercel.app' : undefined) } as never,
    {
      getStore: () => ({
        user_id: 'platform-owner',
      }),
    } as never,
  );

  await assert.rejects(
    () =>
      service.createSchool({
        school_name: 'Existing School',
        tenant_id: 'existing-school',
        admin_email: 'principal@example.test',
        admin_name: 'Principal User',
      }),
    /already exists/i,
  );

  assert.deepEqual(baselines, []);
  assert.equal(sentInvites.length, 0);
  assert.equal(queries.some((query) => query.text.includes('auth_action_tokens')), false);
  assert.equal(queries.some((query) => query.text.includes('auth_email_outbox')), false);
});

test('PlatformOnboardingService wraps school creation and invitation delivery in a transaction', async () => {
  let transactionCalls = 0;

  const service = new PlatformOnboardingService(
    {
      withRequestTransaction: async (callback: () => Promise<unknown>) => {
        transactionCalls += 1;
        return callback();
      },
      query: async (text: string) => {
        if (text.includes('INSERT INTO tenants')) {
          return {
            rows: [
              {
                tenant_id: 'green-valley',
                name: 'Green Valley School',
                subdomain: 'green-valley',
                status: 'active',
                created_at: new Date('2026-05-11T00:00:00.000Z'),
              },
            ],
          };
        }

        if (text.includes('INSERT INTO auth_action_tokens')) {
          return { rows: [{ id: '00000000-0000-0000-0000-000000000801' }] };
        }

        if (text.includes('INSERT INTO auth_email_outbox')) {
          return { rows: [{ id: '00000000-0000-0000-0000-000000000901' }] };
        }

        return { rows: [] };
      },
    } as never,
    {
      ensureTenantAuthorizationBaseline: async () => undefined,
    } as never,
    {
      assertTransactionalEmailConfigured: () => undefined,
      sendInvitationEmail: async () => {
        throw new Error('Resend rejected the invitation');
      },
    } as never,
    { get: (key: string) => (key === 'email.publicAppUrl' ? 'https://shule-hub-erp.vercel.app' : undefined) } as never,
    {
      getStore: () => ({
        user_id: 'platform-owner',
      }),
    } as never,
  );

  await assert.rejects(
    () =>
      service.createSchool({
        school_name: 'Green Valley School',
        tenant_id: 'Green Valley',
        admin_email: 'principal@example.test',
        admin_name: 'Principal User',
      }),
    /Resend rejected the invitation/,
  );

  assert.equal(transactionCalls, 1);
});
