# Remaining ERP Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the minimum production blockers after `implementation5.md` as quickly as possible, while keeping incomplete ERP domains hidden until they are tenant-safe and release-gated.

**Architecture:** Keep the current NestJS API, PostgreSQL RLS, tenant request-context, Redis/BullMQ workers, Next.js frontend, CSRF-protected web proxies, and production module readiness gates. Ship each new ERP domain as the thinnest complete vertical slice first: schema, repository, service invariant, controller route, audit event, focused tests, and release-readiness state. Frontend/report/synthetic depth is only required before that domain is enabled in production navigation.

**Tech Stack:** NestJS, TypeScript, PostgreSQL, forced RLS, Redis/BullMQ, Node test runner, Next.js App Router, React, server report artifacts, S3/R2-compatible object storage, provider smoke checks.

---

# Implementation 6 Completion Update - 2026-05-14

Completed in `codex/support-ticketing-release`:

- Streaming uploads now replace support/admissions memory storage and are release-gated.
- Auth security enforcement covers MFA, trusted devices, and magic links.
- Student fee payment allocation handles partial payments, overpayments, duplicate callbacks, and student credits.
- Report workers generate CSV/XLSX/PDF artifacts, store checksummed files, and create immutable snapshot manifests.
- Academics and Exams backend slices persist teacher assignments, exam marks, locked corrections, report-card publishing, and audits.
- Timetable, HR, and Library hidden backend MVPs include tenant RLS, route permissions, critical invariants, and audit/ledger proof.
- High-volume read paths now have real tenant-scoped API surfaces for mark sheets, published timetables, staff directory, library circulation, and report export jobs.
- Public status now separates active/history incidents, supports hashed-contact subscriptions, signed unsubscribe tokens, public-safe notification attempts, and unsubscribe confirmation UI/proxy flow.
- Existing admissions/dashboard/report transport surfaces now hide route controls, validation, report columns, and copy unless the tenant has transport enabled.
- Retired attendance API and sync source stubs are removed from the active API tree; client sync now exposes only the finance entity.
- Admissions profile contracts and live adapters no longer carry attendance placeholder rows or expose attendance as profile data.
- Scale validation scripts, query reviews, synthetic journey definitions, audit coverage, runbooks, and release readiness gates were tightened for Implementation 6.

Verification on 2026-05-14:

- `npm.cmd test` passed: 301 tests.
- `npm.cmd --prefix apps/web run test:design` passed: 128 tests.
- `npm.cmd --prefix apps/web run build` passed.
- `npm.cmd run release:readiness` passed all 11 checks.
- `npm.cmd run audit:coverage-review` passed all audit coverage requirements.
- `npm.cmd run fixture:pilot-school` passed and emitted the deterministic pilot-school fixture plan.
- `npm.cmd run load:high-volume-workflows` passed and emitted the read-safe workload manifest.
- `npm.cmd run smoke:providers` was blocked by missing local provider environment (`RESEND_API_KEY`, `EMAIL_FROM`, public app URL, `SUPPORT_NOTIFICATION_EMAILS`); retired attendance guard and retry settings passed, while optional SMS, malware scan, and object storage checks skipped because no partial configuration was present.
- `npm.cmd run monitor:synthetic` was blocked by missing `SYNTHETIC_API_BASE_URL` and `SYNTHETIC_WEB_BASE_URL`.
- `npm.cmd run perf:query-plan-review` was blocked by missing `DATABASE_URL`.
- `npm.cmd run load:core-api` was blocked by missing `CORE_API_LOAD_BASE_URL`.

Score movement after this implementation: system maturity 72/100, production readiness 70/100, security 86/100, reliability 76/100, UX completeness 82/100, scalability 72/100, multi-tenant safety 90/100.

Remaining release risk: environment-bound smoke, synthetic, core-load, and query-plan scripts must be run in a configured staging or production-like environment before promotion.

Merge-to-main verification on 2026-05-14:

- Implementation 6 was merged into `main` with merge commit `bb510dd2`.
- `npm.cmd test` passed after the merge: 303 backend/API tests.
- `npm.cmd --prefix apps/web run test:design` passed after the merge: 28 suites, 140 tests.
- `npm.cmd --prefix apps/web run build` passed after the merge.
- `npm.cmd run release:readiness` passed all 11 release-readiness checks after the merge.
- Conflict marker scan passed.
- Source scan confirmed no remaining hardcoded/demo credential module or seeded login credential references in production source.
- Railway production source branch was restored to `main`; production deployment verification follows this merge evidence commit.

Post-merge production hardening evidence on 2026-05-14:

- Railway API deployment `b50aacaa-6db7-4013-a1f6-be51d55cf509` for commit `ef0cfa11199585f3def818d2c7774dd8dd78c07a` reached `SUCCESS`.
- Live API health passed: `/health` returned HTTP 200 with `status=ok`; `/health/ready` returned HTTP 200 with `status=ok`.
- Readiness dependencies reported Postgres `up`, Redis `up`, BullMQ `configured`, transactional email `configured`, CORS `configured`, and support notifications `partial` because SMS is intentionally unconfigured.
- Public status passed: `/support/public/system-status` returned HTTP 200 with 5 public components and no active incidents.
- Provider smoke passed against Railway production environment: 7 checks total, 4 passed, 0 failed, 3 skipped for optional SMS, upload malware scanning, and external object storage.
- Live query-plan review passed against the production database: 11 active search/read hotspots reviewed; protected student, admissions, inventory, academics, exams, billing, support, HR, and timetable paths used index-backed plans. Library catalog search remains hidden and tenant-scoped; the review currently records the plan shape without failing that hidden path.
- Local verification after the final patch passed: `npm.cmd run build`, focused query-plan tests (5/5), full API suite (307/307), and release readiness (11/11).
- Runtime blockers discovered during deployment were fixed on `main`: Nest provider DI metadata, additive `file_objects` retention columns, immutable support search indexes, additive `student_guardians` invitation columns, HR department lower-name expression uniqueness, and deterministic live query-plan review behavior on tiny production tables.
- Frontend remains available at `https://shule-hub-erp.vercel.app`; API remains available at `https://shulehub-production.up.railway.app`.

Remaining post-hardening risk: SMS escalation delivery, upload malware scanning, and external object storage are still optional/unconfigured provider channels. They are detected cleanly by provider smoke and must be configured before those channels are advertised as production capabilities.

---

# 1. Baseline From Implementation 5

## Current Scores

| Area | Current score | Implementation 6 target | Primary gap to close |
|---|---:|---:|---|
| System maturity | 48/100 | 72/100 | Missing ERP domains and incomplete Exams/Academics depth. |
| Production readiness | 43/100 | 70/100 | Full daily school workflows are not end-to-end verified. |
| Security | 74/100 | 86/100 | MFA, trusted device enforcement, magic-link policy, and streaming uploads remain. |
| Reliability | 55/100 | 76/100 | Streaming uploads, inventory concurrency proof, report workers, and incident subscriptions remain. |
| UX completeness | 69/100 | 82/100 | Several visible experiences still need live backend contracts. |
| Scalability | 53/100 | 72/100 | Large uploads, report workers, and high-volume workload tests remain. |
| Multi-tenant safety | 80/100 | 90/100 | New domains must ship with RLS, route permissions, audit logs, and synthetic coverage. |

## Keep These Guardrails

- Exams stays active and must remain covered by the release gate.
- Attendance is fully removed from the API and product surface: no `AttendanceModule` registration, controllers, routes, route catalogs, sync entities, reports, dashboards, provider checks, synthetic journeys, navigation, module readiness, or user-facing copy.
- Transport is not a standalone ERP module in Implementation 6: no `TransportModule`, `/transport` routes, route catalogs, module readiness entry, navigation entry, or standalone transport dashboard. Keep only conditional transport settings/fields inside existing admissions, billing, dashboard, and report surfaces.
- No school-facing module becomes production-ready unless it has backend persistence, tenant RLS, route permissions, UI live adapter, audit/event coverage, report/export coverage, and release-readiness evidence.
- New domains may be merged while hidden if schema, route permissions, tenant isolation, focused tests, and readiness-hidden checks pass.
- New mutating routes require explicit `@Permissions`, `@Roles`, or `@Policy` metadata.
- New tables require `tenant_id` unless they are platform-wide reference tables with an explicit access model.
- New report/export code must reject removed attendance inputs and allow active Exams/Academics inputs.
- Use TDD: write the failing test, run it red, implement the minimum green change, then refactor.

## Fastest Implementation Rules

- Prefer a working, hidden backend slice over a broad half-finished module. A module is allowed to stay out of production readiness until its UI, reports, and synthetic checks exist.
- Reuse existing schema-service, repository, request-context, audit, billing, file-storage, and queue patterns. Do not introduce a new framework, ORM, report engine, upload abstraction, or workflow engine in this implementation.
- Keep each task pack to the minimum invariant that makes the domain safe:
  - streaming: bounded upload memory risk removed from support/admissions controllers
  - inventory: no stale absolute stock writes for issue/loss paths
  - auth: enforced MFA/trusted-device/magic-link backend behavior for high-privilege roles
  - reports: queued artifact generation with checksum and authorization
  - exams: persisted grading/report-card lifecycle
  - timetable/HR/library: hidden backend MVP with one critical invariant, tenant RLS, route permissions, and audit
  - transport: no standalone module; conditional visibility in existing admissions/billing/dashboard/report surfaces only
  - status/load/gate: public safety and final readiness proof
- Defer nice-to-have depth until after Implementation 6: polished frontend management screens for hidden modules, provider-specific streaming uploads, advanced timetable optimization, fleet maintenance, rich library catalog metadata, and multi-format report styling.
- Use one branch/worktree per parallel lane. Do not let independent task packs wait for each other unless they touch the same files.

## Verification Commands

Run focused tests after every task pack. Use the exact command listed inside that task pack first.

Run this integration set after each wave, not after every small step:

```powershell
npm.cmd test
npm.cmd run release:readiness
```

If an older task-pack section below still lists `npm.cmd test` as its verify command, treat that as a wave-gate command. During the pack, run the narrow `node --test dist/...` command listed in that pack until the code is green.

Run the web checks only after a task pack changes web code or module readiness UI:

```powershell
npm.cmd --prefix apps/web run test:design
npm.cmd --prefix apps/web run build
```

Run these before a production release:

```powershell
npm.cmd run smoke:providers
npm.cmd run monitor:synthetic
npm.cmd run audit:coverage-review
npm.cmd run perf:query-plan-review
```

---

# 2. Fast Execution Order

Implementation 6 is fastest when executed in parallel lanes with integration gates between waves.

| Wave | Parallel lanes | Task packs | Gate |
|---:|---|---|---|
| 0 | Release blocker lane | 1, 2, 12 baseline hidden-module checks | `npm.cmd test` for touched API tests plus `npm.cmd run release:readiness` |
| 1 | Security, reports, active academics | 3, 4, 5 | Focused API tests for each lane, then release readiness |
| 2 | Hidden domain MVPs and removals | 6, 7, 8, 9 | Each module hidden by readiness until its own checklist passes; removed modules stay absent |
| 3 | Public ops and scale proof | 10, 11, 12 final | Full verification suite |

Use this ownership split to avoid conflicts:

| Lane | Owns |
|---|---|
| Uploads | `apps/api/src/common/uploads`, support/admissions upload touchpoints |
| Inventory | `apps/api/src/modules/inventory`, inventory release-gate checks |
| Auth | `apps/api/src/auth`, auth web proxies/pages only when necessary |
| Billing/payments | `apps/api/src/modules/payments`, `apps/api/src/modules/billing`, parent/student balance UI |
| Reports | `apps/api/src/common/reports`, report controller hooks |
| Academics | `apps/api/src/modules/exams`, academic lifecycle/report-card files |
| Timetable | `apps/api/src/modules/timetable`, timetable readiness state |
| Transport removal/visibility | admissions transport fields, billing fee lines, dashboard/report text, module readiness checks |
| HR | `apps/api/src/modules/hr`, staff management and staff document lifecycle |
| Library | `apps/api/src/modules/library`, billing fine hook |
| Public status | support public status files and public web page |
| Release gate | readiness, audit, synthetic, load, provider checks |

## MVP Completion Matrix

Use this matrix to decide when to stop work on a pack and move to the next gate.

| Pack | Fastest acceptable completion |
|---|---|
| 1 Streaming uploads | Controllers no longer use `memoryStorage()`, oversized files fail while streaming or bounded buffering, release gate checks it. |
| 2 Inventory concurrency | Issue/loss paths use conditional decrement or row lock, tests prove no stale absolute writes. |
| 3 Auth enforcement | High-privilege MFA challenge, trusted-device check, magic-link single-use behavior are enforced by backend tests. |
| 4 Student fee payment allocation | Confirmed parent payments deduct the correct student balance, handle partials/overpayments, and resist duplicate callbacks. |
| 5 Reports | Worker creates authorized CSV/XLSX/PDF artifacts with checksum; detailed formatting can be plain. |
| 6 Exams | Persisted exam series, marks, report-card publish, audit, and active readiness evidence. |
| 7 Timetable | Hidden backend MVP blocks teacher/class/room conflicts and publishes immutable versions. |
| 8 Transport removal and conditional visibility | No standalone transport module; existing transport fields/fee lines/text appear only when tenant transport is enabled. |
| 9 HR Staff Management | Hidden backend MVP supports staff profiles, departments, contracts, leave, documents, and audit. |
| 10 Library | Hidden backend MVP supports issue/return/reservation/fine handoff with append-only ledger. |
| 11 Public status | Public endpoint/page shows incidents and accepts safe subscriptions without exposing internal notes. |
| 12 Scale validation | Read-safe fixture/load scripts exist and refuse unsafe remote mutation by default. |
| 13 Release gate | Active modules have proof; hidden modules stay hidden; Attendance removed, Transport non-module, and Exams active are enforced. |

---

# 3. Task Pack 1 - Streaming Upload Ingestion

**Goal:** Replace support/admissions memory-buffer upload paths with bounded streaming ingestion that validates content, invokes malware scanning, and writes tenant-scoped file objects or S3/R2 objects without holding full files in API memory.

**Fast path:** Do not build true provider streaming in this pack. It is acceptable to use a bounded in-process buffer after the request body is consumed as a stream, as long as size enforcement happens during consumption and support/admissions controllers no longer use `memoryStorage()`.

**Files:**
- Create: `apps/api/src/common/uploads/streaming-upload.service.ts`
- Create: `apps/api/src/common/uploads/streaming-upload.service.test.ts`
- Create: `apps/api/src/common/uploads/streaming-upload.interceptor.ts`
- Modify: `apps/api/src/common/uploads/upload-policy.ts`
- Modify: `apps/api/src/common/uploads/upload-malware-scan.service.ts`
- Modify: `apps/api/src/common/uploads/database-file-storage.service.ts`
- Modify: `apps/api/src/common/uploads/s3-object-storage.service.ts`
- Modify: `apps/api/src/common/common.module.ts`
- Modify: `apps/api/src/modules/support/support.controller.ts`
- Modify: `apps/api/src/modules/support/support.service.ts`
- Modify: `apps/api/src/modules/support/support.test.ts`
- Modify: `apps/api/src/modules/admissions/admissions.controller.ts`
- Modify: `apps/api/src/modules/admissions/admissions.service.ts`
- Modify: `apps/api/src/modules/admissions/admissions.test.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.test.ts`
- Modify: `package.json`

- [x] **Step 1: Add failing streaming upload tests**

Create `apps/api/src/common/uploads/streaming-upload.service.test.ts` with these behaviors:

```ts
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { StreamingUploadService } from './streaming-upload.service';

test('StreamingUploadService rejects files that exceed configured size while streaming', async () => {
  const service = new StreamingUploadService({
    maxFileBytes: 4,
    scanService: undefined,
    storage: undefined,
  } as never);

  await assert.rejects(
    () =>
      service.consume({
        tenantId: 'tenant-1',
        originalName: 'oversized.txt',
        mimeType: 'text/plain',
        stream: Readable.from(Buffer.from('12345')),
        storagePath: 'tenant/tenant-1/support/oversized.txt',
        ownerType: 'support_attachment',
      }),
    /File exceeds 4 bytes/,
  );
});

test('StreamingUploadService preserves checksum metadata for accepted streamed uploads', async () => {
  const saved: unknown[] = [];
  const service = new StreamingUploadService({
    maxFileBytes: 1024,
    scanService: undefined,
    storage: {
      save: async (input: unknown) => {
        saved.push(input);
        return {
          id: 'file-1',
          tenant_id: 'tenant-1',
          storage_path: 'tenant/tenant-1/support/file.txt',
          checksum_sha256: 'stream-checksum',
          storage_backend: 'database',
        };
      },
    },
  } as never);

  const result = await service.consume({
    tenantId: 'tenant-1',
    originalName: 'file.txt',
    mimeType: 'text/plain',
    stream: Readable.from(Buffer.from('hello')),
    storagePath: 'tenant/tenant-1/support/file.txt',
    ownerType: 'support_attachment',
  });

  assert.equal(result.id, 'file-1');
  assert.equal(saved.length, 1);
});
```

- [x] **Step 2: Run the failing test**

```powershell
npm.cmd run build
node --test dist/apps/api/src/common/uploads/streaming-upload.service.test.js
```

Expected: fail because `StreamingUploadService` does not exist.

- [x] **Step 3: Implement `StreamingUploadService`**

Implementation contract:
- Accept a `Readable` stream plus tenant, storage path, MIME type, original name, and owner type.
- Count bytes as chunks arrive and reject once `UPLOAD_MAX_FILE_BYTES` is exceeded.
- Hash chunks with SHA-256 while streaming.
- Preserve existing file policy decisions for MIME, binary signatures, unsafe filename, malware-test signature, and provider scan verdicts.
- For the first implementation, spool to a bounded temporary buffer only when provider malware scanning still requires base64 content. Keep the buffer limit equal to the upload limit and delete temporary buffers after persistence.
- Call `DatabaseFileStorageService.save()` with the final buffer until the storage adapter supports true streaming writes.
- Do not add provider-specific streaming in Implementation 6. Capture `putObjectStream()` as a post-release follow-up only if S3/R2 provider APIs require it.

- [x] **Step 4: Replace controller memory storage**

Change support/admissions upload endpoints to use `StreamingUploadInterceptor` instead of `FileInterceptor(...memoryStorage())`. Keep `UPLOAD_FORM_LIMITS` in the interceptor so parser-level limits still apply.

- [x] **Step 5: Add support/admissions regression tests**

Add tests proving:
- Support attachments call the streaming service.
- Admissions documents call the streaming service.
- Rejected streamed uploads do not create attachment/document rows.
- Provider malware scan still runs before persistence.

- [x] **Step 6: Add release gate check**

Update `apps/api/src/scripts/release-readiness-gate.test.ts` so the gate fails if `memoryStorage()` remains in support or admissions upload controllers.

- [x] **Step 7: Verify**

```powershell
npm.cmd test
npm.cmd run release:readiness
```

Acceptance:
- No support/admissions upload controller uses `memoryStorage()`.
- Oversized uploads fail while streaming.
- Object storage path enforcement still blocks cross-tenant paths.
- Malware/provider scan rules still run before persistence.
- Rejected or suspicious uploads are not persisted as usable files; scan failures leave a quarantined/audited failure record only when needed for investigation.

---

# 4. Task Pack 2 - Inventory Concurrency Closure

**Goal:** Prove every inventory stock-out, incident loss, stock count, request fulfillment, and transfer mutation uses row locks, conditional updates, reservations, or append-only movements without stale absolute quantity writes.

**Fast path:** Fix only the paths that can overdraw stock now: stock issue and incident loss. Leave stock count as the only allowed absolute correction path and gate against accidental absolute writes elsewhere.

**Files:**
- Modify: `apps/api/src/modules/inventory/repositories/inventory.repository.ts`
- Modify: `apps/api/src/modules/inventory/repositories/inventory.repository.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory.service.ts`
- Modify: `apps/api/src/modules/inventory/inventory.test.ts`
- Modify: `apps/api/src/modules/inventory/inventory-schema.service.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.test.ts`

- [x] **Step 1: Add failing repository tests for stale absolute writes**

Add tests with these names:
- `InventoryRepository stock issue uses conditional decrement instead of stale absolute quantity`
- `InventoryRepository incident loss uses conditional decrement instead of stale absolute quantity`
- `InventoryRepository refuses stock issue when concurrent reservations exhaust available quantity`
- `InventoryRepository transfer reserves source stock before destination receipt`

The tests should inspect repository SQL and injected query calls, matching existing repository test style.

- [x] **Step 2: Run inventory tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/inventory/repositories/inventory.repository.test.js dist/apps/api/src/modules/inventory/inventory.test.js
```

Expected: fail on stock issue/loss paths that still set absolute quantities outside a lock or conditional update.

- [x] **Step 3: Add repository methods**

Add methods with these contracts:

```ts
async decrementItemStockForIssue(input: {
  tenantId: string;
  itemId: string;
  quantity: number;
  reason: 'stock_issue' | 'incident_loss';
  actorUserId: string;
}): Promise<{ beforeQuantity: number; afterQuantity: number }>;

async lockItemBalanceForLocation(input: {
  tenantId: string;
  itemId: string;
  locationId: string;
}): Promise<{ quantityOnHand: number }>;
```

`decrementItemStockForIssue` must use a single conditional SQL statement or a `SELECT ... FOR UPDATE` followed by an update in the same request-context transaction. It must throw a domain error if the affected row count is zero.

- [x] **Step 4: Remove stale stock write paths**

Replace service calls that do `findItemById` then `updateItemStock` for stock-out/loss with `decrementItemStockForIssue`.

- [x] **Step 5: Add release-gate static check**

Fail the release gate if inventory issue/loss code contains `quantity_on_hand = $` in a path that is not the stock-count posting path.

- [x] **Step 6: Verify**

```powershell
npm.cmd test
npm.cmd run release:readiness
```

Acceptance:
- Stock issue and incident loss cannot overdraw under concurrent requests.
- Inter-store transfers reserve source stock and cannot create stock in the destination without a matching source movement.
- Append-only movement rows record before/after quantities.
- Stock count posting remains the only allowed absolute correction path and requires a posted count snapshot.

---

# 5. Task Pack 3 - MFA, Trusted Devices, and Magic-Link Enforcement

**Goal:** Turn auth security state pages into enforced backend flows for high-privilege users, with recovery codes, trusted-device decisions, audit logs, and no false UX claims.

**Fast path:** Backend enforcement comes first. Only add the minimum web proxy/pages needed for existing login flows to complete a challenge; defer polished security settings screens unless a test requires them.

**Files:**
- Create: `apps/api/src/auth/mfa.service.ts`
- Create: `apps/api/src/auth/mfa.service.test.ts`
- Create: `apps/api/src/auth/trusted-device.service.ts`
- Create: `apps/api/src/auth/trusted-device.service.test.ts`
- Create: `apps/api/src/auth/magic-link.service.ts`
- Create: `apps/api/src/auth/magic-link.service.test.ts`
- Create: `apps/api/src/auth/dto/mfa.dto.ts`
- Create: `apps/api/src/auth/dto/trusted-device.dto.ts`
- Create: `apps/api/src/auth/dto/magic-link.dto.ts`
- Modify: `apps/api/src/auth/auth-schema.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.test.ts`
- Modify: `apps/api/src/auth/auth.constants.ts`
- Modify: `apps/api/src/auth/repositories/tenant-memberships.repository.ts`
- Modify: `apps/api/src/modules/onboarding/onboarding.service.ts`
- Modify: `apps/api/src/modules/onboarding/repositories/tenants.repository.ts`
- Modify: `apps/api/src/modules/billing/repositories/subscriptions.repository.ts`
- Modify: `apps/api/src/auth/identity-platform.test.ts`
- Modify: `apps/web/src/app/api/auth/login/route.ts`
- Modify: `apps/web/src/lib/auth/role-routing.ts`
- Modify: `apps/web/src/lib/routing/experience-routes.ts`
- Modify: `apps/web/src/app/school/[role]/page.tsx`
- Modify: `apps/web/src/app/school/[role]/[section]/page.tsx`
- Modify: `apps/web/src/app/superadmin/login/page.tsx`
- Modify: `apps/web/src/app/school/login/page.tsx`
- Modify: `apps/web/src/app/portal/login/page.tsx`
- Modify: `apps/web/src/app/api/auth/mfa/*`
- Modify: `apps/web/src/app/mfa/page.tsx`
- Modify: `apps/web/src/app/otp/page.tsx`
- Modify: `apps/web/src/app/device-verification/page.tsx`
- Modify: `apps/web/src/app/magic-link/page.tsx`
- Modify: `apps/web/tests/design/role-routing.test.tsx`
- Modify: `apps/web/tests/design/production-copy.test.ts`
- Modify: `apps/api/src/scripts/audit-coverage-review.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`

- [x] **Step 1: Add failing auth tests**

Add API tests for:
- MFA enrollment returns a setup secret only to the current verified user.
- MFA verification stores a hashed factor and one-time recovery codes.
- Login for platform owner, administrator, accountant, and support operator returns `mfa_required` when MFA is enabled.
- Completing MFA challenge issues the normal scoped session.
- Recovery code can be used once and is then invalid.
- New device login requires device verification unless the trusted-device cookie is valid.
- Magic-link login tokens are single-use, short-lived, tenant scoped, and audit logged.
- Lockout/rate-limit policy throttles repeated MFA, magic-link, and trusted-device failures.
- Every supported user type has one clear login entry and one role-specific landing workspace.
- Unknown, removed, or disabled roles cannot reach protected school, portal, or superadmin workspaces.

- [x] **Step 2: Run auth tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/auth/auth.test.js dist/apps/api/src/auth/mfa.service.test.js dist/apps/api/src/auth/trusted-device.service.test.js dist/apps/api/src/auth/magic-link.service.test.js
```

Expected: fail because services and routes do not exist.

- [x] **Step 3: Extend auth schema**

Add schema support for:
- `auth_mfa_factors`
- `auth_mfa_recovery_codes`
- `auth_login_challenges`
- `auth_trusted_devices`
- `auth_magic_link_tokens`

Requirements:
- Store secrets and recovery codes hashed or encrypted.
- Include tenant ID where tenant-scoped.
- Add expiry timestamps and consumed timestamps.
- Add forced RLS on tenant-scoped tables.
- Add indexes for lookup by user/session/challenge token hash.

- [x] **Step 4: Implement services**

Service contracts:

```ts
type MfaChallengeResult =
  | { status: 'complete'; accessToken: string; refreshToken: string }
  | { status: 'challenge_required'; challengeId: string; methods: Array<'totp' | 'recovery_code'> };

type TrustedDeviceDecision =
  | { status: 'trusted' }
  | { status: 'verification_required'; challengeId: string };
```

MFA must be required for high-privilege roles first. Low-privilege policy can remain configurable, but copy must not imply enforcement unless the backend requires it.

- [x] **Step 5: Wire frontend routes**

Add CSRF-protected API proxies for:
- `POST /api/auth/mfa/enroll`
- `POST /api/auth/mfa/verify`
- `POST /api/auth/mfa/challenge`
- `POST /api/auth/trusted-device/verify`
- `POST /api/auth/magic-link/request`
- `POST /api/auth/magic-link/consume`

- [x] **Step 6: Add audit coverage**

Update audit coverage to require evidence for:
- MFA enrollment
- MFA challenge success/failure
- Recovery code use
- Trusted device creation/revocation
- Magic-link token issue/consume

- [x] **Step 7: Add role-specific login and workspace routing**

Keep three login entry points, then route by role after successful authentication:

| Audience | Login route | Roles | Required landing |
| --- | --- | --- | --- |
| System owner/platform team | `/superadmin/login` | `superadmin`, `platform_owner`, platform support roles | `/superadmin/dashboard` |
| School staff | `/school/login` | `principal`, `school_admin`, `administrator`, `bursar`, `accountant`, `teacher`, `storekeeper`, `librarian`, `admissions`, `hr` | Role-specific school workspace |
| Parent/student portal | `/portal/login` | `parent`, `student` | `/portal/dashboard` |

School staff landing routes:
- Principal, owner, administrator, and school admin land on `/dashboard`.
- Accountant and bursar land on `/finance/dashboard`.
- Teacher lands on `/academics/dashboard`.
- Storekeeper lands on `/inventory/dashboard`.
- Librarian lands on `/library/dashboard`.
- Admissions office lands on `/admissions/dashboard`.
- HR lands on `/staff` or `/staff/dashboard`, matching the existing staff management route.

Implementation rules:
- Do not create a separate login page for every school role.
- Use shared login pages plus role-based redirects, route guards, and permissions.
- Store the user's tenant, school membership, role, and permission grants in the authenticated session context.
- A parent can only open linked learner portal data for the current tenant.
- A staff user can only open school workspaces allowed by their role and permissions.
- Accountant is accepted as a finance role alias if the system keeps `bursar` as the internal role name.
- HR is staff management only and must not expose payroll routes, payroll copy, payslips, deductions, or salary-run workflows.
- Attendance routes must be removed from role routing, portal routing, school sidebars, dashboards, reports, and permission catalogs.

Required tests:
- Only tenants created through the onboarding flow can issue school staff or portal sessions.
- Suspended, archived, provisioning-only, or missing tenants cannot issue school staff or portal sessions.
- Tenants without an active, trial, or allowed grace subscription cannot enter production school workspaces.
- A user with no active `tenant_memberships` row for the selected school cannot log into that school's workspace.
- Invited, suspended, revoked, disabled, or locked users cannot enter protected workspaces.
- Superadmin login redirects only platform roles to `/superadmin/dashboard`.
- Parent/student login redirects only portal roles to `/portal/dashboard`.
- School login redirects each staff role to its required landing workspace.
- Accountant/bursar users can reach finance pages but cannot reach HR, admissions, inventory, or library write pages unless granted.
- Librarian users can reach library pages but cannot write finance, HR, admissions, or inventory workflows.
- Storekeeper users can reach inventory pages but cannot write finance, HR, admissions, or library workflows.
- Admissions users can reach admissions pages but cannot write finance, HR, inventory, or library workflows.
- HR users can reach staff management pages but cannot reach payroll or salary-run workflows.
- Removed Attendance routes return not found or redirect to a permitted workspace.

- [x] **Step 8: Add onboarded-school and active-teacher access gates**

Every protected request must prove the user belongs to an onboarded, allowed school before module permissions are evaluated.

Current implementation gap:
- Auth login already requires an active `tenant_memberships` row for the selected tenant.
- Onboarding already creates a tenant, baseline subscription, authorization roles, and first principal/admin invitation.
- Implementation 6 must still add a single login/session gate that verifies tenant status, onboarding status, subscription access state, and active staff profile before issuing or refreshing school staff/portal sessions.
- Without that gate, membership checks are present, but a suspended/provisioning tenant or inactive staff profile could be missed by some login/session paths.

Tenant access rules:
- A school is usable only when a `tenants` row exists for the requested tenant/school.
- Tenant status must be production-usable: `active` or another explicitly allowed state such as trial/grace. `provisioning`, `suspended`, `archived`, inactive, or unknown tenants are blocked.
- The current subscription must be active, trial, or allowed grace. Past-due/suspended/expired subscription states cannot access production school workspaces except the billing/subscription recovery flow.
- The request tenant must come from the authenticated session or trusted tenant resolver, not from a client-controlled body field.
- Backend repositories must keep using request context and forced RLS so cross-school reads and writes fail even when IDs are guessed.

Teacher access rules:
- A teacher can access the school workspace only if the teacher has an active user account, active tenant membership, and active staff profile for that tenant.
- A teacher cannot self-register into a school. They must be invited or created by an authorized school admin/principal/HR staff user.
- A teacher cannot enter marks, timetable rows, class learners, or subject data unless assigned to that subject/class/term through `teacher_subject_assignments` or the matching timetable/academics assignment table.
- Teacher subject/class assignments must be tenant scoped and cannot be copied across schools.
- When a teacher leaves or is suspended, disabling the user, membership, or staff profile must immediately block login and module access.

Required tests:
- Login fails for a valid email/password when the selected tenant is not onboarded.
- Login fails for an onboarded but suspended/archived tenant.
- Login fails for a school whose subscription is not allowed for production access.
- Login fails when the user exists globally but has no active membership in the selected tenant.
- Login fails when a teacher has an active user but no active staff profile in the selected tenant.
- Teacher mark entry fails when the teacher is not assigned to that subject/class/term.
- Teacher mark entry succeeds only for the assigned subject/class/term in the same tenant.
- Cross-tenant learner, invoice, timetable, and exam IDs are rejected even when guessed.
- Revoking a teacher membership or staff profile blocks both new login and existing session refresh.

- [x] **Step 9: Verify**

```powershell
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd --prefix apps/web run build
npm.cmd run audit:coverage-review
npm.cmd run release:readiness
```

Acceptance:
- High-privilege logins cannot bypass enabled MFA.
- System owner, school staff, and parent/student users have clear login entry points and role-specific landing workspaces.
- Principal, accountant/bursar, teacher, storekeeper, librarian, admissions, HR, parent, student, and platform owner routes are protected by role and tenant permissions.
- Only onboarded, active, subscribed schools can access school/portal workspaces.
- Teachers must have active school membership, active staff status, and subject/class/term assignment before they can access teacher-only workflows.
- Trusted-device cookies are signed, scoped, expiring, revocable, and audit logged.
- Magic links are single-use and never expose raw tokens in list/read APIs.
- UX copy only claims controls that are enforced.
- MFA, trusted-device, and magic-link failure paths are rate-limited and audit logged without leaking whether an account exists.

---

# 6. Task Pack 4 - Student Fee Payment Allocation and Balance Deduction

**Goal:** Make confirmed parent payments automatically deduct the correct student fee balance for the correct school/tenant/student, with partial payment, overpayment, and duplicate-callback safety.

**Fast path:** Keep using existing invoices, payment intents, M-Pesa callbacks, ledger posting, and payment allocation service. Tighten matching and allocation rules before adding new finance screens.

**Files:**
- Modify: `apps/api/src/modules/payments/services/payment-allocation.service.ts`
- Modify: `apps/api/src/modules/payments/services/mpesa-callback-processor.service.ts`
- Modify: `apps/api/src/modules/payments/repositories/payment-intents.repository.ts`
- Modify: `apps/api/src/modules/billing/repositories/invoices.repository.ts`
- Modify: `apps/api/src/modules/billing/billing.service.ts`
- Modify: `apps/api/src/modules/payments/payments.test.ts`
- Modify: `apps/api/src/modules/billing/billing.test.ts`
- Modify: `apps/api/test/billing-correctness.integration-spec.ts`
- Modify: `apps/api/test/mpesa-adversarial.integration-spec.ts`
- Modify: `apps/web/src/components/portal/portal-pages.tsx`
- Modify: `apps/web/src/lib/experiences/portal-data.ts`
- Modify: `apps/web/tests/design/experience-actions.test.tsx`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`

- [x] **Step 1: Add failing payment allocation tests**

Tests must prove:
- Confirmed M-Pesa callback for a parent/student/school payment increases the target invoice `amount_paid_minor`.
- The visible student balance is reduced by exactly the confirmed amount.
- Partial payment keeps the invoice open or `pending_payment` with the remaining balance.
- Overpayment creates tenant-scoped student credit/prepayment instead of losing the excess or over-marking the invoice.
- Duplicate callbacks and duplicate payment jobs do not double-deduct the student balance.
- Payment cannot be allocated across the wrong tenant, school, student, invoice, or parent-linked learner.
- Failed, pending, canceled, amount-mismatched, or phone-mismatched callbacks do not deduct a balance.

- [x] **Step 2: Add failing portal balance tests**

Tests must prove:
- Parent portal shows the updated balance after confirmed callback allocation.
- Parent portal shows pending payment separately from confirmed balance reduction.
- Student-specific balance views do not leak sibling or other-school balances unless the parent is linked to that learner.

- [x] **Step 3: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/payments/payments.test.js dist/apps/api/src/modules/billing/billing.test.js
npm.cmd --prefix apps/web run test:design -- experience-actions
```

- [x] **Step 4: Implement allocation rules**

Allocation behavior:
- Require tenant ID and student ID on student-fee payment intents.
- Prefer explicit invoice ID/reference when supplied and verify it belongs to the same tenant and student.
- If no invoice ID is supplied, allocate to the oldest open fee invoice for that student in that tenant.
- Allocate across multiple open invoices oldest-first only when the payment exceeds the first invoice balance.
- Store excess as student credit/prepayment with source payment intent and ledger transaction references.
- Use idempotency keyed by payment intent, M-Pesa receipt/checkout request, and invoice allocation target.
- Record audit log rows for allocation, overpayment credit, failed allocation, and duplicate ignored callbacks.

- [x] **Step 5: Wire balance reads**

Balance read behavior:
- Student balance equals open invoice totals minus confirmed allocations plus/minus student credits.
- Parent portal reads balances only for linked learners in the current tenant.
- Pending M-Pesa intents may show as pending but must not reduce confirmed balance.
- Confirmed callback invalidates or refreshes any cached portal balance data.

- [x] **Step 6: Add release gate checks**

Release gate must fail if:
- Student fee payment allocation tests are missing.
- M-Pesa callback completion does not call allocation for student-fee payment intents.
- Allocation code can update an invoice without verifying tenant and student ownership.
- Duplicate callback tests are missing.

- [x] **Step 7: Verify**

```powershell
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd run release:readiness
```

Acceptance:
- Confirmed parent payments automatically deduct the correct student's fee balance in the correct school.
- Partial payments reduce only the confirmed amount and keep the remaining balance visible.
- Overpayments become student credit/prepayment.
- Duplicate callbacks and retries do not double-deduct.
- Failed or mismatched callbacks do not deduct balances.
- Parent/student portal balances update after confirmation and remain tenant/student scoped.

---

# 7. Task Pack 5 - Report PDF/XLSX Workers and Persisted Artifacts

**Goal:** Upgrade current CSV artifact and export-job foundations into worker-generated CSV/XLSX/PDF artifacts with immutable manifests and download authorization.

**Fast path:** Use plain, deterministic XLSX/PDF output. The first implementation only needs correct rows, title, filters, generated timestamp, checksum, storage, and authorization; visual polish is out of scope.

**Files:**
- Create: `apps/api/src/common/reports/report-artifact-storage.service.ts`
- Create: `apps/api/src/common/reports/report-artifact-storage.service.test.ts`
- Create: `apps/api/src/common/reports/report-excel-artifact.ts`
- Create: `apps/api/src/common/reports/report-excel-artifact.test.ts`
- Create: `apps/api/src/common/reports/report-pdf-artifact.ts`
- Create: `apps/api/src/common/reports/report-pdf-artifact.test.ts`
- Create: `apps/api/src/common/reports/report-export.worker.ts`
- Create: `apps/api/src/common/reports/report-export.worker.test.ts`
- Modify: `apps/api/src/common/reports/report-export-queue.ts`
- Modify: `apps/api/src/common/reports/report-snapshot.repository.ts`
- Modify: `apps/api/src/common/common.module.ts`
- Modify: `apps/api/src/modules/admissions/admissions.controller.ts`
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/scripts/synthetic-journey-monitor.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `package.json`

- [x] **Step 1: Add dependencies deliberately**

Use:
- `exceljs` for XLSX generation.
- `pdfkit` for PDF generation.

Install:

```powershell
npm.cmd install exceljs pdfkit
npm.cmd install --save-dev @types/pdfkit
```

- [x] **Step 2: Add failing artifact tests**

Tests must prove:
- XLSX artifact has stable sheet name, row count, checksum, and generated timestamp.
- PDF artifact has a stable manifest checksum and includes report title, filters, generated timestamp, and row count.
- Export worker stores artifact content through `DatabaseFileStorageService`.
- Export worker creates or links an immutable report snapshot manifest.
- Export job rejects `module: 'attendance'` and accepts `module: 'exams'`.
- Duplicate export requests with the same tenant, module, filters, format, and idempotency key do not create duplicate artifacts.
- Download URLs or tokens expire and require tenant-scoped authorization.

- [x] **Step 3: Run report tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/common/reports/report-excel-artifact.test.js dist/apps/api/src/common/reports/report-pdf-artifact.test.js dist/apps/api/src/common/reports/report-export.worker.test.js
```

- [x] **Step 4: Implement artifact builders**

Required exported functions:

```ts
export function createXlsxReportArtifact(input: ReportArtifactInput): Promise<ReportArtifact>;
export function createPdfReportArtifact(input: ReportArtifactInput): Promise<ReportArtifact>;
```

`ReportArtifact` must include:
- `filename`
- `contentType`
- `byteLength`
- `checksumSha256`
- `generatedAt`
- `rowCount`
- `content`

- [x] **Step 5: Implement worker execution**

Worker behavior:
- Claim queued report jobs.
- Load tenant-scoped source data through module repository functions.
- Generate requested format.
- Persist content using file object storage.
- Persist snapshot manifest and audit log.
- Mark job `completed` or `failed` with sanitized error text.

- [x] **Step 6: Wire synthetic monitor**

Add read-only synthetic checks for:
- Admissions CSV/XLSX/PDF report artifact request.
- Inventory CSV/XLSX/PDF report artifact request.
- Billing CSV/XLSX/PDF report artifact request.
- Exams report snapshot once Task Pack 6 is complete.

- [x] **Step 7: Verify**

```powershell
npm.cmd test
npm.cmd run monitor:synthetic
npm.cmd run release:readiness
```

Acceptance:
- Large reports run through queue workers.
- CSV/XLSX/PDF artifacts have checksums and immutable manifests.
- Downloads require tenant-scoped authorization.
- Duplicate export requests are idempotent and authorized download links expire.
- Attendance export jobs remain blocked.

---

# 8. Task Pack 6 - Exams and Academic Lifecycle Backend Depth

**Goal:** Back the active Exams workspace with real academic terms, teacher-subject-class assignments, exam series, assessments, subject-scoped mark entry, grade audit logs, report cards, and parent/student portal reads.

**Fast path:** Implement one complete exam-to-report-card lifecycle before adding broader analytics. Keep advanced dashboards and historical trend analysis behind existing frontend mocks until backend contracts are stable.

**Core result-entry rule:** Different teachers must be able to key results for their own subjects/classes, but not for subjects or class sections they are not assigned to teach. Exams officers/admins can review, lock, publish, and perform audited corrections.

**Files:**
- Create: `apps/api/src/modules/academics/academics.module.ts`
- Create: `apps/api/src/modules/academics/academics-schema.service.ts`
- Create: `apps/api/src/modules/academics/academics.controller.ts`
- Create: `apps/api/src/modules/academics/academics.service.ts`
- Create: `apps/api/src/modules/academics/academics.test.ts`
- Create: `apps/api/src/modules/academics/repositories/academics.repository.ts`
- Create: `apps/api/src/modules/academics/repositories/academics.repository.test.ts`
- Create: `apps/api/src/modules/academics/dto/academic.dto.ts`
- Create: `apps/api/src/modules/exams/exams.module.ts`
- Create: `apps/api/src/modules/exams/exams-schema.service.ts`
- Create: `apps/api/src/modules/exams/exams.controller.ts`
- Create: `apps/api/src/modules/exams/exams.service.ts`
- Create: `apps/api/src/modules/exams/exams.test.ts`
- Create: `apps/api/src/modules/exams/repositories/exams.repository.ts`
- Create: `apps/api/src/modules/exams/repositories/exams.repository.test.ts`
- Create: `apps/api/src/modules/exams/dto/exams.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/observability/grades-audit.service.ts`
- Modify: `apps/web/src/lib/modules/exams-data.ts`
- Modify: `apps/web/src/components/modules/exams/exams-module-screen.tsx`
- Modify: `apps/web/tests/design/exams-workspace.test.tsx`
- Modify: `apps/api/src/scripts/core-api-load.ts`
- Modify: `apps/api/src/scripts/synthetic-journey-monitor.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`

- [x] **Step 1: Add failing schema tests**

Required tables:
- `academic_years`
- `academic_terms`
- `class_sections`
- `subjects`
- `class_subject_assignments`
- `teacher_subject_assignments`
- `exam_series`
- `exam_assessments`
- `exam_marks`
- `exam_mark_entry_windows`
- `exam_grade_boundaries`
- `student_report_cards`
- `student_report_card_audit_logs`

Tests must assert tenant RLS, useful indexes, unique constraints, and no attendance dependency. `teacher_subject_assignments` must be unique by tenant, teacher, academic term, class section, and subject so scoped mark entry is deterministic.

- [x] **Step 2: Add failing service tests**

Test these workflows:
- Create an exam series for an active academic term.
- Create subject assessments with marks and weights.
- Assign teachers to specific subject/class-section combinations for an academic term.
- Allow an assigned teacher to enter marks only for their assigned subject and class section.
- Reject mark entry when the teacher is not assigned to the subject, class section, or academic term.
- Allow an exams officer/admin to review mark-entry progress across all subjects.
- Record who entered each mark, who last edited it, and the previous/new value in grade audit logs.
- Support draft, submitted, reviewed, locked, and published states for subject mark sheets.
- Lock an exam series and prevent mark mutation except through an audited correction.
- Allow audited corrections only for exams officers/admins after lock or publish; regular subject teachers cannot edit locked/published marks.
- Generate a report-card snapshot linked to report snapshots.
- Parent/student read endpoints return report cards without write permissions.

- [x] **Step 3: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/academics/academics.test.js dist/apps/api/src/modules/exams/exams.test.js
```

- [x] **Step 4: Implement schema and repositories**

Use request-context scoped queries, RLS, and append-only audit rows. Grade changes after lock must create a correction record with previous and new values.

- [x] **Step 5: Implement controllers and permissions**

Route policy:
- `academics:read` for academic setup reads.
- `academics:write` for class/subject/term setup.
- `academics:assign-teachers` for teacher-subject-class assignment management.
- `exams:read` for exam reads.
- `exams:write` for assessment setup.
- `exams:enter-marks` for subject-scoped teacher mark entry; service layer must additionally verify `teacher_subject_assignments`.
- `exams:review` for cross-subject mark review and readiness checks.
- `exams:approve` for locking/publishing results.

- [x] **Step 6: Wire the Exams frontend to live APIs**

The workspace must show live exam series, mark status, grading progress, locked/published states, and report-card status. Teachers see only their assigned subject/class mark sheets for entry. Exams officers/admins see all subjects, review progress, missing marks, submitted mark sheets, correction requests, and publish readiness. Keep mock data as empty-state fallback only when the API returns no rows.

- [x] **Step 7: Add release/readiness checks**

Release gate must assert:
- Exams remains active.
- Attendance remains fully removed.
- Exams has API tests, route permissions, synthetic journey coverage, report snapshot coverage, and audit coverage.

- [x] **Step 8: Verify**

```powershell
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd --prefix apps/web run build
npm.cmd run release:readiness
```

Acceptance:
- Active Exams has real backend persistence and report-card workflow.
- Different teachers can key results for their own assigned subjects/classes without seeing or editing unassigned mark sheets.
- Exams officers/admins can review all subjects, lock/publish results, and perform audited corrections.
- Every mark stores entered-by/updated-by context and every correction has an audit trail.
- Published report cards are tenant scoped and audit stable.
- Attendance is not used as an academic dependency.

---

# 9. Task Pack 7 - Timetable Backend

**Goal:** Implement timetable scheduling with conflict detection for class, teacher, room, subject, and term schedules.

**Fast path:** Backend-only hidden MVP. Build conflict-safe create/publish/read behavior and readiness-hidden checks first; do not build drag-and-drop scheduling or optimization.

**Files:**
- Create: `apps/api/src/modules/timetable/timetable.module.ts`
- Create: `apps/api/src/modules/timetable/timetable-schema.service.ts`
- Create: `apps/api/src/modules/timetable/timetable.controller.ts`
- Create: `apps/api/src/modules/timetable/timetable.service.ts`
- Create: `apps/api/src/modules/timetable/timetable.test.ts`
- Create: `apps/api/src/modules/timetable/repositories/timetable.repository.ts`
- Create: `apps/api/src/modules/timetable/repositories/timetable.repository.test.ts`
- Create: `apps/api/src/modules/timetable/dto/timetable.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/web/src/lib/dashboard/module-data.ts`
- Modify: `apps/web/src/lib/dashboard/role-config.ts`
- Modify: `apps/web/src/components/dashboard/sidebar.tsx`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`

- [x] **Step 1: Add failing timetable tests**

Tests:
- Creates timetable periods for a class section.
- Defines cycle days, teaching periods, breaks, and non-teaching blocks for the term.
- Stores teacher availability and rejects entries outside available teaching windows.
- Rejects teacher double-booking in the same period.
- Rejects room double-booking in the same period.
- Rejects class-section double-booking.
- Rejects subject entries where the teacher is not assigned to that subject/class section.
- Records a teacher substitution without mutating the published timetable version.
- Publishes a timetable version with immutable audit record.
- Keeps timetable hidden from production readiness until all tests and UI live adapter exist.

- [x] **Step 2: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/timetable/timetable.test.js
```

- [x] **Step 3: Implement schema**

Required tables:
- `timetable_rooms`
- `timetable_cycles`
- `timetable_periods`
- `timetable_non_teaching_blocks`
- `teacher_availability_windows`
- `timetable_entries`
- `timetable_substitutions`
- `timetable_versions`
- `timetable_audit_logs`

Indexes:
- tenant/class/period
- tenant/teacher/period
- tenant/room/period
- tenant/teacher/availability window
- tenant/version/status

- [x] **Step 4: Implement service/controller**

Permissions:
- `timetable:read`
- `timetable:write`
- `timetable:publish`

- [x] **Step 5: Wire UI when backend is complete**

Only re-enable timetable in production module readiness after:
- API route coverage exists.
- Web live adapter exists.
- Design tests cover empty, draft, conflict, and published states.
- Synthetic monitor covers read-only published timetable.

- [x] **Step 6: Verify**

```powershell
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd run release:readiness
```

Acceptance:
- Timetable conflicts are blocked at the service layer.
- Timetable entries respect teacher availability and teacher-subject-class assignments.
- Published timetables are immutable without a new version.
- Temporary teacher substitutions are auditable and do not rewrite the published base timetable.
- Timetable remains hidden until fully wired.

---

# 10. Task Pack 8 - Remove Transport Module and Add Conditional Transport Visibility

**Goal:** Remove Transport as a standalone ERP module while keeping tenant-level conditional transport behavior in existing admissions, billing, dashboard, and report surfaces.

**Fast path:** Do not create `apps/api/src/modules/transport/*`. Use existing tenant/school configuration or the smallest existing settings surface available to decide whether transport is enabled. Existing data can keep zero transport fees, but every UI/report path must hide transport fields, fee lines, and copy when transport is disabled.

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.test.ts`
- Modify: `apps/web/src/lib/features/module-readiness.ts` or current readiness source file
- Modify: `apps/web/src/components/modules/admissions/admissions-module-screen.tsx`
- Modify: `apps/web/src/lib/modules/admissions-live.ts`
- Modify: `apps/web/src/lib/modules/admissions-data.ts`
- Modify: `apps/web/src/components/dashboard/erp-pages.tsx`
- Modify: `apps/web/src/lib/dashboard/erp-model.ts`
- Modify: `apps/web/src/lib/dashboard/module-data.ts`
- Modify: report/export builders that currently emit transport text or transport fee lines
- Test: `apps/web/tests/design/admissions-workspace.test.tsx`
- Test: `apps/web/tests/design/module-readiness.test.ts`
- Test: `apps/web/tests/design/module-live-adapters.test.ts`
- Test: `apps/api/src/scripts/release-readiness-gate.test.ts`

- [x] **Step 1: Add failing readiness tests for removed modules**

Tests must fail if:
- `transport` appears as a standalone module in module readiness, route catalogs, sidebar navigation, dashboard modules, global search, provider smoke checks, synthetic journeys, or active release requirements.
- `attendance` appears as an API module, controller route, module readiness entry, route catalog item, sync entity, report module, dashboard item, provider check, synthetic journey, navigation item, or user-facing copy.

- [x] **Step 2: Add failing conditional transport UI tests**

Add web tests proving:
- If transport is enabled, admissions allocation shows route assignment.
- If transport is enabled, finance/billing surfaces show a transport fee line when a non-zero transport fee exists.
- If transport is enabled, route reports or report filters can include transport route data.
- If transport is disabled, admissions allocation hides transport route fields and does not validate transport route input.
- If transport is disabled, finance/billing surfaces remove the transport fee line, including zero-amount transport lines.
- If transport is disabled, dashboards and reports avoid transport text entirely.

- [x] **Step 3: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/scripts/release-readiness-gate.test.js
npm.cmd --prefix apps/web run test:design -- admissions-workspace module-readiness module-live-adapters
```

- [x] **Step 4: Remove standalone transport module references**

Remove or block:
- `apps/api/src/modules/transport/*` creation from this plan.
- `TransportModule` imports in `apps/api/src/app.module.ts`.
- `transport` entries in module readiness, navigation, dashboards, global search, route catalogs, synthetic monitors, provider smoke checks, and release requirements.
- Any standalone `/transport` route exposure.
- Any standalone transport dashboard or module shell entry.

- [x] **Step 5: Add conditional transport visibility**

Implement a single tenant/school capability flag such as `transportEnabled` or reuse the existing school settings shape if one already exists.

Behavior:
- If transport is enabled: show route assignment, transport fee line, and route reports.
- If transport is disabled: hide transport route fields, remove transport fee lines, and avoid transport text in dashboards/reports.
- Existing data model may keep `transport_amount_minor = 0` and nullable `transport_route`, but UI and reports must not display disabled transport as a zero-fee feature.
- Admissions allocation must save without `transport_route` when transport is disabled.

- [x] **Step 6: Verify**

```powershell
npm.cmd --prefix apps/web run test:design -- admissions-workspace module-readiness module-live-adapters
node --test dist/apps/api/src/scripts/release-readiness-gate.test.js
npm.cmd run release:readiness
```

Acceptance:
- No standalone Transport module exists in production readiness or navigation.
- Transport settings behave as a tenant capability, not a module.
- Enabled schools can still use route assignment, transport fee lines, and route reports.
- Disabled schools see no transport route fields, no transport fee lines, and no transport text in dashboards/reports.
- Attendance is fully absent from product surfaces and release readiness checks.

---

# 11. Task Pack 9 - HR Staff Management Backend

**Goal:** Implement staff profiles, departments, job titles, contracts, leave, staff documents, status lifecycle, and staff-management audit trails.

**Fast path:** HR is staff management only. Do not create a Payroll module, payroll tables, payslips, deductions, payroll runs, salary payment workflows, or finance ledger handoff in Implementation 6.

**Files:**
- Create: `apps/api/src/modules/hr/hr.module.ts`
- Create: `apps/api/src/modules/hr/hr-schema.service.ts`
- Create: `apps/api/src/modules/hr/hr.controller.ts`
- Create: `apps/api/src/modules/hr/hr.service.ts`
- Create: `apps/api/src/modules/hr/hr.test.ts`
- Create: `apps/api/src/modules/hr/repositories/hr.repository.ts`
- Create: `apps/api/src/modules/hr/repositories/hr.repository.test.ts`
- Create: `apps/api/src/modules/hr/dto/hr.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/scripts/audit-coverage-review.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`

- [x] **Step 1: Add failing HR tests**

Tests:
- Creates staff profile linked to a tenant membership.
- Creates departments, job titles, and reporting lines for staff.
- Creates active staff contract/appointment with role, start date, workload, employment type, and approval state.
- Prevents overlapping active contracts for the same staff member.
- Stores staff statutory identifiers and emergency contact without exposing them in broad list responses.
- Records leave request, approval, and balance impact.
- Prevents leave approval when balance is insufficient unless an override reason is recorded.
- Stores staff documents with verification status and expiry reminders.
- Supports staff status changes: active, on leave, suspended, exited.
- Records audit logs for staff status and contract changes.

- [x] **Step 2: Add failing payroll-removal tests**

Tests:
- `payroll` does not appear in app module imports, module readiness, route catalogs, navigation, synthetic journeys, release requirements, or finance ledger handoff code.
- No `apps/api/src/modules/payroll/*` files are created by this plan.
- HR contract APIs do not expose salary payment, payslip, deduction, or payroll-run behavior.

- [x] **Step 3: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/hr/hr.test.js dist/apps/api/src/scripts/release-readiness-gate.test.js
```

- [x] **Step 4: Implement schema**

HR tables:
- `staff_departments`
- `staff_job_titles`
- `staff_profiles`
- `staff_contracts`
- `staff_leave_balances`
- `staff_leave_requests`
- `staff_documents`
- `staff_document_expiry_reminders`
- `staff_audit_logs`

- [x] **Step 5: Implement services**

Implement staff management services only:
- create/update staff profile
- create/update department and job title
- approve staff contract/appointment
- request/approve/reject leave
- store/verify staff documents
- change staff status with reason
- append audit logs for every staff status, contract, leave, and document change

- [x] **Step 6: Verify**

```powershell
npm.cmd test
npm.cmd run audit:coverage-review
npm.cmd run release:readiness
```

Acceptance:
- Staff profiles include department/job structure, contract state, leave balance, and protected statutory details.
- Leave requests enforce balances and record override reasons.
- Staff document verification and expiry reminders exist.
- Staff status transitions are audited and reasoned.
- No Payroll module, routes, readiness entry, payslips, deductions, payroll runs, or salary payment workflow exists in Implementation 6.
- Staff management audit trails are complete.

---

# 12. Task Pack 10 - Library, Reservations, and Fines

**Goal:** Implement library catalog, copies, borrowers, issue/return, reservations, overdue fines, and billing linkage.

**Fast path:** Backend-only hidden MVP. Implement one-copy issue/return, reservation ordering, overdue fine calculation, billing handoff, and append-only circulation ledger. Catalog import, barcode printing, and public catalog search are out of scope.

**Files:**
- Create: `apps/api/src/modules/library/library.module.ts`
- Create: `apps/api/src/modules/library/library-schema.service.ts`
- Create: `apps/api/src/modules/library/library.controller.ts`
- Create: `apps/api/src/modules/library/library.service.ts`
- Create: `apps/api/src/modules/library/library.test.ts`
- Create: `apps/api/src/modules/library/repositories/library.repository.ts`
- Create: `apps/api/src/modules/library/repositories/library.repository.test.ts`
- Create: `apps/api/src/modules/library/dto/library.dto.ts`
- Modify: `apps/api/src/modules/billing/billing.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`

- [x] **Step 1: Add failing library tests**

Tests:
- Creates catalog item and physical copy.
- Enforces unique accession numbers per tenant and tracks ISBN/title/author metadata.
- Issues available copy to student or staff borrower.
- Enforces borrower limits and blocks issue when the borrower has overdue/lost-item restrictions.
- Prevents issuing an already issued copy.
- Reserves unavailable copy and preserves reservation order.
- Supports renewal when no reservation is waiting and renewal limits are not exceeded.
- Returns copy and resolves next reservation.
- Records lost or damaged copy status and creates a fine or replacement-charge billing handoff.
- Calculates overdue fine and creates billing handoff.
- Records append-only circulation ledger.

- [x] **Step 2: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/library/library.test.js
```

- [x] **Step 3: Implement schema**

Required tables:
- `library_catalog_items`
- `library_copies`
- `library_borrowers`
- `library_borrower_limits`
- `library_circulation_ledger`
- `library_reservations`
- `library_renewals`
- `library_fine_rules`
- `library_fines`
- `library_audit_logs`

- [x] **Step 4: Implement issue/return service**

Rules:
- Issue only if copy status is `available`.
- Refuse issue when borrower limits, overdue restrictions, or lost-item restrictions are active.
- Return creates a ledger row and sets copy status to `available` or `reserved`.
- Renewal creates a ledger row and is refused when a reservation queue exists.
- Lost/damaged processing updates copy status through the circulation ledger and uses billing service for any charge.
- Fine creation uses billing service rather than direct invoice SQL.

- [x] **Step 5: Verify**

```powershell
npm.cmd test
npm.cmd run release:readiness
```

Acceptance:
- Circulation is tenant scoped and append-only.
- Reservations are ordered and auditable.
- Accession numbers are unique and copy status changes only through circulation ledger actions.
- Borrower limits, renewals, overdue restrictions, and lost/damaged charges are enforced.
- Fines can become billing records.

---

# 13. Task Pack 11 - Public Incident Status Subscriptions

**Goal:** Extend the current public status page into a real incident communication system with subscriptions, history, and health/SLO signal linkage.

**Fast path:** Ship a simple public status page and subscription API backed by hashed/encrypted contacts. Notification delivery can queue attempts; multi-channel delivery templates can follow after the release gate passes.

**Files:**
- Create: `apps/api/src/modules/support/support-status-subscription.service.ts`
- Create: `apps/api/src/modules/support/support-status-subscription.service.test.ts`
- Modify: `apps/api/src/modules/support/support-schema.service.ts`
- Modify: `apps/api/src/modules/support/repositories/support.repository.ts`
- Modify: `apps/api/src/modules/support/support.controller.ts`
- Modify: `apps/api/src/modules/support/support.service.ts`
- Modify: `apps/web/src/app/support/status/page.tsx`
- Modify: `apps/web/src/app/api/support/public/system-status/route.ts`
- Create: `apps/web/src/app/api/support/public/status-subscriptions/route.ts`
- Modify: `apps/api/src/scripts/synthetic-journey-monitor.ts`
- Modify: `docs/runbooks/incident-response.md`

- [x] **Step 1: Add failing status tests**

Tests:
- Public status endpoint returns active incidents and historical incidents.
- Public subscription request stores hashed email/contact with consent timestamp.
- Public subscription endpoint rate-limits repeated submissions from the same IP/email hash.
- Subscriber can unsubscribe through a signed token without exposing raw contact details.
- Incident publish queues notifications to subscribers.
- Incident update publishes component status changes, affected services, and resolved timestamps.
- SLO breach can update component status through a controlled service path.
- No support secrets or internal notes are exposed publicly.

- [x] **Step 2: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/modules/support/support-status-subscription.service.test.js dist/apps/api/src/modules/support/support.test.js
```

- [x] **Step 3: Implement schema additions**

Add:
- `support_status_subscriptions`
- `support_status_notification_attempts`
- `support_status_unsubscribe_tokens`
- incident history fields on existing support status tables if they are not present.

- [x] **Step 4: Implement subscription service**

Service contract:

```ts
async subscribe(input: {
  email: string;
  consentSource: 'public_status_page';
  locale?: string;
}): Promise<{ status: 'subscribed' }>;
```

Also add:

```ts
async unsubscribe(input: {
  token: string;
}): Promise<{ status: 'unsubscribed' }>;
```

- [x] **Step 5: Wire public status UI**

The page must show:
- Current component status.
- Active incidents.
- Historical incidents.
- Subscription form.
- Unsubscribe confirmation state.
- Last updated timestamp.

- [x] **Step 6: Verify**

```powershell
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd run monitor:synthetic
npm.cmd run release:readiness
```

Acceptance:
- Public status is useful without login.
- Subscriber notifications are queued and retryable.
- Subscription and unsubscribe flows avoid exposing raw contact data and are rate-limited.
- Internal notes and secrets never appear in public responses.

---

# 14. Task Pack 12 - Production-Scale Validation

**Goal:** Prove the combined platform handles realistic school scale without mutating production by default.

**Fast path:** Scripts must be deterministic, read-safe by default, and targeted at the new critical read paths. Do not build a general load-testing framework.

**Files:**
- Create: `apps/api/src/scripts/generate-pilot-school-fixture.ts`
- Create: `apps/api/src/scripts/generate-pilot-school-fixture.test.ts`
- Create: `apps/api/src/scripts/high-volume-workflow-load.ts`
- Create: `apps/api/src/scripts/high-volume-workflow-load.test.ts`
- Modify: `apps/api/src/scripts/core-api-load.ts`
- Modify: `apps/api/src/scripts/query-plan-review.ts`
- Modify: `docs/runbooks/backup-restore-drill.md`
- Modify: `docs/deployment/production.md`
- Modify: `package.json`

- [x] **Step 1: Add fixture tests**

Fixture generator must create a deterministic non-production dataset:
- 1 tenant.
- 1,500 students.
- 120 staff.
- Departments, job titles, active contracts, leave balances, staff documents, and staff status history.
- 2,000 invoices.
- 5,000 payments/ledger rows.
- Parent/student payment intents, confirmed M-Pesa callbacks, partial allocations, duplicate callbacks, and student credit/prepayment rows.
- 2,000 inventory movements.
- 100 support tickets.
- Library catalog, copies, loans, reservations, and overdue fines.
- Published timetable with teacher availability and substitutions.
- 10 exam series with mark rows.

It must refuse remote targets unless `ALLOW_REMOTE_FIXTURE_MUTATION=true`.

- [x] **Step 2: Add load tests**

Load script must exercise read-heavy and queue-heavy paths:
- Dashboard summaries.
- Student search.
- Admissions lists.
- Inventory reconciliation.
- Billing invoice reports.
- Student fee balance reads after confirmed payments.
- Parent linked-learner balance reads.
- Exams report-card reads.
- Teacher-scoped mark-sheet reads.
- Timetable published schedule reads.
- HR staff directory, contract, leave, and document reads.
- Library borrower/circulation reads.
- Support status and tickets.
- Report export job enqueue/read.

- [x] **Step 3: Run tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/scripts/generate-pilot-school-fixture.test.js dist/apps/api/src/scripts/high-volume-workflow-load.test.js
```

- [x] **Step 4: Implement scripts**

Add package scripts:

```json
"fixture:pilot-school": "node -r ts-node/register/transpile-only -r tsconfig-paths/register apps/api/src/scripts/generate-pilot-school-fixture.ts",
"load:high-volume-workflows": "node -r ts-node/register/transpile-only -r tsconfig-paths/register apps/api/src/scripts/high-volume-workflow-load.ts"
```

- [x] **Step 5: Verify**

```powershell
npm.cmd test
npm.cmd run fixture:pilot-school
npm.cmd run load:high-volume-workflows
npm.cmd run perf:query-plan-review
```

Acceptance:
- Load scripts are read-safe by default.
- Remote mutation requires explicit opt-in.
- Fixture scripts include enough cross-module data to exercise Exams, Timetable, HR, Library, Support, Billing, Payments, Inventory, and Admissions without creating Attendance, Payroll, or standalone Transport data.
- Query-plan review covers new modules.

---

# 15. Task Pack 13 - Final Release Gate Tightening

**Goal:** Make the readiness gate the final contract for this plan: every enabled module has proof; every incomplete module is hidden; Attendance is fully removed; Transport is not a standalone module; Exams stays active.

**Fast path:** Implement the gate matrix early with hidden states, then tighten it at the end. This lets new modules merge safely before full frontend/report/synthetic depth exists.

**Files:**
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.test.ts`
- Modify: `apps/api/src/scripts/audit-coverage-review.ts`
- Modify: `apps/api/src/scripts/core-api-load.ts`
- Modify: `apps/api/src/scripts/synthetic-journey-monitor.ts`
- Modify: `apps/web/src/lib/features/module-readiness.ts` or current readiness source file
- Modify: `apps/web/tests/design/module-readiness.test.ts`
- Modify: `implementation6.md`

- [x] **Step 1: Add failing release-gate tests**

Gate must fail when:
- An active module lacks backend tests.
- An active module lacks route-permission coverage.
- An active module lacks synthetic coverage.
- An active module lacks audit coverage for mutating workflows.
- An active module lacks report/export coverage when it exposes report UI.
- Student-fee payment allocation tests are missing or do not prove confirmed payments deduct the correct student's balance.
- Duplicate M-Pesa callback tests are missing or do not prove no double deduction.
- Attendance appears in readiness, sync, provider smoke, load, report, dashboard, navigation, user-facing copy, or synthetic surfaces.
- Transport appears as a standalone module in readiness, navigation, route catalogs, synthetic journeys, or active release requirements.
- `AttendanceModule`, attendance controllers, or attendance API routes remain registered in the app.
- `TransportModule`, transport controllers, or standalone transport API routes are registered in the app.
- Exams is removed from the active module list without an explicit replacement plan.

- [x] **Step 2: Run release-gate tests red**

```powershell
npm.cmd run build
node --test dist/apps/api/src/scripts/release-readiness-gate.test.js
```

- [x] **Step 3: Implement gate matrix**

Represent enabled modules in one matrix:

```ts
const ACTIVE_MODULE_RELEASE_REQUIREMENTS = [
  'students',
  'admissions',
  'inventory',
  'billing',
  'support',
  'exams',
  'academics',
  'timetable',
  'hr',
  'library',
] as const;
```

Only include new domains after their task packs are complete. For domains not yet complete, keep them out of the active matrix and ensure frontend readiness keeps them hidden.

- [x] **Step 4: Update documentation and scores**

At the end of each completed task pack, update this file with:
- Completed date.
- Verification commands and pass counts.
- Score movement.
- Remaining risk.

- [x] **Step 5: Final verification**

```powershell
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd --prefix apps/web run build
npm.cmd run smoke:providers
npm.cmd run monitor:synthetic
npm.cmd run audit:coverage-review
npm.cmd run perf:query-plan-review
npm.cmd run release:readiness
```

Acceptance:
- The release gate is the source of truth for active module readiness.
- Exams remains active and verified.
- Attendance is fully removed everywhere.
- Transport is not listed as an active or hidden standalone module.
- Hidden modules cannot appear in production navigation, dashboards, global search, route catalogs, or synthetic journeys.

---

# 15. Domain Completion Checklist

Use this checklist before any module is marked production-ready:

- [x] Schema service creates tables, indexes, constraints, and forced RLS.
- [x] Repository tests prove tenant-scoped reads/writes and important SQL behavior.
- [x] Service tests prove lifecycle rules, validation, idempotency, and audit events.
- [x] Controller tests or route metadata tests prove access control.
- [x] DTOs validate inputs and prevent client-controlled tenant IDs.
- [x] Audit logs exist for mutating workflows.
- [x] Domain events or outbox hooks exist when another module needs the result.
- [x] Report/export path exists or the UI has no report affordance.
- [x] Dashboard summary source exists or the module is excluded from dashboards.
- [x] Web live adapter uses CSRF-protected proxies for mutations.
- [x] Design tests cover loading, empty, success, failure, and permission states.
- [x] Synthetic monitor covers a read-only critical path.
- [x] Core API load plan covers a representative read path.
- [x] Query-plan review covers high-volume list/search paths.
- [x] Release readiness gate enforces the module state.
- [x] Attendance is absent from the module's public contract.

---

# 16. Risk Register

| Risk | Mitigation |
|---|---|
| New modules inflate scope and slow release | Keep each module hidden until its task pack passes the domain checklist. |
| Report PDF/XLSX dependencies add build risk | Add dependency tests and keep CSV path stable while introducing new formats. |
| MFA blocks legitimate admins | Ship recovery codes, support override audit logs, and clear challenge UX. |
| Streaming uploads still buffer for malware providers | Bound any provider buffer to the file limit, then add true stream-to-provider support when provider API supports it. |
| Library fines duplicate finance logic | Use existing billing services for invoice effects. |
| Parent payment reduces the wrong balance | Require tenant, student, invoice ownership checks and idempotent allocation tests before release readiness can pass. |
| M-Pesa retries double-deduct balances | Use payment-intent and callback idempotency keys and release-gate duplicate callback tests. |
| Timetable and academic modules conflict with admissions academic enrollment | Treat admissions as a producer of academic lifecycle events and academics/timetable as downstream consumers. |
| Public status subscriptions leak contact data | Store hashed or encrypted contacts and expose only aggregate public state. |
| Attendance returns accidentally through legacy files | Keep release-gate scans for route catalogs, sync entities, report jobs, provider smoke, dashboard summaries, and synthetic journeys. |

---

# 17. Final Definition of Done

Implementation 6 is complete when:

- Streaming uploads replace support/admissions memory storage.
- Inventory stock-out/loss paths are concurrency-safe and release-gated.
- MFA, trusted devices, and magic links are enforced for the configured roles.
- CSV/XLSX/PDF report workers persist artifacts and immutable manifests.
- Confirmed parent fee payments automatically deduct the correct student's balance, with partial payment, overpayment, and duplicate callback handling.
- Exams has real backend grade/report-card workflow and stays active.
- Timetable, HR, and library are either complete and release-gated or hidden from production readiness.
- Transport is not a standalone module; only conditional transport capability UI remains in existing surfaces.
- Public status supports incident history and subscriptions without exposing internal notes.
- Large-school fixture/load scripts prove the main read and queue paths.
- `npm.cmd test` passes.
- `npm.cmd --prefix apps/web run test:design` passes.
- `npm.cmd --prefix apps/web run build` passes.
- `npm.cmd run release:readiness` passes.
- Release readiness explicitly confirms active Exams, fully removed Attendance, and no standalone Transport module.
