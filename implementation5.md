# IMPLEMENTATION 5 — FULL SYSTEM OPERABILITY & ANTI-FRAGILITY AUDIT

Audit date: 2026-05-12  
Workspace audited: `C:\Users\user\Desktop\PROJECTS\Shule hub\.worktrees\codex-support-ticketing-release`  
Live targets checked: `https://shule-hub-erp.vercel.app`, `https://shulehub-production.up.railway.app`

This audit used static code tracing plus safe live smoke checks. I did not create tenants, students, payments, tickets, or other operational records in production during this audit because the production database was intentionally cleaned and mutation tests would create real data.

Verified safe checks:

- Unauthenticated frontend proxy access to `/api/platform/schools` returned `401`.
- Unauthenticated frontend proxy access to `/api/support/tickets` returned `401`.
- Unauthenticated direct backend access to `/platform/schools` returned `401`.
- Unauthenticated direct backend access to `/support/tickets` returned `401`.
- Login POST without CSRF returned `403`.
- Source tracing confirmed forced PostgreSQL RLS on implemented tenant tables for auth, students, attendance, billing, payments, admissions, inventory, support, events, and legacy operational schema tables.

---

# 1. EXECUTIVE SUMMARY

## Scores

| Area | Score | Reason |
|---|---:|---|
| System maturity | 48/100 | Core SaaS shell plus support, admissions, inventory, billing, reporting/export, dashboard snapshot, and readiness infrastructure are now deeper, but several ERP modules remain missing or workflow-incomplete. |
| Production readiness | 43/100 | Auth, platform onboarding, support, admissions, inventory, payments, observability, provider smoke checks, release gates, and runbooks have real infrastructure, but full school operations cannot run safely end to end. |
| Security | 74/100 | JWT/RBAC/RLS/CSRF/rate limiting are strong for implemented APIs. Email verification, tenant invitations, upload checks, provider-backed upload scanning, S3/R2 startup validation, CORS hard fail, and route-permission scanning are now in place; MFA, trusted-device enforcement, and streaming upload handling remain gaps. |
| Reliability | 55/100 | Redis, queues, health, outbox, graceful shutdown, support notification retry, durable file objects, report export jobs, snapshots, and synthetic/readiness checks exist; inventory concurrency and streaming uploads still need hardening. |
| UX completeness | 69/100 | Interfaces are polished and production-looking, Exams is active through the guarded workspace, Attendance remains retired, and known UI-only school modules are hidden behind production readiness gates; many remaining screens are still empty-state or client-side views without operational backend completion. |
| Scalability | 53/100 | Search indexes, query-plan checks, core API load probes, async report jobs, dashboard summaries, and optional S3/R2 upload storage are in place; large streaming uploads and concurrent inventory writes are not ready for high-volume schools. |
| Multi-tenant safety | 80/100 | Implemented tables use tenant IDs and forced RLS, while file objects, report snapshots, dashboard summaries, and S3/R2 object keys are tenant-scoped. Gaps remain in unimplemented modules and global support/status content. |

## Verdict

The platform is **not truly production-ready as a complete School ERP SaaS**.

It is closer to a production-grade foundation with several strong subsystems:

- Secure auth shell with JWT/session architecture.
- Platform owner login and school onboarding route.
- PostgreSQL RLS and tenant-aware request context.
- Redis-backed sessions/rate limiting/queue infrastructure.
- Real students, billing, payments, admissions, inventory, support, observability, and compliance modules.

But schools **cannot safely onboard for full daily operations yet** because critical workflows are incomplete:

- Library, payroll, HR, timetable, transport billing, full academic lifecycle, and fine management do not have real backend modules; exams have been restored as a guarded workspace while backend depth is completed.
- School-admin-driven invitations for teachers, accountants, staff, parents, and students are not exposed as a complete workflow.
- MFA, device verification, and magic-link flows are mostly UI/schema-ready; email verification now has backend token issuance/consumption, a wired verify page/proxy, and privileged-session enforcement for sensitive permissions.
- Inventory requests/transfers do not fully move stock, and stock issue/loss operations are race-prone.
- Support has real tickets/messages/internal notes, email dispatch, SMS webhook delivery, a retry worker, failed-delivery visibility, and in-app terminal-failure alerts.
- File uploads now persist to tenant-scoped file objects with checksums, binary type checks, malware-test signature screening, configured live provider scan invocation, provider scan verdict enforcement, signed private reads, retention purge support, optional S3/R2-compatible object-backed persistence behind configuration, and startup validation for enabled object storage settings; streaming multipart handling remains the open upload hardening item.
- Reporting/export is primarily client-side CSV/print for most modules, but inventory, admissions, and billing now have server-side CSV artifact exports through a shared checksummed CSV artifact builder, and the live inventory/admissions UIs download those backend artifacts; PDF/Excel/report-job infrastructure remains.

Most dangerous hidden failures:

- Known UI-only school modules are now hidden from production navigation/search/cards, but direct legacy surfaces and future modules still require release gates before exposure.
- Inventory stock can become incorrect under concurrent store operations.
- Upload parsing is now bounded to one 10 MB file, 20 fields, 64 KB per field, and 25 total parts; multipart buffering still uses API memory, so external streaming storage remains required before high-volume document usage.
- MFA/device verification pages can give the impression of security controls that are not enforced; email verification is now enforced for privileged/sensitive auth sessions but still needs broader policy decisions for low-privilege flows and recovery overrides.
- Schools may be onboarded before teacher/parent/student invitation and operational module flows are ready.

---

# 2. CRITICAL FAILURES

## CF-01 — UI-Visible ERP Modules Have No Backend Implementation

- Severity: Critical
- Module: Academics, Exams, Timetable, Library, Payroll, HR, Transport, Reservations, Book Issuing, Fine Management
- Description: The frontend exposes school and portal sections for exams, timetable, staff, report cards, parent/student views, and operational dashboards, but backend module inventory still lacks real controllers/services/tables for library, payroll, HR, transport, timetable, grading depth, reservations, book issuing, or fines.
- Root cause: Product surfaces were built ahead of domain services and persistence.
- Reproduction steps:
  1. Inspect `apps/api/src/modules`; implemented modules are admissions, billing, compliance, events, finance, health, inventory, observability, payments, platform, security, students, support, sync.
  2. Search for controllers for library/payroll/hr/transport/timetable/exams.
  3. Only frontend copy and legacy seeder schema references appear; no production controllers exist.
- Risk level: Critical.
- Real-world impact: A school can click into workflows that appear available but cannot create, validate, persist, audit, or report real operations.
- Recommended fix: Hide unimplemented modules behind feature flags or build real backend modules before release. Each module needs schema, RLS, controller, service, DTO validation, audit logging, tests, UI integration, import/export, and tenant-scoped reports.
- Current remediation: Implemented 2026-05-12 in this branch for school-facing navigation/search/cards/actions. Academics, attendance, communication, reports, staff, and timetable are hidden from role sidebars, school workspace navigation, quick actions, capabilities, KPI links, and direct school section routes until backend workflows are verified. Updated 2026-05-13: exams are re-enabled through the new exams workspace while attendance remains retired.
- Estimated complexity: High to Very High.

## CF-02 — School Admin Invitation Flow Is Not Complete

- Severity: Critical
- Module: Authentication, User Management, Onboarding
- Description: Platform owner school creation can issue a school owner/admin invitation, and invitation acceptance exists. There is no complete exposed school-admin workflow for inviting teachers, accountants, staff, parents, and students.
- Root cause: Invitation token consumption and platform onboarding exist, but general tenant member invitation issuance is not exposed as a production module.
- Reproduction steps:
  1. Trace `PlatformOnboardingService`; it creates a school and owner invitation.
  2. Trace `AuthInvitationService`; it only consumes invitation tokens.
  3. Search controllers for tenant member invite creation; no general school-admin invitation controller appears.
- Risk level: Critical.
- Real-world impact: After the first school admin is invited, the school cannot fully onboard real staff and families through secure email-based workflows.
- Recommended fix: Add tenant user management module with invite creation/resend/revoke, role assignment, expiration, audit logs, email dispatch, and school-admin UI.
- Current remediation: Updated 2026-05-13: tenant-scoped invitation creation is exposed from school settings through CSRF-protected proxies and sends the backend `role_code` contract for admin, teacher, accountant, staff, parent, student, storekeeper, and librarian invitations. School settings now loads live tenant members/pending invitations from the backend, supports resend/revoke for pending invitations without exposing tokens, persists membership suspension/reactivation, updates existing member roles through validated backend role assignments, records audit logs for invite/member mutations, and surfaces transactional email readiness without exposing secrets.
- Estimated complexity: High.

## CF-03 — MFA, Device Verification, and Magic Link Are Mostly Non-Operational

- Severity: Medium
- Module: Authentication, Security
- Description: UI pages and schema/token-purpose placeholders exist for MFA, OTP, device verification, email verification, and magic link states. Email verification now has authenticated request and public verify API flows backed by action tokens, email outbox delivery, a CSRF-protected Next proxy, a token-consuming verify page, and auth-service enforcement for write/manage/platform-owner sessions, while MFA, device verification, magic links, and recovery/override policy still need completion.
- Root cause: Security UX and database columns were added without completing backend verification flows.
- Reproduction steps:
  1. Search API for `mfa_verification`, `email_verification`, and `device_verification`.
  2. Email verification now has controller/service/schema flows for token issuance and consumption plus sensitive-session enforcement in auth responses.
  3. MFA/device/magic-link results are still schema token purposes/columns or state pages rather than complete controller/service/enforcement flows.
  4. Frontend has `/mfa`, `/otp`, `/verify-email`, `/device-verification`, and `/magic-link` state pages.
- Risk level: High.
- Real-world impact: Enterprise buyers may believe MFA/device trust is enforced when it is not; high-privilege accounts remain password/session dependent.
- Recommended fix: Implement MFA enrollment, MFA challenge enforcement, trusted-device challenge, recovery codes, audit logs, admin override rules, and any remaining email-verification policy expansion beyond privileged sessions.
- Estimated complexity: High.

## CF-04 — Inventory Transfer and Request Workflows Do Not Fully Move Stock

- Severity: High
- Module: Inventory, Procurement, Store Requests
- Description: Stock issues, receipts, fulfilled/partially fulfilled department requests, completed/cancelled transfers, request reservations, request approval attribution, request backorder records/resolution, opening/receipt balance seeding, managed location administration, transfer source/destination validation, item storage-location validation, stock count posting, and item-vs-location reconciliation reporting now change/read state atomically. Some lifecycle workflows are not complete.
- Root cause: Inventory still has legacy item-level quantity alongside newer item-location balances; some lifecycle workflows remain incomplete.
- Reproduction steps:
  1. Trace `InventoryService.updateTransferStatus`.
  2. On `completed`, it moves source and destination `inventory_item_balances`, records a `transfer` movement, and updates transfer status; completed transfer cancellation reverses the location balances and records a `transfer_reversal` movement before marking the transfer cancelled.
  3. Trace `updateRequestStatus`; approval records the acting approver, reserves stock, and fulfillment issues stock.
  4. Backorder records are created for unavailable approval lines, approval/backorder status persists `approved_by_user_id`, stock receipts seed item-location balances and resolve open backorders when inventory becomes available, managed locations can be listed/created/updated, item storage and transfer source/destination values are validated against active managed locations, stock counts can be posted with variance snapshots and adjustment movements, partially fulfilled requests issue reserved quantities only, and reports expose item/location balance variances.
- Risk level: High.
- Real-world impact: Storekeepers can approve/complete workflows while physical and system stock diverge.
- Recommended fix: Add `inventory_locations`, `inventory_item_balances`, atomic transfer transactions, backorder handling, request fulfillment records, immutable movement ledger, and reconciliation reports.
- Estimated complexity: High.

## CF-05 — Inventory Stock-Out and Incident Operations Are Race-Prone

- Severity: High
- Module: Inventory
- Description: Stock issue and incident loss flows read quantity, check it, then update absolute quantity without row locks or conditional atomic decrements.
- Root cause: `findItemById` does not lock the row and `updateItemStock` sets an absolute quantity instead of `quantity_on_hand = quantity_on_hand - x WHERE quantity_on_hand >= x`.
- Reproduction steps:
  1. Two storekeepers issue the same item concurrently.
  2. Both read the same quantity before either update commits.
  3. Both pass the stock check.
  4. Final stock may represent only one deduction or an otherwise stale value.
- Risk level: High.
- Real-world impact: Real inventory counts become wrong during busy school-opening or exam periods.
- Recommended fix: Use `SELECT ... FOR UPDATE`, conditional decrements, optimistic version checks, or movement-ledger-derived balances. Add concurrent integration tests.
- Estimated complexity: Medium to High.

## CF-06 — Uploads Are Memory-Buffered and Stored on Local Ephemeral Disk

- Current status: local ephemeral persistence is fixed and uploads now reject malware-test signatures plus unsafe provider scan verdicts, with configured live provider scan invocation wired into support/admissions uploads, optional S3/R2-compatible object-backed persistence, and startup rejection for invalid enabled object-storage configuration in place; streaming multipart handling remains.

- Severity: High
- Module: Support, Admissions, Documents
- Description: Support and admissions upload controllers still use Multer `memoryStorage()`, but file persistence has been moved off local ephemeral disk into tenant-scoped `file_objects` rows with RLS, SHA-256 checksums, transaction-wrapped metadata writes, binary signature checks, deterministic malware-test signature rejection, configured live provider scan invocation, provider scan verdict enforcement, signed private reads, retention purge support, and optional S3/R2 object-backed storage metadata.
- Root cause: The hardening passes replaced local runtime storage and added local/provider-result screening hooks, but streaming multipart parsing still requires controller/interceptor rollout decisions.
- Reproduction steps:
  1. Inspect `SupportController` and `AdmissionsController`; both still use `FileInterceptor('file', { storage: memoryStorage() })`.
  2. Inspect `DatabaseFileStorageService`; uploaded buffers are persisted into tenant-scoped `file_objects` rows or external S3/R2 objects when object storage is enabled, with checksummed metadata in both cases.
  3. Upload validation now rejects mismatched binary signatures, EICAR malware-test signatures, and unsafe provider malware-scan verdicts; support/admissions uploads invoke the configured external malware scanning provider before persistence.
- Risk level: High.
- Real-world impact: Files should survive redeploys now, malware-test payloads and unsafe provider verdicts are rejected before storage, malware/object-storage provider credential readiness can be smoke-checked, configured provider-grade scanning runs before upload persistence, invalid enabled S3/R2 settings fail before serving traffic, and enabled S3/R2 storage avoids database bytea persistence; large uploads can still exhaust API memory before streaming multipart is added.
- Recommended fix: Stream multipart uploads directly through validation/scanning and into the S3/R2-compatible tenant-scoped object storage adapter, then finish provider lifecycle policy.
- Estimated complexity: Medium to High.

## CF-07 — Support Notifications Are Recorded but Not Dispatched

- Current status: email dispatch, SMS webhook dispatch, delivery attempt metadata, a scheduled retry worker with row-lock leasing, a failed-delivery dashboard, in-app terminal-failure alerts, and secret-safe provider readiness reporting are implemented; live provider credential validation remains an environment check.

- Severity: Medium
- Module: Support, Notifications
- Description: Critical tickets and replies now create notification rows and dispatch email through the configured auth email service. Critical ticket escalations also create SMS notification rows when SMS webhook URL and recipients are configured. Delivery attempts, last error, next retry time, and delivered timestamp are persisted. A scheduled worker claims due queued email/SMS notifications under system context with row locking and a retry lease. Dead-letter dashboard visibility and in-app terminal-failure alerts are implemented.
- Root cause: The first support notification passes did not include a durable background retry loop or SMS webhook channel; both are now implemented.
- Reproduction steps:
  1. Trace `SupportService.createAndDispatchNotifications`; ticket creation and replies persist notifications and call `SupportNotificationDeliveryService`.
  2. Trace `SupportNotificationDeliveryService`; it can send email through `AuthEmailService`.
  3. `/health/ready` now reports support notification email/SMS provider readiness using booleans and counts without exposing secrets or recipient values.
- Risk level: Medium.
- Real-world impact: Email and configured SMS updates can be sent, transient failures are retried automatically, terminal failures are visible with in-app alerts, and deployments can detect missing support notification provider configuration before operations rely on it.
- Recommended fix: Validate live provider credentials, add provider-specific idempotency keys if required, and keep delivery observability active.
- Estimated complexity: Medium.

## CF-08 — Reporting and Export Are Not Enterprise-Grade

- Severity: High
- Module: Reporting, Finance, Admissions, Inventory, Portal
- Description: Reporting UI still uses client-side CSV and print helpers for some modules. Inventory, admissions, and billing now have server-side CSV artifact exports with checksums through a shared artifact builder, and inventory/admissions live workspaces download those backend artifacts instead of rebuilding live exports in the browser. No server-side PDF/Excel job pipeline, large dataset pagination, report snapshots, or generalized reconciliation workflow was verified for most school reports.
- Root cause: Frontend reporting shell was implemented before a report service layer.
- Reproduction steps:
  1. Inspect `apps/web/src/lib/dashboard/export.ts` and module table exports.
  2. Exports are generated from client-visible rows.
  3. Inventory now exposes server-side CSV artifacts for implemented report datasets, but no generalized backend report generation endpoints exist for all school reports.
- Risk level: High.
- Real-world impact: Inventory CSV export can now be generated server-side with a checksum, but large schools will still hit browser/report-job limits in other modules; exports may disagree with backend ledgers; reports are not audit-stable.
- Recommended fix: Extend the inventory CSV artifact pattern into a report service with tenant-scoped queries, server-side PDF/XLSX/CSV generation, async jobs, immutable report snapshots, permissions, and reconciliation tests.
- Estimated complexity: High.

## CF-09 — System Status Is Static Support Content, Not a Public Incident Platform

- Severity: Medium
- Module: Support, System Status, Observability
- Description: Support system status components are stored as support reference data. A public status endpoint and `/support/status` page now exist, but custom `status.domain.com` routing, subscriptions, and automated metric-to-incident publication remain.
- Root cause: Internal support status tables were added before the public publication layer; the first public surface now reuses those rows without subscription delivery.
- Reproduction steps:
  1. Inspect support status service; it reads `support_system_components`.
  2. Inspect frontend; `/support/status` now renders a public read-only status surface.
  3. No standalone status subdomain app or subscription route exists.
- Risk level: Medium.
- Real-world impact: Schools cannot reliably distinguish tenant-specific issues from platform-wide incidents without logging in.
- Recommended fix: Add custom status domain routing, connect health/SLO metrics to component status, add incident subscriptions, and expand status history.
- Estimated complexity: Medium.

## CF-10 — CORS Safety Depends on Environment Configuration

- Severity: Medium
- Module: API Security
- Current status: Production startup now rejects empty, wildcard, invalid, or non-HTTPS CORS origins, and readiness reports sanitized CORS status/origin counts without echoing configured origins.
- Description: API CORS previously enabled credentialed requests and fell back to reflecting origins if configured origins were empty or wildcarded.
- Root cause: Runtime configuration was permissive when `corsOrigins` was unset or `*`.
- Reproduction steps:
  1. Inspect `app.factory.ts`.
  2. `resolveCorsOriginPolicy` now throws in production unless origins are explicit HTTPS URLs.
  3. `/health/ready` now includes a sanitized `cors` readiness object for deployment checks.
- Risk level: Medium.
- Real-world impact: Production CORS misconfiguration is now blocked before serving traffic and visible in readiness; deployment environments still need explicit allowlist values.
- Recommended fix: Keep the backend suite in CI and configure each production environment with explicit HTTPS origins.
- Estimated complexity: Low to Medium.

---

# 3. HALF-FUNCTIONING WORKFLOWS

## Admissions -> Student -> Parent -> Fees -> Academics

- What appears functional: Admissions module has real application CRUD, document upload, registration to student, allocations, transfers, reports, and UI integration.
- What actually fails: Registration creates a student, allocation, academic enrollment, parent portal invitation, persisted guardian link, fee assignment, student fee invoice, configured subject/timetable enrollments, auditable promotion/graduation/archive lifecycle events, visible academic downstream status, visible parent portal/fee handoff status, and outbox hooks for academic enrollment/lifecycle changes when matching configuration exists, but the full browser/API lifecycle path is not yet covered end to end.
- Missing backend logic: No remaining backend gap identified in this admissions slice beyond future module-specific consumers for the new academic hooks.
- Missing frontend integration: No remaining frontend gap identified in this admissions slice.
- Missing validation: Transport route validity, dormitory capacity, and subject/timetable capacity.
- Missing persistence: Cross-module academic history beyond admissions-owned lifecycle events.
- Missing edge-case handling: Concurrent registration, duplicate admission number variants, rejected/withdrawn admission restoration, live document virus-scan invocation.
- Required implementation steps:
  1. Add full browser/API admission lifecycle tests from application to active learner to promotion/graduation.

## Inventory Supplier → PO → Receiving → Stock → Requests → Allocation → Loss → Reporting

- What appears functional: Inventory has real categories, suppliers, items, movements, purchase orders, requests, transfers, incidents, reports, and live UI calls.
- What actually fails: Transfers now alter item-location balances after validating source/destination against active managed locations, and completed transfer cancellation reverses balances with a `transfer_reversal` movement; managed locations can be listed, created, and updated; approved requests record the acting approver, reserve stock, unavailable approval lines create open backorders, partially fulfilled requests issue reserved lines only, stock receipts seed item-location balances and resolve backorders when available, fulfilled requests issue stock with row-locked decrements, stock counts can be posted with variance adjustment movements and snapshots, stock issue/supplier receipt/PO receipt mutations are row-locked, stock movements are append-only at the database layer, and reports expose item/location variances.
- Missing backend logic: Multi-step approval policy/escalation chain.
- Missing frontend integration: Approval-to-fulfillment flow, backorder handling, location-specific stock cards.
- Missing validation: Atomic no-negative stock guard, duplicate submission protection on all manual workflows.
- Missing persistence: Department allocation records.
- Missing edge-case handling: Concurrent stock issues, partial PO receipt, damaged goods after receipt, transfer cancellation in transit.
- Required implementation steps:
  1. Introduce item-location balance table (completed 2026-05-13 for transfer balance moves).
  2. Convert all stock changes to ledger-posted movements (partially completed 2026-05-13 for stock issues, receipts, request fulfillment, transfers, and incidents).
  3. Use row locks or conditional updates (partially completed 2026-05-13 for stock issues, supplier receipts, PO receipts, request reservations, and transfer location balances).
  4. Tie requests and transfers to stock movements (partially completed 2026-05-13 for approved-request reservations, stock-receipt backorder resolution, fulfilled requests, and completed transfers).
  5. Add concurrency and reconciliation tests (partially completed 2026-05-13 for item-vs-location report reconciliation).

## Support Ticket → Conversation → Escalation → Notification → Resolution

- What appears functional: Real tickets, ticket numbers, categories, messages, internal notes, attachments, status logs, assignment, escalation, merge, analytics, and frontend proxy exist.
- What actually fails: Email dispatch, configured SMS webhook dispatch, retry worker scheduling, failed-delivery dead-letter visibility, in-app terminal-failure alerts, SLA breach monitoring, and public read-only status publishing exist; attachments persist to tenant-scoped file objects with local/provider-verdict screening, configured provider scan invocation, and optional S3/R2 object-backed persistence, but upload controllers still buffer multipart files in memory.
- Missing backend logic: Streaming multipart upload handling, automated incident/status publishing from health/SLO metrics.
- Missing frontend integration: Notification preferences, public status subscription.
- Missing validation: Attachment type/size scanning, ticket duplicate detection beyond manual merge, escalation policy per priority.
- Missing persistence: External object lifecycle cleanup policy.
- Missing edge-case handling: Support reply after closure, customer reply reopening policy, and agent reassignment audit details are now handled; future UI copy can make explicit reopen prompts clearer.
- Required implementation steps:
  1. Add support notification dead-letter dashboard and terminal-failure alerting (completed 2026-05-13).
  2. Move attachments to object storage.
  3. Add SLA breach scheduler (completed 2026-05-13).
  4. Add closed-ticket reply/reopen policy and assignment audit details (completed 2026-05-13).
  5. Add public incident/status page (completed 2026-05-13).
  6. Add end-to-end tests for critical ticket notification (completed 2026-05-13).

## School Onboarding → School Admin → Staff/Parent/Student Invites

- What appears functional: Platform owner can create a school and send an owner invitation; invitation acceptance can set password.
- What actually fails: School admin cannot complete tenant user onboarding for teachers, accountants, staff, parents, and students through a verified API/UI workflow.
- Missing backend logic: Tenant invitation issuance, role catalog management, invite resend/revoke, parent/student account mapping.
- Missing frontend integration: User management invitation UI, invite status table, role assignment, bulk invite import.
- Missing validation: Invitation domain policy, duplicate user conflict resolution, tenant-specific role restrictions.
- Missing persistence: Invitation audit details beyond token/outbox, staff/parent/student profile linkage.
- Missing edge-case handling: Expired invite resend, wrong tenant invite, role downgrade/upgrade, suspended users.
- Required implementation steps:
  1. Build tenant user management module.
  2. Connect invitation emails and accept flow for all roles.
  3. Add audit logs and permission checks.
  4. Add bulk import with validation.
  5. Add role-based onboarding tests.

## Library Lifecycle

- What appears functional: Navigation/support categories mention Library.
- What actually fails: No production backend module was found for book registration, cataloguing, issuing, returns, renewals, reservations, fines, lost books, inventory audits, or reporting.
- Missing backend logic: Entire library domain.
- Missing frontend integration: Any real library workspace beyond labels/placeholders.
- Missing validation: Book IDs, borrowing limits, due dates, reservations, fine calculation.
- Missing persistence: Books, copies, members, loans, reservations, fines, audit logs.
- Missing edge-case handling: Duplicate barcodes, lost book conversion, reservation priority, overdue fine waivers.
- Required implementation steps:
  1. Build full library module with RLS and immutable circulation ledger.
  2. Add librarian permissions.
  3. Add barcode/QR support.
  4. Add fines and reporting.
  5. Add end-to-end issue/return tests.

## Reporting → Export → Print → Audit

- What appears functional: Reporting pages show clean tables, CSV export buttons, and print views.
- What actually fails: Browser-generated reports are not reliable for large datasets, financial audit, PDF/Excel exports, or report snapshot consistency.
- Missing backend logic: Server report endpoints, async export jobs, tenant-scoped report snapshots, export audit logs.
- Missing frontend integration: Job progress, download center, failed export retry.
- Missing validation: Date ranges, report permissions, ledger totals, row limits.
- Missing persistence: Generated report artifacts and checksums.
- Missing edge-case handling: Large classes, multi-year reports, partial data failures, export timeouts.
- Required implementation steps:
  1. Add report generation service.
  2. Add queue-backed export jobs.
  3. Add PDF/XLSX/CSV generation.
  4. Add report snapshot and audit tables.
  5. Reconcile reports against source ledgers.

---

# 4. FEATURE COMPLETENESS MATRIX

| Module | UI Complete | Backend Complete | DB Connected | Secure | Tenant Safe | Production Ready | Notes |
|---|---|---|---|---|---|---|---|
| Admissions | Partial | Partial | Yes | Partial | Yes | No | Real CRUD/register/docs/allocation plus parent invitation, fee assignment, academic enrollment, configured subject/timetable enrollment, promotion/graduation/archive lifecycle, UI downstream status, and registration receipt; browser/API lifecycle coverage remains incomplete. |
| Academics | Partial | No | No | No | Unknown | No | Mostly dashboard/portal copy; no production academics module. |
| Exams | Partial | Partial | Yes | Partial | Yes | No | New exams workspace is active; deeper grading/report-card lifecycle and backend completion still need validation. |
| Finance | Partial | Partial | Yes | Partial | Yes | No | Ledger and billing foundations exist, but full school fee structures, student billing, statements, and reconciled reports are incomplete. |
| Payroll | No | No | No | No | Unknown | No | No payroll module found. |
| Attendance | Retired | Retired | Legacy | Retired | Retired | No | Attendance surfaces are intentionally removed from the active product while legacy backend code is not exposed. |
| Transport | Partial | No | Partial | No | Unknown | No | Transport route appears as admission allocation text only; no transport billing/routes/fleet module. |
| HR | Partial | No | Legacy schema only | No | Unknown | No | Staff UI exists; no production HR controller/service. |
| Inventory | Partial | Partial | Yes | Partial | Yes | No | Real module exists; request reservations, request fulfillment, request backorders/resolution, row locks, transfer location balances, and reconciliation reporting are partly complete. |
| Procurement | Partial | Partial | Yes | Partial | Yes | No | Purchase orders exist, but approval/receipt/accounting lifecycle is partial. |
| Store Requests | Partial | Partial | Yes | Partial | Yes | No | Request records exist, approval reserves stock or opens backorders, stock receipts resolve open backorders, and fulfillment deducts stock. |
| Library | No | No | No | No | Unknown | No | No production library module. |
| Reservations | No | No | No | No | Unknown | No | No reservation model for library or other resources. |
| Book Issuing | No | No | No | No | Unknown | No | No circulation ledger. |
| Fine Management | No | No | No | No | Unknown | No | No late/lost book fine workflow. |
| Notifications | Partial | Partial | Partial | Partial | Partial | No | Auth email works when configured; support email/SMS dispatch, retry worker, dead-letter visibility, and in-app terminal-failure alerts exist, but live provider credential validation remains environment-specific. |
| Reporting | Partial | No | Partial | Partial | Partial | No | Client-side CSV/print exists; no full server reports/PDF/Excel/jobs. |
| User Management | Partial | Partial | Yes | Partial | Yes | No | Owner and school admin invite path exists; school-admin invites for all roles missing. |
| Settings | Partial | Partial | Partial | Partial | Partial | No | UI exists, but many settings are not backed by tenant configuration APIs. |
| Audit Logs | Partial | Partial | Yes | Partial | Yes | Partial | Base audit structures exist; module-level audit coverage is uneven. |
| Support Center | Partial | Partial | Yes | Partial | Yes | No | Real tickets/conversations/internal notes, retrying notifications, dead-letter visibility, in-app terminal-failure alerts, SLA breach monitoring, database-backed attachments, and public status publishing exist; external file storage, status-domain routing, and subscriptions need completion. |
| Payments/MPESA | Partial | Partial | Yes | Partial | Yes | Partial | Payment intents/callback/replay/reconciliation foundations exist; real Daraja credentials and full school-fee reconciliation still required. |
| Observability | Partial | Partial | Yes | Partial | Yes | Partial | Health/SLO/queue visibility exists; not yet tied to public incident/status and all workflows. |

---

# 5. FRONTEND AUDIT

## Strengths

- Authentication screens are polished and responsive.
- Demo credential blocks were removed from login surfaces in prior work.
- CSRF handling is present on mutating frontend auth/API proxy routes.
- Admissions, inventory, and support screens use live client modules.
- Empty-state copy is more honest than fake demo data in several areas.
- Sidebar/navigation is broad and role-aware.

## Failures and gaps

- Many pages are operationally attractive but not backend-complete.
- Parent/student portal views show report cards, exams, payments, and notices without complete backend workflows.
- Reporting export buttons rely on client data and browser downloads.
- System status has a public `/support/status` page, but not a custom status subdomain or subscription workflow.
- MFA, OTP, magic-link, device verification, account locked, and session-expired pages are largely state screens unless backend flows are completed; email verification now has backend token endpoints, a wired verify page, and privileged-session enforcement.
- Search and global navigation can imply module availability before production readiness.
- Mobile responsiveness appears designed, but no current Playwright/mobile visual regression evidence was produced during this audit.

## UX risk

The UX is polished enough that a buyer may believe the system is finished. This increases risk because missing backend workflows are harder for non-technical stakeholders to notice during demos.

Recommended frontend controls:

- Add feature flags for unimplemented modules.
- Add role-aware "not configured" states only where workflows are truly not live.
- Hide or disable actions that do not persist.
- Add operation-level error states for all mutation forms.
- Add Playwright coverage for login, school onboarding, admissions registration, inventory issue/receive, support ticket creation, and exports.

---

# 6. BACKEND AUDIT

## Strengths

- NestJS modular API structure is clean.
- Global guards include JWT, RBAC, and ABAC.
- Public auth routes are explicitly marked.
- Register route rejects open self-registration and requires invitations.
- Password recovery uses secure token/outbox/email service when configured.
- Platform school onboarding creates invitation tokens and emails without exposing tokens in responses.
- Rate limiting is Redis-backed and tenant/actor-aware.
- Request context, tenant context, auth context, request logging, compression, rate limiting, and billing feature middleware are globally applied.
- Redis, BullMQ queues, events outbox, health checks, SLO monitoring, and graceful shutdown exist.
- DTO validation is enabled globally with whitelist and forbidden non-whitelisted properties.

## Failures and gaps

- General tenant invitation issuance is missing.
- MFA/device verification services are missing; email verification backend issuance, token consumption, auth response state, and privileged-session enforcement now exist.
- Support notification SMS escalation exists through a configured webhook provider, while failed delivery visibility and in-app terminal-failure alerts now exist.
- File upload controllers still lack streaming object storage.
- Inventory concurrency controls are insufficient.
- Several major modules have no backend.
- Support SLA monitoring now includes a breach escalation worker that records breach events and notifies support.
- Report generation services are absent for enterprise reports.
- Legacy seeder code and schema remain in the repository, although production seeding is disabled and the seeder module is not imported into `AppModule`.

## API authorization risk

The implemented controllers are decorated with `@Permissions` or `@Roles` in most sensitive areas. The global RBAC guard only enforces when metadata exists, so every new controller must be reviewed to ensure routes are never accidentally auth-only without permission metadata.

Recommended backend controls:

- Add a CI rule that fails any non-public controller route without `@Permissions` or `@Roles`.
- Add integration tests for authorization denial per role.
- Add concurrency tests for inventory.
- Support notification SMS-channel tests now cover configured webhook dispatch and email/SMS retry leasing.
- Add report worker tests for large datasets.

---

# 7. DATABASE AUDIT

## Strengths

- Tenant tables include `tenant_id`.
- Implemented production schemas use forced RLS.
- Base schema has constraints and indexes for auth, sessions, billing, payments, students, attendance, sync, events, audit, and idempotency.
- Support, admissions, inventory, payments, billing, students, and events tables have indexes and tenant policies.
- Auth action tokens are hashed and expiration-aware.
- Event outbox uses `FOR UPDATE SKIP LOCKED`, retry metadata, and consumer idempotency.

## Failures and gaps

- Missing tables for library, payroll, HR, full timetable service, transport, reservations, book issuing, and fines; exams still need deeper lifecycle validation.
- Inventory now has managed location administration, item storage-location validation, transfer source/destination validation, item-location balances for completed transfers, reversal movements for completed transfer cancellation, opening/receipt balance seeding, request approval attribution, open backorders for unavailable request approval lines, partial fulfillment for reserved request lines, receipt-driven backorder resolution, posted stock-count snapshots with variance adjustments, and item/location reconciliation reporting.
- Inventory movements are now structurally append-only in the module schema.
- Inventory `quantity_on_hand` now has a direct non-negative check in the module schema.
- Admissions now persists parent guardian linkage, fee assignment, academic enrollment, configured subject/timetable enrollment, and admissions-owned academic lifecycle history; cross-module academic history is still missing.
- Reports do not have generated artifact/snapshot/checksum tables.
- Support notifications now store delivery attempts, last error, next retry time, and delivered timestamp; retry scheduling, failed-delivery dashboard visibility, and in-app terminal-failure alerts exist.
- File object metadata now points to tenant-scoped database-backed or S3/R2-backed storage paths, signed private read authorization is available, and object-backed reads verify checksums.

## Multi-tenant isolation

For implemented tables, the RLS posture is strong. The live checks also confirmed unauthenticated direct and proxy access is blocked.

Remaining multi-tenant risks:

- File storage is tenant scoped, database-backed by default, optionally S3/R2-backed when enabled, and protected by authorization-aware signed reads with checksum verification.
- Client-side exports can only be as tenant-safe as the already-loaded data; server-side tenant-scoped export generation is still needed.
- Missing modules cannot be proven tenant-safe because their data models do not exist.
- Global support KB/status content is intentionally shared; this must be clearly separated from tenant-specific support data.

---

# 8. SECURITY AUDIT

## Passing evidence

- JWT guard blocks unauthenticated protected routes.
- CSRF blocks mutating login POST without token.
- RBAC/permission decorators exist on implemented domain controllers.
- Forced RLS exists for implemented tenant tables.
- Redis-backed rate limiting exists for auth, MPESA callbacks, sync, and general API routes.
- Password recovery and invitation tokens are hashed and time-limited.
- Open registration is disabled.
- No demo credential UI blocks were found in the scanned login pages in prior verification.

## Vulnerabilities and gaps

- MFA is not operationally enforced.
- Email verification is operationally enforced for privileged/sensitive auth sessions; low-privilege policy and recovery overrides still need explicit product decisions.
- Device verification/trusted device flow is not operationally enforced.
- File uploads now enforce size, type, binary signature, unsafe filename, malware-test screening, provider scan verdict controls, and configured provider scan invocation; streaming multipart handling remains.
- Upload storage now uses tenant-scoped database file objects by default or S3/R2 object-backed persistence when enabled, with signed private reads and retention purge support.
- CORS safety now fails production startup for empty, wildcard, or non-HTTPS origins and is surfaced in readiness without exposing origin values.
- Support notification email and SMS webhook deliveries are dispatched when provider configuration is present, and readiness now exposes provider configuration status without secrets.
- Some security-sensitive UI states may create false assurance.
- Route permission metadata is enforced by the backend route-permissions test; CI must keep running the backend suite.
- Need explicit security tests for tenant isolation across reports, exports, files, notifications, and search.

## Injection/XSS/CSRF notes

- DTO validation and parameterized DB access reduce injection risk in implemented APIs.
- Markdown/rich text handling was not fully traced; any future KB/support rendering must sanitize HTML.
- CSRF is present on frontend mutating proxy routes; direct backend APIs rely on bearer tokens and CORS controls.

---

# 9. PERFORMANCE AUDIT

## Strengths

- Redis is used for sessions, rate limiting, queues, and cache primitives.
- BullMQ and outbox patterns exist.
- Important tenant/status/date indexes exist across implemented tables.
- Health and readiness expose database/Redis/queue state.

## Bottlenecks and risks

- Uploads are still memory-buffered, but parser limits now cap each request to one 10 MB file, 20 fields, 64 KB per field, and 25 total parts.
- Client-side exports will degrade with large datasets.
- Dashboard aggregation may become expensive without module-specific summary tables/materialized views.
- Inventory reports sum live item/movement data and may need precomputed snapshots at scale.
- Support analytics and searches need full-text search or trigram indexes as ticket volume grows.
- The default root `npm test` coverage does not clearly include every newly built domain workflow, so regressions can ship unnoticed.
- No stress test was run during this audit; production load readiness is unproven.

Recommended performance work:

- Add load tests for login, platform schools, support queue, inventory stock issue, admissions registration, MPESA callbacks, and report exports.
- Stream uploads directly to object storage.
- Move large exports to queue jobs.
- Add pagination and cursor-based APIs where needed.
- Add query plans for reporting endpoints before release.

---

# 10. OPERATIONAL RESILIENCE AUDIT

## Existing resilience

- Redis readiness is checked.
- PostgreSQL readiness is checked.
- BullMQ is configured.
- Events outbox and workers exist.
- Payment queue worker exists.
- Request IDs and structured logging exist.
- Graceful shutdown service exists.
- SLO monitoring service exists.

## Gaps

- Support notifications have email dispatch, SMS webhook dispatch, retry metadata, a scheduled retry worker, and a failed-delivery operational dashboard.
- File uploads are recoverable through tenant-scoped file objects with local malware-test screening, provider verdict enforcement, configured provider scan invocation, optional S3/R2 object-backed persistence, and signed reads, but still need streaming multipart handling.
- No documented backup/restore test was found.
- No disaster recovery runbook was found.
- No tenant data export/import recovery path was verified.
- SLA breach escalation scheduler is implemented and covered by backend tests.
- No public incident communication workflow was verified.
- No end-to-end synthetic monitoring for critical user journeys was found.

Recommended operational controls:

- Daily database backup verification and restore drill.
- External object storage lifecycle policy.
- Synthetic checks for login, recovery, school onboarding, ticket creation, and payment callback.
- Queue delivery-alert dashboards.
- Incident runbooks and public status page.
- Audit-log completeness tests per workflow.

---

# 11. IMPLEMENTATION ROADMAP

## Phase 1 — Critical Stability

| Task | Dependencies | Risks | Estimated effort | Expected outcome |
|---|---|---|---|---|
| Hide or feature-flag UI-only modules | Feature flag config | Stakeholders may expect visible modules | 1-2 days | Users only see workflows that can really persist. |
| Harden file uploads | Object storage provider, file policy | Migration from local paths | 3-5 days | Durable, safe, tenant-scoped uploads. |
| Fix inventory atomic stock operations | DB migration/tests | Requires careful migration | 3-6 days | No race-prone stock deductions. |
| Add support notification dispatcher | Email provider config, worker runtime | Delivery retries/spam handling | 3-5 days | Critical tickets and replies notify real people with automatic transient-failure retries. |
| Add CI guard for route permissions | Controller metadata scan | False positives on public routes | 1-2 days | New APIs cannot accidentally bypass RBAC. |

### Phase 1 Progress

- Completed 2026-05-12: Added a compiled controller metadata test that fails CI when any HTTP route handler lacks explicit `@Public`, `@Permissions`, `@Roles`, or `@Policy` metadata.
- Completed 2026-05-12: Added missing authorization metadata to authenticated auth, compliance, sync, and MPESA payment-intent routes.
- Completed 2026-05-12: Added granular `payments:create` permission to the default permission catalog and assigned it to administrator, accountant, and parent roles so payment initiation can be authorized without broad finance write access.
- Completed 2026-05-12: Added a centralized frontend production module readiness gate for school-facing modules.
- Completed 2026-05-12: Hid academics, attendance, communication, exams, reports, staff, and timetable from role sidebars, school workspace navigation, quick actions, capabilities, dashboard KPI links, and workspace search until those workflows are backend-complete.
- Completed 2026-05-13: Re-enabled exams in the production readiness gate after the exams workspace was added; attendance stays retired from route catalogs, navigation, dashboard helpers, and workspace actions.
- Completed 2026-05-12: Blocked direct school routes for inactive sections with `notFound()` and suppressed inactive academics widgets on teacher/parent dashboards.
- Completed 2026-05-12: Replaced local filesystem upload persistence for support attachments and admissions documents with a tenant-scoped `file_objects` storage table protected by RLS and SHA-256 checksums.
- Completed 2026-05-12: Wrapped support/admissions file object writes and metadata writes in request transactions so uploads cannot leave half-saved attachment records.
- Completed 2026-05-12: Added binary signature checks for PDFs, images, Office zip documents, zip files, and text-backed diagnostics.
- Completed 2026-05-13: Added upload malware-test signature screening so admissions documents and support attachments reject EICAR-style payloads before storage.
- Completed 2026-05-14: Added provider malware-scan verdict enforcement and secret-safe provider credential smoke coverage for upload scanning, so unsafe provider verdicts are rejected before storage and scan provider config can be checked without exposing tokens or endpoints.
- Completed 2026-05-14: Added an injectable live upload malware-scan invocation helper that posts checksum, metadata, and base64 content to a configured HTTPS provider with bearer auth, then normalizes clean, infected, timeout, and error verdicts before upload validation.
- Completed 2026-05-14: Wired support attachments and admissions document uploads to invoke the configured malware-scan provider before tenant file persistence, while preserving the scan verdict in stored file metadata.
- Completed 2026-05-14: Added shared upload filename safety checks so path traversal, drive-path, control-character, reserved-character, and overlong original names are rejected before storage.
- Completed 2026-05-14: Added a shared database file-object storage path guard so uploads must be written under `tenant/{tenantId}/...` and cross-tenant or traversal paths are rejected before `file_objects` writes.
- Completed 2026-05-14: Added a standalone S3/R2-compatible object storage adapter with HTTPS endpoint validation, tenant-scoped key enforcement, SHA-256 checksums, AWS SigV4 signed PUT requests, ETag capture, and secret-safe tests without adding an AWS SDK dependency.
- Completed 2026-05-14: Wired object storage into `DatabaseFileStorageService` behind `UPLOAD_OBJECT_STORAGE_ENABLED`, allowing S3/R2-backed file objects with nullable database content, first-class object metadata, signed-read download through the adapter, and checksum mismatch rejection.
- Completed 2026-05-14: Extended `smoke:providers` with secret-safe S3/R2 object storage readiness checks for enabled object-backed uploads, including HTTPS endpoint, bucket, access key, and secret key validation without exposing endpoint URLs or credentials.
- Completed 2026-05-14: Added startup environment validation for enabled S3/R2 upload object storage so invalid providers, non-HTTPS endpoints, and missing bucket/access/secret settings fail before serving upload traffic.
- Completed 2026-05-14: Centralized Multer multipart limits so support and admissions uploads are capped before service-level validation at one file, 10 MB file size, 20 fields, 64 KB per field, and 25 total parts.
- Completed 2026-05-14: Added signed private read tokens for database-backed file objects, with HMAC verification, expiry enforcement, tenant/path matching, and scoped `file_objects` reads before downloads can be served.
- Completed 2026-05-14: Added file-object retention metadata and bounded purge support, including retention policy identifiers, retention expiry timestamps, an expiry index, and batched deletion summaries for expired stored uploads.
- Completed 2026-05-12: Added support notification delivery attempt tracking with `delivery_attempts`, `last_delivery_error`, `next_delivery_attempt_at`, and `delivered_at`.
- Completed 2026-05-12: Changed transient support email provider failures to remain queued with exponential backoff metadata until the configured retry budget is exhausted.
- Completed 2026-05-12: Added a support notification retry worker that runs under system request context, claims due queued email notifications with `FOR UPDATE SKIP LOCKED`, applies a retry lease, and dispatches them through the email delivery service.
- Completed 2026-05-14: Added secret-safe support notification provider readiness reporting for email recipients, transactional email configuration, SMS webhook presence, SMS recipient counts, and retry-worker settings.
- Remaining upload hardening: streaming multipart handling can still be added when controller/interceptor rollout is selected.
- Completed 2026-05-14: Added `smoke:providers`, a secret-safe provider credential smoke command for transactional email, support email recipients, optional support SMS webhook settings, upload malware scan settings, optional S3/R2 object storage settings, retry-worker limits, and retired-attendance notification target rejection. Live provider probes can be enabled per environment through explicit smoke URLs.
- Remaining notification hardening: run `npm run smoke:providers` inside each production/staging environment before launch and enable live provider probe URLs where providers expose non-mutating health/credential endpoints.
- Verification: `npm.cmd --prefix apps/web run test:design` passed with 104/104 frontend design tests.
- Verification: `npm.cmd --prefix apps/web run build` completed a production Next.js build successfully.
- Verification: `npm.cmd test` passed with 79/79 backend tests.
- Deployment: Railway API deployment `6902b5f5-1666-4a27-a4c2-f2bb171ae5a9` succeeded; `/health` and `/health/ready` returned 200 with Postgres up, Redis up, BullMQ configured, and zero active SLO alerts. Runtime logs confirmed `Support notification retry worker running every 60000ms`.
- Deployment: Vercel production deployment `https://shule-hub-9hrbnp6vr-robin142-alts-projects.vercel.app` completed successfully and was aliased to `https://shule-hub-erp.vercel.app`.
- Live smoke check: `https://shule-hub-erp.vercel.app/school/login` returned 200, protected production-ready school routes returned session redirects, and inactive `/school/teacher/academics` returned 404.

## Phase 2 — Workflow Completion

| Task | Dependencies | Risks | Estimated effort | Expected outcome |
|---|---|---|---|---|
| Complete tenant user invitation module | Auth token/email service | Role model complexity | 5-8 days | School admins can invite teachers, accountants, staff, parents, and students. |
| Complete admissions downstream workflow | User invites, fee structures, classes | Cross-module coupling | 8-12 days | Admission creates real operational learner lifecycle. |
| Complete inventory location/request/transfer model | Inventory migration | Historical balance reconciliation | 8-12 days | Storekeeper lifecycle is accurate and auditable. |
| Build server report service | Queue/storage | Export format complexity | 8-15 days | PDF/Excel/CSV reports are reliable at school scale. |
| Add public system status app | Observability data | Incident process ownership | 4-7 days | Schools can see platform incidents without logging in. |

### Phase 2 Progress

- Completed 2026-05-13: Exposed tenant user invitation creation from school settings with a CSRF-protected Next proxy, `role_code` payloads, and a school-admin UI for teacher, accountant, staff, parent, student, storekeeper, librarian, and admin invites.
- Completed 2026-05-13: Added backend-backed tenant user listing that combines active/suspended memberships with pending invitation tokens, added resend with token rotation, added revoke by consuming pending invitation tokens, and replaced the local settings table state with live data plus CSRF-protected resend/revoke actions.
- Completed 2026-05-13: Added backend-persisted membership suspension/reactivation with a CSRF-protected school settings proxy and live table updates.
- Completed 2026-05-13: Added backend-validated role editing for existing tenant members with a CSRF-protected school settings proxy and inline role selectors.
- Completed 2026-05-13: Added audit logging for tenant invitation creation, resend, revoke, membership suspension/reactivation, and role updates.
- Completed 2026-05-13: Added safe transactional email configuration status to readiness checks so production can verify Resend API key, sender, and public app URL presence without leaking secrets.
- Remaining tenant invitation hardening: none identified in this audit slice beyond live environment credential validation.
- Completed 2026-05-13: Admissions registration now locks the admission row, is idempotent for already registered applications, and sends a parent-role tenant invitation when an approved application has a parent email.
- Completed 2026-05-13: Added persisted student guardian links for parent invitations and made invitation acceptance activate matching guardian rows with the accepted user id.
- Completed 2026-05-13: Added active class fee structures plus student fee assignment and student fee invoice generation during admissions registration.
- Completed 2026-05-13: Added academic class sections, student academic enrollments, and configured class capacity checks before student creation.
- Completed 2026-05-13: Added configured subject and timetable enrollment copying during admissions registration from active class-section academic setup.
- Completed 2026-05-13: Added row-locked admissions academic lifecycle advancement for promotion, graduation, and archive with tenant-scoped lifecycle event persistence.
- Completed 2026-05-13: Surfaced active academic enrollment, subject/timetable enrollment counts, and latest lifecycle event status in the admissions student profile.
- Completed 2026-05-13: Surfaced parent portal invitation/activation status plus opening fee assignment/invoice status in the admissions student profile.
- Completed 2026-05-13: Added outbox domain hooks for admissions-created academic enrollments and academic lifecycle changes so downstream modules can consume promotion/graduation/archive transitions without direct coupling.
- Completed 2026-05-13: Added an admissions registration completion receipt summarizing the registered learner, academic handoff, parent portal invitation, and opening fee handoff for both approved-application registration and direct front-office registration.
- Completed 2026-05-13: Added browser-level admissions workspace coverage for the direct registration path, including mandatory document uploads and the registration completion receipt.
- Completed 2026-05-13: Added an admissions onboarding checklist to the registration receipt, showing learner profile, academic handoff, parent portal, and fee handoff readiness states.
- Completed 2026-05-13: Added browser-level admissions profile actions and API-client coverage for promotion and graduation lifecycle flows.
- Remaining admissions workflow gaps: none identified in this audit slice beyond future downstream consumers for academic lifecycle events.
- Completed 2026-05-13: Added support notification dead-letter visibility with a `support:manage` backend endpoint, live frontend proxy adapter, Support Command Center failed-delivery panel, and in-app support alerts for exhausted provider failures.
- Completed 2026-05-13: Added configured support SMS webhook delivery for critical-ticket escalation notifications, including delivery attempts, retry leasing alongside email, terminal-failure alerts, and backend tests.
- Completed 2026-05-13: Added a support SLA breach monitor that runs under system context, records `ticket.sla_breached` status logs, creates support notifications, dispatches provider notifications, and suppresses duplicate breach events.
- Completed 2026-05-13: Added support ticket lifecycle edge-case handling so school replies reopen resolved/closed tickets, support agents must explicitly reopen closed tickets before replying, reopen transitions clear stale resolution/closure timestamps, and assignment audit logs retain previous/new assignee ids.
- Completed 2026-05-13: Added public read-only support status publishing through `GET /support/public/system-status`, an unauthenticated Next proxy endpoint, and a `/support/status` page backed by live status components and incidents.
- Completed 2026-05-13: Added critical-ticket notification flow coverage proving ticket creation persists and dispatches in-app, email, and configured SMS notifications through the support delivery service.
- Completed 2026-05-14: Added provider credential smoke coverage for support email/SMS settings and wired `smoke:providers` into the incident response runbook and release readiness gate.
- Remaining support notification hardening: run `npm run smoke:providers` inside each production/staging environment before launch and enable live provider probe URLs where providers expose non-mutating health/credential endpoints.
- Completed 2026-05-13: Hardened inventory supplier and purchase-order receipt against concurrent stock drift by locking receipt item rows, locking approved PO rows before status transition, and recording before/after quantities on receipt stock movements.
- Completed 2026-05-13: Added approved inventory request fulfillment that locks the request row, issues stock through atomic decrements, records department stock_issue movement rows with before/after quantities, and then marks the request fulfilled.
- Completed 2026-05-13: Made inventory stock movements structurally append-only by adding a schema-level mutation-prevention trigger for `inventory_stock_movements`.
- Completed 2026-05-13: Added `inventory_reservations` with tenant RLS and request/item constraints, reserved approved request lines against row-locked available stock, and marked reservations fulfilled when approved requests issue stock.
- Completed 2026-05-13: Added `inventory_locations` and `inventory_item_balances` with tenant RLS, moved completed transfers between source/destination balances under row locks, and recorded transfer movements with source before/after quantities.
- Completed 2026-05-13: Added `inventory_request_backorders` with tenant RLS and request/item constraints, so approval attempts that cannot reserve stock create open backorders and move the request to `backordered`.
- Completed 2026-05-13: Added `inventory_stock_count_snapshots` with tenant RLS and surfaced an inventory stock reconciliation report comparing item-level quantity to summed location balances with variance status.
- Completed 2026-05-13: Added receipt-driven request backorder resolution that locks open backorders, reserves newly available item stock, marks backorder lines resolved, and returns fully resolved requests to `approved`.
- Completed 2026-05-13: Seeded item-location balances from supplier receipts and purchase-order receipts by upserting received quantities into each item's storage location.
- Completed 2026-05-13: Seeded item-location balances from opening stock during item creation so new stocked items start with matching location totals.
- Completed 2026-05-13: Added managed inventory location administration endpoints and repository/service coverage for listing, creating, and updating tenant-scoped locations with normalized unique codes.
- Completed 2026-05-13: Validated inventory transfer source and destination values against active managed locations before transfer creation and before completed transfers move location balances.
- Completed 2026-05-13: Added stock count posting through `POST /inventory/stock-counts`, including row-locked item/location count updates, variance adjustment movements, and posted count snapshots.
- Completed 2026-05-13: Added partial fulfillment for backordered inventory requests so reserved lines can be issued first, marked fulfilled, and later final fulfillment consumes only remaining reserved lines.
- Completed 2026-05-13: Validated inventory item storage locations against active managed locations before item creation and updates, preventing unmanaged storage text from seeding location balances.
- Completed 2026-05-13: Added completed-transfer cancellation reversal that moves item-location balances back from destination to source and records an append-only `transfer_reversal` movement before marking the transfer cancelled.
- Completed 2026-05-13: Persisted inventory request approval attribution by recording the acting user on approved/backordered request status transitions.
- Completed 2026-05-14: Added a first server-side inventory report CSV artifact export endpoint with stable filenames, row counts, generated timestamps, SHA-256 checksums, CSV escaping, and backend coverage.
- Completed 2026-05-14: Wired live inventory report cards to backend export identifiers, added stock reconciliation export visibility, and made the web workspace download server-generated CSV artifacts with checksum metadata coverage.
- Completed 2026-05-14: Added server-side admissions CSV artifact exports for applications, documents, allocations, and transfers, then wired the admissions workspace export buttons to download those backend artifacts in live mode.
- Completed 2026-05-14: Extracted the backend CSV artifact contract into a shared tested report utility so inventory and admissions exports use one checksum, filename, row count, timestamp, and CSV escaping implementation.
- Completed 2026-05-14: Added a billing invoice CSV artifact export endpoint through the shared report utility, giving finance-facing invoice exports the same checksum and server-generated artifact contract.
- Completed 2026-05-14: Added a shared immutable report snapshot manifest contract with artifact checksums, manifest checksums, stable snapshot ids, tenant/module/report metadata, filter capture, and retired-attendance rejection while allowing active Exams snapshots.
- Completed 2026-05-14: Added tenant-scoped `report_snapshots` and append-only `report_snapshot_audit_logs` schema coverage plus a shared repository that persists report snapshot manifests and audit entries atomically under request context.

## Phase 3 — Security Hardening

| Task | Dependencies | Risks | Estimated effort | Expected outcome |
|---|---|---|---|---|
| Implement MFA enforcement | Auth service and UI | Recovery/support workflows | 6-10 days | Platform owner and school admins have real second-factor protection. |
| Enforce email verification for sensitive actions | Email verification backend/UI | Policy edge cases | 1-3 days | Sensitive actions can require verified email ownership. |
| Implement trusted device verification | Session/device model | UX friction | 5-8 days | Suspicious/new device login is controlled. |
| Lock production CORS config | Env validation | Deployment config mismatch | 1 day | No wildcard credentialed origins. |
| Add file malware/type scanning | Upload pipeline | Provider integration | 3-5 days | Safer school documents and screenshots. |

### Phase 3 Progress

- Completed 2026-05-13: Added backend email verification request and verify endpoints, email outbox/token schema functions, transactional verification email rendering, token expiry/consumption handling, and invalid-token safeguards.
- Completed 2026-05-14: Wired `/verify-email` to consume verification links through CSRF-protected Next proxies, with frontend coverage for successful token verification.
- Completed 2026-05-14: Enforced verified email ownership for sensitive tenant/platform sessions by downscoping unverified privileged logins to `auth:read`, invalidating existing unverified privileged access-token sessions, exposing verification state in auth payloads, and aligning auth lookup schema functions with the new security state.
- Completed 2026-05-14: Removed false-assurance MFA/device-verification claims from auth login, state, and trust copy while those controls remain policy-ready but not fully enforced.
- Completed 2026-05-14: Added production-copy regression coverage to prevent unfinished MFA or trusted-device claims from reappearing in auth surfaces before backend enforcement exists.
- Completed 2026-05-14: Hardened the shared upload policy to reject unsafe original filenames before support attachments or admissions documents can be persisted.
- Completed 2026-05-14: Added sanitized production CORS readiness reporting alongside the existing production CORS startup guard.

## Phase 4 — Performance Optimization

| Task | Dependencies | Risks | Estimated effort | Expected outcome |
|---|---|---|---|---|
| Add load tests for core APIs | Test data factory | Avoid polluting prod | 4-7 days | Known capacity for school-opening spikes. |
| Add dashboard summary tables | Domain data models | Staleness handling | 5-10 days | Fast dashboards for large schools. |
| Add full-text search indexes | DB extensions/migrations | Index growth | 2-4 days | Fast ticket/student/report search. |
| Queue large exports | Report service | Worker scaling | 3-6 days | Reports do not time out in browser/API. |
| Add query-plan review in CI | Representative DB | CI complexity | 2-4 days | Slow queries are caught early. |

### Phase 4 Progress

- Completed 2026-05-14: Added a read-only core API load probe covering health, public status, students, admissions, inventory, billing, and the new server-side admissions/inventory/billing report artifact exports. The probe refuses remote targets unless explicitly opted in, requires tenant credentials for tenant-scoped endpoints, and validates that retired attendance workloads cannot be reintroduced.
- Completed 2026-05-14: Added full-text GIN search indexes for active implemented modules: student directory search, admissions application search, inventory item/supplier search, and support ticket/knowledge-base search. Schema regression coverage confirms the active-module indexes exist and do not reintroduce retired attendance search surfaces.
- Completed 2026-05-14: Added a query-plan review harness with representative EXPLAIN JSON checks for active search hotspots. The new `perf:query-plan-review` script flags sequential scans on protected high-volume tables and rejects retired attendance query-plan reviews.
- Completed 2026-05-14: Added a shared queue-backed report export job contract and async export-job endpoints for admissions, inventory, and billing. The queue payload is tenant/request scoped, produces stable job IDs, defaults to CSV, keeps room for Excel/PDF workers, and rejects retired attendance export jobs while active academic/exam modules remain the forward path.
- Completed 2026-05-14: Added release-gated report snapshot manifest coverage so generated report artifacts now have a tested audit manifest contract before PDF/XLSX workers and persisted snapshot tables are added.
- Completed 2026-05-14: Added release-gated report snapshot persistence coverage with RLS, immutable snapshot rows, append-only audit logs, and retired-attendance database constraints.
- Completed 2026-05-14: Added tenant-scoped dashboard summary snapshot persistence with checksum metadata, source report snapshot links, staleness timestamps, RLS, release-gated coverage, and retired-attendance rejection while active Exams dashboards remain allowed.
- Completed 2026-05-14: Added tenant-scoped dashboard summary reads for current non-stale module/role summaries so dashboard surfaces can consume precomputed metrics without scanning operational tables.

## Phase 5 — Production Reliability

| Task | Dependencies | Risks | Estimated effort | Expected outcome |
|---|---|---|---|---|
| Backup/restore drill | Railway/Neon backup access | Operational coordination | 1-2 days | Recovery confidence. |
| Synthetic journey monitoring | Stable test tenant | Test tenant isolation | 3-5 days | Early detection of broken critical flows. |
| Incident runbooks | Support/status workflow | Ownership clarity | 2-4 days | Support can respond consistently. |
| Audit-log completeness testing | Audit events per module | Coverage work | 4-8 days | Enterprise-grade accountability. |
| Release readiness gate | QA checklist/CI | Slower releases | 2-3 days | No half-working feature ships as complete. |

### Phase 5 Progress

- Completed 2026-05-14: Added a CI-friendly release readiness gate script and `release:readiness` command. The gate verifies frontend module readiness keeps exams active and attendance retired, confirms default test coverage includes route permissions/load/query-plan/report-export checks, validates active-module core API load and query-plan coverage, and checks that queued report exports still reject retired attendance jobs.
- Completed 2026-05-14: Added an incident response runbook covering readiness/status checks, support notification dead letters, SLA breach triage, communications, rollback, queued report export mitigation, active Exams handling, and the retired-attendance guardrail. The release readiness gate now verifies the runbook keeps those required response steps.
- Completed 2026-05-14: Added a backup/restore drill runbook and `dr:backup-restore` command that runs the existing backup integrity and disaster recovery integration suites. The release readiness gate now requires the backup integrity, disaster recovery, and combined drill scripts plus runbook safeguards for sandbox-only restores, full schema restore, tenant-scoped restore, point-in-time restore, RTO/RPO, tenant digests, checksum verification, active Exams recovery scope, and retired attendance handling.
- Completed 2026-05-14: Added a read-only synthetic journey monitor and `monitor:synthetic` command covering public readiness/status, tenant-scoped students/admissions/inventory/billing read paths, server report artifact exports, and the active Exams web route. The monitor refuses remote targets unless explicitly opted in, requires tenant credentials for tenant journeys, rejects mutating steps, and blocks retired attendance monitoring from being reintroduced; release readiness now checks this coverage.
- Completed 2026-05-14: Added an audit coverage review harness and `audit:coverage-review` command that checks implementation and test evidence for active audit/event surfaces: tenant invitation and membership audit logs, support ticket status/SLA logs, admissions academic handoff and lifecycle domain events, finance transaction audit logs, grade audit logging, and fraud/security audit events. The release readiness gate now runs this matrix and rejects retired attendance audit requirements.
- Completed 2026-05-14: Added a provider credential smoke harness and `smoke:providers` command that validates transactional email, support email recipients, optional support SMS webhook configuration, upload malware-scan provider readiness, optional S3/R2 object storage readiness, retry-worker safety limits, and rejects retired-attendance notification targets without exposing secrets. The release readiness gate now requires the command and its test coverage, and the incident runbook uses it during support notification incidents.

---

# 12. FINAL VERDICT

## Is the system truly production-ready?

No. The platform has a credible production foundation, but it is not a complete production-ready School ERP SaaS.

## Can schools safely use it today?

Only for a restricted pilot of implemented workflows, and only if unimplemented modules are hidden. Schools should not be sold or onboarded as if the ERP is complete.

## What will fail first?

The first failures will likely be:

- School admins unable to invite all real users after onboarding.
- Teachers/parents/students reaching workflows that remain hidden or incomplete until backend modules are implemented.
- Inventory counts drifting during concurrent store operations.
- Support notification provider failures exhausting retries are surfaced in the support command center and create in-app support alerts; configured SMS escalation now uses the same delivery/retry path.
- Large multipart uploads stressing API memory before streaming object storage is added.
- Reports failing to satisfy finance/admin audit expectations.

## What must be fixed immediately?

- Keep incomplete modules behind the new production readiness gate and apply it to every future release.
- Complete school-admin invitation flow.
- Harden upload storage.
- Fix inventory stock movement correctness.
- Validate configured support notification SMS channel with live provider credentials.
- Implement MFA/device verification and define any remaining low-privilege email-verification policy, or remove claims that imply those controls are fully active.
- Build server-side reporting/export infrastructure.

## What hidden technical debt exists?

- UI surfaces ahead of backend contracts, now partially controlled by production readiness gating.
- Remaining upload debt around streaming multipart handling.
- Legacy seeder schema/code still present despite disabled seeding.
- Report generation coupled to frontend tables.
- Partial security UX without enforcement.
- Inventory modeled as simple item quantity instead of a ledger/location-balance system.
- Module-specific audit coverage is uneven.

## What operational risks remain?

- Tenant-safe reporting and file downloads are not fully proven.
- Large-school performance is unproven.
- Backup/restore readiness is unverified.
- Public incident communication is absent.
- SMS delivery is implemented through a configured webhook provider; `smoke:providers` now validates static credentials and can run environment-specific live probes when non-mutating provider health URLs are supplied.
- Full school lifecycle from admission to graduation now has an admissions-owned backend path, but it is not yet fully surfaced and verified across every school module.

Final readiness statement:

The product should be treated as an advanced SaaS foundation with some real modules, not a complete ERP. It can become production-grade, but only after the incomplete workflows are either hidden or fully implemented and verified end to end.
