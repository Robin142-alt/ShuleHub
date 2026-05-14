# Production Monitoring Runbook

Implementation 7 uses scheduled, read-safe production probes to catch provider, workflow, query, and release-regression failures before schools report them.

## Schedule

| Check | Cadence | Command | Secret scope |
|---|---:|---|---|
| Synthetic journey monitor | Every 15 minutes | `npm run monitor:synthetic` | API/Web URLs, tenant id, monitor token |
| Core API load probe | Hourly | `npm run load:core-api` | API URL, tenant id, monitor token |
| Provider smoke | Every 6 hours | `npm run smoke:providers` | SMS, email, malware scanner, object storage |
| Query-plan review | Nightly | `npm run perf:query-plan-review` | Production database URL |
| Release readiness | Nightly and manual | `npm run release:readiness` | None |

All scheduled runs are defined in [.github/workflows/production-operability.yml](/C:/Users/user/Desktop/PROJECTS/Shule%20hub/.github/workflows/production-operability.yml).

## Required GitHub Secrets

- `PROD_API_BASE_URL`
- `PROD_WEB_BASE_URL`
- `PROD_MONITOR_TENANT_ID`
- `PROD_MONITOR_ACCESS_TOKEN`
- `PROD_DATABASE_URL`
- `SUPPORT_NOTIFICATION_EMAILS`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN`
- `SUPPORT_NOTIFICATION_SMS_RECIPIENTS`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `UPLOAD_MALWARE_SCAN_API_URL`
- `UPLOAD_MALWARE_SCAN_HEALTH_URL`
- `UPLOAD_MALWARE_SCAN_API_TOKEN`
- `UPLOAD_OBJECT_STORAGE_PROVIDER`
- `UPLOAD_OBJECT_STORAGE_ENDPOINT`
- `UPLOAD_OBJECT_STORAGE_BUCKET`
- `UPLOAD_OBJECT_STORAGE_REGION`
- `UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID`
- `UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY`

`PROD_MONITOR_ACCESS_TOKEN` must be generated through `npm run monitor:create-service-account`; do not use a human JWT.

## Creating a Monitor Token

Set the script variables in a secure shell, then run one of the target modes:

```bash
export MONITORING_SERVICE_ACCOUNT_TENANT_ID="real-tenant-id"
export MONITORING_SERVICE_ACCOUNT_NAME="production synthetic monitor"
export MONITORING_SERVICE_ACCOUNT_SECRET_TARGET="github"
npm run monitor:create-service-account
```

The script stores only a hash in PostgreSQL and writes the raw token directly into the target secret store. Normal output contains account metadata only.

## Manual Dispatch

Open the `Production Operability` workflow and run one check at a time:

- `synthetic`
- `core-load`
- `providers`
- `query-plan`
- `readiness`
- `all`

Use `all` before production promotion. Use individual checks while triaging to avoid noisy unrelated failures.

## Triage

- Synthetic failure: inspect the failing step id, confirm `GET /health/ready`, then confirm the affected web/API route manually.
- Core-load failure: compare p95/max latency with the route and query-plan review. Check database indexes before increasing capacity.
- Provider smoke failure: check whether the failure is email, SMS, malware scanner, or object storage. Do not disable required provider flags to hide a broken dependency.
- Query-plan failure: review the reported query and index recommendation. Treat tenant-wide scans on operational tables as release blockers.
- Release readiness failure: treat the missing artifact or gate failure as a code release issue, not an infrastructure incident.

## Rotation

Rotate monitor tokens at least every 90 days or immediately after a suspected leak:

1. Create a replacement token with `npm run monitor:create-service-account`.
2. Verify `Production Operability` succeeds with the new secret.
3. Revoke the old token through `MonitoringServiceAccountService.revokeToken` or a short admin maintenance script.
4. Confirm failed validation attempts are recorded in `monitoring_service_account_audit_logs`.

## Noise Control

If a check is noisy, reduce its blast radius without hiding the underlying failure:

- Lower `CORE_API_LOAD_ITERATIONS` temporarily during provider incidents.
- Use workflow dispatch to run only one check while debugging.
- Keep `SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS=true`, `UPLOAD_MALWARE_SCAN_REQUIRED=true`, and `UPLOAD_OBJECT_STORAGE_ENABLED=true` for production gates.
- Document any temporary pause in the incident timeline with owner and expiry time.
