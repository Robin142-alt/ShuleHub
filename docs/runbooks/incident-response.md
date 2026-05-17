# Incident Response Runbook

This runbook is for production incidents affecting Shule Hub schools, support operators, or platform availability. Use it for degraded readiness, public status changes, support notification failures, billing/MPESA disruption, export failures, and release regressions.

## Detection

- Check `GET /health/ready` for Postgres, Redis, BullMQ, CORS, transactional email, support notification, and request-context readiness.
- Check `GET /support/public/system-status` before and after any school-facing incident update.
- Confirm public status subscriptions are accepting consented requests and that status notification attempts are queued for active subscribers.
- Review observability alerts and queue lag from the health dashboard.
- Run `npm run smoke:providers` in the affected environment to verify transactional email, support email recipients, optional SMS webhook settings, and retry-worker configuration without printing secrets.
- For Implementation 7 provider incidents, confirm `live-support-sms-provider`, `live-upload-malware-scan-provider`, and `live-upload-object-storage` are passing before declaring provider recovery.
- Check the `Production Operability` GitHub Actions workflow for recent synthetic, core-load, provider, query-plan, and readiness failures.
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
- For malware-scanner failure, keep `UPLOAD_MALWARE_SCAN_REQUIRED=true`; pause file-upload workflows if clean scanning cannot be verified.
- For object-storage failure, pause new file uploads if provider smoke cannot write/read/delete a tenant-scoped smoke object.
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

## Incident Drill Checklist

Use this checklist for `npm run ops:incident-drill -- --dry-run` and for quarterly live game-day reviews.

- Incident commander assigned: one named operator owns triage, decision logs, and final closeout.
- Severity confirmed: classify as Critical, Major, Minor, or Maintenance before publishing updates.
- Blast radius recorded: tenant, module, role, provider, and whether data integrity is affected.
- Rollback decision recorded: decide forward fix, rollback, provider failover, or manual workaround.
- Communications checkpoint completed: publish safe status update, support macro, and next update time.
- Evidence captured: attach health/readiness output, workflow artifact links, provider smoke output, and timeline.
- Closeout completed: record root cause, customer impact, permanent fix, owner, and due date.

## Provider Outage Playbooks

### Email outage

- Primary owner: Support lead.
- Confirm `RESEND_API_KEY`, `EMAIL_FROM`, and provider smoke without printing secrets.
- Keep password recovery and invitation failures visible to operators; do not claim delivery success until provider sends.
- Switch to in-app notices and support ticket updates while email is degraded.

### SMS provider outage

- Primary owner: Platform owner.
- Confirm active platform SMS provider, relay `/ready`, school SMS wallet deduction behavior, and support SMS recipients.
- Pause non-critical bulk SMS if delivery is failing; do not deduct credits for failed provider dispatches.
- Use email and in-app notifications for critical incident communication until SMS recovers.

### Daraja outage

- Primary owner: Finance operations owner.
- Confirm whether Safaricom, one school credential set, callback validation, or queue processing is affected.
- Keep school funds in school-owned accounts; never reroute payments through the ERP.
- Queue idempotent callback replays only after signature, amount, and tenant matching are verified.

### Redis outage

- Primary owner: Engineering owner.
- Check replay protection, queue workers, rate limits, sessions, and BullMQ readiness.
- Pause risky MPESA replay and notification retry paths if idempotency cannot be guaranteed.
- Restore Redis, then replay only jobs with idempotency keys and clear ownership.

### Postgres outage

- Primary owner: Engineering owner.
- Treat database unavailability or tenant isolation risk as Critical.
- Pause writes, verify Neon/Postgres status, and keep public status updated.
- Run restore checks only in DR/sandbox environments; never restore over production during live triage.

### Object storage outage

- Primary owner: Engineering owner.
- Pause new uploads if read/write/delete smoke cannot verify a tenant-scoped object path.
- Keep existing file metadata intact and prevent fallback storage that breaks tenant scoping.
- Resume uploads only after signed URL and tenant-prefix checks pass.

### Malware scanner outage

- Primary owner: Security owner.
- Keep `UPLOAD_MALWARE_SCAN_REQUIRED=true` in production.
- Pause file uploads when clean scanning cannot be verified.
- Resume uploads only after provider health and upload-policy validation pass.

## Dependency Ownership Matrix

| Dependency | Primary owner | Fallback owner | Escalation path | Acknowledgement SLA |
|---|---|---|---|---:|
| Email | Support lead | Platform owner | Resend/provider support, then engineering | 15 minutes |
| SMS provider | Platform owner | Support lead | SMS relay logs, provider support, then engineering | 15 minutes |
| Daraja | Finance operations owner | Platform owner | Safaricom Daraja support, then engineering | 15 minutes |
| Redis | Engineering owner | Platform owner | Railway/Redis provider support | 10 minutes |
| Postgres | Engineering owner | Platform owner | Neon/Postgres provider support | 10 minutes |
| Object storage | Engineering owner | Security owner | Storage provider support | 15 minutes |
| Malware scanner | Security owner | Engineering owner | Scanner provider/runtime owner | 15 minutes |

## Retired Modules

Attendance is retired. Do not restore attendance navigation, routes, sync entities, load probes, report exports, or incident workarounds during an outage.

Exams is active through the implemented exams workspace. If an academic incident affects Exams, treat it as an active module and keep attendance retired while restoring exam workflows.

## Recovery

- Confirm `GET /health/ready` returns healthy or intentionally degraded status with a known owner.
- Confirm `GET /support/public/system-status` reflects the current incident state.
- Verify failed support notifications are either delivered, queued for retry, or documented as dead-letter records.
- Re-run `npm test` and `npm run release:readiness` for release-related incidents.
- Re-run `npm run monitor:synthetic`, `npm run load:core-api`, and `npm run smoke:providers` for Implementation 7 operability incidents.
- Run `npm run load:high-volume-workflows` when an incident follows scale-sensitive changes to reports, Exams, billing, or support status.
- Record the timeline, root cause, customer impact, mitigation, follow-up owner, and any test or runbook gaps found during the incident.
