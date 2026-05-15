# Implementation 7 Live Validation

Status as of 2026-05-15: live Railway validation is complete for transactional email, external object storage, and required upload malware scanning. SMS relay infrastructure is deployed and healthy, but real SMS delivery is intentionally pending real SMS provider credentials and recipients. GitHub CLI is authenticated and the available production operability secrets are installed. Scheduled GitHub Actions dispatch is pending merge because GitHub only exposes the new `production-operability.yml` workflow after it exists on the default branch. Production currently has zero tenants, so scoped monitor token creation must wait for real tenant onboarding.

## Validation Log

| Date | Actor | Workflow | Result | Evidence reference | Issue or fix |
|---|---|---|---|---|---|
| 2026-05-15 | Codex | Local API build and focused provider/monitor tests | Passed | `npm run build`; focused Node tests | Current branch |
| 2026-05-15 | Codex | SMS relay service tests | Passed | `npm --prefix apps/sms-relay run test` | Current branch |
| 2026-05-15 | Codex | Malware scanner service tests | Passed | `npm --prefix apps/malware-scanner run test` | Current branch |
| 2026-05-15 | Codex | Live email provider smoke | Passed | Resend `/emails` authenticated validation probe passed without sending mail | `EMAIL_PROVIDER_SMOKE_URL` set to sending endpoint |
| 2026-05-15 | Codex | SMS relay liveness and readiness split | Passed | `/health` remains deployable; `/ready` remains degraded in dry-run | Prevents dry-run SMS from passing production smoke |
| 2026-05-15 | Operator | Live SMS provider smoke | Pending | Requires provider credentials, recipients, and `/ready` HTTP 200 | Configure Africa's Talking or equivalent |
| 2026-05-15 | Codex | Live malware scanner smoke | Passed | Railway scanner health; authenticated clean/EICAR probes | Scanner uses ClamAV daily/bytecode database mode for Railway memory limits |
| 2026-05-15 | Codex | Live object storage smoke | Passed | Railway API env write/read/delete probe | Railway S3-compatible bucket configured |
| 2026-05-15 | Codex | GitHub Actions provider/query/readiness secrets | Passed | GitHub secret names installed without exposing values | Monitor and SMS secrets intentionally absent |
| 2026-05-15 | Codex | Production provider smoke | Passed | Railway `npm run smoke:providers`: 9 passed, 0 failed, 1 skipped | SMS skipped until real provider credentials exist |
| 2026-05-15 | Codex | Production query-plan review | Passed | Railway `npm run perf:query-plan-review`: ok true | Library catalog search remains allowed by current gate |
| 2026-05-15 | Codex | Release readiness gate | Passed | `npm run release:readiness`: ok true | Current branch |
| 2026-05-15 | Operator | Scheduled GitHub Actions monitor | Pending | Workflow dispatch returned 404 because workflow is not on default branch yet | Merge workflow, create real tenant, then add monitor secrets |
| 2026-05-15 | Operator | Real pilot school workflow checklist | Pending | Requires controlled pilot tenant; production currently has zero tenants | Execute checklist after real onboarding |

## Required Before Marking Complete

- Provider smoke has zero failed required checks and no skipped required providers except SMS while real SMS credentials are pending.
- SMS provider smoke uses the relay `/ready` endpoint, not `/health`; dry-run readiness must fail.
- `GET /health/ready` reports support email configured; SMS remains missing until real provider credentials and recipients are supplied.
- A critical support ticket generates email and SMS notification attempts.
- EICAR upload is rejected before persistence.
- Clean support/admissions uploads persist through external object storage with tenant-scoped keys.
- Synthetic monitor and core API load run from GitHub Actions with `PROD_MONITOR_ACCESS_TOKEN`, not a human JWT.
- Create the first real school tenant before generating `PROD_MONITOR_ACCESS_TOKEN`; do not create fake/demo tenants for monitoring.
- Every checklist row in [pilot-real-workflow-checklist.md](/C:/Users/user/Desktop/PROJECTS/Shule%20hub/docs/validation/pilot-real-workflow-checklist.md) is passed or linked to a fixed issue.

## Secrets Handling

No token, OTP, provider credential, database URL, object-storage key, or full phone number should appear in this document. Use request ids, ticket ids, artifact ids, deployment ids, and provider delivery ids as evidence.
