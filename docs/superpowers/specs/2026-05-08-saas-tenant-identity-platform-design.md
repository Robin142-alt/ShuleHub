# SaaS Tenant Identity Platform Design

## Goal

Build a production-grade SaaS tenant onboarding, authentication, user management, invitation, password recovery, session, and subscription access platform for Shule Hub.

The product must behave like a real school ERP SaaS business platform:

- Platform owners onboard and operate schools from `superadmin.domain.com`.
- Schools receive isolated tenant workspaces at `{school}.domain.com`.
- Tenant login, invitations, password recovery, sessions, dashboards, permissions, and billing access are tenant-aware.
- No password is manually exposed to school users.
- PostgreSQL RLS and tenant-scoped repositories remain the safety boundary.

## Current Context

The repository already has useful foundations:

- NestJS API under `apps/api/src`
- Next.js web app under `apps/web/src`
- request context and tenant middleware
- JWT access and refresh tokens
- Redis-backed sessions
- RBAC and ABAC guards
- PostgreSQL RLS on tenant-scoped tables
- billing/subscription lifecycle tables and access middleware
- hosted frontend routing for `superadmin`, school subdomains, and portal

The current gaps are:

- school onboarding is not a real platform workflow
- there is no tenant registry table with branding/config/status
- superadmin auth and dashboards still rely heavily on demo frontend state
- user invitations and password recovery are not backed by secure API flows
- sessions are not exposed as an operational user-management surface
- role routing is inconsistent with the required role URL map
- users can still encounter demo credential panels and review copy in login surfaces

The correct strategy is to harden the existing foundation, not replace it.

## Chosen Architecture

Use the existing monorepo and keep one NestJS API plus one Next.js application.

The backend owns all authoritative identity state:

- `tenants`
- `tenant_memberships`
- `roles`
- `permissions`
- `user_invitations`
- `password_resets`
- `sessions` or Redis session records with an API projection
- `audit_logs`
- `subscriptions`

The frontend is a thin operational client:

- `superadmin.domain.com` routes to platform control pages
- `{school}.domain.com/login` loads tenant branding and subscription access state
- invitation and reset pages call secure API endpoints
- successful login redirects by role, never by user selection

## Host and Tenant Resolution

Every API request resolves a tenant context before protected code runs.

For school hosts:

1. Normalize the host header.
2. Extract the subdomain.
3. Resolve the subdomain against `tenants`.
4. Reject unknown, suspended, or invalid tenants where the route requires active access.
5. Inject `tenant_id`, request ID, user ID, role, session ID, IP, and user agent into request context.
6. Apply `SET LOCAL app.tenant_id`, `app.user_id`, `app.role`, and related context for PostgreSQL RLS.
7. Validate active tenant membership for authenticated requests.

For `superadmin.domain.com`, the request is platform-scoped and must not impersonate a school tenant unless a support tool explicitly performs a scoped read using a controlled service method.

## Tenant Registry

Add a first-class `tenants` table:

- `id`
- `tenant_id`
- `school_name`
- `slug`
- `primary_domain`
- `contact_email`
- `phone`
- `address`
- `county`
- `plan_code`
- `student_limit`
- `status`
- `onboarding_status`
- `branding jsonb`
- `metadata jsonb`
- `created_at`
- `updated_at`

Statuses:

- `provisioning`
- `active`
- `past_due`
- `suspended`
- `archived`

Onboarding statuses:

- `created`
- `admin_invited`
- `admin_activated`
- `setup_in_progress`
- `complete`

Tenant registry reads for login branding are public but restricted to safe fields. Operational tenant management requires superadmin permission.

## Super Admin Platform

Superadmin users are platform users with `audience = "superadmin"` and no school `tenant_id`.

Superadmin features:

- create school tenant
- manage tenant status and suspension
- manage plan and student limit
- view subscription lifecycle
- resend or revoke school admin invitation
- initiate password reset assistance without seeing passwords
- monitor login activity and active sessions
- view audit logs and user activity
- view usage/onboarding analytics

Superadmin endpoints use platform permissions and audit every operational action.

## Tenant Onboarding

Flow:

1. Superadmin submits school registration fields.
2. API validates subdomain uniqueness and slug policy.
3. API inserts the tenant registry record.
4. API creates default role/permission baseline for the tenant.
5. API creates or updates the billing subscription baseline.
6. API creates an invited tenant membership for the first school admin.
7. API creates a single-use invitation token and stores only its hash.
8. API records audit events.
9. API returns an invitation delivery payload for the mail provider.
10. School admin accepts invitation, sets password, and activates membership.
11. Tenant onboarding status advances to `admin_activated`.
12. School admin lands in setup wizard or dashboard depending on completion state.

No generated password is shown or stored in plain text.

## Invitations

Create:

- `user_invitations`
- `invitation_tokens`

Invitation records include:

- `tenant_id`
- `email`
- `display_name`
- `role`
- `status`
- `expires_at`
- `accepted_at`
- `revoked_at`
- `created_by_user_id`
- `metadata`
- timestamps

Tokens include:

- `tenant_id`
- `invitation_id`
- `token_hash`
- `expires_at`
- `used_at`
- timestamps

Invitation acceptance:

1. Validate token hash, expiry, tenant, and invitation status.
2. Validate password policy.
3. Create or activate global user.
4. Activate tenant membership with the invited role.
5. Mark token used and invitation accepted.
6. Audit the event.
7. Invalidate any stale sessions for the user.
8. Return login-ready state.

## Password Recovery

Create `password_resets` with:

- `tenant_id`
- `user_id`
- `email`
- `token_hash`
- `status`
- `expires_at`
- `used_at`
- `requested_ip`
- `requested_user_agent`
- timestamps

Forgot password request:

- always returns the same response for existing and missing users
- rate limited by IP, email, and tenant
- creates a single-use expiring token only for active users with active tenant membership
- stores only token hash
- sends a tenant-branded reset URL
- audits request without leaking account existence

Reset password:

- validates token hash and expiry
- updates bcrypt password hash
- marks token used
- invalidates all user sessions
- audits success or failure

## Session Management

Keep Redis as the fast session authority and expose an operational session API:

- list current user's active sessions
- revoke a single session
- logout all devices
- admin revoke user sessions

Each session tracks:

- `session_id`
- `user_id`
- `tenant_id`
- `role`
- `audience`
- permissions
- IP
- user agent
- browser/device summary
- created timestamp
- updated timestamp
- refresh expiry
- suspicious flag

Suspicious login detection for this slice:

- flag when same user opens a session from a new IP or different user-agent family within a short window
- audit suspicious session creation

## Role Routing

Successful login never asks the user to choose a dashboard.

Route map:

- superadmin -> `/superadmin/dashboard`
- principal -> `/dashboard`
- bursar -> `/finance/dashboard`
- teacher -> `/academics/dashboard`
- storekeeper -> `/inventory/dashboard`
- librarian -> `/library/dashboard`
- parent -> `/portal/dashboard`

Unrecognized school roles fall back to `/dashboard` only if the role is active and authorized.

## RBAC and ABAC

Expose a policy engine:

```ts
canAccess(user, resource, action, context)
```

It evaluates:

- authenticated session state
- active tenant membership
- role permissions
- wildcard permissions
- contextual constraints such as tenant ID, ownership, subscription mode, and support context

The API guards remain the enforcement point. The frontend only hides unavailable navigation; it does not authorize.

## Subscription-Aware Access

School tenants require an active subscription lifecycle to log in normally.

Rules:

- `active` and `trialing` subscriptions allow full access.
- `past_due` allows login with warning and grace messaging.
- `restricted` can allow read-only or billing-only access depending on billing lifecycle.
- `suspended`, `canceled`, and `expired` block tenant login and show renewal/support notice.

Data is retained safely for expired or suspended tenants.

## Audit Logging and Observability

Audit these events:

- tenant created
- tenant suspended or activated
- subscription changed
- invitation created, accepted, revoked, resent
- password reset requested and completed
- login success and failure
- session revoked
- role or membership changed
- support reset assistance

Each audit event includes:

- `tenant_id`
- `actor_user_id`
- `request_id`
- IP address
- user agent
- action
- resource type
- resource ID
- metadata

Structured logs must include request ID, tenant ID, user ID, and session ID when available.

Metrics:

- login success rate
- failed login count
- active tenant count
- onboarding completion count
- invite acceptance count
- password reset count
- suspended tenant count

## Frontend Experience

Build operational surfaces, not demos:

- superadmin dashboard and tenant control center
- tenant onboarding form
- tenant detail panel with subscription and support actions
- school-branded login page
- invitation acceptance page
- forgot/reset password pages
- school user management page
- active sessions page

Remove demo credential panels from production-facing login flows. Test/demo credentials may remain only in internal test fixtures.

The UI should be dense, calm, and institutional:

- tables over generic cards for operational lists
- clear status indicators
- restrained colors
- no marketing hero treatment in the app shell
- direct actions with confirmation states

## Implementation Boundaries

This design is one large platform feature. Implement it in slices:

1. database schema and repositories
2. tenant onboarding service and controller
3. invitation service and controller
4. password recovery service and controller
5. session management service and controller
6. superadmin live API client integration
7. school login/invite/reset/user/session UI
8. tests and verification

Existing payments, library, and tenant-finance dirty files must not be reverted or reformatted as part of this work.

## Acceptance Criteria

- A superadmin can create a school tenant from API/UI.
- Tenant creation provisions tenant config, roles, subscription baseline, and first admin invitation.
- Tenant login loads branding from tenant registry.
- Users activate accounts by invitation and set their own password.
- Forgot/reset password uses expiring hashed tokens and invalidates old sessions.
- Sessions can be listed and revoked.
- Login redirects by role using the required route map.
- Suspended/expired tenants cannot log in and receive a renewal notice.
- RLS remains enforced for tenant-scoped tables.
- Audit logs capture identity and onboarding events.
- Tests cover tenant isolation, invitations, password recovery, session revocation, role routing, and subscription blocks.
