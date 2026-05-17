# Backup Restore Verification

This is the canonical production-operability runbook for restore evidence. The detailed drill procedure remains in `docs/runbooks/backup-restore-drill.md`; this file defines the schedule, owner, artifact, and proof expected before production promotion.

## Schedule

- Weekly scheduled verification: GitHub Actions `Production Operability` workflow, `backup-restore` check.
- Manual verification: run `npm run dr:backup-restore` against a dedicated disaster-recovery database, never against production.
- Required secret for scheduled runs: `DR_DATABASE_URL`.

## Latest Restore Artifact

- Artifact name: `production-backup-restore.txt`.
- Upload source: `.github/workflows/production-operability.yml`.
- Retention: 14 days with the rest of the production operability evidence.
- Required contents: command output from `npm run dr:backup-restore`, restore test result, and failure stack trace if the drill fails.

## Owner

- Primary owner: Engineering owner.
- Backup owner: Platform owner.
- Escalation: Support lead for school-facing communications, database provider support for platform restore blockers.

## Verification Rules

- Use a sandbox or DR database only.
- Do not point `DATABASE_URL` at the live production database.
- Confirm the drill creates and drops only sandbox schemas.
- Confirm full schema restore, tenant-scoped restore, point-in-time restore, checksum rejection, and tenant digest comparison pass.
- Confirm file-object metadata remains tenant scoped after restore.

## Evidence Checklist

- Git SHA or deployment version.
- `production-backup-restore.txt` artifact link.
- DR database target, without credentials.
- RTO and RPO test results.
- Tenant digest comparison result.
- Follow-up owner for every failure.
