# Backup and Restore Drill Runbook

Use this runbook for scheduled disaster-recovery drills, backup artifact verification, and pre-launch production-readiness checks. The drill validates the existing recovery harness without touching production data.

## Scope

- Full schema restore from a backup snapshot.
- Tenant-scoped restore for one corrupted tenant without disturbing other tenants.
- Point-in-time restore using the recovery journal.
- Backup artifact checksum verification through `checksum_sha256`.
- File-object metadata restore for external object storage rows, including tenant-scoped `object_storage_key` and `storage_backend='object'`.
- RTO and RPO measurement for full restore, tenant restore, and point-in-time restore.
- Tenant isolation checks using tenant digests before and after restore.

## Commands

- Run `npm run test:backup-integrity` to verify serialized artifact restore repeatability, checksum failure handling, and tenant-scoped artifact extraction.
- Run `npm run test:disaster-recovery` to verify full schema restore, tenant restore, point-in-time restore, RTO, RPO, and tenant isolation.
- Run `npm run dr:backup-restore` for the combined backup/restore drill before a high-risk release or scheduled recovery review.
- Run `npm run fixture:pilot-school` only against a sandbox target to generate the deterministic pilot-school dataset used by scale checks.
- Run `npm run load:high-volume-workflows` after fixture generation to verify read-safe high-volume paths without mutating production by default.

## Safety

- Run only against sandbox schemas created by the recovery test harness.
- Never restore over production.
- Never point `DATABASE_URL` at the production database for this drill.
- Confirm the test database can create and drop schemas before starting.
- Keep generated backup artifacts in temporary storage unless the drill explicitly needs retention evidence.

## Drill Steps

1. Confirm the test database environment is configured and isolated from production.
2. Run `npm run dr:backup-restore`.
3. If the drill includes scale validation, run `npm run fixture:pilot-school` and `npm run load:high-volume-workflows` against the sandbox schema only.
4. Confirm backup artifact parsing rejects corrupted `checksum_sha256` values before restore mutates a target schema.
5. Confirm full schema restore recreates all expected tenants and matches pre-loss tenant digests.
6. Confirm tenant-scoped restore repairs only the selected tenant and preserves untouched tenant digests.
7. Confirm point-in-time restore replays only journal entries up to the requested timestamp.
8. Confirm restored file-object records still point to tenant-scoped object keys and do not restore object bytes into database-backed `content` columns.
9. Record measured RTO and RPO against current launch targets.
10. Drop all sandbox schemas created during the drill.

## Exams and Retired Modules

Exams data belongs to the active academic recovery scope. When Exams backend persistence becomes part of the recovery harness, include it in full schema, tenant-scoped, and point-in-time restore checks.

Attendance is retired. Do not reintroduce attendance tables, sync records, export artifacts, or production module access as part of a restore drill. If legacy attendance data appears in a backup source, treat it as historical data only and keep it out of active module readiness.

## Evidence

Record:

- Date and operator.
- Git SHA or deployment version.
- Database target name confirming sandbox use.
- Output from `npm run dr:backup-restore`.
- RTO and RPO values.
- Tenant digest comparison result.
- File-object metadata digest and object-storage tenant-prefix check.
- Any restore failure, root cause, and follow-up owner.
