import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../common/request-context/request-context.service';
import { AuthService } from './auth.service';

test('AuthService register rejects direct self-service account creation', async () => {
  const requestContext = new RequestContextService();

  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => null,
      createGlobalUserFromInvitation: async () => {
        throw new Error('register should not create users');
      },
      findById: async () => null,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      createSession: async () => undefined,
      invalidateSession: async () => undefined,
      getSession: async () => null,
      rotateRefreshToken: async () => undefined,
      toPrincipal: () => {
        throw new Error('not used');
      },
    } as never,
    { get: () => undefined } as never,
  );

  await assert.rejects(
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
    (error: unknown) =>
      error instanceof ForbiddenException
      && error.message === 'Account creation requires a valid invitation.',
  );
});

test('AuthService authenticateAccessToken rejects access tokens when the audience does not match the session audience', async () => {
  const requestContext = new RequestContextService();

  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => null,
      createGlobalUserFromInvitation: async () => {
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
    { get: () => undefined } as never,
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
    email_verified_at: '2026-05-14T00:00:00.000Z',
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
      createGlobalUserFromInvitation: async () => {
        throw new Error('not used');
      },
      findById: async () => null,
      findPlatformOwnerById: async () => ({
        id: 'user-platform',
        tenant_id: 'global',
        email: 'owner@example.test',
        password_hash: 'hashed-password',
        display_name: 'Platform Owner',
        status: 'active',
        email_verified_at: '2026-05-14T00:00:00.000Z',
      }),
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
        audience: session.audience,
        permissions: session.permissions,
        session_id: session.session_id,
        is_authenticated: session.is_authenticated,
      }),
    } as never,
    { get: () => undefined } as never,
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

test('AuthService authenticateAccessToken blocks existing unverified sensitive sessions', async () => {
  const requestContext = new RequestContextService();
  let invalidatedSessionId: string | null = null;
  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => null,
      createGlobalUserFromInvitation: async () => {
        throw new Error('not used');
      },
      findById: async () => ({
        id: 'user-admin',
        tenant_id: 'tenant-a',
        email: 'admin@example.test',
        password_hash: 'hashed-password',
        display_name: 'School Admin',
        status: 'active',
        email_verified_at: null,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      verifyAccessToken: async () => ({
        sub: 'user-admin',
        user_id: 'user-admin',
        tenant_id: 'tenant-a',
        role: 'admin',
        audience: 'school',
        session_id: 'session-admin',
        token_id: 'token-admin',
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
        user_id: 'user-admin',
        tenant_id: 'tenant-a',
        role: 'admin',
        audience: 'school',
        permissions: ['students:write'],
        session_id: 'session-admin',
        is_authenticated: true,
        refresh_token_id: 'refresh-admin',
        created_at: '2026-05-14T00:00:00.000Z',
        updated_at: '2026-05-14T00:00:00.000Z',
        refresh_expires_at: '2026-06-13T00:00:00.000Z',
        ip_address: '127.0.0.1',
        user_agent: 'test-suite',
      }),
      createSession: async () => undefined,
      invalidateSession: async (sessionId: string) => {
        invalidatedSessionId = sessionId;
      },
      rotateRefreshToken: async () => {
        throw new Error('not used');
      },
      toPrincipal: () => {
        throw new Error('unverified sessions should not become principals');
      },
    } as never,
    { get: () => undefined } as never,
  );

  await assert.rejects(
    () => service.authenticateAccessToken('access-token', 'tenant-a', 'school'),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === 'Verify your email before accessing sensitive workspace actions',
  );

  assert.equal(invalidatedSessionId, 'session-admin');
});

test('AuthService limits unverified email users to verification-only tenant sessions', async () => {
  const requestContext = new RequestContextService();
  let sessionPermissions: string[] | null = null;
  let sessionEmailVerifiedAt: string | null | undefined;
  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => ({
        id: 'user-admin',
        tenant_id: 'tenant-a',
        email: 'admin@example.test',
        password_hash: 'hashed-password',
        display_name: 'School Admin',
        status: 'active',
        email_verified_at: null,
      }),
    } as never,
    {
      findActiveMembership: async () => ({
        id: 'membership-admin',
        tenant_id: 'tenant-a',
        user_id: 'user-admin',
        role_id: 'role-admin',
        role_code: 'admin',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }),
    } as never,
    {
      ensureTenantAuthorizationBaseline: async () => undefined,
      getPermissionsByRoleId: async () => ['students:write'],
    } as never,
    {
      compare: async () => true,
    } as never,
    {
      issueTokenPair: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer' as const,
        access_expires_in: 900,
        refresh_expires_in: 2592000,
        access_expires_at: '2026-05-14T00:15:00.000Z',
        refresh_expires_at: '2026-06-13T00:00:00.000Z',
        access_token_id: 'access-token-id',
        refresh_token_id: 'refresh-token-id',
        session_id: 'session-admin',
      }),
    } as never,
    {
      createSession: async (input: { permissions: string[]; email_verified_at?: string | null }) => {
        sessionPermissions = input.permissions;
        sessionEmailVerifiedAt = input.email_verified_at;
      },
      invalidateSession: async () => undefined,
      getSession: async () => null,
      rotateRefreshToken: async () => undefined,
      toPrincipal: () => {
        throw new Error('not used');
      },
    } as never,
    { get: () => undefined } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-auth-email-unverified',
      tenant_id: 'tenant-a',
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/auth/login',
      started_at: '2026-05-14T00:00:00.000Z',
    },
    () =>
      service.login(
        {
          email: 'admin@example.test',
          password: 'SecurePass!2026',
          audience: 'school',
        },
        {
          ip_address: '127.0.0.1',
          user_agent: 'test-suite',
        },
      ),
  );

  assert.deepEqual(response.user.permissions, ['auth:read']);
  assert.equal(response.user.email_verified, false);
  assert.deepEqual(sessionPermissions, ['auth:read']);
  assert.equal(sessionEmailVerifiedAt, null);
});

test('AuthService exposes verified email state on tenant auth responses', async () => {
  const requestContext = new RequestContextService();
  let sessionCreated = false;
  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => ({
        id: 'user-admin',
        tenant_id: 'tenant-a',
        email: 'admin@example.test',
        password_hash: 'hashed-password',
        display_name: 'School Admin',
        status: 'active',
        email_verified_at: '2026-05-14T00:00:00.000Z',
      }),
    } as never,
    {
      findActiveMembership: async () => ({
        id: 'membership-admin',
        tenant_id: 'tenant-a',
        user_id: 'user-admin',
        role_id: 'role-admin',
        role_code: 'admin',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }),
    } as never,
    {
      ensureTenantAuthorizationBaseline: async () => undefined,
      getPermissionsByRoleId: async () => ['students:write'],
    } as never,
    {
      compare: async () => true,
    } as never,
    {
      issueTokenPair: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer' as const,
        access_expires_in: 900,
        refresh_expires_in: 2592000,
        access_expires_at: '2026-05-14T00:15:00.000Z',
        refresh_expires_at: '2026-06-13T00:00:00.000Z',
        access_token_id: 'access-token-id',
        refresh_token_id: 'refresh-token-id',
        session_id: 'session-admin',
      }),
    } as never,
    {
      createSession: async () => {
        sessionCreated = true;
      },
      invalidateSession: async () => undefined,
      getSession: async () => null,
      rotateRefreshToken: async () => undefined,
      toPrincipal: () => {
        throw new Error('not used');
      },
    } as never,
    { get: () => undefined } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-auth-email-verified',
      tenant_id: 'tenant-a',
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/auth/login',
      started_at: '2026-05-14T00:00:00.000Z',
    },
    () =>
      service.login(
        {
          email: 'admin@example.test',
          password: 'SecurePass!2026',
          audience: 'school',
        },
        {
          ip_address: '127.0.0.1',
          user_agent: 'test-suite',
        },
      ),
  );

  assert.equal(sessionCreated, true);
  assert.equal(response.user.email_verified, true);
  assert.equal(response.user.email_verified_at, '2026-05-14T00:00:00.000Z');
});

test('AuthService enforces MFA and can persist a trusted device during high-privilege login', async () => {
  const requestContext = new RequestContextService();
  const securityChecks: Record<string, unknown> = {};
  const service = new AuthService(
    requestContext,
    {
      findByEmail: async () => ({
        id: 'user-admin',
        tenant_id: 'tenant-a',
        email: 'admin@example.test',
        password_hash: 'hashed-password',
        display_name: 'School Admin',
        status: 'active',
        email_verified_at: '2026-05-14T00:00:00.000Z',
        mfa_enabled: true,
        mfa_verified_at: '2026-05-14T00:00:00.000Z',
      }),
    } as never,
    {
      findActiveMembership: async () => ({
        id: 'membership-admin',
        tenant_id: 'tenant-a',
        user_id: 'user-admin',
        role_id: 'role-admin',
        role_code: 'admin',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      }),
    } as never,
    {
      ensureTenantAuthorizationBaseline: async () => undefined,
      getPermissionsByRoleId: async () => ['users:write'],
    } as never,
    {
      compare: async () => true,
    } as never,
    {
      issueTokenPair: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer' as const,
        access_expires_in: 900,
        refresh_expires_in: 2592000,
        access_expires_at: '2026-05-14T00:15:00.000Z',
        refresh_expires_at: '2026-06-13T00:00:00.000Z',
        access_token_id: 'access-token-id',
        refresh_token_id: 'refresh-token-id',
        session_id: 'session-admin',
      }),
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
    { get: () => undefined } as never,
    {
      enforceLoginChallenge: async (input: Record<string, unknown>) => {
        securityChecks.mfa = input;
        return { status: 'verified' };
      },
    } as never,
    {
      isTrustedDevice: async (input: Record<string, unknown>) => {
        securityChecks.lookup = input;
        return false;
      },
      trustDevice: async (input: Record<string, unknown>) => {
        securityChecks.trust = input;
        return { trusted: true };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-auth-mfa-login',
      tenant_id: 'tenant-a',
      user_id: 'anonymous',
      role: 'guest',
      session_id: null,
      permissions: [],
      is_authenticated: false,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/auth/login',
      started_at: '2026-05-14T00:00:00.000Z',
    },
    () =>
      service.login(
        {
          email: 'admin@example.test',
          password: 'SecurePass!2026',
          audience: 'school',
          mfa_code: '123456',
          trusted_device_token: 'trusted-device-token-1',
          trust_device: true,
        },
        {
          ip_address: '127.0.0.1',
          user_agent: 'test-suite',
        },
      ),
  );

  assert.deepEqual(securityChecks.lookup, {
    userId: 'user-admin',
    rawToken: 'trusted-device-token-1',
  });
  assert.deepEqual(securityChecks.mfa, {
    userId: 'user-admin',
    role: 'admin',
    permissions: ['users:write'],
    mfaEnabled: true,
    mfaCode: '123456',
    trustedDevice: false,
  });
  assert.deepEqual(securityChecks.trust, {
    userId: 'user-admin',
    rawToken: 'trusted-device-token-1',
    ipAddress: '127.0.0.1',
    userAgent: 'test-suite',
  });
});
