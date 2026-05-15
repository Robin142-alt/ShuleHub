# Implementation 7 Provider Hardening and Live Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ShuleHub from controlled pilot readiness to production-operable readiness by configuring SMS support delivery, upload malware scanning, external object storage, live workflow validation, and scheduled synthetic/core load monitoring.

**Architecture:** Keep the existing NestJS API, PostgreSQL RLS, Redis/BullMQ, provider smoke script, streaming upload service, S3/R2-compatible storage adapter, and read-only synthetic/load scripts. Implementation 7 does not add random ERP features; it turns existing optional provider channels and live validation hooks into required production contracts with no secret leakage, no seeded data, and no long-lived human JWTs in automation.

**Tech Stack:** NestJS, TypeScript, PostgreSQL, Railway, Redis/BullMQ, Vercel, GitHub Actions, provider smoke checks, S3-compatible object storage, HTTPS malware scan webhook, support SMS webhook, Node test runner, Playwright-ready web validation.

---

# Execution Status - 2026-05-15

| Area | Status | Evidence |
|---|---|---|
| SMS relay service | Deployed to Railway | `sms-relay` service health passes; dry-run mode until real SMS provider credentials are supplied |
| Malware scanner service | Deployed to Railway | `malware-scanner` service health passes; clean upload probe returns `clean`; EICAR probe returns `infected` |
| Provider smoke hardening | Implemented locally and configured in Railway | Live Resend credential probe, required SMS controls, live SMS readiness body checks, live malware health, object-storage write/read/delete smoke |
| External object-storage delete support | Implemented locally | Signed DELETE support and tenant-prefix tests |
| Monitoring service accounts | Implemented locally | Hashed monitor tokens, audit logs, read-only request middleware, creation script |
| Scheduled production operability | Implemented locally | `.github/workflows/production-operability.yml` and runbook |
| Production pilot validation scaffold | Implemented locally | Playwright E2E scaffold and manual checklist |
| Release readiness gate | Implemented locally | Implementation 7 artifacts and monitor-account test coverage enforced |
| Live SMS activation | Relay deployed, provider pending | SMS relay domain exists and health passes; real SMS delivery still requires Africa's Talking or equivalent credentials and real recipients |
| Live malware scanner activation | Active | Railway API variables configured; `UPLOAD_MALWARE_SCAN_REQUIRED=true`; authenticated clean/EICAR probes passed |
| Live object storage activation | Active | Railway bucket configured; API object-storage write/read/delete probe passed |
| Scheduled production operability | Workflow ready, provider secrets installed | GitHub Actions cadence exists; available provider/query/readiness secrets are installed; dispatch waits for workflow merge to default branch and monitor token creation waits for real tenant onboarding |
| Real pilot tenant validation | Pending operator execution | Requires controlled pilot tenant and invited real users; do not create fake/demo tenants |

Focused local verification completed:

```text
npm.cmd run build
node --test dist/apps/api/src/auth/monitoring-service-account.service.test.js dist/apps/api/src/scripts/synthetic-journey-monitor.test.js dist/apps/api/src/scripts/core-api-load.test.js dist/apps/api/src/config/env.validation.test.js
node --test dist/apps/api/src/scripts/release-readiness-gate.test.js dist/apps/api/src/scripts/provider-credential-smoke.test.js dist/apps/api/src/common/uploads/database-file-storage.service.test.js
npm.cmd --prefix apps/sms-relay run test
npm.cmd --prefix apps/malware-scanner run test
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd --prefix apps/web run build
npm.cmd run release:readiness
```

No production secrets, OTPs, tokens, phone numbers, database URLs, or object-storage keys were written to this plan.

---

# 1. Current State

Implementation 6 left the platform in this state:

- API and web are live.
- Postgres and Redis are connected.
- Transactional email is configured.
- Support notification retry worker is configured.
- Support SMS is not configured.
- Upload malware scanning is not configured.
- External object storage is not configured.
- Synthetic and core API load scripts exist but need durable production credentials and scheduled execution.
- Some modules are backend-safe but still need real-user end-to-end validation with a real tenant, real invited users, and real persisted workflows.

Implementation 7 closes those gaps without reintroducing demo accounts or seeded operational data.

---

# 2. Production Decisions

## 2.1 SMS Support Delivery

Use the existing `SUPPORT_NOTIFICATION_SMS_WEBHOOK_*` contract as the backend interface. The API already sends SMS notifications by POSTing this JSON payload to the configured HTTPS webhook:

```json
{
  "to": "+254700000000",
  "title": "Support title",
  "message": "Support message",
  "tenant_id": "tenant-id",
  "ticket_id": "ticket-id",
  "notification_id": "notification-id",
  "metadata": {}
}
```

Implementation choice:

- Preferred production path: deploy a small SMS relay service that accepts the ShuleHub webhook payload and forwards to the chosen SMS provider.
- Initial provider target: Africa's Talking or another Kenya-ready SMS aggregator. The ERP API remains provider-agnostic.
- Direct-provider integration can be added only if the provider accepts the exact JSON webhook contract above.

Required production variables on Railway API:

- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN`
- `SUPPORT_NOTIFICATION_SMS_RECIPIENTS`
- `SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS=true`
- `SUPPORT_PROVIDER_SMOKE_LIVE=true`

## 2.2 Upload Malware Scanning

Use the existing `UploadMalwareScanService` and `runProviderMalwareScan` contract. The API sends a POST request to an HTTPS scanner endpoint with this JSON body:

```json
{
  "content_base64": "base64-file-content",
  "filename": "upload.pdf",
  "mime_type": "application/pdf",
  "sha256": "file-sha256",
  "size_bytes": 12345
}
```

The scanner must return a JSON payload containing a clean verdict:

```json
{
  "status": "clean",
  "scan_id": "provider-scan-id",
  "scanned_at": "2026-05-15T00:00:00.000Z"
}
```

Supported clean values are `clean`, `safe`, or `passed`. Supported infected values are `infected`, `malicious`, or `found`.

Required production variables on Railway API:

- `UPLOAD_MALWARE_SCAN_PROVIDER=clamav`
- `UPLOAD_MALWARE_SCAN_API_URL`
- `UPLOAD_MALWARE_SCAN_HEALTH_URL`
- `UPLOAD_MALWARE_SCAN_API_TOKEN`
- `UPLOAD_MALWARE_SCAN_REQUIRED=true`

## 2.3 External Object Storage

Use the existing `S3CompatibleObjectStorageService`. Configure Cloudflare R2 or AWS S3 through the current S3-compatible variables. Cloudflare R2 is recommended for this SaaS because it is S3-compatible and cost-effective for tenant-scoped file storage.

Required production variables on Railway API:

- `UPLOAD_OBJECT_STORAGE_ENABLED=true`
- `UPLOAD_OBJECT_STORAGE_PROVIDER=r2`
- `UPLOAD_OBJECT_STORAGE_ENDPOINT`
- `UPLOAD_OBJECT_STORAGE_BUCKET`
- `UPLOAD_OBJECT_STORAGE_REGION=auto`
- `UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID`
- `UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY`

All stored keys must remain tenant scoped:

```text
tenant/{tenant_id}/support/{ticket_id}/...
tenant/{tenant_id}/admissions/{application_id}/...
```

## 2.4 Production Monitoring Credentials

Do not put a normal human access token into scheduled monitors. Normal access tokens expire and create unsafe operational habits.

Implementation 7 adds a scoped monitoring service-account credential with:

- tenant-scoped read-only permissions
- no write permissions
- token hashing at rest
- expiration and rotation metadata
- audit log on each token issuance and verification failure
- script support for synthetic and core API probes

## 2.5 Monitoring Cadence

Use GitHub Actions for scheduled live probes because the scripts already live in the repo and GitHub can keep production monitor credentials as encrypted secrets.

Cadence:

- Synthetic monitor: every 15 minutes.
- Core API load probe: hourly.
- Provider smoke with live checks: every 6 hours.
- Query-plan review: nightly.
- Release readiness: nightly and on push to `main`.

---

# 3. File Map

## Provider Configuration and Smoke

- Modify: `apps/api/src/scripts/provider-credential-smoke.ts`
- Modify: `apps/api/src/scripts/provider-credential-smoke.test.ts`
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/src/config/env.validation.test.ts`
- Modify: `apps/api/src/common/uploads/s3-object-storage.service.ts`
- Modify: `apps/api/src/common/uploads/database-file-storage.service.test.ts`
- Create: `docs/deployment/provider-hardening.md`

## SMS Relay

- Create: `apps/sms-relay/package.json`
- Create: `apps/sms-relay/src/server.ts`
- Create: `apps/sms-relay/src/server.test.ts`
- Create: `apps/sms-relay/Dockerfile`
- Create: `deploy/railway/sms-relay.railway.json`
- Modify: `docs/deployment/production.md`

## Malware Scanner

- Create: `apps/malware-scanner/package.json`
- Create: `apps/malware-scanner/src/server.ts`
- Create: `apps/malware-scanner/src/server.test.ts`
- Create: `apps/malware-scanner/Dockerfile`
- Create: `deploy/railway/malware-scanner.railway.json`
- Modify: `docs/deployment/production.md`

## Monitoring Service Accounts

- Create: `apps/api/src/auth/monitoring-service-account.service.ts`
- Create: `apps/api/src/auth/monitoring-service-account.service.test.ts`
- Modify: `apps/api/src/auth/auth-schema.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/scripts/synthetic-journey-monitor.ts`
- Modify: `apps/api/src/scripts/synthetic-journey-monitor.test.ts`
- Modify: `apps/api/src/scripts/core-api-load.ts`
- Modify: `apps/api/src/scripts/core-api-load.test.ts`
- Create: `apps/api/src/scripts/create-monitoring-service-account.ts`
- Modify: `package.json`

## Scheduled Live Operability

- Create: `.github/workflows/production-operability.yml`
- Create: `docs/runbooks/production-monitoring.md`
- Modify: `docs/runbooks/incident-response.md`
- Modify: `docs/runbooks/backup-restore-drill.md`

## Real Workflow Validation

- Create: `docs/validation/pilot-real-workflow-checklist.md`
- Create: `docs/validation/implementation7-live-validation.md`
- Create: `apps/web/tests/e2e/production-pilot.spec.ts`
- Create: `apps/web/tests/e2e/production-pilot.config.ts`
- Modify: `apps/web/package.json`

## Final Gate

- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.test.ts`
- Modify: `implementation7.md`

---

# 4. Environment Variable Contract

Never commit values. Store values in Railway service variables, Vercel project variables, and GitHub Actions secrets only.

## Railway API Variables

```text
SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL
SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL
SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN
SUPPORT_NOTIFICATION_SMS_RECIPIENTS
SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS=true
SUPPORT_PROVIDER_SMOKE_LIVE=true
UPLOAD_MALWARE_SCAN_PROVIDER=clamav
UPLOAD_MALWARE_SCAN_API_URL
UPLOAD_MALWARE_SCAN_HEALTH_URL
UPLOAD_MALWARE_SCAN_API_TOKEN
UPLOAD_MALWARE_SCAN_REQUIRED=true
UPLOAD_OBJECT_STORAGE_ENABLED=true
UPLOAD_OBJECT_STORAGE_PROVIDER=r2
UPLOAD_OBJECT_STORAGE_ENDPOINT
UPLOAD_OBJECT_STORAGE_BUCKET
UPLOAD_OBJECT_STORAGE_REGION=auto
UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID
UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY
```

## SMS Relay Variables

```text
SMS_RELAY_AUTH_TOKEN
SMS_PROVIDER=africastalking
SMS_PROVIDER_API_URL
SMS_PROVIDER_API_KEY
SMS_PROVIDER_USERNAME
SMS_PROVIDER_SENDER_ID
SMS_DRY_RUN=false
```

## Malware Scanner Variables

```text
MALWARE_SCANNER_AUTH_TOKEN
MALWARE_SCANNER_MAX_BYTES=10485760
MALWARE_SCANNER_EICAR_TEST_ENABLED=true
```

## GitHub Actions Secrets

```text
PROD_API_BASE_URL
PROD_WEB_BASE_URL
PROD_MONITOR_TENANT_ID
PROD_MONITOR_ACCESS_TOKEN
PROD_DATABASE_URL
PROD_RAILWAY_API_VARIABLE_EXPORT_COMMAND
```

`PROD_MONITOR_ACCESS_TOKEN` must be a scoped monitoring token, not a human login JWT.

---

# 5. Task Pack 1 - SMS Support Delivery

**Goal:** Configure support SMS delivery so critical support tickets and support alerts can notify operators by SMS without exposing phone numbers or SMS provider secrets.

**Acceptance:**

- Provider smoke reports support SMS as `pass`, not `skip`.
- `/health/ready` reports support notifications as `configured`, not `partial`, once email and SMS are both configured.
- A critical support ticket queues SMS notifications for support.
- Retry worker retries SMS failures and creates an in-app support alert after exhaustion.
- No SMS token, webhook URL, or recipient phone number is printed in logs or provider smoke output.

- [ ] **Step 1: Add failing live SMS smoke tests**

Modify `apps/api/src/scripts/provider-credential-smoke.test.ts` with a test that enables live smoke and expects `live-support-sms-provider` to pass when the health endpoint returns HTTP 200.

Run:

```powershell
npm.cmd run build
node --test dist/apps/api/src/scripts/provider-credential-smoke.test.js
```

Expected before implementation: fail because live SMS health behavior is not strict enough for the required Implementation 7 gate.

- [ ] **Step 2: Tighten provider smoke for required SMS**

Modify `apps/api/src/scripts/provider-credential-smoke.ts` so:

- `SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS=true` makes `support-sms` fail when any SMS setting is missing.
- `SUPPORT_PROVIDER_SMOKE_LIVE=true` adds `live-support-sms-provider` and fails if `SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL` is missing.
- live smoke output includes only booleans and counts, never URLs, tokens, or phone numbers.

- [ ] **Step 3: Create SMS relay service tests**

Create `apps/sms-relay/src/server.test.ts` covering:

- `GET /health` returns 200 without secrets.
- `POST /send` rejects missing bearer token.
- `POST /send` rejects invalid phone numbers.
- `POST /send` maps ShuleHub webhook payload to the configured provider request.
- provider failure returns non-2xx so the API retry worker can retry.
- logs redact recipient phone numbers to the last four digits.

- [ ] **Step 4: Implement SMS relay service**

Create `apps/sms-relay/src/server.ts` with:

- `GET /health`
- `POST /send`
- bearer-token check from `SMS_RELAY_AUTH_TOKEN`
- JSON body validation for `to`, `title`, `message`, `tenant_id`, `notification_id`
- provider adapter for `SMS_PROVIDER=africastalking`
- timeout of 10 seconds for provider calls
- redacted logs

The relay receives ShuleHub JSON and forwards an SMS text shaped like:

```text
{title}
{message}
Ticket: {ticket_id}
```

- [ ] **Step 5: Add Railway config for SMS relay**

Create `deploy/railway/sms-relay.railway.json` with:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/sms-relay/Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 6: Configure Railway API SMS variables**

Set Railway API variables:

```powershell
npx.cmd @railway/cli variables set SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL="https://sms-relay-domain/send" --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL="https://sms-relay-domain/ready" --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS=true --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set SUPPORT_PROVIDER_SMOKE_LIVE=true --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
```

Set `SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN` and `SUPPORT_NOTIFICATION_SMS_RECIPIENTS` through Railway's secure variable flow. Do not print those values.

- [ ] **Step 7: Verify SMS**

Run with Railway production variables loaded into the process:

```powershell
npm.cmd run smoke:providers
```

Expected:

- `support-sms` is `pass`
- `live-support-sms-provider` is `pass`
- no secrets or full phone numbers appear in output

Then create a critical support ticket and verify:

- SMS notification row is created.
- SMS webhook receives a request.
- notification delivery status becomes `sent`.

Commit:

```powershell
git add apps/api/src/scripts/provider-credential-smoke.ts apps/api/src/scripts/provider-credential-smoke.test.ts apps/sms-relay deploy/railway/sms-relay.railway.json docs/deployment/production.md
git commit -m "feat: configure production support sms delivery"
```

---

# 6. Task Pack 2 - Upload Malware Scanning

**Goal:** Make malware scanning mandatory for support and admissions uploads before files are persisted.

**Acceptance:**

- `UPLOAD_MALWARE_SCAN_REQUIRED=true` in Railway API.
- Provider smoke reports malware scan as `pass`, not `skip`.
- Live scanner health check passes.
- EICAR upload is rejected before persistence.
- Clean upload is scanned, persisted, and stores provider scan metadata.
- Scanner token and scanner URL are never printed in logs.

- [ ] **Step 1: Add failing live malware smoke tests**

Modify `apps/api/src/scripts/provider-credential-smoke.test.ts` to cover:

- `UPLOAD_MALWARE_SCAN_REQUIRED=true` fails when health URL is missing and live smoke is enabled.
- live malware scanner health passes with HTTP 200.
- output does not include scanner API token or scanner URL.

- [ ] **Step 2: Extend provider smoke for live malware health**

Modify `apps/api/src/scripts/provider-credential-smoke.ts`:

- add `live-upload-malware-scan-provider`
- use `UPLOAD_MALWARE_SCAN_HEALTH_URL`
- send `Authorization: Bearer <UPLOAD_MALWARE_SCAN_API_TOKEN>`
- fail when live smoke is enabled and health URL is missing
- sanitize any returned error body

- [ ] **Step 3: Create malware scanner service tests**

Create `apps/malware-scanner/src/server.test.ts` covering:

- `GET /health` returns 200.
- `POST /scan` rejects missing bearer token.
- `POST /scan` rejects payloads above `MALWARE_SCANNER_MAX_BYTES`.
- `POST /scan` returns `clean` for a normal file.
- `POST /scan` returns `infected` for EICAR content.
- response includes `scan_id` and `scanned_at`.

- [ ] **Step 4: Implement malware scanner service**

Create `apps/malware-scanner/src/server.ts` with:

- `GET /health`
- `POST /scan`
- bearer-token check from `MALWARE_SCANNER_AUTH_TOKEN`
- base64 size validation
- SHA-256 validation when provided
- EICAR test detection
- ClamAV execution when available in the container
- safe fallback that returns `error` if scanner execution fails

The service response must match:

```json
{
  "status": "clean",
  "scan_id": "uuid",
  "scanned_at": "2026-05-15T00:00:00.000Z"
}
```

- [ ] **Step 5: Add Railway config for scanner**

Create `deploy/railway/malware-scanner.railway.json` and `apps/malware-scanner/Dockerfile`.

The Dockerfile must install a scanner binary and run the Node service as a non-root user.

- [ ] **Step 6: Configure Railway API malware variables**

Set Railway API variables:

```powershell
npx.cmd @railway/cli variables set UPLOAD_MALWARE_SCAN_PROVIDER=clamav --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set UPLOAD_MALWARE_SCAN_API_URL="https://malware-scanner-domain/scan" --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set UPLOAD_MALWARE_SCAN_HEALTH_URL="https://malware-scanner-domain/health" --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set UPLOAD_MALWARE_SCAN_REQUIRED=true --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
```

Set `UPLOAD_MALWARE_SCAN_API_TOKEN` through Railway's secure variable flow. Do not print the value.

- [ ] **Step 7: Verify malware scanning**

Run:

```powershell
npm.cmd run build
node --test dist/apps/api/src/common/uploads/upload-policy.test.js dist/apps/api/src/common/uploads/streaming-upload.service.test.js dist/apps/api/src/modules/support/support.test.js dist/apps/api/src/modules/admissions/admissions.test.js dist/apps/api/src/scripts/provider-credential-smoke.test.js
npm.cmd run smoke:providers
```

Expected:

- clean files upload successfully
- EICAR test content is rejected
- provider smoke malware scan is `pass`
- live scanner health is `pass`

Commit:

```powershell
git add apps/api/src/scripts/provider-credential-smoke.ts apps/api/src/scripts/provider-credential-smoke.test.ts apps/malware-scanner deploy/railway/malware-scanner.railway.json
git commit -m "feat: require production malware scanning for uploads"
```

---

# 7. Task Pack 3 - External Object Storage

**Goal:** Store new uploads in tenant-scoped external object storage instead of database bytea while preserving checksum verification and signed read behavior.

**Acceptance:**

- `UPLOAD_OBJECT_STORAGE_ENABLED=true`.
- Provider smoke reports object storage as `pass`, not `skip`.
- Live object storage smoke writes, reads, verifies checksum, and deletes a tenant-scoped smoke object.
- Support and admissions uploads create `file_objects` rows with `storage_backend='object'`.
- Cross-tenant object paths are rejected before upload.
- Existing database-backed files remain readable.

- [ ] **Step 1: Add failing live object storage smoke tests**

Modify `apps/api/src/scripts/provider-credential-smoke.test.ts` so live object storage smoke requires:

- HTTPS endpoint
- valid bucket
- access key configured
- secret key configured
- ability to PUT, GET, verify checksum, and DELETE a smoke object

- [ ] **Step 2: Add delete support to object storage**

Modify `apps/api/src/common/uploads/s3-object-storage.service.ts`:

- add `deleteObject(input: ObjectStorageGetInput)`
- sign DELETE requests with AWS Signature V4
- enforce tenant-scoped paths before DELETE

Add tests to `apps/api/src/common/uploads/database-file-storage.service.test.ts` proving:

- DELETE signs the expected request
- DELETE rejects paths outside `tenant/{tenant_id}/`
- failed DELETE returns `ServiceUnavailableException`

- [ ] **Step 3: Extend provider smoke for live object storage**

Modify `apps/api/src/scripts/provider-credential-smoke.ts`:

- add `live-upload-object-storage`
- write smoke object to `tenant/provider-smoke/support/provider-smoke.txt`
- read it back
- verify SHA-256
- delete it
- return only booleans and provider name in output

- [ ] **Step 4: Configure R2 or S3 bucket**

For Cloudflare R2:

- create bucket dedicated to production ShuleHub uploads
- create access key with object read/write/delete for that bucket only
- configure CORS only if browser direct uploads are introduced; current API-mediated uploads do not require public bucket CORS
- keep bucket private
- set lifecycle retention for `tenant/provider-smoke/` to expire quickly as a backup cleanup mechanism

Set Railway API variables:

```powershell
npx.cmd @railway/cli variables set UPLOAD_OBJECT_STORAGE_ENABLED=true --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set UPLOAD_OBJECT_STORAGE_PROVIDER=r2 --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
npx.cmd @railway/cli variables set UPLOAD_OBJECT_STORAGE_REGION=auto --service 62241841-a98c-4058-b0af-bae872ed4929 --environment production
```

Set endpoint, bucket, access key, and secret key through Railway's secure variable flow. Do not print values.

- [ ] **Step 5: Verify object storage**

Run:

```powershell
npm.cmd run build
node --test dist/apps/api/src/common/uploads/database-file-storage.service.test.js dist/apps/api/src/scripts/provider-credential-smoke.test.js
npm.cmd run smoke:providers
```

Then upload one support attachment and one admissions document in production or a production-like staging tenant. Verify database rows:

- `storage_backend='object'`
- `object_storage_provider='r2'`
- `content IS NULL`
- `checksum_sha256` is populated
- `object_storage_key` starts with `tenant/{tenant_id}/`

Commit:

```powershell
git add apps/api/src/common/uploads/s3-object-storage.service.ts apps/api/src/common/uploads/database-file-storage.service.test.ts apps/api/src/scripts/provider-credential-smoke.ts apps/api/src/scripts/provider-credential-smoke.test.ts docs/deployment/provider-hardening.md
git commit -m "feat: enable live object storage verification"
```

---

# 8. Task Pack 4 - Monitoring Service Accounts

**Goal:** Replace expiring human JWTs in synthetic and load monitoring with tenant-scoped read-only monitoring credentials.

**Acceptance:**

- Monitoring token is hashed at rest.
- Monitoring token can only authenticate read-only monitor scripts.
- Monitoring token cannot call mutating routes.
- Token issuance and failed token validation are audited.
- Token rotation is documented.
- No token value is printed in normal script output.

- [ ] **Step 1: Add failing monitoring service account tests**

Create `apps/api/src/auth/monitoring-service-account.service.test.ts` covering:

- creates a tenant-scoped monitoring token with read-only permissions
- stores only a hash
- verifies a valid token and returns tenant/user context
- rejects expired tokens
- rejects revoked tokens
- rejects token use for write permissions
- records audit rows for creation, rotation, and failed validation

- [ ] **Step 2: Add schema**

Modify `apps/api/src/auth/auth-schema.service.ts` to create:

```sql
CREATE TABLE IF NOT EXISTS monitoring_service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL,
  permissions text[] NOT NULL DEFAULT ARRAY['monitor:read'],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
```

Add indexes:

- unique hash index
- tenant/status index
- expiration index

Enable and force RLS. Allow platform owner management and tenant-scoped read for the monitoring token verification function only.

- [ ] **Step 3: Implement service**

Create `apps/api/src/auth/monitoring-service-account.service.ts` with:

- `createToken(input)`
- `verifyToken(rawToken)`
- `revokeToken(tokenId)`
- `rotateToken(tokenId)`

Hash raw tokens with SHA-256 plus server-side pepper from `SECURITY_PII_ENCRYPTION_KEY`.

- [ ] **Step 4: Add script for secure creation**

Create `apps/api/src/scripts/create-monitoring-service-account.ts`.

The script must:

- require `DATABASE_URL`
- require `MONITORING_SERVICE_ACCOUNT_TENANT_ID`
- require `MONITORING_SERVICE_ACCOUNT_NAME`
- generate a raw token
- store only the hash
- write the raw token directly to a target secret store when configured
- avoid printing the raw token to stdout

Supported secret targets:

- GitHub Actions secret through `gh secret set PROD_MONITOR_ACCESS_TOKEN`
- Railway variable through `npx @railway/cli variables set PROD_MONITOR_ACCESS_TOKEN=...`

- [ ] **Step 5: Teach monitor scripts to use monitor tokens**

Modify `apps/api/src/scripts/synthetic-journey-monitor.ts` and `apps/api/src/scripts/core-api-load.ts`:

- accept `SYNTHETIC_MONITOR_TOKEN` and `CORE_API_LOAD_MONITOR_TOKEN`
- send `Authorization: Bearer <monitor-token>`
- send `x-tenant-id`
- keep existing access-token variables as local-development fallback
- never print tokens

- [ ] **Step 6: Verify**

Run:

```powershell
npm.cmd run build
node --test dist/apps/api/src/auth/monitoring-service-account.service.test.js dist/apps/api/src/scripts/synthetic-journey-monitor.test.js dist/apps/api/src/scripts/core-api-load.test.js
npm.cmd test
```

Commit:

```powershell
git add apps/api/src/auth apps/api/src/scripts package.json
git commit -m "feat: add scoped monitoring service accounts"
```

---

# 9. Task Pack 5 - Scheduled Production Operability

**Goal:** Run production checks on a cadence and fail loudly when live provider, synthetic, load, or query-plan health regresses.

**Acceptance:**

- GitHub Actions schedule exists.
- Scheduled jobs use encrypted secrets.
- Jobs never print database URLs, access tokens, SMS tokens, scanner tokens, object storage credentials, or recipient phone numbers.
- Synthetic monitor runs every 15 minutes.
- Core API load probe runs hourly.
- Provider smoke live check runs every 6 hours.
- Query-plan review runs nightly.
- Failures create a visible failed workflow and upload sanitized JSON artifacts.

- [ ] **Step 1: Add workflow**

Create `.github/workflows/production-operability.yml`:

```yaml
name: Production Operability

on:
  schedule:
    - cron: "*/15 * * * *"
    - cron: "7 * * * *"
    - cron: "17 */6 * * *"
    - cron: "33 2 * * *"
  workflow_dispatch:
    inputs:
      check:
        description: "Check to run"
        required: true
        default: "all"
        type: choice
        options:
          - all
          - synthetic
          - core-load
          - providers
          - query-plan
          - readiness

jobs:
  production-operability:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - run: npm run build
      - name: Synthetic monitor
        if: github.event.inputs.check == 'all' || github.event.inputs.check == 'synthetic' || github.event_name == 'schedule'
        env:
          SYNTHETIC_API_BASE_URL: ${{ secrets.PROD_API_BASE_URL }}
          SYNTHETIC_WEB_BASE_URL: ${{ secrets.PROD_WEB_BASE_URL }}
          SYNTHETIC_TENANT_ID: ${{ secrets.PROD_MONITOR_TENANT_ID }}
          SYNTHETIC_MONITOR_TOKEN: ${{ secrets.PROD_MONITOR_ACCESS_TOKEN }}
          SYNTHETIC_ALLOW_REMOTE: "true"
        run: npm run monitor:synthetic
      - name: Core API load
        if: github.event.inputs.check == 'all' || github.event.inputs.check == 'core-load' || github.event_name == 'schedule'
        env:
          CORE_API_LOAD_BASE_URL: ${{ secrets.PROD_API_BASE_URL }}
          CORE_API_LOAD_TENANT_ID: ${{ secrets.PROD_MONITOR_TENANT_ID }}
          CORE_API_LOAD_MONITOR_TOKEN: ${{ secrets.PROD_MONITOR_ACCESS_TOKEN }}
          CORE_API_LOAD_ALLOW_REMOTE: "true"
          CORE_API_LOAD_ITERATIONS: "3"
        run: npm run load:core-api
      - name: Provider smoke
        if: github.event.inputs.check == 'all' || github.event.inputs.check == 'providers' || github.event_name == 'schedule'
        env:
          SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS: ${{ secrets.SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS || 'false' }}
          SUPPORT_PROVIDER_SMOKE_LIVE: ${{ secrets.SUPPORT_PROVIDER_SMOKE_LIVE || 'false' }}
        run: npm run smoke:providers
      - name: Query plan review
        if: github.event.inputs.check == 'all' || github.event.inputs.check == 'query-plan' || github.event_name == 'schedule'
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
        run: npm run perf:query-plan-review
      - name: Release readiness
        if: github.event.inputs.check == 'all' || github.event.inputs.check == 'readiness'
        run: npm run release:readiness
```

- [ ] **Step 2: Add documentation**

Create `docs/runbooks/production-monitoring.md` with:

- schedule table
- required GitHub secrets
- how to run each workflow manually
- how to triage failures
- how to rotate monitor token
- how to disable a noisy check without hiding the underlying provider failure

- [ ] **Step 3: Verify workflow syntax**

Run:

```powershell
npm.cmd run build
npm.cmd run release:readiness
```

Then use GitHub Actions manual dispatch for each check:

- `synthetic`
- `core-load`
- `providers`
- `query-plan`
- `readiness`

Commit:

```powershell
git add .github/workflows/production-operability.yml docs/runbooks/production-monitoring.md docs/runbooks/incident-response.md docs/runbooks/backup-restore-drill.md
git commit -m "ci: schedule production operability checks"
```

---

# 10. Task Pack 6 - Real User Workflow Validation

**Goal:** Prove production workflows work through real UI/API paths using invited users and a real tenant, not seeded demo data.

**Acceptance:**

- One controlled pilot tenant exists.
- Users are invited by real flows.
- Password setup and recovery work through real email.
- School admin can complete core workflows.
- Support can receive and respond to a real ticket with attachment.
- Reports export real artifacts.
- No workflow relies on hardcoded credentials or demo records.

- [ ] **Step 1: Create validation checklist**

Create `docs/validation/pilot-real-workflow-checklist.md` with these workflows:

1. Platform owner creates school.
2. Platform owner invites school admin.
3. School admin accepts invite and sets password.
4. School admin invites teacher, accountant, parent, and support-facing staff.
5. Password recovery email is requested and delivered.
6. Email verification is requested and delivered.
7. School admin creates admissions application.
8. Student record is created or updated.
9. Accountant creates invoice or verifies existing billing surface.
10. Payment allocation is verified against the correct student.
11. Inventory receives stock and issues stock.
12. Teacher opens exams workspace and verifies report-card read path.
13. Support ticket is created with attachment.
14. Support replies, adds internal note, escalates, resolves.
15. Public status page is checked.
16. Report export is generated and downloaded.
17. Audit trail is checked for each mutating workflow.
18. School user confirms tenant isolation by attempting a cross-tenant URL or ID and receiving denial.

- [ ] **Step 2: Add E2E test scaffold**

Create `apps/web/tests/e2e/production-pilot.config.ts` with environment-driven URLs and credentials:

- `E2E_WEB_BASE_URL`
- `E2E_API_BASE_URL`
- `E2E_PLATFORM_OWNER_EMAIL`
- `E2E_PLATFORM_OWNER_PASSWORD`
- `E2E_PILOT_SCHOOL_ADMIN_EMAIL`
- `E2E_PILOT_TENANT_ID`

Do not commit any values.

- [ ] **Step 3: Add E2E smoke spec**

Create `apps/web/tests/e2e/production-pilot.spec.ts` covering:

- superadmin login page loads
- school login page loads
- support status page loads
- forgot password request returns a user-safe success state
- support ticket creation page requires authentication
- public status page has component data

Keep the first spec read-safe. Add mutating E2E steps only after the pilot tenant is ready.

- [ ] **Step 4: Execute manual pilot validation**

Run through the checklist with real browser sessions and record results in `docs/validation/implementation7-live-validation.md`.

Every row must include:

- date
- actor
- workflow
- result
- evidence reference
- issue link or fix commit when failed

- [ ] **Step 5: Fix failures discovered by pilot**

For every failed workflow:

- reproduce locally or in staging
- write a failing test
- implement the fix
- run focused test
- run `npm.cmd test`
- record the fix in `implementation7.md`

Commit validation docs:

```powershell
git add docs/validation apps/web/tests/e2e apps/web/package.json
git commit -m "test: add production pilot workflow validation"
```

---

# 11. Task Pack 7 - Final Production Gate

**Goal:** Make Implementation 7 the gate that proves all remaining provider and live validation gaps are closed.

**Acceptance:**

- Release readiness knows SMS, malware scanning, object storage, scheduled monitoring, and pilot validation are Implementation 7 requirements.
- Provider smoke has no skipped required providers.
- Live API readiness reports support notifications `configured`.
- Implementation 7 evidence is recorded.

- [ ] **Step 1: Add failing release-gate tests**

Modify `apps/api/src/scripts/release-readiness-gate.test.ts`:

- fail when `provider-credential-smoke.test.js` does not cover required SMS
- fail when provider smoke does not cover live malware scan health
- fail when provider smoke does not cover live object storage write/read/delete
- fail when production operability workflow is missing
- fail when pilot validation document is missing
- fail when monitoring service account tests are missing

- [ ] **Step 2: Implement release-gate checks**

Modify `apps/api/src/scripts/release-readiness-gate.ts` to check:

- `.github/workflows/production-operability.yml` exists
- `docs/runbooks/production-monitoring.md` exists
- `docs/validation/pilot-real-workflow-checklist.md` exists
- `docs/validation/implementation7-live-validation.md` exists
- provider smoke test contains required SMS, malware, and object storage live checks
- monitoring service account tests are included in `package.json` test script

- [ ] **Step 3: Run final local suite**

Run:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd --prefix apps/web run test:design
npm.cmd --prefix apps/web run build
npm.cmd run release:readiness
```

- [ ] **Step 4: Run final live suite**

Run with production-safe variables:

```powershell
npm.cmd run smoke:providers
npm.cmd run monitor:synthetic
npm.cmd run load:core-api
npm.cmd run perf:query-plan-review
```

Expected:

- provider smoke passes with zero failed and zero skipped required checks
- synthetic monitor has zero failed steps
- core API load has zero failed requests
- query-plan review passes

- [ ] **Step 5: Update Implementation 7 evidence**

Update this file with:

- deployed commit hash
- Railway deployment ID
- Vercel deployment URL
- provider smoke result
- synthetic result
- core load result
- query-plan result
- real workflow validation result
- final readiness score
- remaining risks

Commit:

```powershell
git add implementation7.md apps/api/src/scripts/release-readiness-gate.ts apps/api/src/scripts/release-readiness-gate.test.ts package.json
git commit -m "chore: gate implementation 7 production readiness"
```

---

# 12. Final Verification Matrix

| Area | Command | Required result |
|---|---|---|
| API build | `npm.cmd run build` | exit 0 |
| API tests | `npm.cmd test` | all tests pass |
| Web design tests | `npm.cmd --prefix apps/web run test:design` | all tests pass |
| Web build | `npm.cmd --prefix apps/web run build` | exit 0 |
| Release gate | `npm.cmd run release:readiness` | all checks pass |
| Provider smoke | `npm.cmd run smoke:providers` | malware scan and object storage pass; SMS passes after real provider credentials and `/ready` are configured |
| Synthetic monitor | `npm.cmd run monitor:synthetic` | zero failed steps |
| Core API load | `npm.cmd run load:core-api` | zero failed requests |
| Query plan | `npm.cmd run perf:query-plan-review` | ok true |
| Public health | `GET /health` | HTTP 200, status ok |
| Readiness | `GET /health/ready` | HTTP 200, status ok |
| Public status | `GET /support/public/system-status` | HTTP 200, components present |
| Real workflow validation | `docs/validation/implementation7-live-validation.md` | all critical workflows pass or have fixed issue references |

---

# 13. Final Definition of Done

Implementation 7 is complete only when:

- SMS support notifications are configured and verified with live provider smoke after real provider credentials are supplied.
- Malware scanning is mandatory for uploads and rejects EICAR before persistence.
- External object storage is enabled for new uploads with tenant-scoped keys and checksum verification.
- Monitoring scripts use scoped monitoring credentials, not human JWTs.
- GitHub Actions runs scheduled synthetic, core-load, provider, query-plan, and readiness checks.
- A real pilot tenant completes core school workflows through invitation-based accounts.
- No secrets, tokens, URLs containing credentials, or full phone numbers are printed in logs, docs, or command output.
- `support_notifications` in `/health/ready` is `configured`.
- Final production readiness score is at least 85/100.

---

# 14. Expected Score Movement

| Area | Current | Target after Implementation 7 |
|---|---:|---:|
| System maturity | 72/100 | 84/100 |
| Production readiness | 70/100 | 86/100 |
| Security | 86/100 | 92/100 |
| Reliability | 76/100 | 88/100 |
| UX completeness | 82/100 | 86/100 |
| Scalability | 72/100 | 84/100 |
| Multi-tenant safety | 90/100 | 93/100 |

The platform becomes broad-production-ready after this plan only if the real workflow validation passes with no unresolved critical or high severity failures.
