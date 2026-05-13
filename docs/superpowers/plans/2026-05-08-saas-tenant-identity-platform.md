# SaaS Tenant Identity Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real tenant onboarding, invitation-based activation, password recovery, role routing, session management, and subscription-aware access for Shule Hub.

**Architecture:** Extend the existing NestJS API and Next.js app. The backend owns tenant identity state, token generation, membership activation, session revocation, audit logging, and subscription gates. The frontend becomes an operational client for superadmin onboarding, school-branded login, invite acceptance, password reset, user management, and active sessions.

**Tech Stack:** NestJS 11, PostgreSQL with RLS, Redis sessions, bcrypt, Next.js 16, React 19, TypeScript, Jest/node:test, Testing Library.

---

## File Structure

Backend files to create:

- `apps/api/src/modules/onboarding/onboarding.module.ts`
- `apps/api/src/modules/onboarding/onboarding-schema.service.ts`
- `apps/api/src/modules/onboarding/onboarding.controller.ts`
- `apps/api/src/modules/onboarding/onboarding.service.ts`
- `apps/api/src/modules/onboarding/dto/create-tenant.dto.ts`
- `apps/api/src/modules/onboarding/entities/tenant.entity.ts`
- `apps/api/src/modules/onboarding/repositories/tenants.repository.ts`
- `apps/api/src/auth/invitations.controller.ts`
- `apps/api/src/auth/invitation.service.ts`
- `apps/api/src/auth/password-recovery.controller.ts`
- `apps/api/src/auth/password-recovery.service.ts`
- `apps/api/src/auth/repositories/invitations.repository.ts`
- `apps/api/src/auth/repositories/password-resets.repository.ts`
- `apps/api/src/auth/sessions.controller.ts`
- `apps/api/src/auth/audit.service.ts`
- `apps/api/src/auth/role-routing.ts`

Backend files to modify:

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.constants.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/session.service.ts`
- `apps/api/src/auth/repositories/users.repository.ts`
- `apps/api/src/auth/repositories/tenant-memberships.repository.ts`
- `apps/api/src/tenant/tenant.service.ts`

Frontend files to create:

- `apps/web/src/app/invite/accept/page.tsx`
- `apps/web/src/app/api/auth/invitations/accept/route.ts`
- `apps/web/src/app/api/auth/password/forgot/route.ts`
- `apps/web/src/app/api/auth/password/reset/route.ts`
- `apps/web/src/components/auth/invitation-acceptance-view.tsx`
- `apps/web/src/components/school/user-management-panel.tsx`
- `apps/web/src/components/school/session-management-panel.tsx`
- `apps/web/src/lib/auth/role-routing.ts`
- `apps/web/src/lib/platform/tenant-onboarding-client.ts`

Frontend files to modify:

- `apps/web/src/components/auth/school-login-view.tsx`
- `apps/web/src/components/auth/auth-recovery-view.tsx`
- `apps/web/src/components/platform/superadmin-pages.tsx`
- `apps/web/src/lib/auth/server-auth-client.ts`
- `apps/web/src/lib/auth/experience-routing.ts`
- `apps/web/src/lib/experiences/types.ts`

Tests to create or modify:

- `apps/api/src/auth/auth.test.ts`
- `apps/api/src/auth/identity-platform.test.ts`
- `apps/api/test/auth-security.integration-spec.ts`
- `apps/web/tests/design/role-routing.test.ts`
- `apps/web/tests/design/auth.test.tsx`
- `apps/web/tests/design/invitation-recovery.test.tsx`

## Task 1: Backend Schema, Tenant Registry, and Role Catalog

**Files:**

- Create: `apps/api/src/modules/onboarding/onboarding-schema.service.ts`
- Create: `apps/api/src/modules/onboarding/entities/tenant.entity.ts`
- Create: `apps/api/src/modules/onboarding/repositories/tenants.repository.ts`
- Modify: `apps/api/src/auth/auth.constants.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing unit test for role catalog coverage**

Add a test in `apps/api/src/auth/identity-platform.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ROLE_CATALOG, getDefaultDashboardPathForRole } from './auth.constants';

test('default SaaS identity roles include required school roles and dashboard routes', () => {
  const roleCodes = new Set(DEFAULT_ROLE_CATALOG.map((role) => role.code));

  for (const role of ['principal', 'bursar', 'teacher', 'storekeeper', 'librarian', 'parent']) {
    assert.equal(roleCodes.has(role), true, `${role} must be provisioned for each tenant`);
  }

  assert.equal(getDefaultDashboardPathForRole('principal'), '/dashboard');
  assert.equal(getDefaultDashboardPathForRole('bursar'), '/finance/dashboard');
  assert.equal(getDefaultDashboardPathForRole('teacher'), '/academics/dashboard');
  assert.equal(getDefaultDashboardPathForRole('storekeeper'), '/inventory/dashboard');
  assert.equal(getDefaultDashboardPathForRole('librarian'), '/library/dashboard');
  assert.equal(getDefaultDashboardPathForRole('parent'), '/portal/dashboard');
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm run build`

Expected: FAIL because `getDefaultDashboardPathForRole` and several roles do not exist.

- [ ] **Step 3: Implement role catalog and schema bootstrap**

Add required roles and route helper in `auth.constants.ts`. Create `tenants`, `user_invitations`, `invitation_tokens`, and `password_resets` in `onboarding-schema.service.ts`, enabling RLS on tenant-scoped tables and allowing safe public tenant lookup by slug through a security-definer function.

- [ ] **Step 4: Run test and build**

Run: `npm run build`

Expected: PASS TypeScript build for new backend files.

## Task 2: Tenant Onboarding API

**Files:**

- Create: `apps/api/src/modules/onboarding/dto/create-tenant.dto.ts`
- Create: `apps/api/src/modules/onboarding/onboarding.controller.ts`
- Create: `apps/api/src/modules/onboarding/onboarding.service.ts`
- Create: `apps/api/src/modules/onboarding/onboarding.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing service test**

Add to `apps/api/src/auth/identity-platform.test.ts`:

```ts
test('tenant onboarding provisions tenant, roles, subscription baseline, and first admin invitation', async () => {
  const calls: string[] = [];
  const service = new OnboardingService(
    { createTenant: async () => { calls.push('tenant'); return { tenant_id: 'greenfield', slug: 'greenfield' }; } } as never,
    { ensureTenantAuthorizationBaseline: async () => calls.push('roles') } as never,
    { ensureBaselineSubscription: async () => calls.push('subscription') } as never,
    { createInvitation: async () => { calls.push('invitation'); return { invitation_id: 'invite-1', accept_url: 'https://greenfield.domain.com/invite/accept?token=t' }; } } as never,
    { record: async () => calls.push('audit') } as never,
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
  });

  assert.deepEqual(calls, ['tenant', 'roles', 'subscription', 'invitation', 'audit']);
  assert.equal(result.tenant.tenant_id, 'greenfield');
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm run build`

Expected: FAIL because `OnboardingService` does not exist.

- [ ] **Step 3: Implement service and controller**

Create `POST /onboarding/tenants` with DTO validation and superadmin guard. Return tenant summary plus invitation delivery payload. Audit tenant creation.

- [ ] **Step 4: Run backend build**

Run: `npm run build`

Expected: PASS.

## Task 3: Invitations and Account Activation

**Files:**

- Create: `apps/api/src/auth/invitations.controller.ts`
- Create: `apps/api/src/auth/invitation.service.ts`
- Create: `apps/api/src/auth/repositories/invitations.repository.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/repositories/users.repository.ts`
- Modify: `apps/api/src/auth/repositories/tenant-memberships.repository.ts`

- [ ] **Step 1: Write failing invitation test**

Add to `identity-platform.test.ts`:

```ts
test('accepting an invitation stores a hashed password and activates membership', async () => {
  const events: string[] = [];
  const service = new InvitationService(
    { findValidToken: async () => ({ invitation_id: 'invite-1', tenant_id: 'greenfield', email: 'principal@greenfield.ac.ke', role: 'principal' }), markAccepted: async () => events.push('accepted') } as never,
    { hash: async () => { events.push('hash'); return 'bcrypt-hash'; } } as never,
    { ensureGlobalUserForInvitation: async () => { events.push('user'); return { id: 'user-1', email: 'principal@greenfield.ac.ke', password_hash: 'bcrypt-hash', display_name: 'Principal', status: 'active' }; } } as never,
    { activateInvitedMembership: async () => events.push('membership') } as never,
    { invalidateUserSessions: async () => events.push('sessions') } as never,
    { record: async () => events.push('audit') } as never,
  );

  await service.acceptInvitation({ token: 'raw-token', password: 'correct horse battery staple', display_name: 'Principal' });

  assert.deepEqual(events, ['hash', 'user', 'membership', 'accepted', 'sessions', 'audit']);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm run build`

Expected: FAIL because `InvitationService` does not exist.

- [ ] **Step 3: Implement invitation flow**

Use `randomBytes(32).toString('base64url')` for raw tokens and SHA-256 hashes for storage. Never return the raw token after creation except in the immediate delivery payload. Acceptance sets password, activates membership, marks token used, and audits.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

## Task 4: Password Recovery

**Files:**

- Create: `apps/api/src/auth/password-recovery.controller.ts`
- Create: `apps/api/src/auth/password-recovery.service.ts`
- Create: `apps/api/src/auth/repositories/password-resets.repository.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/repositories/users.repository.ts`

- [ ] **Step 1: Write failing password reset test**

Add to `identity-platform.test.ts`:

```ts
test('password reset invalidates old sessions after setting the new hash', async () => {
  const events: string[] = [];
  const service = new PasswordRecoveryService(
    { findValidToken: async () => ({ tenant_id: 'greenfield', user_id: 'user-1', email: 'user@example.test' }), markUsed: async () => events.push('used') } as never,
    { hash: async () => { events.push('hash'); return 'new-hash'; } } as never,
    { updatePasswordHash: async () => events.push('password') } as never,
    { invalidateUserSessions: async () => events.push('sessions') } as never,
    { record: async () => events.push('audit') } as never,
  );

  await service.resetPassword({ token: 'reset-token', password: 'correct horse battery staple' });

  assert.deepEqual(events, ['hash', 'password', 'used', 'sessions', 'audit']);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm run build`

Expected: FAIL because `PasswordRecoveryService` does not exist.

- [ ] **Step 3: Implement forgot/reset endpoints**

Forgot password returns a generic response, creates reset tokens only for valid active memberships, and audits. Reset validates token, hashes password, marks token used, invalidates sessions, and audits.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

## Task 5: Session Management and Audit Logging

**Files:**

- Create: `apps/api/src/auth/sessions.controller.ts`
- Create: `apps/api/src/auth/audit.service.ts`
- Modify: `apps/api/src/auth/session.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

- [ ] **Step 1: Write failing session test**

Add to `identity-platform.test.ts`:

```ts
test('session service lists and revokes user sessions without exposing refresh token ids', async () => {
  const service = new SessionService(inMemoryRedisWithTwoSessionsFor('user-1') as never);

  const sessions = await service.listUserSessions('user-1');
  assert.equal(sessions.length, 2);
  assert.equal('refresh_token_id' in sessions[0], false);

  await service.invalidateSession(sessions[0].session_id);
  const remaining = await service.listUserSessions('user-1');
  assert.equal(remaining.length, 1);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm run build`

Expected: FAIL because `listUserSessions` is missing.

- [ ] **Step 3: Implement listing, revoke-current, revoke-all, admin revoke**

Return safe metadata only: session ID, role, audience, IP, device/browser summary, timestamps, and expiry.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

## Task 6: Frontend Role Routing and Production Login

**Files:**

- Create: `apps/web/src/lib/auth/role-routing.ts`
- Modify: `apps/web/src/lib/auth/server-auth-client.ts`
- Modify: `apps/web/src/components/auth/school-login-view.tsx`
- Modify: `apps/web/src/lib/experiences/types.ts`

- [ ] **Step 1: Write failing frontend routing test**

Add `apps/web/tests/design/role-routing.test.ts`:

```ts
import { getRoleHomePath } from '@/lib/auth/role-routing';

test('routes school users directly to the required role dashboard', () => {
  expect(getRoleHomePath('superadmin')).toBe('/superadmin/dashboard');
  expect(getRoleHomePath('principal')).toBe('/dashboard');
  expect(getRoleHomePath('bursar')).toBe('/finance/dashboard');
  expect(getRoleHomePath('teacher')).toBe('/academics/dashboard');
  expect(getRoleHomePath('storekeeper')).toBe('/inventory/dashboard');
  expect(getRoleHomePath('librarian')).toBe('/library/dashboard');
  expect(getRoleHomePath('parent')).toBe('/portal/dashboard');
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm --prefix apps/web run test:design -- role-routing.test.ts`

Expected: FAIL because `role-routing.ts` does not exist.

- [ ] **Step 3: Implement routing helper and remove production demo credential panels**

Use helper in `server-auth-client.ts` and school login. Remove demo credential panels from production-facing login views.

- [ ] **Step 4: Run frontend tests**

Run: `npm --prefix apps/web run test:design -- role-routing.test.ts auth.test.tsx`

Expected: PASS.

## Task 7: Superadmin and School Identity UI

**Files:**

- Create: `apps/web/src/components/auth/invitation-acceptance-view.tsx`
- Create: `apps/web/src/app/invite/accept/page.tsx`
- Create: `apps/web/src/components/school/user-management-panel.tsx`
- Create: `apps/web/src/components/school/session-management-panel.tsx`
- Modify: `apps/web/src/components/platform/superadmin-pages.tsx`
- Modify: `apps/web/src/components/auth/auth-recovery-view.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests in `apps/web/tests/design/invitation-recovery.test.tsx` that render invite acceptance and reset forms, submit valid data, and assert the API routes are called.

- [ ] **Step 2: Run test and verify it fails**

Run: `npm --prefix apps/web run test:design -- invitation-recovery.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement forms and operational panels**

Build controlled forms with validation, disabled/busy states, success states, and institutional copy. Use tables for user/session management.

- [ ] **Step 4: Run tests**

Run: `npm --prefix apps/web run test:design -- invitation-recovery.test.tsx auth.test.tsx`

Expected: PASS.

## Task 8: Verification

**Files:**

- Modify only files touched by earlier tasks if verification reveals defects.

- [ ] **Step 1: Run backend build and unit tests**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Run focused API unit tests**

Run: `node --test dist/apps/api/src/auth/auth.test.js dist/apps/api/src/auth/identity-platform.test.js`

Expected: PASS.

- [ ] **Step 3: Run frontend design tests**

Run: `npm --prefix apps/web run test:design`

Expected: PASS or report pre-existing unrelated failures with exact test names.

- [ ] **Step 4: Start frontend dev server for browser verification**

Run: `npm run web:dev`

Expected: Next dev server starts on an available port.

- [ ] **Step 5: Verify in browser**

Open:

- `http://localhost:3000/superadmin`
- `http://localhost:3000/login`
- `http://localhost:3000/invite/accept?token=sample`
- `http://localhost:3000/school/forgot-password`
- `http://localhost:3000/school/reset-password`

Expected: pages render without overflow, demo credential panels are absent from production login, invite/reset forms are usable, and role redirects are encoded in client/server helper tests.
