# Three-System Frontend and Auth Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the School ERP SaaS into three fully separated, host-aware systems with distinct auth, routing, layouts, and permissions for platform owners, school staff, and parents/students.

**Architecture:** Keep one Next.js app for deployment simplicity, but enforce hard experience boundaries through host-based middleware rewrites, audience-aware auth sessions, and dedicated UI shells for `superadmin`, `school`, and `portal`. Extend the NestJS auth/session layer so tokens, sessions, and route protection understand experience audience and tenant scope instead of treating everything as one tenant dashboard.

**Tech Stack:** Next.js App Router, React 19, Tailwind 4, Jest, Playwright, NestJS 11, PostgreSQL, Redis sessions, JWT access/refresh tokens

---

## Scope Note

This spec spans four tightly related subsystems:

1. backend auth audience model
2. frontend routing and middleware foundation
3. separated application shells
4. legacy route migration

They are kept in one plan because the shared foundation is a prerequisite for all three product experiences, but each phase after Task 3 is independently shippable.

## Target File Structure

### Backend Auth Foundation

- Modify: `apps/api/src/auth/auth.interfaces.ts`
- Modify: `apps/api/src/auth/token.service.ts`
- Modify: `apps/api/src/auth/session.service.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/dto/auth-response.dto.ts`
- Modify: `apps/api/src/auth/auth.test.ts`
- Create: `apps/api/test/auth-experience-separation.integration-spec.ts`
- Create: `apps/api/test/support/auth-experience-test.module.ts`

### Frontend Routing and Auth Foundation

- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/routing/experience-host.ts`
- Create: `apps/web/src/lib/routing/experience-routes.ts`
- Create: `apps/web/src/lib/routing/experience-context.ts`
- Create: `apps/web/src/lib/auth/experience-audience.ts`
- Create: `apps/web/src/lib/auth/session-cookies.ts`
- Create: `apps/web/src/lib/auth/server-auth-client.ts`
- Create: `apps/web/src/lib/auth/server-session.ts`
- Create: `apps/web/src/lib/auth/use-experience-session.ts`
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/refresh/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/app/api/auth/me/route.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/unsupported-host/page.tsx`
- Create: `apps/web/src/app/forbidden/page.tsx`
- Create: `apps/web/src/app/session-expired/page.tsx`

### Experience Shells

- Create: `apps/web/src/components/system/app-frame.tsx`
- Create: `apps/web/src/components/system/app-sidebar.tsx`
- Create: `apps/web/src/components/system/app-topbar.tsx`
- Create: `apps/web/src/components/system/empty-state.tsx`
- Create: `apps/web/src/components/platform/platform-shell.tsx`
- Create: `apps/web/src/components/school/erp-shell.tsx`
- Create: `apps/web/src/components/portal/portal-shell.tsx`
- Modify: `apps/web/src/components/experience/workspace-shell.tsx`
- Modify: `apps/web/src/components/platform/superadmin-pages.tsx`
- Modify: `apps/web/src/components/school/school-pages.tsx`
- Modify: `apps/web/src/components/portal/portal-pages.tsx`

### Internal Experience Routes

- Create: `apps/web/src/app/__superadmin/login/page.tsx`
- Create: `apps/web/src/app/__superadmin/forgot-password/page.tsx`
- Create: `apps/web/src/app/__superadmin/reset-password/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/layout.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/dashboard/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/schools/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/revenue/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/subscriptions/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/mpesa-monitoring/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/support/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/audit-logs/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/infrastructure/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/notifications/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/settings/page.tsx`
- Create: `apps/web/src/app/__school/login/page.tsx`
- Create: `apps/web/src/app/__school/forgot-password/page.tsx`
- Create: `apps/web/src/app/__school/reset-password/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/layout.tsx`
- Create: `apps/web/src/app/__school/(tenant)/dashboard/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/students/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/students/[studentId]/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/admissions/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/finance/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/mpesa/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/attendance/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/academics/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/exams/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/inventory/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/staff/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/reports/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/communication/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/settings/page.tsx`
- Create: `apps/web/src/app/__portal/login/page.tsx`
- Create: `apps/web/src/app/__portal/forgot-password/page.tsx`
- Create: `apps/web/src/app/__portal/reset-password/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/layout.tsx`
- Create: `apps/web/src/app/__portal/(portal)/dashboard/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/fees/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/academics/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/attendance/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/messages/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/downloads/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/notifications/page.tsx`

### Legacy Compatibility Layer

- Modify: `apps/web/src/app/superadmin/page.tsx`
- Modify: `apps/web/src/app/superadmin/[section]/page.tsx`
- Modify: `apps/web/src/app/school/[role]/page.tsx`
- Modify: `apps/web/src/app/school/[role]/[section]/page.tsx`
- Modify: `apps/web/src/app/school/[role]/students/[studentId]/page.tsx`
- Modify: `apps/web/src/app/portal/[viewer]/page.tsx`
- Modify: `apps/web/src/app/portal/[viewer]/[section]/page.tsx`
- Modify: `apps/web/src/app/dashboard/[role]/page.tsx`
- Modify: `apps/web/src/app/dashboard/[role]/[module]/page.tsx`
- Modify: `apps/web/src/app/dashboard/[role]/students/[studentId]/page.tsx`

### Frontend Test Coverage

- Modify: `apps/web/tests/design/auth.test.tsx`
- Modify: `apps/web/tests/design/layout.test.tsx`
- Modify: `apps/web/tests/design/role.test.tsx`
- Modify: `apps/web/tests/design/interaction.test.tsx`
- Modify: `apps/web/tests/design/offline.test.tsx`
- Modify: `apps/web/tests/design/dashboard.spec.ts`
- Create: `apps/web/tests/design/experience-routing.test.ts`
- Create: `apps/web/tests/design/experience-shells.test.tsx`
- Create: `apps/web/tests/design/experience-separation.spec.ts`

---

### Task 1: Add experience audience to the backend auth and session model

**Files:**
- Modify: `apps/api/src/auth/auth.interfaces.ts`
- Modify: `apps/api/src/auth/token.service.ts`
- Modify: `apps/api/src/auth/session.service.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/dto/auth-response.dto.ts`
- Test: `apps/api/src/auth/auth.test.ts`

- [ ] **Step 1: Write the failing auth unit tests**

Add these cases to `apps/api/src/auth/auth.test.ts`:

```ts
test("rejects access tokens when the requested audience does not match the session audience", async () => {
  await expect(
    authService.authenticateAccessToken(token, "tenant-a", "superadmin"),
  ).rejects.toThrow("Access token does not belong to this audience");
});

test("allows platform sessions without a tenant id", async () => {
  const pair = await tokenService.issueTokenPair({
    user_id: "user-1",
    tenant_id: null,
    role: "platform_owner",
    audience: "superadmin",
    session_id: "session-1",
  });

  expect(pair.access_token).toBeTruthy();
});
```

- [ ] **Step 2: Run the auth test to verify it fails**

Run: `npm run build && node --test dist/src/auth/auth.test.js`

Expected: FAIL with a type or assertion error because `audience` and nullable `tenant_id` are not supported yet.

- [ ] **Step 3: Implement the backend audience model**

Update the auth types and token subject shape in `apps/api/src/auth/auth.interfaces.ts` and `apps/api/src/auth/token.service.ts`:

```ts
export type AuthAudience = "superadmin" | "school" | "portal";

export interface JwtTokenPayload {
  sub: string;
  user_id: string;
  tenant_id: string | null;
  role: string;
  audience: AuthAudience;
  session_id: string;
  token_id: string;
  type: "access" | "refresh";
}
```

Update session persistence in `apps/api/src/auth/session.service.ts`:

```ts
export interface AuthSessionRecord extends AuthenticatedPrincipal {
  audience: AuthAudience;
  refresh_token_id: string;
  created_at: string;
  updated_at: string;
  refresh_expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}
```

Update auth issuance and validation in `apps/api/src/auth/auth.service.ts`:

```ts
async authenticateAccessToken(
  accessToken: string,
  expectedTenantId: string | null,
  expectedAudience: AuthAudience,
): Promise<AuthenticatedPrincipal> {
  const payload = await this.tokenService.verifyAccessToken(accessToken);

  if (payload.audience !== expectedAudience) {
    throw new UnauthorizedException("Access token does not belong to this audience");
  }

  if (payload.tenant_id !== expectedTenantId) {
    throw new UnauthorizedException("Access token does not belong to this tenant");
  }

  const session = await this.sessionService.getSession(payload.session_id);

  if (!session || session.audience !== expectedAudience) {
    throw new UnauthorizedException("Session is no longer valid for this audience");
  }

  return this.sessionService.toPrincipal(session);
}
```

- [ ] **Step 4: Return the audience in auth responses**

Update `apps/api/src/auth/dto/auth-response.dto.ts`:

```ts
export interface AuthenticatedUserDto {
  user_id: string;
  tenant_id: string | null;
  role: string;
  audience: "superadmin" | "school" | "portal";
  email: string;
  display_name: string;
  permissions: string[];
  session_id: string;
}
```

Update `apps/api/src/auth/dto/login.dto.ts` and `apps/api/src/auth/auth.controller.ts` to accept:

```ts
audience: "superadmin" | "school" | "portal";
```

- [ ] **Step 5: Run the auth test to verify it passes**

Run: `npm run build && node --test dist/src/auth/auth.test.js`

Expected: PASS for the new audience-aware auth cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/auth.interfaces.ts apps/api/src/auth/token.service.ts apps/api/src/auth/session.service.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/dto/login.dto.ts apps/api/src/auth/dto/auth-response.dto.ts apps/api/src/auth/auth.test.ts
git commit -m "feat: add auth audience model for separated experiences"
```

### Task 2: Add backend auth integration coverage for superadmin, school, and portal boundaries

**Files:**
- Create: `apps/api/test/auth-experience-separation.integration-spec.ts`
- Create: `apps/api/test/support/auth-experience-test.module.ts`
- Modify: `apps/api/test/support/run-integration-with-local-postgres.ts`

- [ ] **Step 1: Write the failing integration spec**

Create `apps/api/test/auth-experience-separation.integration-spec.ts` with:

```ts
it("rejects a school token on a superadmin audience request", async () => {
  const schoolLogin = await loginSchoolUser(app, tenantId);

  await request(app.getHttpServer())
    .get("/auth/me")
    .set("authorization", `Bearer ${schoolLogin.tokens.access_token}`)
    .set("x-auth-audience", "superadmin")
    .expect(401);
});

it("rejects tenant access for a suspended tenant host context", async () => {
  await suspendTenant(tenantId);

  await request(app.getHttpServer())
    .post("/auth/login")
    .set("x-tenant-id", tenantId)
    .send({ email: schoolEmail, password: schoolPassword, audience: "school" })
    .expect(403);
});
```

- [ ] **Step 2: Run the new integration spec to verify it fails**

Run: `node -r ts-node/register/transpile-only -r tsconfig-paths/register apps/api/test/support/run-integration-with-local-postgres.ts jest --config jest.integration.config.js --runInBand apps/api/test/auth-experience-separation.integration-spec.ts`

Expected: FAIL because the API does not yet enforce audience headers or suspended-tenant auth behavior consistently.

- [ ] **Step 3: Implement the missing enforcement**

Use the existing request context and tenant middleware so the auth audience enters request scope explicitly:

```ts
const audienceHeader = request.headers["x-auth-audience"];
const audience = Array.isArray(audienceHeader) ? audienceHeader[0] : audienceHeader;

if (audience !== "superadmin" && audience !== "school" && audience !== "portal") {
  throw new UnauthorizedException("Authentication audience is required");
}
```

Apply the audience checks before issuing or hydrating principals in the auth module and test module wiring.

- [ ] **Step 4: Run the integration spec again**

Run: `node -r ts-node/register/transpile-only -r tsconfig-paths/register apps/api/test/support/run-integration-with-local-postgres.ts jest --config jest.integration.config.js --runInBand apps/api/test/auth-experience-separation.integration-spec.ts`

Expected: PASS for audience mismatch rejection and suspended-tenant blocking.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/auth-experience-separation.integration-spec.ts apps/api/test/support/auth-experience-test.module.ts apps/api/test/support/run-integration-with-local-postgres.ts apps/api/src/auth
git commit -m "test: cover auth audience and tenant boundary separation"
```

### Task 3: Build host-aware Next middleware and route rewrite foundation

**Files:**
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/routing/experience-host.ts`
- Create: `apps/web/src/lib/routing/experience-routes.ts`
- Create: `apps/web/src/lib/routing/experience-context.ts`
- Create: `apps/web/src/app/unsupported-host/page.tsx`
- Create: `apps/web/tests/design/experience-routing.test.ts`

- [ ] **Step 1: Write the failing middleware unit test**

Create `apps/web/tests/design/experience-routing.test.ts` with:

```ts
import { resolveExperienceFromHost, rewriteExperiencePath } from "@/lib/routing/experience-host";

test("rewrites superadmin dashboard requests into the internal superadmin namespace", () => {
  const resolution = resolveExperienceFromHost("superadmin.app.com");
  expect(resolution.experience).toBe("superadmin");
  expect(rewriteExperiencePath(resolution, "/dashboard")).toBe("/__superadmin/dashboard");
});

test("rewrites school students routes into the internal school namespace", () => {
  const resolution = resolveExperienceFromHost("greenfield.app.com");
  expect(resolution.experience).toBe("school");
  expect(rewriteExperiencePath(resolution, "/students")).toBe("/__school/students");
});
```

- [ ] **Step 2: Run the design test to verify it fails**

Run: `npm run web:test:design -- experience-routing.test.ts`

Expected: FAIL because `resolveExperienceFromHost` and `rewriteExperiencePath` do not exist yet.

- [ ] **Step 3: Implement host resolution and rewrites**

Create `apps/web/src/lib/routing/experience-host.ts`:

```ts
export type ExperienceKind = "superadmin" | "school" | "portal";

export interface HostResolution {
  experience: ExperienceKind;
  host: string;
  tenantSlug: string | null;
}

export function resolveExperienceFromHost(hostHeader: string): HostResolution {
  const host = hostHeader.split(":")[0].toLowerCase();

  if (host.startsWith("superadmin.")) {
    return { experience: "superadmin", host, tenantSlug: null };
  }

  if (host.startsWith("portal.")) {
    return { experience: "portal", host, tenantSlug: null };
  }

  const [tenantSlug] = host.split(".");
  return { experience: "school", host, tenantSlug };
}
```

Create `apps/web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveExperienceFromHost, rewriteExperiencePath } from "@/lib/routing/experience-host";

export function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return NextResponse.redirect(new URL("/unsupported-host", request.url));
  }

  const resolution = resolveExperienceFromHost(host);
  const internalPath = rewriteExperiencePath(resolution, request.nextUrl.pathname);
  const url = request.nextUrl.clone();
  url.pathname = internalPath;

  const response = NextResponse.rewrite(url);
  response.headers.set("x-shulehub-experience", resolution.experience);
  if (resolution.tenantSlug) {
    response.headers.set("x-shulehub-tenant-slug", resolution.tenantSlug);
  }

  return response;
}
```

- [ ] **Step 4: Add unsupported-host handling**

Create `apps/web/src/app/unsupported-host/page.tsx` with a clear recovery page and CTA back to the correct login host.

- [ ] **Step 5: Run the routing test again**

Run: `npm run web:test:design -- experience-routing.test.ts`

Expected: PASS for superadmin, school, and portal rewrite logic.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/lib/routing/experience-host.ts apps/web/src/lib/routing/experience-routes.ts apps/web/src/lib/routing/experience-context.ts apps/web/src/app/unsupported-host/page.tsx apps/web/tests/design/experience-routing.test.ts
git commit -m "feat: add host-aware experience routing middleware"
```

### Task 4: Replace localStorage auth with server-handled experience sessions

**Files:**
- Create: `apps/web/src/lib/auth/experience-audience.ts`
- Create: `apps/web/src/lib/auth/session-cookies.ts`
- Create: `apps/web/src/lib/auth/server-auth-client.ts`
- Create: `apps/web/src/lib/auth/server-session.ts`
- Create: `apps/web/src/lib/auth/use-experience-session.ts`
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/refresh/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/app/api/auth/me/route.ts`
- Modify: `apps/web/src/hooks/use-live-tenant-session.ts`
- Modify: `apps/web/src/lib/dashboard/api-client.ts`
- Modify: `apps/web/tests/design/auth.test.tsx`

- [ ] **Step 1: Write the failing auth view test**

Extend `apps/web/tests/design/auth.test.tsx`:

```tsx
test("school login submits through the Next auth gateway instead of client-side token storage", async () => {
  const loginMock = vi.fn().mockResolvedValue({ redirectTo: "/dashboard" });
  renderWithProviders(<SchoolLoginView resolution={resolveSchoolBranding("barakaacademy.app.com")} />, {
    authApi: { login: loginMock },
  });

  await user.type(screen.getByLabelText(/email or phone number/i), "bursar@barakaacademy.sch.ke");
  await user.type(screen.getByLabelText(/^password$/i), "School#2026");
  await user.click(screen.getByRole("button", { name: /sign in securely/i }));

  expect(loginMock).toHaveBeenCalledWith({
    audience: "school",
    identifier: "bursar@barakaacademy.sch.ke",
    password: "School#2026",
  });
});
```

- [ ] **Step 2: Run the auth test to verify it fails**

Run: `npm run web:test:design -- auth.test.tsx`

Expected: FAIL because the current login views still rely on local demo routing and `localStorage`.

- [ ] **Step 3: Implement the Next auth gateway**

Create `apps/web/src/lib/auth/session-cookies.ts`:

```ts
export const ACCESS_COOKIE = "shulehub_access";
export const REFRESH_COOKIE = "shulehub_refresh";
export const AUDIENCE_COOKIE = "shulehub_audience";
export const TENANT_COOKIE = "shulehub_tenant";
```

Create `apps/web/src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/auth/server-auth-client";

export async function POST(request: Request) {
  const body = await request.json();
  const authClient = createServerAuthClient(request);
  const session = await authClient.login(body);
  const response = NextResponse.json({ redirectTo: "/dashboard", user: session.user });

  response.cookies.set("shulehub_access", session.tokens.access_token, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  response.cookies.set("shulehub_refresh", session.tokens.refresh_token, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });

  return response;
}
```

Update `apps/web/src/hooks/use-live-tenant-session.ts` to delegate to a new `useExperienceSession` hook and remove direct browser token persistence.

- [ ] **Step 4: Update the auth views to use the shared server session hook**

Use this signature in `apps/web/src/lib/auth/use-experience-session.ts`:

```ts
export function useExperienceSession(audience: "superadmin" | "school" | "portal") {
  return {
    session,
    user,
    isLoading,
    isSubmitting,
    error,
    login,
    logout,
    refresh,
  };
}
```

- [ ] **Step 5: Run the auth test again**

Run: `npm run web:test:design -- auth.test.tsx`

Expected: PASS with login flowing through the new Next auth gateway.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/experience-audience.ts apps/web/src/lib/auth/session-cookies.ts apps/web/src/lib/auth/server-auth-client.ts apps/web/src/lib/auth/server-session.ts apps/web/src/lib/auth/use-experience-session.ts apps/web/src/app/api/auth/login/route.ts apps/web/src/app/api/auth/refresh/route.ts apps/web/src/app/api/auth/logout/route.ts apps/web/src/app/api/auth/me/route.ts apps/web/src/hooks/use-live-tenant-session.ts apps/web/src/lib/dashboard/api-client.ts apps/web/tests/design/auth.test.tsx
git commit -m "feat: add server-handled experience auth sessions"
```

### Task 5: Split the generic shell into dedicated platform, school, and portal shells

**Files:**
- Create: `apps/web/src/components/system/app-frame.tsx`
- Create: `apps/web/src/components/system/app-sidebar.tsx`
- Create: `apps/web/src/components/system/app-topbar.tsx`
- Create: `apps/web/src/components/platform/platform-shell.tsx`
- Create: `apps/web/src/components/school/erp-shell.tsx`
- Create: `apps/web/src/components/portal/portal-shell.tsx`
- Modify: `apps/web/src/components/experience/workspace-shell.tsx`
- Modify: `apps/web/src/components/platform/superadmin-pages.tsx`
- Modify: `apps/web/src/components/school/school-pages.tsx`
- Modify: `apps/web/src/components/portal/portal-pages.tsx`
- Modify: `apps/web/tests/design/layout.test.tsx`
- Modify: `apps/web/tests/design/role.test.tsx`

- [ ] **Step 1: Write the failing layout test**

Add to `apps/web/tests/design/layout.test.tsx`:

```tsx
test("does not reuse the same shell component across platform, school, and portal experiences", () => {
  render(<PlatformShell {...platformProps} />);
  expect(screen.getByText(/platform owner workspace/i)).toBeVisible();

  cleanup();
  render(<ErpShell {...schoolProps} />);
  expect(screen.getByText(/school workspace/i)).toBeVisible();

  cleanup();
  render(<PortalShell {...portalProps} />);
  expect(screen.getByText(/family portal/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the layout test to verify it fails**

Run: `npm run web:test:design -- layout.test.tsx`

Expected: FAIL because all experiences still rely on the generic `WorkspaceShell`.

- [ ] **Step 3: Implement the shared primitives and dedicated shells**

Create a neutral frame primitive in `apps/web/src/components/system/app-frame.tsx`:

```tsx
export function AppFrame({ sidebar, topbar, children }: AppFrameProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-[1400px] gap-6 px-4 py-4 md:px-6 lg:px-8">
        {sidebar}
        <div className="min-w-0">
          {topbar}
          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
```

Then build separate shells:

```tsx
export function PlatformShell(props: PlatformShellProps) {
  return <AppFrame sidebar={<PlatformSidebar {...props} />} topbar={<PlatformTopbar {...props} />}>{props.children}</AppFrame>;
}

export function ErpShell(props: ErpShellProps) {
  return <AppFrame sidebar={<ErpSidebar {...props} />} topbar={<ErpTopbar {...props} />}>{props.children}</AppFrame>;
}

export function PortalShell(props: PortalShellProps) {
  return <AppFrame sidebar={<PortalSidebar {...props} />} topbar={<PortalTopbar {...props} />}>{props.children}</AppFrame>;
}
```

- [ ] **Step 4: Switch pages off the generic shell**

Update `apps/web/src/components/platform/superadmin-pages.tsx`, `apps/web/src/components/school/school-pages.tsx`, and `apps/web/src/components/portal/portal-pages.tsx` so they import their dedicated shell instead of `WorkspaceShell`.

- [ ] **Step 5: Run the layout and role tests**

Run: `npm run web:test:design -- layout.test.tsx role.test.tsx`

Expected: PASS with distinct shells and preserved role visibility.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/system/app-frame.tsx apps/web/src/components/system/app-sidebar.tsx apps/web/src/components/system/app-topbar.tsx apps/web/src/components/platform/platform-shell.tsx apps/web/src/components/school/erp-shell.tsx apps/web/src/components/portal/portal-shell.tsx apps/web/src/components/platform/superadmin-pages.tsx apps/web/src/components/school/school-pages.tsx apps/web/src/components/portal/portal-pages.tsx apps/web/tests/design/layout.test.tsx apps/web/tests/design/role.test.tsx
git commit -m "refactor: split shared workspace shell into experience-specific shells"
```

### Task 6: Move the superadmin platform onto host-first internal routes

**Files:**
- Create: `apps/web/src/app/__superadmin/login/page.tsx`
- Create: `apps/web/src/app/__superadmin/forgot-password/page.tsx`
- Create: `apps/web/src/app/__superadmin/reset-password/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/layout.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/dashboard/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/schools/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/revenue/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/subscriptions/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/mpesa-monitoring/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/support/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/audit-logs/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/infrastructure/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/notifications/page.tsx`
- Create: `apps/web/src/app/__superadmin/(platform)/settings/page.tsx`
- Modify: `apps/web/src/app/superadmin/page.tsx`
- Modify: `apps/web/src/app/superadmin/[section]/page.tsx`

- [ ] **Step 1: Write the failing platform route test**

Add to `apps/web/tests/design/experience-separation.spec.ts`:

```ts
test("superadmin host serves the platform dashboard on /dashboard without a path prefix", async ({ page }) => {
  await page.goto("http://superadmin.localhost:3000/dashboard");
  await expect(page.getByRole("heading", { name: /platform owner workspace/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the Playwright test to verify it fails**

Run: `npm run web:test:design:e2e -- experience-separation.spec.ts`

Expected: FAIL because `/dashboard` still resolves to the mixed legacy dashboard.

- [ ] **Step 3: Create the internal platform route tree**

Use thin route files that delegate to the existing platform page components:

```tsx
import { SuperadminPages } from "@/components/platform/superadmin-pages";

export default function PlatformDashboardPage() {
  return <SuperadminPages section="overview" />;
}
```

Use the same pattern for `schools`, `revenue`, `subscriptions`, `mpesa-monitoring`, `support`, `audit-logs`, `infrastructure`, `notifications`, and `settings`.

- [ ] **Step 4: Turn the old `/superadmin/*` routes into compatibility redirects**

Update `apps/web/src/app/superadmin/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function LegacySuperadminHomePage() {
  redirect("/dashboard");
}
```

- [ ] **Step 5: Run the platform route Playwright test again**

Run: `npm run web:test:design:e2e -- experience-separation.spec.ts`

Expected: PASS for `superadmin.localhost:3000/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/__superadmin apps/web/src/app/superadmin/page.tsx apps/web/src/app/superadmin/[section]/page.tsx apps/web/tests/design/experience-separation.spec.ts
git commit -m "feat: move superadmin onto host-first internal routes"
```

### Task 7: Move the school ERP onto tenant-host routes with branding and role guards

**Files:**
- Create: `apps/web/src/app/__school/login/page.tsx`
- Create: `apps/web/src/app/__school/forgot-password/page.tsx`
- Create: `apps/web/src/app/__school/reset-password/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/layout.tsx`
- Create: `apps/web/src/app/__school/(tenant)/dashboard/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/students/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/students/[studentId]/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/admissions/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/finance/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/mpesa/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/attendance/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/academics/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/exams/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/inventory/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/staff/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/reports/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/communication/page.tsx`
- Create: `apps/web/src/app/__school/(tenant)/settings/page.tsx`
- Modify: `apps/web/src/lib/auth/school-branding.ts`
- Modify: `apps/web/src/app/school/[role]/page.tsx`
- Modify: `apps/web/src/app/school/[role]/[section]/page.tsx`
- Modify: `apps/web/src/app/school/[role]/students/[studentId]/page.tsx`
- Modify: `apps/web/src/components/auth/school-login-view.tsx`
- Modify: `apps/web/src/components/school/school-pages.tsx`

- [ ] **Step 1: Write the failing school separation tests**

Add to `apps/web/tests/design/role.test.tsx`:

```tsx
test("school dashboard renders finance visibility for bursar but blocks superadmin modules", async () => {
  render(<SchoolPages role="bursar" />);
  expect(screen.getByText(/mpesa transactions/i)).toBeVisible();
  expect(screen.queryByText(/tenant control/i)).toBeNull();
});
```

Add to `apps/web/tests/design/experience-separation.spec.ts`:

```ts
test("tenant host serves school dashboard on /dashboard", async ({ page }) => {
  await page.goto("http://greenfield.localhost:3000/dashboard");
  await expect(page.getByText(/school workspace/i)).toBeVisible();
  await expect(page.getByText(/greenfield/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run web:test:design -- role.test.tsx && npm run web:test:design:e2e -- experience-separation.spec.ts`

Expected: FAIL because the school routes still depend on `/school/[role]` and role in the path.

- [ ] **Step 3: Create the tenant-host school route tree**

Use server route files that read tenant context from middleware headers and infer the role from the authenticated session:

```tsx
import { SchoolPages } from "@/components/school/school-pages";
import { readSchoolRequestContext } from "@/lib/routing/experience-context";

export default async function SchoolDashboardPage() {
  const context = await readSchoolRequestContext();
  return <SchoolPages role={context.role} />;
}
```

- [ ] **Step 4: Remove role from the public school URL model**

Turn `apps/web/src/app/school/[role]/*` into compatibility redirects to the host-local `/dashboard`, `/students`, `/finance`, and other section routes.

- [ ] **Step 5: Keep school branding host-driven**

Update `apps/web/src/lib/auth/school-branding.ts` to resolve branding from the tenant slug in request context first, then fall back to the demo host resolver for local dev.

- [ ] **Step 6: Run the school tests again**

Run: `npm run web:test:design -- role.test.tsx && npm run web:test:design:e2e -- experience-separation.spec.ts`

Expected: PASS for bursar finance visibility and tenant-host `/dashboard`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/__school apps/web/src/lib/auth/school-branding.ts apps/web/src/app/school/[role]/page.tsx apps/web/src/app/school/[role]/[section]/page.tsx apps/web/src/app/school/[role]/students/[studentId]/page.tsx apps/web/src/components/auth/school-login-view.tsx apps/web/src/components/school/school-pages.tsx apps/web/tests/design/role.test.tsx apps/web/tests/design/experience-separation.spec.ts
git commit -m "feat: move school ERP onto tenant-host routes"
```

### Task 8: Move the parent and student portal onto a separate portal host with linked-user protections

**Files:**
- Create: `apps/web/src/app/__portal/login/page.tsx`
- Create: `apps/web/src/app/__portal/forgot-password/page.tsx`
- Create: `apps/web/src/app/__portal/reset-password/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/layout.tsx`
- Create: `apps/web/src/app/__portal/(portal)/dashboard/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/fees/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/academics/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/attendance/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/messages/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/downloads/page.tsx`
- Create: `apps/web/src/app/__portal/(portal)/notifications/page.tsx`
- Modify: `apps/web/src/app/portal/[viewer]/page.tsx`
- Modify: `apps/web/src/app/portal/[viewer]/[section]/page.tsx`
- Modify: `apps/web/src/components/auth/portal-login-view.tsx`
- Modify: `apps/web/src/components/portal/portal-pages.tsx`
- Modify: `apps/web/tests/design/interaction.test.tsx`

- [ ] **Step 1: Write the failing portal tests**

Add to `apps/web/tests/design/interaction.test.tsx`:

```tsx
test("portal dashboard shows only self-service sections and no school admin actions", () => {
  render(<PortalPages viewer="parent" />);
  expect(screen.getByText(/recent payments/i)).toBeVisible();
  expect(screen.queryByText(/record payment/i)).toBeNull();
  expect(screen.queryByText(/tenant control/i)).toBeNull();
});
```

Add to `apps/web/tests/design/experience-separation.spec.ts`:

```ts
test("portal host serves the family dashboard on /dashboard", async ({ page }) => {
  await page.goto("http://portal.localhost:3000/dashboard");
  await expect(page.getByText(/family portal/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run web:test:design -- interaction.test.tsx && npm run web:test:design:e2e -- experience-separation.spec.ts`

Expected: FAIL because the portal still depends on `/portal/[viewer]`.

- [ ] **Step 3: Create the portal route tree and viewer resolution**

Use server route files that infer `viewer` from the authenticated portal session:

```tsx
import { PortalPages } from "@/components/portal/portal-pages";
import { readPortalRequestContext } from "@/lib/routing/experience-context";

export default async function PortalDashboardPage() {
  const context = await readPortalRequestContext();
  return <PortalPages viewer={context.viewer} />;
}
```

- [ ] **Step 4: Convert `/portal/[viewer]/*` into compatibility redirects**

Update the current prefixed portal pages so they redirect to `/dashboard`, `/fees`, `/academics`, `/attendance`, `/messages`, `/downloads`, and `/notifications`.

- [ ] **Step 5: Run the portal tests again**

Run: `npm run web:test:design -- interaction.test.tsx && npm run web:test:design:e2e -- experience-separation.spec.ts`

Expected: PASS for family-only navigation and `portal.localhost:3000/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/__portal apps/web/src/app/portal/[viewer]/page.tsx apps/web/src/app/portal/[viewer]/[section]/page.tsx apps/web/src/components/auth/portal-login-view.tsx apps/web/src/components/portal/portal-pages.tsx apps/web/tests/design/interaction.test.tsx apps/web/tests/design/experience-separation.spec.ts
git commit -m "feat: move parent and student portal onto portal host routes"
```

### Task 9: Quarantine the legacy mixed dashboard and verify end-to-end boundaries

**Files:**
- Modify: `apps/web/src/app/dashboard/[role]/page.tsx`
- Modify: `apps/web/src/app/dashboard/[role]/[module]/page.tsx`
- Modify: `apps/web/src/app/dashboard/[role]/students/[studentId]/page.tsx`
- Modify: `apps/web/tests/design/dashboard.spec.ts`
- Modify: `apps/web/tests/design/offline.test.tsx`
- Create: `apps/web/tests/design/experience-shells.test.tsx`

- [ ] **Step 1: Write the failing legacy quarantine tests**

Add to `apps/web/tests/design/dashboard.spec.ts`:

```ts
test("legacy dashboard routes redirect into the new host-aware paths", async ({ page }) => {
  await page.goto("/dashboard/admin");
  await expect(page).not.toHaveURL(/\/dashboard\/admin$/);
});
```

- [ ] **Step 2: Run the Playwright suite to verify it fails**

Run: `npm run web:test:design:e2e`

Expected: FAIL because the mixed `/dashboard/*` routes are still first-class.

- [ ] **Step 3: Redirect or hide the legacy dashboard**

Update the legacy route files so they either:

```tsx
redirect("/dashboard");
```

for the correct host-aware session, or:

```tsx
redirect("/forbidden");
```

when the route is reached without a valid experience context.

- [ ] **Step 4: Verify the full frontend regression suite**

Run:

```bash
npm run web:lint
npm run web:test:design
npm run web:test:design:e2e
npm run web:build
```

Expected:

- `web:lint` passes
- Jest design suite passes
- Playwright design suite passes
- Next build passes

- [ ] **Step 5: Verify the backend auth regression suite**

Run:

```bash
npm run build
npm test
node -r ts-node/register/transpile-only -r tsconfig-paths/register apps/api/test/support/run-integration-with-local-postgres.ts jest --config jest.integration.config.js --runInBand apps/api/test/auth-experience-separation.integration-spec.ts
```

Expected:

- API build passes
- existing backend unit suite passes
- new auth experience separation integration suite passes

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard apps/web/tests/design/dashboard.spec.ts apps/web/tests/design/offline.test.tsx apps/web/tests/design/experience-shells.test.tsx
git commit -m "refactor: quarantine legacy mixed dashboard routes"
```

## Self-Review

### Spec coverage

- separate login systems -> Tasks 4, 6, 7, 8
- separate dashboards and layouts -> Tasks 5, 6, 7, 8
- host-based tenant resolution -> Task 3
- middleware responsibilities -> Tasks 2, 3, 4
- JWT, refresh tokens, session tracking -> Tasks 1, 4
- role segregation across superadmin, school, portal -> Tasks 1, 2, 6, 7, 8
- legacy mixed route quarantine -> Task 9
- realism, activity, and separated UX -> Tasks 5, 6, 7, 8

No major spec gaps remain.

### Placeholder scan

- no `TODO`
- no `TBD`
- no “similar to Task N”
- every task includes exact file paths and exact verification commands

### Type consistency

- auth audience type is consistently `superadmin | school | portal`
- internal route namespaces are consistently `__superadmin`, `__school`, `__portal`
- public dashboard destinations are consistently `/dashboard` on the correct host
