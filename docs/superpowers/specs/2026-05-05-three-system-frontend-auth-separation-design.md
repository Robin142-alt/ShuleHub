# Three-System Frontend and Auth Separation Design

## Goal

Refactor the School ERP SaaS frontend and authentication architecture into three clearly separated systems:

1. Super Admin Platform
2. School ERP System
3. Parent and Student Portal

The result must feel enterprise-grade, secure, operational, and scalable, with strict separation of routes, layouts, sessions, permissions, and user experience.

## Current Context

The current frontend already contains three route families under:

- `apps/web/src/app/superadmin`
- `apps/web/src/app/school`
- `apps/web/src/app/portal`

There is also an older mixed route family under:

- `apps/web/src/app/dashboard`

The current UI layer is partly separated through:

- `apps/web/src/components/platform`
- `apps/web/src/components/school`
- `apps/web/src/components/portal`
- `apps/web/src/components/auth`
- `apps/web/src/components/ui`

The backend already has tenant-aware auth, JWT/session handling, request context, tenant middleware, RBAC/ABAC guards, and tenant-aware modules in:

- `apps/api/src/auth`
- `apps/api/src/middleware`
- `apps/api/src/guards`
- `apps/api/src/tenant`

This means the correct strategy is not to rebuild the product from zero, but to harden the existing application into three fully separated experience zones with a shared platform foundation.

## Recommended Architecture

### Chosen Approach

Use one Next.js application with three hard-isolated experience zones:

- `superadmin`
- `school`
- `portal`

This preserves deployment simplicity and shared primitives while still enforcing hard separation at:

- host resolution
- route groups
- middleware
- auth audience
- permissions
- layouts
- navigation
- session handling

### Why This Approach

This repository already has a mature shared web app, established route families, existing authentication surfaces, and shared primitives. Splitting into three entirely separate frontend apps now would increase duplication and delivery risk without improving immediate user outcomes enough to justify the cost.

This design keeps the system ready for future physical decomposition into multiple frontend apps if team structure or scale later requires it.

## Separation Principles

### Non-Negotiable System Boundaries

The following must be true after the refactor:

- Super admin users never see school or portal shells.
- School staff never enter superadmin routes.
- Parents and students never enter school or superadmin routes.
- Tenant users never cross tenant boundaries.
- Parent users only see linked students.
- Student users only see self-scoped records.

### Experience Separation

Each of the three systems must have unique:

- login experience
- dashboard
- navigation
- layout hierarchy
- route group
- session policy
- permission policy
- empty states
- activity feeds
- language and tone

Shared component reuse is allowed only for low-level primitives, not business-level experiences.

## Domain Model

### Experience Types

All requests are classified into one of these frontend experiences:

- `superadmin`
- `school`
- `portal`

### Viewer Types

All authenticated viewers are normalized into:

- `platform_owner`
- `support_agent`
- `platform_finance_admin`
- `platform_ops_admin`
- `principal`
- `bursar`
- `teacher`
- `registrar`
- `accountant`
- `school_admin`
- `parent`
- `student`
- `anonymous`

### Session States

All requests must resolve to one of:

- `authenticated`
- `expired`
- `anonymous`

## Host and Tenant Resolution

### Host Rules

The host determines the experience:

- `superadmin.app.com` -> `superadmin`
- `portal.app.com` -> `portal`
- `{school}.app.com` -> `school`

Development equivalents:

- `superadmin.localhost`
- `portal.localhost`
- `{school}.localhost`

### Tenant Resolution Flow

For school hosts:

1. Extract subdomain slug from request host.
2. Resolve slug to tenant metadata.
3. Load:
   - `tenant_id`
   - `tenant_slug`
   - `school_name`
   - `logo`
   - `theme colors`
   - `status`
4. Reject unknown or suspended tenants before page rendering.

### Resolved Request Context

Every request should resolve into a normalized frontend request context:

- `experience`
- `tenantSlug`
- `tenantId`
- `viewerType`
- `role`
- `sessionState`
- `permissions`
- `branding`
- `requestId`

This context must be available to:

- middleware
- server components
- route guards
- internal fetch clients
- UI shell components

## Frontend Route Architecture

### Public URL Model

The public URL model must be host-first, not path-prefixed:

#### Super Admin

- `https://superadmin.app.com/login`
- `https://superadmin.app.com/forgot-password`
- `https://superadmin.app.com/reset-password`
- `https://superadmin.app.com/dashboard`
- `https://superadmin.app.com/schools`
- `https://superadmin.app.com/revenue`
- `https://superadmin.app.com/subscriptions`
- `https://superadmin.app.com/mpesa-monitoring`
- `https://superadmin.app.com/support`
- `https://superadmin.app.com/audit-logs`
- `https://superadmin.app.com/infrastructure`
- `https://superadmin.app.com/notifications`
- `https://superadmin.app.com/settings`

#### School ERP

- `https://{school}.app.com/login`
- `https://{school}.app.com/forgot-password`
- `https://{school}.app.com/reset-password`
- `https://{school}.app.com/dashboard`
- `https://{school}.app.com/students`
- `https://{school}.app.com/students/{studentId}`
- `https://{school}.app.com/admissions`
- `https://{school}.app.com/finance`
- `https://{school}.app.com/mpesa`
- `https://{school}.app.com/attendance`
- `https://{school}.app.com/academics`
- `https://{school}.app.com/exams`
- `https://{school}.app.com/inventory`
- `https://{school}.app.com/staff`
- `https://{school}.app.com/reports`
- `https://{school}.app.com/communication`
- `https://{school}.app.com/settings`

#### Parent and Student Portal

- `https://portal.app.com/login`
- `https://portal.app.com/forgot-password`
- `https://portal.app.com/reset-password`
- `https://portal.app.com/dashboard`
- `https://portal.app.com/fees`
- `https://portal.app.com/academics`
- `https://portal.app.com/attendance`
- `https://portal.app.com/messages`
- `https://portal.app.com/downloads`
- `https://portal.app.com/notifications`

### Internal App Router Structure

Because all three experiences need overlapping public paths like `/login` and `/dashboard`, the internal filesystem should use hidden experience namespaces and middleware rewrites.

Frontend routes should be organized under `apps/web/src/app` as follows:

### Shared

- `page.tsx`
- `not-found.tsx`
- `forbidden/page.tsx`
- `session-expired/page.tsx`
- `unsupported-host/page.tsx`

### Super Admin Internal Namespace

- `__superadmin/login/page.tsx`
- `__superadmin/forgot-password/page.tsx`
- `__superadmin/reset-password/page.tsx`
- `__superadmin/(platform)/layout.tsx`
- `__superadmin/(platform)/dashboard/page.tsx`
- `__superadmin/(platform)/schools/page.tsx`
- `__superadmin/(platform)/revenue/page.tsx`
- `__superadmin/(platform)/subscriptions/page.tsx`
- `__superadmin/(platform)/mpesa-monitoring/page.tsx`
- `__superadmin/(platform)/support/page.tsx`
- `__superadmin/(platform)/audit-logs/page.tsx`
- `__superadmin/(platform)/infrastructure/page.tsx`
- `__superadmin/(platform)/notifications/page.tsx`
- `__superadmin/(platform)/settings/page.tsx`

### School ERP Internal Namespace

- `__school/login/page.tsx`
- `__school/forgot-password/page.tsx`
- `__school/reset-password/page.tsx`
- `__school/(tenant)/layout.tsx`
- `__school/(tenant)/dashboard/page.tsx`
- `__school/(tenant)/students/page.tsx`
- `__school/(tenant)/students/[studentId]/page.tsx`
- `__school/(tenant)/admissions/page.tsx`
- `__school/(tenant)/finance/page.tsx`
- `__school/(tenant)/mpesa/page.tsx`
- `__school/(tenant)/attendance/page.tsx`
- `__school/(tenant)/academics/page.tsx`
- `__school/(tenant)/exams/page.tsx`
- `__school/(tenant)/inventory/page.tsx`
- `__school/(tenant)/staff/page.tsx`
- `__school/(tenant)/reports/page.tsx`
- `__school/(tenant)/communication/page.tsx`
- `__school/(tenant)/settings/page.tsx`

### Parent and Student Portal Internal Namespace

- `__portal/login/page.tsx`
- `__portal/forgot-password/page.tsx`
- `__portal/reset-password/page.tsx`
- `__portal/(portal)/layout.tsx`
- `__portal/(portal)/dashboard/page.tsx`
- `__portal/(portal)/fees/page.tsx`
- `__portal/(portal)/academics/page.tsx`
- `__portal/(portal)/attendance/page.tsx`
- `__portal/(portal)/messages/page.tsx`
- `__portal/(portal)/downloads/page.tsx`
- `__portal/(portal)/notifications/page.tsx`

### Middleware Rewrite Model

Middleware should rewrite public host-scoped routes into the correct internal namespace before rendering:

- `superadmin.app.com/login` -> `/__superadmin/login`
- `superadmin.app.com/dashboard` -> `/__superadmin/dashboard`
- `greenfield.app.com/login` -> `/__school/login`
- `greenfield.app.com/students` -> `/__school/students`
- `portal.app.com/login` -> `/__portal/login`
- `portal.app.com/fees` -> `/__portal/fees`

This gives the product three truly separate public systems without forcing three separate Next.js deployments yet.

### Legacy Mixed Routes

The current mixed route family under `apps/web/src/app/dashboard` should be moved into one of two states:

- redirected into the new experience routes, or
- quarantined during migration and removed after parity is achieved

It must not remain the main navigation surface once the three-system split is complete.

## Layout and Navigation System

### Shared Rules

All systems must use a shared primitive design layer for:

- buttons
- cards
- tables
- badges
- dialogs
- forms
- skeletons

These primitives should stay under:

- `apps/web/src/components/ui`
- `apps/web/src/components/system` (new shared system area)

Business shells and dashboards must remain separated.

### Super Admin Layout

Tone:

- premium
- analytical
- operational
- Stripe / Vercel / Linear inspired

Structure:

- left sidebar
- compact topbar
- denser dashboards
- stronger system-state emphasis

Sidebar:

- Overview
- Schools
- Revenue
- Subscriptions
- MPESA Monitoring
- Support
- Audit Logs
- Infrastructure
- Notifications
- Settings

### School ERP Layout

Tone:

- trustworthy
- familiar
- finance-first
- operations-ready

Structure:

- school-branded shell
- practical topbar
- table-first workflows
- school identity visible without clutter

Sidebar:

- Dashboard
- Students
- Admissions
- Finance
- MPESA
- Attendance
- Academics
- Exams
- Inventory
- Staff
- Reports
- Communication
- Settings

### Parent and Student Portal Layout

Tone:

- simple
- friendly
- mobile-first
- low cognitive load

Structure:

- compact shell
- mobile-adaptive nav
- simpler summaries
- fewer decisions on each page

Sidebar:

- Dashboard
- Fees
- Academics
- Attendance
- Messages
- Downloads
- Notifications

## Authentication Architecture

### Auth Strategy

Use the existing backend session and JWT model, but normalize the frontend around zone-aware sessions:

- short-lived access JWT
- refresh token
- session registry
- logout everywhere support
- role-aware route protection

### Audience Separation

Sessions and tokens must be interpreted through frontend audience boundaries:

- superadmin audience -> platform routes only
- school audience -> tenant routes only
- portal audience -> portal routes only

Tokens valid for one audience must not silently pass in another.

### Login Flows

#### Super Admin Login

URL:

- `superadmin.app.com/login`

Fields:

- email
- password
- 2FA-ready step

Traits:

- premium SaaS
- minimal
- enterprise tone

#### School Login

URL:

- `{school}.app.com/login`

Fields:

- email or phone
- password
- remember me

Traits:

- tenant-aware branding
- school name
- school logo
- school-specific colors

#### Parent and Student Login

URL:

- `portal.app.com/login`

Fields:

- admission number or phone
- PIN/password

Traits:

- mobile-first
- simple
- non-technical

### Post-Login Destinations

- superadmin -> `/dashboard`
- school roles -> `/dashboard`
- portal roles -> `/dashboard`

The host and session context determine which dashboard the user reaches. Public URLs should not expose cross-system prefixes.

## Middleware and Route Protection

### Middleware Responsibilities

There should be one middleware entrypoint with separable internal steps:

1. `resolveExperienceFromHost`
2. `resolveTenantFromSubdomain`
3. `readSessionTokens`
4. `validateSessionForExperience`
5. `validateTenantForSession`
6. `enforceRoutePolicy`
7. `injectRequestContextHeaders`

### Required Middleware Behaviors

The middleware must:

- resolve tenant from subdomain
- validate authentication
- validate session freshness
- validate permission scope
- reject audience mismatch
- inject normalized request context
- protect all route groups
- redirect anonymous users to the correct login route
- redirect authenticated users away from incorrect login pages

### Route Policies

#### Superadmin Routes

- require `experience=superadmin`
- require platform session
- require platform role

#### School Routes

- require `experience=school`
- require tenant resolution
- require tenant-scoped session
- require role in tenant

#### Portal Routes

- require `experience=portal`
- require parent/student session
- require linked-entity validation

### Failure Modes

The frontend must provide clear separated states for:

- tenant not found
- forbidden
- session expired
- suspended tenant
- unsupported host

## Permission Model

### Platform Roles

- `platform_owner`
- `support_agent`
- `platform_finance_admin`
- `platform_ops_admin`

### School Roles

- `principal`
- `bursar`
- `teacher`
- `registrar`
- `accountant`
- `school_admin`

### Portal Roles

- `parent`
- `student`

### Guard Layers

Access must be enforced through:

1. host / experience guard
2. auth audience guard
3. role guard
4. tenant guard
5. linked-student guard for portal

UI hiding is not sufficient. Route-level protection is required.

## Data and Feature Separation

### Superadmin Can Access

- all schools
- subscriptions
- MRR and SaaS revenue
- MPESA platform monitoring
- infra health
- support operations
- audit and ops logs

### School Users Can Access

- only their own tenant
- operational school data
- financial school workflows
- student management
- staff workflows

### Portal Users Can Access

- only linked student data
- fees
- attendance
- academics
- messages
- downloads

### Explicit Non-Overlap

The UI and routing must not allow:

- platform metrics inside school dashboards
- school admin functions inside portal
- student/parent surfaces inside superadmin

## Design System Direction

### Shared Foundation

Across all three systems:

- white or light operational surfaces by default
- soft shadows
- rounded cards
- balanced spacing
- strong typography hierarchy
- clean table borders
- responsive grids
- no horizontal overflow

### Color Direction

Primary shared system color:

- emerald green

Support colors:

- slate gray
- green for success
- orange for warning
- red for error

Superadmin may use darker accent treatment, but it must still feel like part of the same company.

## Realism and Operational Feel

The platform must feel actively used.

Each system should include:

- realistic timestamps
- activity feeds
- notifications
- empty states
- loading skeletons
- validation messages
- state banners where needed

### Superadmin Realism

- failed callback list
- infra health issues
- support queue movement
- subscription and tenant alerts

### School Realism

- M-PESA feed
- defaulters list
- unpaid students
- attendance issues
- admissions activity
- staff actions

### Portal Realism

- recent payments
- fee balance
- results
- announcements
- downloads

## Internal Frontend Code Organization

### Shared

- `apps/web/src/components/ui`
- `apps/web/src/components/system` (new)
- `apps/web/src/lib/auth`
- `apps/web/src/lib/routing` (new)
- `apps/web/src/lib/tenant` (new)
- `apps/web/src/lib/session` (new)

### Superadmin

- `apps/web/src/components/platform`
- `apps/web/src/lib/platform`

### School

- `apps/web/src/components/school`
- `apps/web/src/lib/school`

### Portal

- `apps/web/src/components/portal`
- `apps/web/src/lib/portal`

### Migration Note

The current mixed business layer under:

- `apps/web/src/components/dashboard`
- `apps/web/src/lib/dashboard`

should be decomposed and reassigned into:

- platform
- school
- portal
- shared system primitives

Anything that is experience-specific should leave the shared dashboard area.

## API and Backend Integration Expectations

The frontend foundation will depend on existing backend capabilities:

- tenant-aware auth
- session validation
- request context
- role and permission checks
- tenant-bound host resolution

The frontend should add thin, experience-aware client adapters instead of coupling raw pages directly to mixed data helpers.

## Delivery Strategy

### Phase 1: Shared Foundation and Separated Shells

Implement:

- host resolution
- tenant resolution
- auth middleware
- request context injection
- protected route groups
- separate login pages
- separate layout systems
- separate nav trees
- legacy dashboard quarantine

This phase must already make the three systems feel separate.

### Phase 2: Superadmin Platform

Implement:

- overview
- schools
- revenue
- subscriptions
- MPESA monitoring
- support
- audit logs
- infrastructure
- notifications
- settings

### Phase 3: School ERP

Implement:

- dashboard
- students
- admissions
- finance
- MPESA
- attendance
- academics
- exams
- inventory
- staff
- reports
- communication
- settings

### Phase 4: Parent and Student Portal

Implement:

- dashboard
- fees
- academics
- attendance
- messages
- downloads
- notifications

### Phase 5: Cleanup and Migration

Implement:

- redirects from legacy routes
- compatibility layer removal
- shared primitive cleanup
- end-to-end security route tests

## Risks and Safeguards

### Main Risks

- route bleed between experiences
- mixed shared components carrying the wrong IA
- legacy dashboard routes remaining first-class
- tenant branding mixed into the wrong shells
- parent/student access relying on UI only

### Safeguards

- enforce host-based experience resolution in middleware
- enforce route policies before rendering
- move business widgets out of mixed folders
- create dedicated shells per system
- add design and auth tests per experience

## Recommendation Summary

The correct strategy is:

- keep one Next.js application for now
- hard-separate it into three experience zones
- implement one shared auth/routing foundation
- build foundation plus all three visible shells first
- migrate existing mixed dashboard code into platform, school, portal, or shared primitives

This yields the cleanest balance of:

- security
- maintainability
- delivery speed
- enterprise-grade product clarity

## Spec Approval Gate

Implementation planning should not begin until this design is reviewed and approved.
