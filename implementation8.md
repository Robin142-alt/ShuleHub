# IMPLEMENTATION 8 - Practical Integrations, SMS Quota, Daraja, Scanner Library, Simplified Login, and Parent UX Plan

> **For agentic workers:** Implement this plan task-by-task with focused tests first. Use the existing NestJS API, Next.js web app, PostgreSQL RLS, request context, audit logging, encryption helpers, and current Railway/Vercel deployment shape. Do not introduce new infrastructure unless the task explicitly needs it.

**Goal:** Add practical Kenyan school integrations and simpler user flows to the existing ShuleHub ERP without turning the product into an overengineered enterprise platform.

**Primary outcomes:**

- Platform owner centrally manages SMS providers, SMS pricing, school SMS wallets, and SMS usage.
- Schools manage their own M-PESA Daraja/paybill credentials because schools own their fee collection accounts.
- Schools log in with email and password only; the system resolves the workspace automatically.
- Parents can access a lightweight mobile portal with phone/email plus password or OTP.
- Library circulation supports USB/Bluetooth/handheld barcode or QR scanners as fast keyboard input.
- The system remains practical for a solo founder to operate while scaling toward 1000+ schools.

**Non-goals:**

- Do not rebuild the ERP.
- Do not introduce Kubernetes, CQRS, event sourcing, microservices, or hardware SDKs.
- Do not let schools see platform SMS provider credentials.
- Do not make the ERP hold school funds.
- Do not expose raw secrets, OTPs, credentials, or API keys in UI, logs, reports, or audit metadata.

---

# 0. Ready-to-Paste Master Prompt

```text
CODEX MASTER PROMPT - PRACTICAL SCHOOL ERP INTEGRATIONS, SMS QUOTA, SIMPLIFIED LOGIN, PARENT PORTAL, AND LIBRARY SCANNER

You are a Senior Fullstack SaaS Engineer improving an existing multi-tenant School ERP system used by schools in Kenya.

Your task is to enhance the current system incrementally with practical, real-world improvements focused on usability, simplicity, speed, maintainability, tenant safety, and realistic school workflows.

Do not redesign the entire system.
Do not overengineer.
Do not introduce unnecessary enterprise infrastructure.
Use the existing stack and patterns.

Core rules:
- Platform owner centrally manages SMS providers, SMS credentials, SMS pricing, SMS quotas, and SMS monitoring.
- Schools do not manage SMS provider API credentials.
- Schools consume SMS credits from their own school SMS wallet.
- Schools can buy/request more SMS credits.
- Each school manages its own Daraja credentials, paybill/till, shortcode, passkey, environment, and payment notifications.
- The ERP acts as middleware, reconciliation engine, and automation layer. It never holds school funds.
- Login should only ask for email/username and password. Remove tenant code/workspace code/school code from normal login.
- The system resolves the user's tenant/workspace automatically after authentication.
- Parent portal access should support phone or email, password or OTP, with SMS invite onboarding.
- The library module must support QR/barcode scanners as keyboard input. Do not build IoT or hardware driver integrations.
- Keep all experiences mobile-first and friendly for non-technical school staff and parents.

Implementation targets:
1. Platform SMS settings for TextSMS Kenya, Africa's Talking, and Twilio.
2. School SMS wallet/quota system with balance checks, deduction, low-balance alerts, purchase records, and logs.
3. School SMS dashboard showing balance, monthly usage, delivery rate, and recent logs without exposing provider secrets.
4. SMS sending flow: check balance, enforce quota, deduct credit, send via platform provider, store log, update delivery.
5. School Daraja settings: paybill, shortcode, consumer key, encrypted secret, encrypted passkey, environment, active status, test connection.
6. Callback flow: parent pays school paybill, Safaricom callback arrives, system identifies school, validates transaction, records payment, allocates fees, generates receipt, sends SMS notification.
7. Onboarding flow: school information, admin account, optional Daraja setup, SMS plan setup, finish.
8. Library scanner flow: scan student ID, scan book, issue instantly; scan book, return instantly, calculate fines.
9. Simplified parent portal: fee balances, receipts, exam results, announcements, attendance visibility only when the module exists, and school communication.
10. Performance: optimize for 1000+ schools, fast mobile UX, indexed tenant-scoped queries, queue SMS/callback side effects, cache safe read models, and load-test before release.

Security:
- Encrypt provider API keys, Daraja consumer secrets, passkeys, and callback secrets.
- Mask credentials in UI after save.
- Never log raw secrets.
- Store audit events for credential changes, SMS wallet adjustments, purchases, and integration changes.
- Enforce RBAC: platform owner for platform SMS providers; school owner/finance admin for Daraja; librarian/admin for library circulation; parents only see their linked children.

Output:
- Backend schema changes
- API endpoint map
- Frontend page map
- Service architecture
- SMS quota and deduction logic
- Daraja callback flow
- Library scanner workflow
- Simplified login flow
- Parent portal flow
- RBAC and audit updates
- Performance plan
- Production readiness checklist

Build the fastest practical implementation that can launch safely and scale gradually.
```

## 0.1 Output Requirement Traceability

This plan deliberately maps the requested implementation outputs to concrete sections:

- A. Frontend page structure: see section 6.
- B. Database schemas: see section 3.
- C. Backend services structure: see section 4.
- D. API endpoints: see section 5.
- E. Daraja integration flow: see section 8.
- F. SMS quota architecture: see sections 2.1, 3.2, 3.4, and 7.
- G. SMS deduction logic: see section 7.
- H. Callback handling flow: see sections 5.3 and 8.3.
- I. RBAC permissions: see section 12.1.
- J. Security implementation: see sections 3, 8, 12, and 15.
- K. Deployment recommendations: see sections 14, 15, and 16.
- L. Realistic scaling recommendations: see section 13.
- M. Production-readiness checklist: see section 15.

---

# 1. Current System Fit

The current repo already has most of the foundations needed:

- NestJS API modules with controllers, services, schema services, repositories, request context, permissions, and tests.
- PostgreSQL schemas with tenant-scoped RLS patterns.
- Next.js App Router frontend with school, portal, platform, support, billing, library, and auth surfaces.
- Support notification SMS relay work from Implementation 7.
- Payments and tenant finance code, including M-PESA related services.
- Library module backend and web routes that can be extended for scanner-first workflows.
- Auth flow with tenant memberships and invite/password recovery infrastructure.

Implementation 8 should reuse these patterns. The fastest path is to add small vertical slices, not a parallel integration platform.

---

# 2. Architecture Decisions

## 2.1 SMS Ownership

Platform owns:

- provider credentials
- sender IDs
- default provider
- provider health checks
- SMS pricing
- wallet adjustment policies
- global SMS monitoring

School owns:

- SMS wallet balance
- SMS usage
- recipient lists
- message content
- consent and communication preferences

School cannot:

- see provider API keys
- switch SMS provider
- edit sender credentials

## 2.2 Daraja Ownership

School owns:

- paybill/till
- shortcode
- Daraja app credentials
- passkey
- environment
- callback URLs configured in Safaricom portal

Platform provides:

- encrypted credential storage
- per-school credential loading
- payment validation and reconciliation
- receipt/SMS automation
- operational monitoring

The ERP never touches settlement funds. Money goes from parent to school paybill/till.

## 2.3 Scanner Hardware

Treat scanners as keyboard input devices.

No hardware SDK.
No drivers.
No IoT bridge.

Browser fields receive scanner text and submit on Enter.

## 2.4 Simplified Login

Normal login asks only:

- Email or username
- Password

Tenant resolution happens after credential verification by looking up the user's active membership.

If a user belongs to exactly one school, redirect directly.
If a platform owner logs in, redirect to platform workspace.
If a legitimate user belongs to more than one school, show a simple post-login "Choose school" page only for that edge case, not a normal workspace-code login.

## 2.5 Performance Target

Practical target for launch:

- 1000+ onboarded schools.
- 50k to 250k total users over time.
- Read p95 under 250 ms for common dashboards on warm cache.
- Write p95 under 700 ms for normal school actions.
- Callback processing acknowledgement under 2 seconds.
- Queue side effects for SMS, receipts, email, and callback retries.
- Scale API horizontally when needed.

"Thousands of users per second" should be treated as a load-test target for read-heavy and queued paths, not a promise that SMS providers or Daraja callbacks can process unlimited live writes instantly.

---

# 3. Database Schema Plan

Use additive migrations/schema-service updates only. Keep RLS forced on tenant data.

## 3.1 Platform SMS Providers

Table: `platform_sms_providers`

Platform-wide table, accessible only by platform owner/system.

Columns:

- `id uuid primary key`
- `provider_name text not null`
- `provider_code text not null` values: `textsms_kenya`, `africas_talking`, `twilio`
- `api_key_ciphertext text not null`
- `username_ciphertext text`
- `sender_id text not null`
- `base_url text`
- `is_active boolean not null default false`
- `is_default boolean not null default false`
- `last_test_status text`
- `last_tested_at timestamptz`
- `metadata jsonb not null default '{}'::jsonb`
- `created_by_user_id uuid`
- `updated_by_user_id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints:

- one default active provider
- provider code in supported list
- no blank sender ID

## 3.2 School SMS Wallets

Table: `school_sms_wallets`

Tenant-scoped.

Columns:

- `id uuid primary key`
- `tenant_id tenant_key not null`
- `sms_balance integer not null default 0`
- `monthly_used integer not null default 0`
- `monthly_limit integer`
- `sms_plan text not null default 'starter'`
- `low_balance_threshold integer not null default 100`
- `allow_negative_balance boolean not null default false`
- `billing_status text not null default 'active'`
- `last_reset_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints:

- one wallet per tenant
- balance can go negative only when `allow_negative_balance=true`
- monthly used cannot be negative

## 3.3 SMS Logs

Table: `sms_logs`

Tenant-scoped.

Columns:

- `id uuid primary key`
- `tenant_id tenant_key not null`
- `provider_id uuid`
- `recipient_ciphertext text not null`
- `recipient_last4 text`
- `recipient_hash text not null`
- `message_ciphertext text`
- `message_preview text`
- `message_type text`
- `status text not null` values: `queued`, `sent`, `delivered`, `failed`, `rejected`
- `credit_cost integer not null default 1`
- `provider_message_id text`
- `failure_reason text`
- `sent_by_user_id uuid`
- `sent_at timestamptz`
- `delivered_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Notes:

- Store masked preview for support.
- Encrypt full message only if the business needs resend/audit. Otherwise store a short preview and template metadata.

## 3.4 SMS Wallet Transactions

Table: `sms_wallet_transactions`

Tenant-scoped.

Columns:

- `id uuid primary key`
- `tenant_id tenant_key not null`
- `transaction_type text` values: `purchase`, `adjustment`, `deduction`, `refund`
- `quantity integer not null`
- `balance_after integer not null`
- `reference text`
- `reason text`
- `created_by_user_id uuid`
- `created_at timestamptz`

This provides the audit-safe wallet ledger.

## 3.5 School Integrations

Table: `school_integrations`

Tenant-scoped.

Columns:

- `id uuid primary key`
- `tenant_id tenant_key not null`
- `integration_type text not null` values: `mpesa_daraja`
- `paybill_number text`
- `till_number text`
- `shortcode text`
- `consumer_key_ciphertext text`
- `consumer_secret_ciphertext text`
- `passkey_ciphertext text`
- `environment text not null default 'sandbox'` values: `sandbox`, `production`
- `callback_url text`
- `callback_secret_hash text`
- `is_active boolean not null default false`
- `last_test_status text`
- `last_tested_at timestamptz`
- `created_by_user_id uuid`
- `updated_by_user_id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints:

- one active Daraja integration per tenant/environment unless there is a clear multi-paybill requirement.
- do not store raw consumer secret/passkey.

## 3.6 Integration Logs

Table: `integration_logs`

Tenant-scoped.

Columns:

- `id uuid primary key`
- `tenant_id tenant_key`
- `integration_type text not null`
- `operation text not null`
- `status text not null`
- `provider_reference text`
- `error_message text`
- `request_id text`
- `created_by_user_id uuid`
- `created_at timestamptz`

Never store raw request payloads when they contain secrets or phone numbers.

## 3.7 School Onboarding Status

Add to existing school/platform tenant schema, or create `school_onboarding_status`.

Columns:

- `tenant_id tenant_key primary key`
- `school_info_completed_at timestamptz`
- `admin_account_completed_at timestamptz`
- `daraja_setup_status text default 'pending'`
- `sms_plan_status text default 'pending'`
- `overall_status text` values: `pending_setup`, `partially_configured`, `fully_configured`
- `updated_at timestamptz`

## 3.8 Library Scanner Enhancements

Extend existing library tables or add if absent.

`library_books` additions:

- `barcode text`
- `qr_code text`
- `accession_number text not null`
- `isbn text`
- `category text`
- `shelf_location text`
- `availability_status text` values: `available`, `issued`, `lost`, `damaged`, `retired`

Indexes:

- `(tenant_id, barcode)`
- `(tenant_id, qr_code)`
- `(tenant_id, accession_number)`
- `(tenant_id, isbn)`

`library_transactions` additions:

- `scan_code text`
- `scanned_by_user_id uuid`
- `issue_date timestamptz`
- `due_date timestamptz`
- `return_date timestamptz`
- `fine_amount_minor bigint default 0`
- `status text` values: `issued`, `returned`, `overdue`, `lost`, `damaged`

## 3.9 Parent Access

Use existing users and tenant memberships if possible.

Required support:

- parent phone login alias
- parent OTP challenge table or reuse existing auth action tokens
- guardian to student relationship already present in admissions/student guardian work

Add only if missing:

- `users.phone_number_ciphertext`
- `users.phone_number_hash`
- `users.phone_number_last4`
- index on `phone_number_hash`

---

# 4. Backend Service Structure

Create or extend modules with thin services.

## 4.1 Platform SMS

Files:

- `apps/api/src/modules/integrations/platform-sms.controller.ts`
- `apps/api/src/modules/integrations/platform-sms.service.ts`
- `apps/api/src/modules/integrations/platform-sms.repository.ts`
- `apps/api/src/modules/integrations/platform-sms-schema.service.ts`
- `apps/api/src/modules/integrations/sms-provider-client.ts`

Responsibilities:

- CRUD platform provider settings.
- Store encrypted credentials.
- Mask provider details for responses.
- Test provider connection.
- Select default provider.
- Expose platform usage metrics.

## 4.2 School SMS Wallet

Files:

- `apps/api/src/modules/integrations/school-sms-wallet.service.ts`
- `apps/api/src/modules/integrations/school-sms-wallet.repository.ts`
- `apps/api/src/modules/integrations/sms-dispatch.service.ts`

Responsibilities:

- Get wallet.
- Deduct credits transactionally.
- Record wallet ledger.
- Queue/send SMS.
- Update SMS logs.
- Emit low balance notifications.

## 4.3 Daraja School Integration

Files:

- `apps/api/src/modules/tenant-finance/daraja-integration.service.ts`
- `apps/api/src/modules/tenant-finance/daraja-integration.repository.ts`
- `apps/api/src/modules/payments/controllers/mpesa-callback.controller.ts`

Responsibilities:

- Save masked credentials.
- Test Daraja OAuth/token/STK or C2B configuration.
- Load/decrypt credentials by tenant.
- Handle callbacks by integration id or shortcode/paybill lookup.
- Record integration logs.

## 4.4 Library Scanner

Extend existing library module:

- `library-scanner.service.ts`
- `library-circulation.service.ts`
- `library.repository.ts`

Responsibilities:

- Resolve scan code to book or student.
- Issue book from scanned student/book pair.
- Return book from scanned book code.
- Calculate overdue fine.
- Update availability.

## 4.5 Simplified Auth

Extend existing auth:

- email/password login no longer requires `tenant_id` in the frontend.
- backend resolves membership.
- session stores resolved tenant.
- public login pages remove workspace code fields.

---

# 5. API Endpoint Map

## 5.1 Platform SMS Endpoints

Platform owner only:

- `GET /platform/sms/providers`
- `POST /platform/sms/providers`
- `PATCH /platform/sms/providers/:providerId`
- `POST /platform/sms/providers/:providerId/test`
- `POST /platform/sms/providers/:providerId/set-default`
- `GET /platform/sms/usage`
- `GET /platform/sms/school-wallets`
- `POST /platform/sms/school-wallets/:tenantId/adjust`

Responses must mask secrets:

```json
{
  "provider_name": "Africa's Talking",
  "api_key": "************abcd",
  "username": "********",
  "sender_id": "SHULEHUB",
  "is_active": true,
  "is_default": true
}
```

## 5.2 School SMS Endpoints

School owner/admin/finance read:

- `GET /school/sms/wallet`
- `GET /school/sms/logs`
- `GET /school/sms/usage`
- `POST /school/sms/purchase-requests`

Internal/module send endpoint:

- `POST /sms/send`

Guarded by permissions and wallet checks.

## 5.3 Daraja Integration Endpoints

School owner or finance admin:

- `GET /integrations/daraja`
- `PUT /integrations/daraja`
- `POST /integrations/daraja/test`
- `POST /integrations/daraja/activate`
- `POST /integrations/daraja/deactivate`

Public/provider callback:

- `POST /payments/mpesa/callback/:integrationId`
- `POST /payments/mpesa/validation/:integrationId`
- `POST /payments/mpesa/confirmation/:integrationId`

Fallback lookup by shortcode/paybill can exist, but the primary callback URL should include integration id.

## 5.4 Library Scanner Endpoints

Librarian/admin:

- `GET /library/scan/:code`
- `POST /library/books`
- `POST /library/books/:bookId/qr`
- `POST /library/circulation/issue`
- `POST /library/circulation/return`
- `GET /library/dashboard`
- `GET /library/books?search=...`

## 5.5 Auth and Parent Endpoints

Auth:

- `POST /auth/login` with email/password only.
- `POST /auth/resolve-session` if needed for post-login membership resolution.

Parent:

- `POST /auth/parent/otp/request`
- `POST /auth/parent/otp/verify`
- `POST /auth/parent/invite/accept`
- `GET /portal/children`
- `GET /portal/children/:studentId/fees`
- `GET /portal/children/:studentId/results`
- `GET /portal/children/:studentId/receipts`
- `GET /portal/announcements`

---

# 6. Frontend Page Structure

## 6.1 Platform Owner

Add to superadmin/platform settings:

```text
Platform Settings
  SMS Providers
  SMS Usage
  School SMS Wallets
  Integration Health
```

Screens:

- Provider cards with masked credentials.
- Add/edit provider drawer.
- Test connection button.
- Default provider badge.
- Delivery status summary.
- School wallet table.
- Wallet adjustment modal with reason.

## 6.2 School Admin and Finance Admin

Add:

```text
School Settings
  Integrations
    M-PESA Daraja
  SMS
    Balance
    Logs
    Purchase SMS
```

Daraja UI:

- masked credential fields
- environment switch
- paybill/till fields
- save/test buttons
- connection status badge
- callback URL copy button

SMS UI:

- current balance
- monthly used
- monthly limit
- delivery rate
- recent logs
- buy/request more SMS button

Do not show platform provider credentials.

## 6.3 Onboarding

Steps:

1. School Information
2. Admin Account
3. Daraja Setup
4. SMS Plan Setup
5. Finish

Daraja can be skipped with status `partially_configured`.

## 6.4 Login Pages

Remove from normal school login:

- tenant code
- workspace code
- school selector

Keep:

- email/username
- password
- forgot password
- remember me
- show password toggle

## 6.5 Parent Portal

Mobile-first pages:

- login with phone/email
- OTP screen
- children switcher
- fee balance
- receipts
- exam results
- announcements
- message school

Avoid dense dashboards.

## 6.6 Library Scanner UI

Librarian pages:

- `Library Dashboard`
- `Scan Issue`
- `Scan Return`
- `Book Register`
- `Books`
- `Overdue`

Scanner UX:

- large focused input
- auto-submit on Enter
- success/error banner
- last scanned item panel
- keyboard-only flow
- mobile-friendly fallback typing

---

# 7. SMS Quota and Deduction Logic

Use a single transaction for wallet deduction and log creation.

Pseudo-flow:

```text
sendSms(tenant_id, recipient, message, type)
  begin transaction
    wallet = lock school_sms_wallets where tenant_id = current tenant for update
    creditCost = calculateSegments(message)
    if wallet.balance < creditCost and allow_negative_balance is false:
      create rejected sms_log
      throw "SMS balance exhausted"
    deduct wallet balance
    increment monthly_used
    create sms_wallet_transaction
    create sms_log status=queued
  commit

  enqueue dispatch job
  worker loads default active provider
  worker decrypts provider credential
  worker sends provider request
  worker updates sms_log status/provider_message_id
```

Low balance:

- if `sms_balance <= low_balance_threshold`, create notification.
- rate-limit low-balance alert per tenant.

SMS purchase:

- Phase 1: purchase request/manual admin credit adjustment.
- Phase 2: online payment for SMS credits.

This is practical for a startup and avoids premature billing complexity.

---

# 8. Daraja Integration Flow

## 8.1 Save Credentials

```text
School finance admin saves Daraja settings
  validate shape only
  encrypt consumer secret and passkey
  store masked metadata
  audit "daraja_credentials_updated"
```

Never return raw secret after save.

## 8.2 Test Connection

```text
School clicks Test Daraja Connection
  load tenant integration
  decrypt credentials backend only
  request OAuth token from Daraja
  optionally validate shortcode access
  store integration_log
  return pass/fail without secrets
```

## 8.3 Callback

```text
Safaricom callback hits /payments/mpesa/callback/:integrationId
  identify integration and tenant
  verify callback shape and shortcode
  validate duplicate transaction id
  record raw-safe payment event
  match invoice/student by account reference
  allocate fee payment
  generate receipt
  enqueue SMS receipt notification
  return success to Safaricom quickly
```

Do callback side effects through queue if they can be slow.

---

# 9. Library Scanner Architecture

## 9.1 Book Registration

Required fields:

- barcode or QR code
- accession number
- ISBN
- title
- category
- shelf location
- availability status

Generate code:

- default QR payload can be accession number or book id.
- prefer accession number for printed labels because librarians understand it.

## 9.2 Issue Flow

```text
focus student scan input
scan student ID/admission number
resolve student
focus book scan input
scan book barcode/QR/accession
resolve book
if available:
  create transaction
  set book issued
  show success
else:
  show clear error
```

## 9.3 Return Flow

```text
focus book scan input
scan book
find active issued transaction
calculate fine if due date passed
mark returned
set book available
show success/fine
```

## 9.4 Scanner Detection

Use:

- `autoFocus`
- `onKeyDown` submit on Enter
- short debounce for scanners that do not send Enter
- keep manual submit button for fallback

No special hardware support required.

---

# 10. Simplified Login and Tenant Resolution

## 10.1 Backend Logic

```text
POST /auth/login
  email + password
  find user by email
  verify password
  load active memberships
  if platform owner:
    create platform session
  else if one active school membership:
    create tenant session for that school
  else if multiple active memberships:
    create pre-auth session and show simple choose-school page
  else:
    reject login
```

## 10.2 Data Rules

- Normal school staff should have one active school membership.
- Parent accounts may have children in one tenant first.
- Platform support users use platform/internal auth path.
- Do not ask normal users for tenant codes.

## 10.3 Frontend Changes

Remove workspace/tenant fields from:

- `/school/login`
- `/teacher/login`
- `/accountant/login`
- `/parent/login`
- shared public school login component

Keep tenant selection only for rare multi-membership resolution after login.

---

# 11. Parent Portal Flow

## 11.1 Invitation

```text
School registers student guardian
  create or link parent user
  send SMS invite using school's SMS wallet
  parent opens invite link
  parent sets password or verifies OTP
  parent portal opens linked children
```

## 11.2 Parent Login

Support:

- email + password
- phone + OTP
- phone + password if password exists

## 11.3 Parent Features

Mobile-first:

- fee balances
- fee statements
- receipts
- exam results
- announcements
- school messages
- attendance only if current product reintroduces attendance safely later

Because attendance has been retired from the current system, do not expose attendance unless a future implementation re-adds it with real backend support and readiness gates.

---

# 12. RBAC and Audit

## 12.1 Permissions

Platform:

- `platform_sms:read`
- `platform_sms:write`
- `school_sms_wallets:adjust`
- `integrations:monitor`

School:

- `school_sms:read`
- `school_sms:purchase`
- `daraja:read`
- `daraja:write`
- `daraja:test`

Library:

- `library:read`
- `library:write`
- `library:circulation`
- `library:inventory`

Parent:

- `portal:read_own_children`
- `portal:message_school`

## 12.2 Audit Events

Track:

- `platform_sms_provider_created`
- `platform_sms_provider_updated`
- `platform_sms_provider_tested`
- `platform_sms_default_changed`
- `school_sms_wallet_adjusted`
- `school_sms_purchase_requested`
- `sms_balance_deducted`
- `daraja_credentials_updated`
- `daraja_connection_tested`
- `daraja_integration_activated`
- `library_book_scanned`
- `library_book_issued`
- `library_book_returned`
- `parent_invite_sent`
- `parent_otp_verified`

Audit metadata must never include raw secrets, OTPs, full API keys, full phone numbers, or full SMS body.

---

# 13. Performance and Scale Plan

## 13.1 Database

Indexes required:

- `school_sms_wallets(tenant_id)`
- `sms_logs(tenant_id, created_at desc)`
- `sms_logs(tenant_id, status, created_at desc)`
- `sms_wallet_transactions(tenant_id, created_at desc)`
- `school_integrations(tenant_id, integration_type, is_active)`
- `school_integrations(shortcode)` for callback lookup
- `integration_logs(tenant_id, created_at desc)`
- `library_books(tenant_id, barcode)`
- `library_books(tenant_id, qr_code)`
- `library_books(tenant_id, accession_number)`
- `library_transactions(tenant_id, status, due_date)`
- `users(lower(email))`
- `users(phone_number_hash)`
- `tenant_memberships(user_id, status)`

Use `FOR UPDATE` only around wallet deduction and critical stock/circulation transitions.

## 13.2 API

- Keep auth/login path simple and indexed.
- Avoid loading full dashboards on login.
- Paginate SMS logs, integration logs, library books, and parent records.
- Use projection queries instead of `SELECT *`.
- Keep callback acknowledgements fast.

## 13.3 Queues

Use existing Redis/BullMQ only for:

- SMS dispatch
- SMS delivery status polling/webhooks
- M-PESA callback side effects
- receipt generation if heavy
- low-balance notifications

Do not put normal CRUD behind queues.

## 13.4 Frontend

- Mobile-first parent pages.
- Avoid heavy charts for parent portal.
- Use small tables with pagination.
- Keep scanner pages client-side and keyboard-fast.
- Cache safe read data per route where possible.

## 13.5 Load Targets

Phase 1 release gate:

- 1000 schools in fixture/load plan.
- 100k users fixture model.
- 500 read RPS synthetic target.
- 100 write RPS targeted tenant-safe load.
- callback processing p95 under 2 seconds for acknowledgement.
- SMS queue can absorb spikes without losing wallet consistency.

Phase 2:

- 2000+ read RPS with horizontal API replicas.
- DB pooler tuned.
- common dashboards cached.
- query-plan review must pass for protected tables.

---

# 14. Fastest Implementation Order

## Phase 1 - Simplified Login

- [ ] Add failing tests for email-only login tenant resolution.
- [ ] Update auth service to resolve tenant from active membership.
- [ ] Preserve platform owner flow.
- [ ] Add rare multi-membership fallback.
- [ ] Remove workspace code fields from login UI.
- [ ] Update auth proxies/cookies to rely on resolved tenant.
- [ ] Verify password recovery still works.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/auth/auth.test.js
npm.cmd --prefix apps/web run build
```

## Phase 2 - Platform SMS Settings

- [ ] Add platform SMS provider schema/service/repository.
- [ ] Encrypt provider API key and username.
- [ ] Add masked provider responses.
- [ ] Add test provider endpoint.
- [ ] Add default provider toggle.
- [ ] Add platform owner UI page.
- [ ] Add audit logs.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/integrations/platform-sms.test.js
npm.cmd --prefix apps/web run build
```

## Phase 3 - School SMS Wallet and Logs

- [ ] Add school SMS wallet schema.
- [ ] Add wallet transaction ledger.
- [ ] Add SMS log table.
- [ ] Implement transactional deduction.
- [ ] Implement insufficient balance rejection.
- [ ] Implement low-balance alerts.
- [ ] Add school dashboard with balance, usage, logs, and buy/request button.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/integrations/school-sms-wallet.test.js
npm.cmd --prefix apps/web run build
```

## Phase 4 - SMS Dispatch Flow

- [ ] Add provider adapter for TextSMS Kenya.
- [ ] Add provider adapter for Africa's Talking.
- [ ] Add provider adapter for Twilio.
- [ ] Queue dispatch after wallet deduction.
- [ ] Update logs with provider message id and delivery status.
- [ ] Add provider smoke tests without secret leakage.

Verification:

```powershell
npm.cmd run build
npm.cmd run smoke:providers
```

## Phase 5 - School Daraja Integration

- [ ] Add `school_integrations` schema.
- [ ] Add encrypted credential save endpoint.
- [ ] Add masked credential response.
- [ ] Add Daraja test connection endpoint.
- [ ] Add school settings UI.
- [ ] Add onboarding Daraja step with skip option.
- [ ] Add audit logs.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/tenant-finance/tenant-finance-config.service.test.js
npm.cmd --prefix apps/web run build
```

## Phase 6 - Payment Callback Flow

- [ ] Add callback URL per integration id.
- [ ] Map callback to tenant.
- [ ] Validate shortcode/paybill matches integration.
- [ ] Deduplicate transaction id.
- [ ] Record payment event.
- [ ] Allocate fees through existing billing/payment allocation.
- [ ] Generate receipt.
- [ ] Enqueue SMS receipt notification through school wallet.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/payments/payments.test.js
```

## Phase 7 - Library Scanner

- [ ] Add barcode/QR/accession fields and indexes.
- [ ] Add scan resolve endpoint.
- [ ] Add issue by scanned student/book endpoint.
- [ ] Add return by scanned book endpoint.
- [ ] Add fine calculation on overdue return.
- [ ] Add scanner-friendly UI with autofocus and Enter submit.
- [ ] Add QR generation for book labels.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/library/library.test.js
npm.cmd --prefix apps/web run build
```

## Phase 8 - Parent Portal Access

- [ ] Add parent phone/email login support.
- [ ] Add OTP request/verify.
- [ ] Link parent to guardian/student relationship.
- [ ] Add SMS invite using school wallet.
- [ ] Build mobile-first portal pages.
- [ ] Add parent-only RBAC tests.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/auth/auth.test.js dist/apps/api/src/modules/students/students.test.js
npm.cmd --prefix apps/web run build
```

## Phase 9 - Onboarding Flow

- [ ] Update platform school creation to avoid forcing workspace code into user-facing login.
- [ ] Add onboarding status tracking.
- [ ] Add Daraja optional setup.
- [ ] Add SMS plan setup.
- [ ] Add finish screen with practical checklist.

Verification:

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/platform/platform-onboarding.service.test.js
npm.cmd --prefix apps/web run build
```

## Phase 10 - Performance and Readiness

- [ ] Add query plan reviews for SMS, Daraja, library scan, parent portal, and login.
- [ ] Add synthetic journeys for login, parent portal, Daraja settings, SMS dashboard, and library scan.
- [ ] Add load scripts for auth resolution, callback ingestion, SMS sending, and library scan.
- [ ] Add release-readiness checks for no workspace-code login regression.
- [ ] Add provider smoke checks for platform SMS provider readiness.

Verification:

```powershell
npm.cmd test
npm.cmd --prefix apps/web run build
npm.cmd run release:readiness
npm.cmd run perf:query-plan-review
npm.cmd run monitor:synthetic
```

---

# 15. Production Readiness Checklist

## Security

- [ ] SMS provider API keys encrypted.
- [ ] Daraja consumer secret/passkey encrypted.
- [ ] No raw secrets in logs.
- [ ] Masked credentials only in UI.
- [ ] Audit logs exist for all credential and wallet changes.
- [ ] Parent OTPs are hashed/short-lived.
- [ ] RBAC blocks teachers from integration settings.
- [ ] Parents can only access linked students.

## Reliability

- [ ] SMS wallet deduction is transactional.
- [ ] Duplicate M-PESA callbacks are idempotent.
- [ ] Daraja callback acknowledgement is fast.
- [ ] SMS dispatch retries safely.
- [ ] Low balance alerts are rate-limited.
- [ ] Library issue/return prevents duplicate active loans.

## UX

- [ ] Login has only email/username and password.
- [ ] No workspace code on normal login.
- [ ] Parent portal is mobile-first.
- [ ] Library scanner fields autofocus.
- [ ] Daraja setup can be skipped during onboarding.
- [ ] School SMS dashboard does not expose provider credentials.

## Performance

- [ ] Query-plan review passes.
- [ ] Common login and dashboard reads are indexed.
- [ ] SMS logs and integration logs are paginated.
- [ ] Load tests cover 1000-school fixture.
- [ ] Callback and SMS queues handle spikes.

## Deployment

- [ ] Railway API env has encryption key.
- [ ] Platform SMS provider credentials are installed only in database through UI/API, not hardcoded.
- [ ] Daraja credentials are school-provided and tenant-scoped.
- [ ] Redis/BullMQ enabled for SMS/callback side effects.
- [ ] GitHub Actions monitors include Implementation 8 journeys.

---

# 16. Rollout Strategy

## Stage 1 - Internal

- Enable simplified login for internal pilot tenants.
- Keep old workspace-code path behind a temporary hidden fallback for admin recovery only.
- Test parent OTP with staff phones.
- Test SMS wallet deduction in dry-run mode.

## Stage 2 - Pilot Schools

- Enable platform SMS settings.
- Assign initial SMS credits manually.
- Configure one real school Daraja sandbox or production credentials.
- Test paybill callback and receipt generation.
- Print 20 library QR labels and test scanner workflow.

## Stage 3 - Production

- Enable SMS purchase request flow.
- Enable Daraja self-service settings for finance admins.
- Enable parent SMS invites.
- Enable scanner workflows for librarians.
- Run weekly query-plan and load reviews during onboarding growth.

---

# 17. Final Architecture Verdict

This plan keeps ShuleHub practical:

- SMS is centralized because the platform pays and controls provider cost.
- Daraja is tenant-owned because schools own their funds.
- Login is simplified because schools should not remember workspace codes.
- Library scanning uses keyboard input because real scanners already work that way.
- Parent portal is mobile-first because most parents will use Android phones and mobile data.
- Scaling uses indexes, queues for side effects, provider smoke checks, and horizontal API growth rather than premature infrastructure complexity.

The fastest safe implementation is to ship this in vertical slices:

1. simplified login
2. SMS wallet/provider settings
3. Daraja settings and callbacks
4. scanner library workflows
5. parent OTP/mobile portal
6. performance/readiness gates

Do not expose any slice in production navigation until its backend, RBAC, RLS, audit, frontend, and focused tests pass.
