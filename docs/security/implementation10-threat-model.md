# Implementation 10 Threat Model

Generated for the production score maximization workstream on 2026-05-16.

## Scope

This model covers the highest-risk surfaces in ShuleHub ERP:

- authentication, JWT refresh, password reset, email verification, MFA, trusted devices, and invitations
- tenant resolution and row-level isolation
- support tickets, internal support notes, and support notifications
- finance payments, Daraja credentials, MPESA callbacks, manual payments, and receipts
- SMS provider credentials, school SMS wallets, SMS logs, and balance deduction
- file uploads, object storage, malware scanning, and signed access
- discipline incidents, counselling sessions, confidential notes, parent acknowledgements, and exports
- parent portal access by email, phone, password, or OTP
- reporting, CSV/Excel/PDF exports, and queued report artifacts

## Security Objectives

- Schools must never access another school's records, files, notifications, SMS logs, finance records, support tickets, or discipline data.
- Raw provider secrets must never leave backend execution paths.
- Auth pages must never display demo credentials, seeded accounts, passwords, OTPs, tenant IDs, workspace codes, or admin hints.
- Password reset, invite, email verification, and OTP flows must store token hashes only.
- Counselling notes must remain confidential, encrypted where persisted, and excluded from standard parent or report exports unless explicitly permitted.
- MPESA callbacks must be idempotent and tenant-specific. The ERP records and reconciles school-owned payments; it must not represent school funds as platform-held funds.

## Trust Boundaries

| Boundary | Entry Points | Key Controls |
| --- | --- | --- |
| Public auth | login, forgot password, invite acceptance, parent OTP | rate limits, token hashes, generic errors, no visible credentials |
| Tenant APIs | school dashboards, finance, library, support, discipline | authenticated session, tenant membership, RBAC, RLS, scoped repositories |
| Platform owner APIs | SMS provider settings, school onboarding, analytics | superadmin role checks, audit logs, secret masking |
| Provider callbacks | MPESA callback routes, email/SMS provider statuses | callback secret validation, idempotency, tenant lookup by configured integration |
| File ingress | support, admissions, discipline, library attachments | MIME and size policy, malware scan, tenant-scoped storage keys, signed URLs |
| Background jobs | SMS, reports, payments, notifications | tenant-aware payloads, retry limits, dead-letter visibility, no raw secret logs |

## Primary Threats And Mitigations

| Threat | Risk | Mitigation |
| --- | --- | --- |
| Cross-tenant direct object access | Critical | PostgreSQL RLS, tenant-scoped repositories, tenant isolation audit, route permission checks |
| Credential leakage in UI or logs | Critical | masked provider APIs, backend-only decryption, security scan, no raw secret logging |
| Password reset or invite token theft | High | hash tokens at rest, expiry windows, single-use consumption, generic public errors, no raw reset/verify/invite URLs in API JSON, outbox payloads, or request logs |
| Parent sees unrelated learner data | Critical | parent subject resolution by active tenant membership, linked-child scope checks |
| MPESA callback duplication | High | idempotent transaction reference handling, receipt uniqueness, audit records |
| Malicious file upload | High | bounded streaming upload, MIME/size policy, malware scanning, tenant-scoped storage |
| Counselling note disclosure | Critical | counsellor/admin permission gates, confidentiality visibility, encryption-sensitive handling |
| SMS credit bypass | High | wallet balance checks before send, transactional deduction/refund, centralized SMS dispatch |
| Operational false health | High | provider health states, readiness gates, scorecard, artifacted audits |
| Dependency compromise | High | production dependency audit gate with high-severity failure threshold |

## 2026-05-17 Hardening Amendments

- Retired the legacy backend password recovery implementation that could return reset URLs to browser-facing callers.
- Routed legacy browser password endpoints through the modern CSRF-protected password recovery flow.
- Removed raw reset, email verification, and invite URLs from persisted auth action and email outbox payloads.
- Sanitized request context and request/SLO logging paths so `token`, `code`, `otp`, `password`, `secret`, and `refresh_token` query values are redacted before logs or database session context.
- Tightened auth token and auth email outbox RLS policies away from broad public path grants and toward explicit operation-scoped database settings used by narrow auth functions.
- Required MPESA C2B validation and confirmation callbacks to pass configured callback-secret verification.
- Added focused regression tests for token containment, auth URL persistence, path redaction, auth RLS policy shape, tighter auth rate limits, and MPESA callback signature enforcement.

## Required Evidence Gates

- `npm run tenant:isolation:audit`
- `npm run security:scan`
- `npm run security:deps`
- `npm run certify:pilot`
- `npm run scorecard:production`
- `npm run release:readiness`

## Residual Risks

- Live authenticated pilot mode requires production-safe pilot credentials to be configured in CI secrets.
- Provider smoke tests depend on live provider sandbox or production endpoints being available and rate-limit safe.
- Heavy load proof still depends on scheduled tenant-scale runs and production-safe monitoring cadence.
