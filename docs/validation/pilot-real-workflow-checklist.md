# Pilot Real Workflow Checklist

Use this checklist with one controlled pilot tenant and invitation-created accounts only. Do not use seeded accounts, visible demo credentials, or hardcoded passwords.

| # | Workflow | Actor | Evidence |
|---:|---|---|---|
| 1 | Platform owner creates school. | Platform owner | School id, tenant slug, audit log id |
| 2 | Platform owner invites school admin. | Platform owner | Invitation id, email outbox id |
| 3 | School admin accepts invite and sets password. | School admin | Accepted timestamp, first session id |
| 4 | School admin invites teacher, accountant, parent, and support-facing staff. | School admin | Invitation ids and role memberships |
| 5 | Password recovery email is requested and delivered. | Invited user | Email provider delivery id |
| 6 | Email verification is requested and delivered. | Invited user | Verification outbox id and verified timestamp |
| 7 | School admin creates admissions application. | School admin | Application id and audit log id |
| 8 | Student record is created or updated. | School admin | Student id, tenant id, audit log id |
| 9 | Accountant creates invoice or verifies existing billing surface. | Accountant | Invoice id or billing report id |
| 10 | Payment allocation is verified against the correct student. | Accountant | Ledger/payment allocation reference |
| 11 | Inventory receives stock and issues stock. | Storekeeper | Receipt id, issue id, stock movement ids |
| 12 | Teacher opens exams workspace and verifies report-card read path. | Teacher | Route screenshot or response id |
| 13 | Support ticket is created with attachment. | School admin | Ticket id, attachment file object id |
| 14 | Support replies, adds internal note, escalates, resolves. | Support agent | Message ids, note id, status logs |
| 15 | Public status page is checked. | Public user | Status response timestamp |
| 16 | Report export is generated and downloaded. | School admin | Report job or artifact id |
| 17 | Audit trail is checked for each mutating workflow. | Platform owner | Audit log query evidence |
| 18 | School user attempts cross-tenant URL or id and receives denial. | School admin | HTTP 403/404 evidence and request id |

## Rules

- Every mutating row must include `tenant_id`.
- File evidence must use tenant-scoped object keys.
- Recovery, invitation, and verification flows must use real email delivery.
- No password, OTP, token, database URL, provider key, or full phone number may be copied into this document.
- Failed rows must link to a fix commit or issue before a production readiness score can be raised.
