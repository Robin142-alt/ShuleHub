import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';
import { AuthService } from './auth.service';

test('AuthService register creates missing global users through the registration helper', async () => {
  const requestContext = new RequestContextService();
  let helperCallCount = 0;
  let createUserCallCount = 0;

  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => null,
      ensureGlobalUserForRegistration: async (input: {
        email: string;
        password_hash: string;
        display_name: string;
      }) => {
        helperCallCount += 1;

        return {
          id: '00000000-0000-0000-0000-000000000101',
          tenant_id: 'global',
          email: input.email,
          password_hash: input.password_hash,
          display_name: input.display_name,
          status: 'active',
          created_at: new Date('2026-05-04T00:00:00.000Z'),
          updated_at: new Date('2026-05-04T00:00:00.000Z'),
        };
      },
      createUser: async () => {
        createUserCallCount += 1;
        throw new Error('register should not call createUser directly');
      },
      findById: async () => null,
    } as never,
    {
      findMembershipByUserAndTenant: async () => null,
      countActiveMembershipsByTenant: async () => 0,
      createOrActivateMembership: async () => ({
        id: '00000000-0000-0000-0000-000000000201',
        tenant_id: 'tenant-a',
        user_id: '00000000-0000-0000-0000-000000000101',
        role_id: '00000000-0000-0000-0000-000000000301',
        role_code: 'owner',
        status: 'active',
        created_at: new Date('2026-05-04T00:00:00.000Z'),
        updated_at: new Date('2026-05-04T00:00:00.000Z'),
      }),
      findActiveMembership: async () => null,
    } as never,
    {
      ensureTenantAuthorizationBaseline: async () => undefined,
      getRoleByCode: async () => ({
        id: '00000000-0000-0000-0000-000000000301',
        tenant_id: 'tenant-a',
        code: 'owner',
        name: 'Owner',
        description: 'Full access',
        is_system: true,
        created_at: new Date('2026-05-04T00:00:00.000Z'),
        updated_at: new Date('2026-05-04T00:00:00.000Z'),
      }),
      getPermissionsByRoleId: async () => ['*:*'],
    } as never,
    {
      hash: async () => 'hashed-password',
      compare: async () => true,
    } as never,
    {
      issueTokenPair: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        access_expires_in: 900,
        refresh_expires_in: 2592000,
        access_expires_at: '2026-05-04T01:00:00.000Z',
        refresh_expires_at: '2026-06-04T00:00:00.000Z',
        session_id: 'session-1',
        refresh_token_id: 'refresh-1',
      }),
      verifyAccessToken: async () => {
        throw new Error('not used');
      },
      verifyRefreshToken: async () => {
        throw new Error('not used');
      },
    } as never,
    {
      createSession: async () => undefined,
      invalidateSession: async () => undefined,
      getSession: async () => null,
      rotateRefreshToken: async () => undefined,
      toPrincipal: () => {
        throw new Error('not used');
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-auth-1',
      tenant_id: 'tenant-a',
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/auth/register',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.register(
        {
          email: 'owner@example.test',
          password: 'SecurePass!2026',
          display_name: 'Owner',
        },
        {
          ip_address: '127.0.0.1',
          user_agent: 'test-suite',
        },
      ),
  );

  assert.equal(helperCallCount, 1);
  assert.equal(createUserCallCount, 0);
  assert.equal(response.user.email, 'owner@example.test');
  assert.equal(response.user.tenant_id, 'tenant-a');
});

test('AuthService authenticateAccessToken rejects access tokens when the audience does not match the session audience', async () => {
  const requestContext = new RequestContextService();

  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => null,
      ensureGlobalUserForRegistration: async () => {
        throw new Error('not used');
      },
      findById: async () => null,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      verifyAccessToken: async () => ({
        sub: 'user-1',
        user_id: 'user-1',
        tenant_id: 'tenant-a',
        role: 'principal',
        audience: 'school',
        session_id: 'session-1',
        token_id: 'token-1',
        type: 'access' as const,
      }),
      issueTokenPair: async () => {
        throw new Error('not used');
      },
      verifyRefreshToken: async () => {
        throw new Error('not used');
      },
    } as never,
    {
      getSession: async () => ({
        user_id: 'user-1',
        tenant_id: 'tenant-a',
        role: 'principal',
        audience: 'school',
        permissions: ['students:read'],
        session_id: 'session-1',
        is_authenticated: true,
        refresh_token_id: 'refresh-1',
        created_at: '2026-05-05T00:00:00.000Z',
        updated_at: '2026-05-05T00:00:00.000Z',
        refresh_expires_at: '2026-06-05T00:00:00.000Z',
        ip_address: '127.0.0.1',
        user_agent: 'test-suite',
      }),
      createSession: async () => undefined,
      invalidateSession: async () => undefined,
      rotateRefreshToken: async () => {
        throw new Error('not used');
      },
      toPrincipal: () => {
        throw new Error('not used');
      },
    } as never,
  );

  await assert.rejects(
    () => service.authenticateAccessToken('access-token', 'tenant-a', 'superadmin'),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === 'Access token does not belong to this audience',
  );
});

test('AuthService authenticateAccessToken allows platform sessions without a tenant id', async () => {
  const requestContext = new RequestContextService();
  const sessionRecord = {
    user_id: 'user-platform',
    tenant_id: null,
    role: 'platform_owner',
    audience: 'superadmin',
    permissions: ['*:*'],
    session_id: 'session-platform',
    is_authenticated: true,
    refresh_token_id: 'refresh-platform',
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
    refresh_expires_at: '2026-06-05T00:00:00.000Z',
    ip_address: '127.0.0.1',
    user_agent: 'test-suite',
  };

  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => null,
      ensureGlobalUserForRegistration: async () => {
        throw new Error('not used');
      },
      findById: async () => null,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      verifyAccessToken: async () => ({
        sub: 'user-platform',
        user_id: 'user-platform',
        tenant_id: null,
        role: 'platform_owner',
        audience: 'superadmin',
        session_id: 'session-platform',
        token_id: 'token-platform',
        type: 'access' as const,
      }),
      issueTokenPair: async () => {
        throw new Error('not used');
      },
      verifyRefreshToken: async () => {
        throw new Error('not used');
      },
    } as never,
    {
      getSession: async () => sessionRecord,
      createSession: async () => undefined,
      invalidateSession: async () => undefined,
      rotateRefreshToken: async () => {
        throw new Error('not used');
      },
      toPrincipal: (session: typeof sessionRecord) => ({
        user_id: session.user_id,
        tenant_id: session.tenant_id,
        role: session.role,
        permissions: session.permissions,
        session_id: session.session_id,
        is_authenticated: session.is_authenticated,
      }),
    } as never,
  );

  const principal = await service.authenticateAccessToken(
    'access-token',
    null,
    'superadmin',
  );

  assert.equal(principal.user_id, 'user-platform');
  assert.equal(principal.tenant_id, null);
  assert.equal(principal.role, 'platform_owner');
});
