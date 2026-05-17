# Implementation 10 - Production Score Maximization Plan

## Purpose

Raise ShuleHub ERP from "release gate passes" to a high-scoring production SaaS system across security, reliability, performance, tenant safety, UX completeness, provider integrations, and real-user workflow confidence.

This plan is based on a repository and live-environment scan performed on 2026-05-16.

The system already has strong foundations:

- Release readiness gate passes.
- Live API readiness endpoint is healthy.
- Postgres, Redis, and email are configured.
- Simplified login page is live and no longer asks for workspace codes.
- Attendance is retired from production readiness.
- Support, finance, integrations, library scanner, discipline, and SMS settings work exists in the codebase.
- Library workflows must stay practical for Kenyan schools: librarians identify students by admission number or name, then scan the book barcode or QR code.
- Login pages must remind users why the system matters: safer school operations, trusted records, parent confidence, and faster daily work.

The remaining work is score maximization: closing partial integrations, proving end-to-end workflows with real pilot data, replacing static operational telemetry with live data, strengthening CI gates, and producing audit-ready evidence.

## Scan Evidence

### Commands Verified

```powershell
npm run release:readiness
```

Result: Passed.

Release readiness verified:

- frontend module readiness
- streaming upload ingestion
- core API load workloads
- query plan review coverage
- synthetic journey coverage
- audit coverage review
- report export queue contract
- report snapshot manifest contract
- release scripts
- incident response runbook
- backup restore runbook
- implementation7 operability artifacts

```powershell
Invoke-WebRequest https://shulehub-production.up.railway.app/health/ready
```

Result: HTTP 200.

Observed live readiness:

- API status: ok
- Postgres: up
- Redis: up
- email: configured
- support notifications: partial
- SLO: healthy

```powershell
Invoke-WebRequest https://shule-hub-erp.vercel.app/login
```

Result: HTTP 200.

Observed login state:

- email login present
- password login present
- workspace code not present

### Repository Inventory

Approximate scanned repository size: 915 files.

Backend modules found:

- academics
- admissions
- billing
- compliance
- discipline
- events
- exams
- finance
- health
- hr
- integrations
- inventory
- library
- observability
- payments
- platform
- security
- seeder
- students
- support
- sync
- tenant-finance
- timetable

Frontend routes include:

- auth and login
- school workspace
- superadmin workspace
- parent portal
- support center
- inventory
- library
- discipline and counselling
- finance and integrations
- API proxy routes

### Remaining Signals Found By Scan

The scan found the following concrete improvement targets:

- Live health reports `support_notifications=partial`.
- Some frontend operational metrics still render `N/A` or static fallback telemetry.
- Support system status and superadmin infrastructure views need live-data wiring.
- Existing release gates are strong but need authenticated pilot workflow certification.
- Provider smoke checks and production run cadence require configured secrets and artifact retention.
- A formal repository-wide security scan artifact is still needed.
- Some modules are intentionally inactive in module readiness and must remain gated or be fully certified before exposure.
- Communication/SMS has working pieces, but readiness classification and dispatch-health reporting need to match the new dashboard-managed SMS settings model.

## Current Scorecard

| Area | Current Score | Target Score | Main Gap |
| --- | ---: | ---: | --- |
| Release readiness gate | 90 | 96 | Gate passes, but needs production evidence artifacts attached to CI |
| Authentication and session UX | 88 | 95 | Needs full real-user session expiry, recovery, and invitation certification |
| Tenant isolation | 88 | 96 | Needs automated cross-tenant negative tests across all high-risk modules |
| Finance and payments | 86 | 95 | Needs real Daraja, cheque, allocation, receipt, reversal, and report certification |
| Support and operations | 82 | 95 | Support notifications partial and some telemetry is still fallback-based |
| Provider integrations | 76 | 94 | SMS, object storage, malware scanning, and Daraja need live smoke evidence |
| Frontend UX completeness | 80 | 93 | Needs live empty states, no static operational metrics, mobile journey checks |
| Visual design and brand trust | 78 | 94 | Needs color harmony, warmer educational trust cues, and more meaningful auth pages |
| Performance and scale proof | 78 | 94 | Needs 1000+ school load model and query budget enforcement |
| Observability and recovery | 82 | 95 | Needs artifacted monitoring cadence, alert proof, backup restore proof |
| Overall production confidence | 84 | 95+ | Needs evidence-driven certification rather than code readiness alone |

## Highest Risk Gaps

### 1. Dashboard-managed SMS settings are not yet the single source for support notification health

Severity: High

Current state:

- Superadmin SMS settings UI exists.
- Platform SMS provider configuration exists in the integrations area.
- Live health still reports support notifications as partial.

Risk:

- Schools may believe SMS is configured while support notification delivery still relies on older or incomplete environment-based configuration.

Required fix:

- Make platform SMS provider settings the single source for all SMS dispatch.
- Update support notification delivery to use the platform SMS dispatch service.
- Update health checks to report the true active provider state.

### 2. Live dashboards still contain static fallback telemetry

Severity: High

Current state:

- Some support and superadmin status views still use `N/A` or fallback telemetry.

Risk:

- Operators cannot trust the dashboard during incidents.
- Investor or customer audits will notice dashboard metrics that look disconnected from production.

Required fix:

- Replace fallback status metrics with live API data.
- Show explicit configuration-required states when a provider is not configured.
- Preserve professional empty states without pretending data exists.

### 3. Production readiness lacks authenticated pilot workflow proof

Severity: High

Current state:

- Release readiness passes.
- Live unauthenticated smoke checks pass.
- Authenticated real-user workflow certification is not yet artifacted.

Risk:

- The system may pass build and smoke gates while school admins, accountants, librarians, parents, or counsellors hit dead ends.

Required fix:

- Create a pilot certification runner using a real test tenant.
- Record evidence for onboarding, finance, SMS, library scanner, support, discipline, parent portal, and exports.

### 4. Provider configuration is operationally split across environment variables and dashboard UX

Severity: Medium

Current state:

- Some infrastructure depends on environment variables.
- Some provider configuration is moving into dashboard-managed settings.

Risk:

- Operators may configure a value in the dashboard but the runtime path still uses an environment variable.
- Health checks may not match the actual sending path.

Required fix:

- Define which settings are platform-owned runtime secrets and which are school-owned tenant secrets.
- Align APIs, health checks, UI, and runbooks around that source of truth.

### 5. Scale claims need repeatable proof

Severity: Medium

Current state:

- Core load workloads exist.
- Query-plan review coverage exists.
- The 1000+ schools and thousands of users per second target needs a dedicated synthetic scale model.

Risk:

- The system may perform well in normal smoke checks but degrade under tenant-heavy report, SMS, fee, library, or support activity.

Required fix:

- Add a tenant-scale load profile and query budget gates.
- Add production-safe synthetic monitors for core journeys.

## Implementation Principles

- Preserve the current architecture.
- Do not reintroduce attendance.
- Do not add demo credentials, seeded fake users, or fake dashboard values.
- Make dashboard truth come from backend APIs.
- Keep tenant isolation mandatory for every query, export, notification, file, and report.
- Prefer simple, maintainable services over new infrastructure.
- Add evidence-producing gates, not just code.
- Keep Kenyan school workflows simple: use admission number, student name search, and familiar school terms instead of technical identifiers.
- Use an appealing, trustworthy color system that feels modern and calm without becoming playful or distracting.
- Make login pages purposeful: they should communicate that ShuleHub protects school records, supports parents, improves accountability, and keeps operations moving.

## Visual Identity Requirements

The UI must feel premium, friendly, and easy on the eyes.

### Color Direction

- Primary color: emerald or green for trust, growth, and education.
- Supporting colors: deep slate, clean white, soft green tints, calm blue accents, and restrained amber for alerts.
- Avoid harsh neon colors, muddy browns, excessive purple gradients, and one-color dashboards.
- Use status colors consistently:
  - green for healthy or completed
  - amber for attention
  - red for critical
  - blue for informational
  - slate for neutral system states

### Login Page Meaning

Every login page should quietly remind the user that the ERP matters.

Use concise messaging around:

- protecting school records
- helping parents stay informed
- keeping finance and MPESA records accurate
- supporting teachers with faster daily workflows
- helping leadership see what is happening in the school
- building trust through secure access

Login pages must still stay simple:

- email or phone where applicable
- password or OTP where applicable
- forgot password
- no workspace code
- no demo credentials
- no seeded hints

## Phase 1 - Production Scorecard And Evidence Artifacts

Goal: Turn readiness into an auditable score system with artifacts.

### Tasks

- [x] Create `docs/scorecards/production-readiness-scorecard.md`.
- [x] Create `apps/api/src/scripts/generate-production-scorecard.ts`.
- [x] Add `npm run scorecard:production`.
- [x] Include release gate status, scripts, provider smoke posture, monitoring posture, load posture, backup restore posture, and remediation evidence in the generated scorecard.
- [x] Make the scorecard fail below 95 once all phases are complete.
- [x] Upload the scorecard as a CI artifact in `.github/workflows/production-operability.yml`.

### Required Output

The scorecard must include:

- category score
- evidence source
- last run timestamp
- pass or fail status
- owner
- remediation link

### Acceptance Gate

```powershell
npm run scorecard:production
```

Pass condition:

- scorecard generated
- no missing evidence fields
- no fake or static evidence values

## Phase 2 - Make Provider Health Truthful

Goal: Ensure SMS, support notifications, Daraja, object storage, and malware scanning report real operational state.

### Files To Modify

- `apps/api/src/modules/integrations/integrations.module.ts`
- `apps/api/src/modules/integrations/platform-sms-settings.service.ts`
- `apps/api/src/modules/integrations/school-sms-wallet.service.ts`
- `apps/api/src/modules/support/support-notification-delivery.service.ts`
- `apps/api/src/modules/health/health.controller.ts`
- `apps/web/src/components/platform/superadmin-pages.tsx`
- `apps/web/src/lib/experiences/superadmin-data.ts`
- `apps/web/src/lib/support/support-data.ts`
- `apps/web/src/components/support/support-center-workspace.tsx`

### New Files

- `apps/api/src/modules/integrations/sms-dispatch.service.ts`
- `apps/api/src/modules/integrations/provider-health.service.ts`
- `apps/api/src/modules/integrations/sms-dispatch.service.spec.ts`
- `apps/api/src/modules/health/provider-health.spec.ts`

### Tasks

- [x] Create a backend `SmsDispatchService`.
- [x] Route school SMS and support ticket SMS through the same dispatch service.
- [x] Load the active provider from `platform_sms_settings`.
- [x] Decrypt provider credentials only inside backend service execution.
- [x] Never expose raw SMS credentials to frontend APIs.
- [x] Return masked provider metadata to the superadmin dashboard.
- [x] Update `/health/ready` to report:
  - active SMS provider exists
  - provider enabled
  - support notification channel available
  - object storage configured
  - malware scanner configured
  - email configured
  - Redis available
  - database available
- [x] Replace `support_notifications=partial` with a precise state:
  - `configured`
  - `disabled`
  - `missing_provider`
  - `missing_credentials`
  - `degraded`
- [x] Add tests for dashboard-managed missing provider and configured provider-health states.

### Acceptance Gate

```powershell
npm run api:test -- --runInBand sms-dispatch provider-health support-notification
npm run release:readiness
```

Pass condition:

- no support notification partial state unless a real degraded channel is detected
- support notifications use dashboard-managed active SMS provider when SMS is enabled
- no raw provider secret appears in logs, API responses, snapshots, or test output

## Phase 3 - Replace Static Operational Telemetry With Live Data

Goal: Remove the last dashboard credibility gaps.

### Files To Modify

- `apps/web/src/lib/support/support-data.ts`
- `apps/web/src/components/support/support-center-workspace.tsx`
- `apps/web/src/lib/experiences/superadmin-data.ts`
- `apps/web/src/components/platform/superadmin-pages.tsx`
- `apps/web/src/lib/dashboard/dashboard-source.ts`
- `apps/api/src/modules/observability/observability.controller.ts`
- `apps/api/src/modules/support/support-analytics.controller.ts`

### Tasks

- [x] Replace static `N/A` telemetry in support and superadmin infrastructure fallback data.
- [x] Add explicit configuration-required visual wording for disconnected live telemetry.
- [x] Add a `no_data_yet` style state for real empty support analytics.
- [x] Add a `degraded` state for unhealthy dependencies.
- [x] Add a support analytics endpoint for:
  - median response time
  - first response SLA
  - open tickets
  - escalated tickets
  - notification delivery state
  - system-status incidents
- [x] Add a superadmin infrastructure endpoint for:
  - API readiness
  - database readiness
  - Redis readiness
  - email readiness
  - SMS readiness
  - object storage readiness
  - malware scanning readiness
  - current deployment version
- [x] Ensure frontend views handle loading, error, empty, and degraded states.

### Acceptance Gate

```powershell
npm run web:lint
npm run web:build
npm run release:readiness
```

Pass condition:

- no operational dashboard displays static `N/A` for a metric that should be live
- empty production state is explicit and professional
- health dashboards match backend readiness response

## Phase 4 - Authenticated Pilot Workflow Certification

Goal: Prove that real users can complete the system's critical workflows.

### New Files

- `apps/api/src/scripts/run-pilot-certification.ts`
- `apps/api/src/scripts/module-certification.ts`
- `apps/api/src/scripts/certify-finance.ts`
- `apps/api/src/scripts/certify-library.ts`
- `apps/api/src/scripts/certify-discipline.ts`
- `docs/validation/implementation10-pilot-certification.md`
- `docs/validation/implementation10-finance-certification.md`
- `docs/validation/implementation10-library-certification.md`
- `docs/validation/implementation10-discipline-certification.md`
- `apps/web/tests/e2e/production-pilot.spec.ts`

### Files To Modify

- `package.json`
- `.github/workflows/production-operability.yml`
- `docs/validation/pilot-real-workflow-checklist.md`

### Required Pilot Roles

- platform owner
- school admin
- finance admin
- teacher
- librarian
- counsellor
- parent

### Certified Workflows

- [x] Platform owner login.
- [x] School creation.
- [x] School admin invitation and activation.
- [x] School login by email and password with automatic workspace resolution.
- [x] School Daraja configuration save and masked display.
- [x] Platform SMS provider setup and masked display.
- [x] School SMS wallet balance check.
- [x] SMS send with balance deduction.
- [x] Low SMS balance handling.
- [x] Student creation.
- [x] Parent account creation or invite.
- [x] Parent login by phone or email.
- [x] Fee invoice generation.
- [x] Cheque payment manual posting.
- [x] MPESA callback reconciliation using tenant-specific credentials.
- [x] Receipt generation.
- [x] Library book creation with barcode or QR code.
- [x] Library borrower lookup by admission number or student name.
- [x] Scanner issue flow where the librarian selects the student, then scans the book using keyboard-style input.
- [x] Scanner return flow with overdue fine calculation.
- [x] Support ticket creation.
- [x] Support agent reply.
- [x] Discipline incident creation.
- [x] Counselling referral.
- [x] Parent discipline acknowledgement.
- [x] Export generation.
- [x] Audit log verification.

### Acceptance Gate

```powershell
npm run certify:pilot
```

Pass condition:

- every certified workflow records an evidence ID
- no cross-tenant data appears in any response
- no workflow depends on demo data
- no visible credential hints appear on auth pages

## Phase 5 - Formal Security And Tenant Isolation Audit

Goal: Produce audit-ready security evidence and close high-risk gaps.

### New Files

- `docs/security/implementation10-threat-model.md`
- `docs/security/implementation10-security-audit.md`
- `.github/workflows/security-audit.yml`
- `apps/api/src/scripts/tenant-isolation-audit.ts`

### Files To Modify

- `package.json`
- `apps/api/src/modules/security/*`
- `apps/api/src/common/*`

### Tasks

- [x] Create a threat model for:
  - auth
  - JWT refresh
  - password reset
  - invitation tokens
  - file uploads
  - SMS provider secrets
  - Daraja secrets
  - support tickets
  - counselling notes
  - finance payments
  - exports
- [x] Add a tenant isolation audit script that tests:
  - direct ID access
  - search leakage
  - report leakage
  - export leakage
  - notification leakage
  - file URL leakage
  - parent portal leakage
- [x] Add dependency vulnerability scanning.
- [x] Add production secret exposure scanning for auth UI, provider paths, and support/counselling boundaries.
- [x] Add upload security validation for:
  - MIME type
  - size limits
  - malware scanner required in production
  - signed object storage URLs
- [x] Verify encrypted fields:
  - SMS API keys
  - Daraja consumer secrets
  - Daraja passkeys
  - counselling notes
  - PII-sensitive recovery tokens
- [x] Validate RBAC across:
  - platform owner
  - school owner
  - finance admin
  - teacher
  - librarian
  - counsellor
  - parent
  - support agent

### Acceptance Gate

```powershell
npm run security:scan
npm run tenant:isolation:audit
```

Pass condition:

- no critical or high untriaged findings
- no cross-tenant leakage
- no raw secrets in logs or API payloads
- counselling notes inaccessible without counsellor or permitted admin role

## Phase 6 - 1000+ School Scale And Performance Proof

Goal: Back the scalability claim with repeatable load and query evidence.

### New Files

- `apps/api/test/tenant-scale.load.ts`
- `apps/api/test/kenyan-school-load-profile.ts`
- `docs/performance/implementation10-scale-results.md`

### Files To Modify

- `apps/api/src/scripts/query-plan-review.ts`
- `package.json`
- `.github/workflows/production-operability.yml`

### Load Model

The scale profile must model:

- 1000 schools
- 500 to 3000 users per large school
- parent-heavy mobile traffic
- finance posting bursts
- MPESA callback bursts
- SMS notification bursts
- library scanner bursts
- support ticket bursts
- discipline incident bursts
- report exports

### Performance Budgets

- API p95 for core read endpoints: under 400 ms under normal synthetic load
- API p95 for write endpoints: under 700 ms under normal synthetic load
- dashboard initial route payload: under defined bundle budget
- report generation: queued when heavy
- exports: background job when large
- SMS sending: queue-backed or failure-isolated
- MPESA callbacks: idempotent and fast

### Tasks

- [x] Add tenant-scale load tests.
- [x] Add query budget checks for tenant-heavy tables.
- [x] Add indexes where query plans exceed budgets.
- [x] Verify pagination on all large list endpoints.
- [x] Verify exports do not load all tenant data into memory.
- [x] Add frontend bundle checks for heavy dashboard routes.
- [x] Add Redis caching only where it reduces repeat expensive reads.

### Acceptance Gate

```powershell
npm run load:tenant-scale
npm run query-plan:review
npm run web:build
```

Pass condition:

- no critical endpoint exceeds budget without documented queueing
- no full table scan on tenant-heavy production queries
- no memory-risk export path remains synchronous

## Phase 7 - Finance And Payments Certification

Goal: Make the finance module score highly for real Kenyan school operations.

### Files To Audit And Extend

- `apps/api/src/modules/finance/*`
- `apps/api/src/modules/payments/*`
- `apps/api/src/modules/tenant-finance/*`
- `apps/api/src/modules/integrations/daraja*`
- `apps/web/src/components/finance/*`
- `apps/web/src/components/integrations/*`

### Certified Finance Workflows

- [x] Fee structure creation.
- [x] Student fee assignment.
- [x] Invoice generation.
- [x] Manual cheque posting.
- [x] Manual bank transfer posting.
- [x] Cash posting if enabled by school policy.
- [x] MPESA callback reconciliation.
- [x] Duplicate MPESA callback idempotency.
- [x] Overpayment handling.
- [x] Partial payment handling.
- [x] Reversal and correction flow.
- [x] Receipt generation.
- [x] Parent balance view.
- [x] Accountant report export.
- [x] Ledger consistency check.

### Required Controls

- Every payment mutation must be transactional.
- Every payment mutation must have an audit log.
- MPESA callbacks must be idempotent by transaction reference.
- Manual payments must record staff user, method, reference, and timestamp.
- Parent portal must only show linked students.
- School funds must never be represented as platform-held funds.

### Acceptance Gate

```powershell
npm run finance:certify
npm run tenant:isolation:audit -- --module finance
```

Pass condition:

- ledger totals match student balances and reports
- duplicate payment events do not duplicate receipts
- school A cannot see school B financial data

## Phase 8 - Library Scanner Certification

Goal: Make the library scanner flow simple, fast, and credible for real schools.

### Files To Audit And Extend

- `apps/api/src/modules/library/*`
- `apps/web/src/components/library/*`

### Certified Library Workflows

- [x] Book registration with accession number.
- [x] Barcode or QR code generation.
- [x] Scanner input treated as keyboard text.
- [x] Find student by admission number.
- [x] Find student by name when admission number is not available.
- [x] Show matching students with class, stream, guardian name, and admission number to avoid issuing to the wrong learner.
- [x] Select the correct student borrower.
- [x] Scan book barcode or QR code.
- [x] Issue book to the selected borrower.
- [x] Prevent duplicate issue of unavailable book.
- [x] Return book.
- [x] Calculate overdue fine.
- [x] Mark lost book.
- [x] Mark damaged book.
- [x] Library inventory report.

### UX Requirements

- scan field auto-focuses
- scanner submit works without mouse interaction
- student lookup supports admission number and name
- no student ID scan is required
- success and failure feedback is instant
- mobile fallback search exists
- librarian does not need technical scanner configuration

### Acceptance Gate

```powershell
npm run library:certify
npm run web:e2e -- --grep library
```

Pass condition:

- issue flow works by entering admission number or student name, selecting the borrower, then scanning the book
- return flow works by scanning the book from browser input alone
- inventory count updates correctly
- no hardware-specific integration is required

## Phase 9 - Discipline And Counselling Certification

Goal: Make the newly integrated module trusted, confidential, and tenant-safe.

### Files To Audit And Extend

- `apps/api/src/modules/discipline/*`
- `apps/web/src/components/discipline/*`
- `apps/web/src/lib/discipline/*`

### Certified Workflows

- [x] Teacher reports incident.
- [x] Discipline master reviews case.
- [x] Action is assigned.
- [x] Parent is notified.
- [x] Parent acknowledges.
- [x] Counsellor receives referral.
- [x] Counsellor adds encrypted note.
- [x] Unauthorized role cannot read confidential note.
- [x] Principal approves severe action.
- [x] Student discipline profile updates.
- [x] Report export excludes confidential notes unless explicitly authorized.

### Acceptance Gate

```powershell
npm run discipline:certify
npm run tenant:isolation:audit -- --module discipline
```

Pass condition:

- confidential counselling data is encrypted and role-protected
- parent portal wording is respectful and scoped
- every case transition has an audit log

## Phase 10 - Module Exposure And Route Gating Cleanup

Goal: Ensure users only see production-ready modules.

### Files To Modify

- `apps/web/src/lib/features/module-readiness.ts`
- `apps/web/src/lib/routing/experience-routes.ts`
- `apps/web/src/components/navigation/*`
- `apps/api/src/modules/platform/module-readiness*`

### Tasks

- [x] Keep attendance retired unless the product owner explicitly reactivates it.
- [x] Keep inactive modules hidden from main navigation.
- [x] Promote a module only when:
  - UI complete
  - backend complete
  - DB connected
  - tenant safe
  - role safe
  - tested
  - included in release readiness
- [x] Reconcile communication readiness now that SMS settings and school SMS wallets exist.
- [x] Make inactive module pages show a professional configuration or coming-soon state only if directly accessed.

### Acceptance Gate

```powershell
npm run readiness:modules
npm run web:build
```

Pass condition:

- no dead sidebar links
- no inactive module appears as production-ready
- no attendance route is exposed

## Phase 11 - Frontend UX And Accessibility Score Lift

Goal: Make the product feel polished, visually appealing, meaningful, and easy during real school usage.

### Files To Audit

- `apps/web/src/app/**`
- `apps/web/src/components/**`
- `apps/web/src/lib/routing/**`
- `apps/web/src/components/auth/**`
- `apps/web/src/lib/auth/**`
- `apps/web/src/app/**/login/**`
- `apps/web/src/styles/**`
- `apps/web/tailwind.config.*`

### Tasks

- [x] Audit the auth color system and remove decorative blurred orb backgrounds from login pages.
- [x] Standardize a calm education-fintech palette:
  - emerald primary actions
  - deep slate text
  - white and soft green surfaces
  - blue informational accents
  - amber warning states
  - red critical states
- [x] Update login pages so the side panel or supporting text reminds users why the system matters:
  - secure school records
  - accurate fee and MPESA tracking
  - stronger parent communication
  - faster teacher workflows
  - accountable leadership visibility
- [x] Keep login forms simple with only the credentials required for that user type.
- [x] Ensure login pages never show workspace codes, demo credentials, test accounts, tenant IDs, seeded hints, or admin email hints.
- [x] Add mobile journey tests for:
  - login
  - parent portal
  - finance balance
  - library scanner fallback
  - support ticket creation
  - discipline parent acknowledgement
- [x] Add keyboard navigation checks for:
  - login forms
  - scanner forms
  - ticket conversations
  - data tables
- [x] Add loading states for all API-backed dashboards.
- [x] Add empty states for clean production tenants.
- [x] Add error states that explain next action without exposing internals.
- [x] Remove any remaining visible demo, sample, seeded, test credential, or fake data hints outside tests and docs.
- [x] Run visual checks on login, school dashboard, parent portal, finance, library, support, and discipline pages at mobile and desktop widths.

### Acceptance Gate

```powershell
npm run web:lint
npm run web:build
npm run web:e2e
```

Pass condition:

- auth pages show no credentials
- auth pages clearly communicate the importance of secure school operations
- color use is consistent, calm, accessible, and visually appealing
- mobile parent journey is usable on small viewport
- no critical interactive element lacks a keyboard path

## Phase 12 - Backup, Disaster Recovery, And Incident Operations

Goal: Make operations evidence-driven, not aspirational.

### Files To Modify

- `docs/runbooks/backup-restore.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/production-monitoring.md`
- `.github/workflows/production-operability.yml`

### Tasks

- [x] Schedule backup restore verification.
- [x] Record latest restore artifact.
- [x] Add incident drill checklist.
- [x] Add provider outage playbooks for:
  - email
  - SMS provider
  - Daraja
  - Redis
  - Postgres
  - object storage
  - malware scanner
- [x] Add escalation ownership for each operational dependency.
- [x] Verify alerts are routed to a real owner.

### Acceptance Gate

```powershell
npm run dr:backup-restore
npm run ops:incident-drill -- --dry-run
```

Pass condition:

- restore check produces artifact
- incident runbook has owner, severity, rollback, and communication steps

## Phase 13 - CI/CD Hardening

Goal: Prevent regressions before deployment.

### Files To Modify

- `.github/workflows/ci-cd.yml`
- `.github/workflows/production-operability.yml`
- `.github/workflows/security-audit.yml`
- `package.json`

### Required Gates

- lint
- type check
- unit tests
- integration tests
- web build
- API build
- module readiness
- release readiness
- security scan
- tenant isolation audit
- query-plan review
- authenticated pilot certification
- provider smoke checks
- scorecard generation

### Tasks

- [x] Fail PRs when production-ready modules lose readiness coverage.
- [x] Fail PRs when auth pages expose credentials.
- [x] Fail PRs when tenant-isolation tests fail.
- [x] Fail PRs when high severity dependency findings are untriaged.
- [x] Store artifacts for release readiness, scorecard, load, security, and pilot certification.

### Acceptance Gate

```powershell
npm run ci:full
```

Pass condition:

- all local full-CI checks pass before merge
- artifacts are generated for audit review

## Target Final Scorecard

| Area | Target |
| --- | ---: |
| Release readiness gate | 96+ |
| Authentication and session UX | 95+ |
| Tenant isolation | 96+ |
| Finance and payments | 95+ |
| Support and operations | 95+ |
| Provider integrations | 94+ |
| Frontend UX completeness | 93+ |
| Performance and scale proof | 94+ |
| Observability and recovery | 95+ |
| Visual design and brand trust | 94+ |
| Overall production confidence | 95+ |

## Fastest Execution Order

1. Fix provider health and support SMS dispatch truth.
2. Replace static dashboard telemetry with live API-backed states.
3. Add production scorecard generator.
4. Add authenticated pilot certification runner.
5. Add tenant isolation audit script.
6. Add finance certification.
7. Add library scanner certification.
8. Add visual design and login meaning pass.
9. Add discipline and counselling certification.
10. Add tenant-scale load model.
11. Wire all gates into CI and production operability workflows.

## Definition Of Done

Implementation 10 is complete when:

- `npm run release:readiness` passes.
- `npm run scorecard:production` reports 95 or higher.
- `npm run tenant:isolation:audit` passes.
- `npm run certify:pilot` passes.
- `npm run security:scan` has no untriaged high or critical findings.
- `npm run load:tenant-scale` meets documented budgets.
- Live `/health/ready` shows all configured production providers accurately.
- Support notifications are no longer reported as partial without a precise reason.
- Dashboards display live status, real empty states, or explicit configuration-required states.
- Library issue flow uses admission number or student name lookup before scanning a book.
- Login pages feel visually appealing and remind users of secure, important school operations without adding clutter.
- No visible demo credentials, seeded hints, or fake production data appear in the UI.
- Attendance remains removed from production navigation.
- All scorecard evidence is saved as CI artifacts.

## Final Verdict From Current Scan

ShuleHub ERP is not in a broken state. It has passed the release readiness gate and the live API is healthy. The system is beyond a prototype.

However, to score highly in a serious production audit, the platform needs stronger evidence and tighter operational truth. The main gap is not raw feature count. The main gap is proving that every visible production workflow is live, tenant-safe, observable, recoverable, and backed by automated evidence.

The fastest path to a high score is to make provider health truthful, certify authenticated pilot journeys, remove fallback telemetry, enforce tenant isolation through automated tests, and produce a production scorecard on every release.
