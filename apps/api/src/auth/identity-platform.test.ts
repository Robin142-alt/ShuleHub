import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ROLE_CATALOG,
  getDefaultDashboardPathForRole,
} from './auth.constants';
import { InvitationService } from './invitation.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { SessionService } from './session.service';
import { OnboardingService } from '../modules/onboarding/onboarding.service';

test('default SaaS identity roles include required school roles and dashboard routes', () => {
  const roleCodes = new Set(DEFAULT_ROLE_CATALOG.map((role) => role.code));

  for (const role of ['principal', 'bursar', 'teacher', 'storekeeper', 'librarian', 'parent'] as const) {
    assert.equal(roleCodes.has(role), true, `${role} must be provisioned for each tenant`);
  }

  assert.equal(getDefaultDashboardPathForRole('superadmin'), '/superadmin/dashboard');
  assert.equal(getDefaultDashboardPathForRole('principal'), '/dashboard');
  assert.equal(getDefaultDashboardPathForRole('bursar'), '/finance/dashboard');
  assert.equal(getDefaultDashboardPathForRole('teacher'), '/academics/dashboard');
  assert.equal(getDefaultDashboardPathForRole('storekeeper'), '/inventory/dashboard');
  assert.equal(getDefaultDashboardPathForRole('librarian'), '/library/dashboard');
  assert.equal(getDefaultDashboardPathForRole('parent'), '/portal/dashboard');
});

test('accepting an invitation stores a hashed password and activates membership', async () => {
  const events: string[] = [];
  const service = new InvitationService(
    {
      findValidToken: async () => ({
        invitation_id: 'invite-1',
        tenant_id: 'greenfield',
        email: 'principal@greenfield.ac.ke',
        role: 'principal',
      }),
      markAccepted: async () => {
        events.push('accepted');
      },
    } as never,
    {
      hash: async () => {
        events.push('hash');
        return 'bcrypt-hash';
      },
    } as never,
    {
      ensureGlobalUserForInvitation: async () => {
        events.push('user');
        return {
          id: 'user-1',
          tenant_id: 'global',
          email: 'principal@greenfield.ac.ke',
          password_hash: 'bcrypt-hash',
          display_name: 'Principal',
          status: 'active',
          created_at: new Date('2026-05-08T00:00:00.000Z'),
          updated_at: new Date('2026-05-08T00:00:00.000Z'),
        };
      },
    } as never,
    {
      activateInvitedMembership: async () => {
        events.push('membership');
      },
    } as never,
    {
      invalidateUserSessions: async () => {
        events.push('sessions');
      },
    } as never,
    {
      record: async () => {
        events.push('audit');
      },
    } as never,
  );

  const result = await service.acceptInvitation({
    token: 'raw-token',
    password: 'correct horse battery staple',
    display_name: 'Principal',
  });

  assert.equal(result.email, 'principal@greenfield.ac.ke');
  assert.deepEqual(events, ['hash', 'user', 'membership', 'accepted', 'sessions', 'audit']);
});

test('password reset invalidates old sessions after setting the new hash', async () => {
  const events: string[] = [];
  const service = new PasswordRecoveryService(
    {
      findValidToken: async () => ({
        tenant_id: 'greenfield',
        user_id: 'user-1',
        email: 'user@example.test',
      }),
      markUsed: async () => {
        events.push('used');
      },
    } as never,
    {
      hash: async () => {
        events.push('hash');
        return 'new-hash';
      },
    } as never,
    {
      updatePasswordHash: async () => {
        events.push('password');
      },
    } as never,
    {
      invalidateUserSessions: async () => {
        events.push('sessions');
      },
    } as never,
    {
      record: async () => {
        events.push('audit');
      },
    } as never,
  );

  await service.resetPassword({
    token: 'reset-token',
    password: 'correct horse battery staple',
  });

  assert.deepEqual(events, ['hash', 'password', 'used', 'sessions', 'audit']);
});

test('session service lists and revokes user sessions without exposing refresh token ids', async () => {
  const redis = new TestRedisClient();
  const service = new SessionService({ getClient: () => redis } as never);
  const refreshExpiresAt = new Date(Date.now() + 60_000).toISOString();

  await service.createSession({
    user_id: 'user-1',
    tenant_id: 'greenfield',
    role: 'principal',
    audience: 'school',
    permissions: ['*:*'],
    session_id: 'session-1',
    is_authenticated: true,
    refresh_token_id: 'refresh-1',
    refresh_expires_at: refreshExpiresAt,
    ip_address: '127.0.0.1',
    user_agent: 'Mozilla/5.0 Chrome/120',
  });
  await service.createSession({
    user_id: 'user-1',
    tenant_id: 'greenfield',
    role: 'principal',
    audience: 'school',
    permissions: ['*:*'],
    session_id: 'session-2',
    is_authenticated: true,
    refresh_token_id: 'refresh-2',
    refresh_expires_at: refreshExpiresAt,
    ip_address: '127.0.0.2',
    user_agent: 'Mozilla/5.0 Firefox/120',
  });

  const sessions = await service.listUserSessions('user-1');

  assert.equal(sessions.length, 2);
  assert.equal('refresh_token_id' in sessions[0], false);
  assert.equal(sessions[0].device_label.length > 0, true);

  await service.invalidateSession(sessions[0].session_id);
  const remaining = await service.listUserSessions('user-1');

  assert.equal(remaining.length, 1);
});

test('tenant onboarding provisions tenant, roles, subscription baseline, and first admin invitation', async () => {
  const calls: string[] = [];
  const service = new OnboardingService(
    {
      createTenant: async () => {
        calls.push('tenant');
        return {
          tenant_id: 'greenfield',
          slug: 'greenfield',
          school_name: 'Greenfield Academy',
          status: 'provisioning',
          onboarding_status: 'created',
        };
      },
      markAdminInvited: async () => undefined,
    } as never,
    {
      ensureTenantAuthorizationBaseline: async () => {
        calls.push('roles');
      },
    } as never,
    {
      ensureBaselineSubscription: async () => {
        calls.push('subscription');
      },
    } as never,
    {
      createInvitation: async () => {
        calls.push('invitation');
        return {
          invitation_id: 'invite-1',
          email: 'admin@greenfield.ac.ke',
          role: 'principal',
          accept_url: 'https://greenfield.domain.com/invite/accept?token=t',
          expires_at: '2026-05-15T00:00:00.000Z',
        };
      },
    } as never,
    {
      record: async () => {
        calls.push('audit');
      },
    } as never,
  );

  const result = await service.createSchoolTenant({
    school_name: 'Greenfield Academy',
    subdomain: 'greenfield',
    contact_email: 'admin@greenfield.ac.ke',
    phone: '+254700000000',
    address: 'Nairobi',
    county: 'Nairobi',
    plan: 'growth',
    student_limit: 600,
    branding: { primary_color: '#0f766e', logo_mark: 'GA' },
    base_url: 'https://greenfield.domain.com',
  });

  assert.deepEqual(calls, ['tenant', 'roles', 'subscription', 'invitation', 'audit']);
  assert.equal(result.tenant.tenant_id, 'greenfield');
  assert.equal(result.invitation.role, 'principal');
});

class TestRedisClient {
  private readonly values = new Map<string, string>();
  private readonly sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deletedValue = this.values.delete(key) ? 1 : 0;
    const deletedSet = this.sets.delete(key) ? 1 : 0;
    return deletedValue + deletedSet;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    let added = 0;

    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }

    this.sets.set(key, set);
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);

    if (!set) {
      return 0;
    }

    let removed = 0;

    for (const member of members) {
      if (set.delete(member)) {
        removed += 1;
      }
    }

    if (set.size === 0) {
      this.sets.delete(key);
    }

    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async watch(): Promise<'OK'> {
    return 'OK';
  }

  async unwatch(): Promise<'OK'> {
    return 'OK';
  }

  multi(): { set: () => { exec: () => Promise<Array<[null, 'OK']>> } } {
    return {
      set: () => ({
        exec: async () => [[null, 'OK']],
      }),
    };
  }
}
