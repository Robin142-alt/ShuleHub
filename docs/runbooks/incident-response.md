# Incident Response Runbook

This runbook is for production incidents affecting Shule Hub schools, support operators, or platform availability. Use it for degraded readiness, public status changes, support notification failures, billing/MPESA disruption, export failures, and release regressions.

## Detection

- Check `GET /health/ready` for Postgres, Redis, BullMQ, CORS, transactional email, support notification, and request-context readiness.
- Check `GET /support/public/system-status` before and after any school-facing incident update.
- Confirm public status subscriptions are accepting consented requests and that status notification attempts are queued for active subscribers.
- Review observability alerts and queue lag from the health dashboard.
- Run `npm run smoke:providers` in the affected environment to verify transactional email, support email recipients, optional SMS webhook settings, and retry-worker configuration without printing secrets.
- Review support notification dead-letter deliveries from the support command center.
- Review SLA breach alerts and unresolved critical support tickets.
- Confirm whether the release readiness gate passed before the active deployment.

## Triage

- Identify blast radius: all tenants, one tenant, one module, one role, or one worker.
- Confirm the affected workflow: login, onboarding, invitations, admissions, students, inventory, billing, MPESA, reports, support, or Exams.
- Compare API readiness with user reports. If readiness is healthy but users are blocked, inspect route permissions, billing lifecycle restrictions, and frontend module readiness.
- For export incidents, prefer queued report jobs for large datasets and keep synchronous CSV artifact exports for small reports.
- Preserve tenant isolation. Do not inspect or restore another tenant's data while troubleshooting a tenant-specific incident.

## Severity

- Critical: login, tenant isolation, billing access, MPESA callbacks, database availability, or data integrity is broken for one or more schools.
- Major: a production-ready module is degraded but has a manual workaround.
- Minor: a non-critical view, support notification channel, or report export is degraded.
- Maintenance: planned infrastructure, schema, or provider work with communicated timing.

## Mitigation

- For database or queue failure, pause risky write-heavy operations and verify readiness before resuming.
- For support notification failure, inspect email/SMS provider readiness with `npm run smoke:providers`, process retry queues, and triage support notification dead-letter records.
- For public incident subscription failure, pause outbound status notification attempts only if they are leaking unsafe content, then verify hashed subscribers remain active and retryable.
- For MPESA issues, stop duplicate callback processing, verify signature and amount mismatch logs, then replay only idempotent jobs.
- For export issues, move large exports to the report export queue and avoid browser-generated artifacts for audit workflows.
- For frontend exposure regressions, run `npm run release:readiness` and hide incomplete modules through the production module readiness gate.
- Use rollback when the latest release caused a critical regression and a forward fix cannot be verified quickly.

## Communications

- Publish school-safe updates through the public support status surface backed by `GET /support/public/system-status`.
- Use public status subscriptions for incident communications; notification attempts must contain public summaries only, never internal notes.
- State impact, affected modules, current status, and the next update time. Do not expose tenant names, secrets, tokens, phone numbers, or internal stack traces.
- Keep support tickets updated with the same incident summary so tenant-scoped communication stays consistent.

## Retired Modules

Attendance is retired. Do not restore attendance navigation, routes, sync entities, load probes, report exports, or incident workarounds during an outage.

Exams is active through the implemented exams workspace. If an academic incident affects Exams, treat it as an active module and keep attendance retired while restoring exam workflows.

## Recovery

- Confirm `GET /health/ready` returns healthy or intentionally degraded status with a known owner.
- Confirm `GET /support/public/system-status` reflects the current incident state.
- Verify failed support notifications are either delivered, queued for retry, or documented as dead-letter records.
- Re-run `npm test` and `npm run release:readiness` for release-related incidents.
- Run `npm run load:high-volume-workflows` when an incident follows scale-sensitive changes to reports, Exams, billing, or support status.
- Record the timeline, root cause, customer impact, mitigation, follow-up owner, and any test or runbook gaps found during the incident.
