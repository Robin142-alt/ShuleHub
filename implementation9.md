# IMPLEMENTATION 9 - Enterprise Discipline and Counselling Module Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Keep commits small, run tests after each vertical slice, and preserve existing multi-tenant, RBAC, notification, reporting, and upload patterns.

**Goal:** Build a production-grade Discipline and Counselling Management module inside the existing ShuleHub ERP so schools can securely manage incidents, disciplinary actions, counselling referrals, parent acknowledgements, behavior scoring, documents, analytics, and student discipline history.

**Architecture:** Add a focused NestJS `DisciplineModule` with tenant-scoped PostgreSQL tables, forced RLS, repository/service/controller layers, encrypted counselling notes, event/audit integration, and report/export support. Add a Next.js school workspace, parent portal view, student profile discipline section, and API proxy routes that reuse the existing session, CSRF, upload, and design patterns. Treat `tenant_id` as the database workspace isolation key; expose `workspace_id` in product copy only when useful, and always bind records to `tenant_id`, `school_id`, `student_id`, `class_id`, `academic_term_id`, `academic_year_id`, and `reporting_staff_id` where the workflow requires them.

**Tech Stack:** NestJS, Next.js App Router, TypeScript, PostgreSQL with RLS, existing request context, existing RBAC guards, existing upload storage, existing notification/SMS infrastructure, existing report artifacts, TailwindCSS, current web component conventions.

**Primary Outcomes:**

- Teachers can report incidents, add remarks, upload evidence, and recommend action for assigned students/classes.
- Discipline masters/deans can manage incident workflows, actions, escalations, parent meetings, offence settings, and reports.
- School counsellors control counselling sessions, encrypted notes, improvement plans, follow-ups, and referral outcomes.
- Principals and school admins approve serious actions, audit history, and review analytics.
- Parents see respectful, permitted discipline history and acknowledgements for their linked children only.
- Positive behavior and commendations affect behavior scores alongside misconduct.
- All sensitive records are tenant-safe, permission-safe, audited, encrypted where needed, and exportable only by authorized users.

**Non-Goals:**

- Do not rebuild the ERP shell or auth system.
- Do not create a separate counselling app.
- Do not expose confidential counselling notes to parents or unauthorized staff.
- Do not create playful/gamified visuals.
- Do not remove existing support, finance, library, parent portal, or student features.

---

# 1. Current System Fit

The existing repo already provides the pieces this module should reuse:

- API modules under `apps/api/src/modules/*` with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*-schema.service.ts`, repositories, DTOs, and tests.
- Tenant-aware request context, PostgreSQL RLS, and runtime role handling.
- RBAC guards and route permission coverage tests.
- Event/audit infrastructure under `apps/api/src/modules/events`.
- Upload/storage patterns used by support and library.
- Next.js route proxies under `apps/web/src/app/api/*/[...path]/route.ts`.
- School workspace pages under `apps/web/src/app/school/[role]/[section]/page.tsx`.
- Parent portal pages under `apps/web/src/app/portal/[viewer]/[section]/page.tsx`.
- Student profile route under `apps/web/src/app/school/[role]/students/[studentId]/page.tsx`.

Implementation 9 should follow these patterns instead of introducing a new framework or parallel permission model.

---

# 2. Domain Model Decisions

## 2.1 Tenant and School Identity

Use these mappings consistently:

- `tenant_id`: existing workspace isolation key used by RLS and request context.
- `school_id`: school profile identifier from onboarding/platform records.
- `workspace_id`: product-facing label only; do not add a second isolation key unless the existing schema already exposes it as an alias.

Every discipline operational row must include:

- `tenant_id`
- `school_id`
- `student_id`
- `class_id`
- `academic_term_id`
- `academic_year_id`
- `reporting_staff_id` where a staff member originates the record
- `created_at`
- `updated_at` where mutable

## 2.2 Confidentiality Levels

Use these note visibility values:

- `internal_only`: counsellor/private staff visibility only.
- `discipline_office`: counsellor plus discipline office, dean, principal, school admin.
- `parent_visible`: visible to linked parents after permission checks.

Counselling note bodies must be encrypted at rest. Store a searchable summary only when the counsellor explicitly marks it parent-visible or discipline-office visible, and never store raw confidential note content in audit logs.

## 2.3 Severity Levels

Use a simple configurable severity ladder:

- `low`
- `medium`
- `high`
- `critical`

Critical incidents require high-visibility dashboard treatment, principal/admin review, and optional immediate parent notification based on school template settings.

## 2.4 Incident Statuses

Use the requested workflow statuses as database enum-like text with check constraints:

- `reported`
- `under_review`
- `pending_action`
- `awaiting_parent_response`
- `counselling_assigned`
- `escalated`
- `suspended`
- `resolved`
- `closed`

## 2.5 Disciplinary Actions

Action types:

- `verbal_warning`
- `written_warning`
- `detention`
- `manual_work`
- `counselling`
- `suspension`
- `expulsion`
- `parent_meeting`
- `behavior_contract`

Suspension and expulsion require principal or school admin approval. Expulsion should remain a controlled workflow even if the first release only records approval and document generation.

---

# 3. Database Schema Plan

Create `apps/api/src/modules/discipline/discipline-schema.service.ts`.

Use one idempotent schema bootstrap block with:

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for upgrade safety
- check constraints
- indexes
- forced RLS
- tenant policies
- immutable audit triggers where appropriate

## 3.1 Tables

Create these tables:

- `offense_categories`
- `discipline_incidents`
- `discipline_actions`
- `discipline_comments`
- `discipline_attachments`
- `discipline_audit_logs`
- `discipline_notifications`
- `behavior_points`
- `commendations`
- `parent_acknowledgements`
- `counselling_referrals`
- `counselling_sessions`
- `counselling_notes`
- `behavior_improvement_plans`
- `behavior_improvement_plan_steps`
- `discipline_document_templates`
- `discipline_generated_documents`

## 3.2 Core DDL Shape

Use this as the schema direction, adapted to the existing schema helper style:

```sql
CREATE TABLE IF NOT EXISTS offense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  default_severity text NOT NULL DEFAULT 'medium',
  default_points integer NOT NULL DEFAULT 0,
  default_action_type text,
  notify_parent_by_default boolean NOT NULL DEFAULT false,
  escalation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_positive boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_offense_categories_tenant_code UNIQUE (tenant_id, code),
  CONSTRAINT ck_offense_categories_severity CHECK (default_severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ck_offense_categories_name CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS discipline_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  class_id uuid NOT NULL,
  academic_term_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  offense_category_id uuid NOT NULL,
  reporting_staff_id uuid NOT NULL,
  assigned_staff_id uuid,
  incident_number text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'reported',
  occurred_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  location text,
  witnesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NOT NULL,
  action_taken text,
  recommendations text,
  linked_counselling_referral_id uuid,
  behavior_points_delta integer NOT NULL DEFAULT 0,
  parent_notification_status text NOT NULL DEFAULT 'not_required',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_discipline_incidents_tenant_number UNIQUE (tenant_id, incident_number),
  CONSTRAINT ck_discipline_incidents_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ck_discipline_incidents_status CHECK (
    status IN (
      'reported',
      'under_review',
      'pending_action',
      'awaiting_parent_response',
      'counselling_assigned',
      'escalated',
      'suspended',
      'resolved',
      'closed'
    )
  ),
  CONSTRAINT ck_discipline_incidents_title CHECK (btrim(title) <> ''),
  CONSTRAINT ck_discipline_incidents_description CHECK (btrim(description) <> '')
);

CREATE TABLE IF NOT EXISTS counselling_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  counselling_session_id uuid NOT NULL,
  counsellor_user_id uuid NOT NULL,
  visibility text NOT NULL DEFAULT 'internal_only',
  encrypted_note text NOT NULL,
  note_nonce text NOT NULL,
  note_auth_tag text NOT NULL,
  safe_summary text,
  risk_indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_counselling_notes_visibility CHECK (
    visibility IN ('internal_only', 'discipline_office', 'parent_visible')
  )
);
```

## 3.3 Required Indexes

Add indexes for the actual read paths:

```sql
CREATE INDEX IF NOT EXISTS ix_discipline_incidents_tenant_status
  ON discipline_incidents (tenant_id, status, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_discipline_incidents_student_term
  ON discipline_incidents (tenant_id, student_id, academic_year_id, academic_term_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_discipline_incidents_class_severity
  ON discipline_incidents (tenant_id, class_id, severity, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_discipline_actions_incident_due
  ON discipline_actions (tenant_id, incident_id, due_at ASC, status);

CREATE INDEX IF NOT EXISTS ix_counselling_sessions_counsellor_schedule
  ON counselling_sessions (tenant_id, counsellor_user_id, scheduled_for ASC, status);

CREATE INDEX IF NOT EXISTS ix_behavior_points_student_term
  ON behavior_points (tenant_id, student_id, academic_year_id, academic_term_id, awarded_at DESC);

CREATE INDEX IF NOT EXISTS ix_parent_acknowledgements_incident
  ON parent_acknowledgements (tenant_id, incident_id, parent_user_id);
```

## 3.4 RLS Policy Pattern

Every discipline table must enable and force RLS:

```sql
ALTER TABLE discipline_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE discipline_incidents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discipline_incidents_tenant_policy ON discipline_incidents;
CREATE POLICY discipline_incidents_tenant_policy ON discipline_incidents
FOR ALL
USING (
  tenant_id = current_setting('app.tenant_id', true)
  OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
)
WITH CHECK (
  tenant_id = current_setting('app.tenant_id', true)
  OR current_setting('app.role', true) IN ('platform_owner', 'superadmin', 'system')
);
```

Counselling note filtering must also happen in service/repository logic because RLS protects tenant boundaries, while note visibility protects role-level confidentiality inside a school.

---

# 4. Backend File Structure

Create a new backend module:

- Create: `apps/api/src/modules/discipline/discipline.module.ts`
- Create: `apps/api/src/modules/discipline/discipline-schema.service.ts`
- Create: `apps/api/src/modules/discipline/discipline.controller.ts`
- Create: `apps/api/src/modules/discipline/counselling.controller.ts`
- Create: `apps/api/src/modules/discipline/discipline.service.ts`
- Create: `apps/api/src/modules/discipline/counselling.service.ts`
- Create: `apps/api/src/modules/discipline/behavior-points.service.ts`
- Create: `apps/api/src/modules/discipline/discipline-document.service.ts`
- Create: `apps/api/src/modules/discipline/discipline-notification.service.ts`
- Create: `apps/api/src/modules/discipline/repositories/discipline.repository.ts`
- Create: `apps/api/src/modules/discipline/repositories/counselling.repository.ts`
- Create: `apps/api/src/modules/discipline/repositories/behavior-points.repository.ts`
- Create: `apps/api/src/modules/discipline/storage/discipline-attachment-storage.service.ts`
- Create: `apps/api/src/modules/discipline/dto/discipline.dto.ts`
- Create: `apps/api/src/modules/discipline/dto/counselling.dto.ts`
- Create: `apps/api/src/modules/discipline/dto/discipline-report.dto.ts`
- Create: `apps/api/src/modules/discipline/entities/discipline.entity.ts`
- Create: `apps/api/src/modules/discipline/discipline.test.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app-route-permissions.test.ts` if new controllers require route metadata updates.
- Modify: existing RBAC/permission catalog files if the repo centralizes permission keys.

---

# 5. Backend API Endpoint Plan

Use `/discipline` for school staff workflows and `/counselling` for counsellor-specific workflows. Keep parent-facing reads under `/discipline/parent`.

## 5.1 Incidents

- `GET /discipline/incidents`
  - Filters: `status`, `severity`, `studentId`, `classId`, `offenseCategoryId`, `termId`, `yearId`, `from`, `to`, `q`, `page`, `pageSize`.
  - Roles: teacher scoped to assigned classes/students, discipline master, counsellor where referred, principal, school admin.

- `POST /discipline/incidents`
  - Creates draft or reported incident.
  - Roles: teacher, discipline master, principal, school admin.

- `GET /discipline/incidents/:incidentId`
  - Returns incident detail, timeline, permitted comments, actions, attachments, acknowledgement state, and counselling referral summary.

- `PATCH /discipline/incidents/:incidentId`
  - Updates allowed mutable fields before closure.
  - Roles: discipline master, principal, school admin; teacher only for own draft before submit.

- `POST /discipline/incidents/:incidentId/submit`
  - Converts draft to reported, writes audit, computes initial behavior points, optionally queues parent notification.

- `POST /discipline/incidents/:incidentId/status`
  - Changes status with required reason.
  - Roles: discipline master, principal, school admin.

- `POST /discipline/incidents/:incidentId/assign`
  - Assigns staff owner.

- `POST /discipline/incidents/:incidentId/escalate`
  - Escalates to dean/principal.

- `POST /discipline/incidents/:incidentId/resolve`
  - Marks resolved with resolution notes.

- `POST /discipline/incidents/:incidentId/close`
  - Closes after resolution and parent acknowledgement rules.

## 5.2 Actions and Comments

- `POST /discipline/incidents/:incidentId/actions`
- `PATCH /discipline/actions/:actionId`
- `POST /discipline/actions/:actionId/complete`
- `POST /discipline/actions/:actionId/approve`
- `POST /discipline/incidents/:incidentId/comments`
- `GET /discipline/incidents/:incidentId/audit`

Internal comments must never be returned to parent portal endpoints.

## 5.3 Offense Categories and Templates

- `GET /discipline/offense-categories`
- `POST /discipline/offense-categories`
- `PATCH /discipline/offense-categories/:categoryId`
- `POST /discipline/offense-categories/:categoryId/archive`
- `GET /discipline/notification-templates`
- `PATCH /discipline/notification-templates/:templateId`
- `GET /discipline/document-templates`
- `PATCH /discipline/document-templates/:templateId`

## 5.4 Counselling

- `GET /counselling/dashboard`
- `GET /counselling/referrals`
- `POST /counselling/referrals`
- `POST /counselling/referrals/:referralId/accept`
- `POST /counselling/referrals/:referralId/decline`
- `GET /counselling/sessions`
- `POST /counselling/sessions`
- `GET /counselling/sessions/:sessionId`
- `PATCH /counselling/sessions/:sessionId`
- `POST /counselling/sessions/:sessionId/notes`
- `GET /counselling/sessions/:sessionId/notes`
- `POST /counselling/improvement-plans`
- `PATCH /counselling/improvement-plans/:planId`
- `POST /counselling/improvement-plans/:planId/steps/:stepId/progress`

## 5.5 Positive Discipline

- `POST /discipline/commendations`
- `GET /discipline/commendations`
- `GET /discipline/students/:studentId/behavior-score`
- `GET /discipline/students/:studentId/timeline`

## 5.6 Parent Portal

- `GET /discipline/parent/students/:studentId/summary`
- `GET /discipline/parent/students/:studentId/incidents`
- `POST /discipline/parent/incidents/:incidentId/acknowledge`
- `GET /discipline/parent/documents/:documentId/download`

These endpoints must verify parent-child linkage server-side, not from client state.

## 5.7 Reports

- `GET /discipline/analytics/overview`
- `GET /discipline/analytics/offenses`
- `GET /discipline/analytics/repeat-offenders`
- `GET /discipline/analytics/counselling-effectiveness`
- `POST /discipline/reports/export`
- `GET /discipline/reports/jobs/:jobId`

---

# 6. Frontend Page Structure

Create a discipline workspace and connect it to existing school and parent shells.

## 6.1 School Staff Pages

- Create: `apps/web/src/app/school/[role]/discipline/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/incidents/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/incidents/new/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/incidents/[incidentId]/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/counselling/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/analytics/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/settings/page.tsx`
- Create: `apps/web/src/app/school/[role]/discipline/reports/page.tsx`

If the existing dynamic section router is preferred, implement the same views through:

- Modify: `apps/web/src/app/school/[role]/[section]/page.tsx`
- Modify: `apps/web/src/components/school/school-pages.tsx`

## 6.2 Components

Create:

- `apps/web/src/components/discipline/discipline-workspace.tsx`
- `apps/web/src/components/discipline/discipline-dashboard.tsx`
- `apps/web/src/components/discipline/incident-list.tsx`
- `apps/web/src/components/discipline/create-incident-form.tsx`
- `apps/web/src/components/discipline/incident-detail.tsx`
- `apps/web/src/components/discipline/incident-timeline.tsx`
- `apps/web/src/components/discipline/action-tracker.tsx`
- `apps/web/src/components/discipline/offense-settings.tsx`
- `apps/web/src/components/discipline/counselling-center.tsx`
- `apps/web/src/components/discipline/counselling-session-panel.tsx`
- `apps/web/src/components/discipline/improvement-plan-panel.tsx`
- `apps/web/src/components/discipline/behavior-score-card.tsx`
- `apps/web/src/components/discipline/discipline-analytics.tsx`
- `apps/web/src/components/discipline/parent-discipline-view.tsx`
- `apps/web/src/components/discipline/student-discipline-profile.tsx`
- `apps/web/src/components/discipline/discipline-reporting.tsx`

## 6.3 API Proxy Route

Create:

- `apps/web/src/app/api/discipline/[...path]/route.ts`
- `apps/web/src/app/api/counselling/[...path]/route.ts`

Use the existing CSRF and server auth proxy pattern from billing/support/integrations routes.

## 6.4 Shell Navigation

Modify:

- `apps/web/src/components/school/erp-shell.tsx`
- `apps/web/src/components/layouts/school-shell.tsx`
- `apps/web/src/components/portal/portal-shell.tsx`
- `apps/web/src/components/portal/portal-pages.tsx`

Add sidebar entries:

School staff:

```text
Discipline
  - Dashboard
  - Incidents
  - New Incident
  - Counselling
  - Analytics
  - Reports
  - Settings
```

Parent portal:

```text
Discipline
  - Behavior Summary
  - Notices
  - Acknowledgements
  - Commendations
```

## 6.5 Student Profile Integration

Modify:

- `apps/web/src/app/school/[role]/students/[studentId]/page.tsx`
- `apps/web/src/components/school/school-pages.tsx`

Add a `Discipline` tab/section showing:

- behavior score trend
- incident history
- warnings/actions
- commendations
- parent acknowledgements
- permitted counselling summaries
- suspension history

---

# 7. RBAC and Permissions

Add permission keys using the existing permission catalog pattern.

Required permissions:

- `discipline.incidents.create`
- `discipline.incidents.read.assigned`
- `discipline.incidents.read.all`
- `discipline.incidents.update`
- `discipline.incidents.delete.soft`
- `discipline.actions.create`
- `discipline.actions.approve`
- `discipline.actions.complete`
- `discipline.comments.create`
- `discipline.comments.internal`
- `discipline.settings.manage`
- `discipline.analytics.read`
- `discipline.reports.export`
- `discipline.documents.generate`
- `discipline.parent.read`
- `discipline.parent.acknowledge`
- `counselling.dashboard.read`
- `counselling.referrals.manage`
- `counselling.sessions.manage`
- `counselling.notes.read.private`
- `counselling.notes.write`
- `counselling.notes.share.parent`
- `counselling.improvement_plans.manage`

Role mappings:

| Role | Permissions |
| --- | --- |
| Teacher | create incidents, read assigned incidents, add evidence, add public/teacher remarks, recommend actions |
| Discipline Master / Dean | manage incidents, actions, categories, escalations, parent meetings, reports |
| School Counsellor | counselling dashboard, sessions, encrypted notes, improvement plans, referrals |
| Principal / School Admin | approve serious actions, read all, analytics, override permitted workflows |
| Parent | read linked child permitted records, acknowledge notices, download permitted letters |
| Platform Owner / Superadmin | operational audit and support visibility, never casual access to decrypted counselling notes |

Backend services must enforce permissions in addition to controller metadata because teacher assignment and parent-child checks are record-specific.

---

# 8. Security Design

## 8.1 Counselling Note Encryption

Use the existing `SECURITY_PII_ENCRYPTION_KEY` configuration. Add a small service:

- Create: `apps/api/src/modules/discipline/counselling-note-encryption.service.ts`

Required behavior:

- Encrypt note body before insert.
- Store `encrypted_note`, `note_nonce`, and `note_auth_tag`.
- Decrypt only after permission checks.
- Return redacted note metadata when permission is insufficient.
- Never write raw note body to logs, audit rows, notification payloads, or report exports.

## 8.2 Attachments

Use tenant-scoped object paths:

```text
tenant/{tenant_id}/discipline/{incident_id}/attachments/{attachment_id}
tenant/{tenant_id}/counselling/{session_id}/attachments/{attachment_id}
```

Rules:

- Allow images, PDFs, videos, and documents within configured size limits.
- Reuse malware scanning from Implementation 7 where enabled.
- Store metadata in `discipline_attachments`.
- Return signed URLs only to authorized users.
- Parent endpoints only return attachments explicitly marked parent-visible.

## 8.3 Audit Logging

Write immutable audit rows for:

- incident creation
- draft submission
- status changes
- assignment changes
- escalation
- disciplinary action creation
- disciplinary action approval
- disciplinary action completion
- parent notification queued/sent/failed
- parent acknowledgement
- counselling referral creation
- counselling session creation/update
- counselling note visibility change
- document generation
- settings/category changes

Audit rows must include:

- `tenant_id`
- `school_id`
- `actor_user_id`
- `actor_role`
- `action`
- `entity_type`
- `entity_id`
- `ip_address`
- `user_agent`
- `created_at`
- `metadata` without raw confidential notes or raw attachment content

---

# 9. Notification Integration

Use existing SMS/email/in-app notification services. Create `DisciplineNotificationService` to queue messages, not send directly inside incident transactions.

Notification types:

- incident alert
- warning notice
- suspension notice
- parent meeting request
- counselling reminder
- follow-up reminder
- commendation message
- parent acknowledgement reminder

Template variables:

- `student_name`
- `incident_number`
- `offense_name`
- `incident_date`
- `severity`
- `school_name`
- `meeting_time`
- `action_due_date`
- `portal_link`

Tone rules:

- Parent copy must be respectful and non-hostile.
- Avoid accusatory language in SMS.
- Counselling notifications must not reveal private note content.

---

# 10. Reporting and Analytics

Create analytics queries in repository methods, not UI-only calculations.

Dashboards:

- open cases count
- severe incidents count
- pending approvals
- behavior trends
- recent reports
- repeat offender alerts
- counselling referrals by status
- upcoming counselling sessions
- overdue actions

Reports:

- incidents by offense
- incidents by class/stream
- incidents by term
- incidents by severity
- repeat offender report
- suspension report
- teacher reporting statistics
- counselling effectiveness report
- behavior improvement trends
- commendation report

Exports:

- PDF summary
- CSV export
- Excel export
- printable letters and certificates

Standard exports must exclude `internal_only` counselling notes. A counsellor-only export may include decrypted private notes only if explicitly requested and audited.

---

# 11. Document Generation

Create `DisciplineDocumentService` that uses existing report artifact patterns.

Documents:

- warning letter
- suspension letter
- expulsion notice
- counselling referral
- parent summons
- behavior report
- commendation certificate

Each generated document should include:

- school branding
- document number
- student details
- incident/action summary
- approval signature metadata
- QR verification code or signed verification token
- generated_by_user_id
- generated_at

Store generated document metadata in `discipline_generated_documents`. Store file content through the existing report artifact or object storage service.

---

# 12. UX Design Direction

The UI must feel:

- confidential
- operational
- structured
- premium
- calm
- trustworthy

Use:

- compact dashboards
- severity badges
- clean incident cards
- dense tables
- timelines
- audit panels
- neutral professional color palette
- mobile-first forms
- clear empty states
- restrained animations

Avoid:

- childish illustrations
- gamified behavior visuals
- bright punitive styling
- aggressive parent language
- oversized marketing-style sections

---

# 13. Performance and Scale

Design for large schools and many tenants:

- All list endpoints must be paginated.
- Use indexed filters for tenant, status, student, class, term, year, severity, and date range.
- Use summary endpoints for dashboards instead of loading all incidents.
- Use background jobs for notifications and report generation.
- Use cached dashboard summaries only when cache keys include `tenant_id` and role scope.
- Use lazy-loaded detail panels for audit logs, attachments, and notes.
- Avoid fetching counselling private notes in incident list responses.
- Avoid client-side filtering over large incident sets.

Load checks:

- 1000 schools
- 3000 students per large school
- 50,000 incidents in a large tenant
- 500 concurrent incident list reads
- 100 concurrent incident submissions
- 10,000 parent portal notice reads per hour

---

# 14. Implementation Tasks

## Phase 1 - Schema, RBAC, and Module Skeleton

### Task 1: Add Discipline Module Skeleton

**Files:**

- Create: `apps/api/src/modules/discipline/discipline.module.ts`
- Create: `apps/api/src/modules/discipline/discipline-schema.service.ts`
- Create: `apps/api/src/modules/discipline/discipline.controller.ts`
- Create: `apps/api/src/modules/discipline/counselling.controller.ts`
- Create: `apps/api/src/modules/discipline/discipline.service.ts`
- Create: `apps/api/src/modules/discipline/counselling.service.ts`
- Create: `apps/api/src/modules/discipline/repositories/discipline.repository.ts`
- Create: `apps/api/src/modules/discipline/repositories/counselling.repository.ts`
- Create: `apps/api/src/modules/discipline/discipline.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] Write tests asserting the schema service creates the required table names, indexes, RLS policies, and status/severity constraints.
- [ ] Implement the module skeleton with schema bootstrap wired through `onModuleInit`.
- [ ] Import `DisciplineModule` in `apps/api/src/app.module.ts`.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline module schema skeleton`.

### Task 2: Add Permission Metadata

**Files:**

- Modify: the existing route permission catalog files found by `rg "permission|Permissions|Require" apps/api/src`.
- Modify: `apps/api/src/app-route-permissions.test.ts`.
- Test: `apps/api/src/modules/discipline/discipline.test.ts`.

- [ ] Add discipline and counselling permission keys listed in section 7.
- [ ] Add controller route metadata for every new endpoint.
- [ ] Add tests that route permission coverage fails if a discipline route lacks metadata.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline rbac permissions`.

## Phase 2 - Incident Management

### Task 3: Implement Incident DTOs and Validation

**Files:**

- Create: `apps/api/src/modules/discipline/dto/discipline.dto.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add DTOs for create incident, update incident, list query, status change, assignment, escalation, and resolution.
- [ ] Validate required fields: student, class, term, year, offence, severity, occurred time, description, and reporting staff.
- [ ] Reject blank descriptions and invalid statuses.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline incident validation`.

### Task 4: Implement Incident Repository and Service

**Files:**

- Modify: `apps/api/src/modules/discipline/repositories/discipline.repository.ts`
- Modify: `apps/api/src/modules/discipline/discipline.service.ts`
- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Write tests for incident create, list, detail, update, submit, assign, escalate, resolve, and close.
- [ ] Generate readable incident numbers such as `DIS-2026-000145`.
- [ ] Enforce teacher assigned-student/class scope in service methods.
- [ ] Record audit rows for every workflow mutation.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: implement discipline incident workflow`.

### Task 5: Implement Attachments and Evidence

**Files:**

- Create: `apps/api/src/modules/discipline/storage/discipline-attachment-storage.service.ts`
- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Modify: `apps/api/src/modules/discipline/discipline.service.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add incident attachment upload endpoint.
- [ ] Store attachments under tenant-scoped paths.
- [ ] Reuse upload scanning when configured.
- [ ] Return signed URLs only on authorized detail reads.
- [ ] Hide non-parent-visible evidence from parent endpoints.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline evidence uploads`.

## Phase 3 - Offense Categories and Behavior Points

### Task 6: Implement Offense Category Engine

**Files:**

- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Modify: `apps/api/src/modules/discipline/discipline.service.ts`
- Modify: `apps/api/src/modules/discipline/repositories/discipline.repository.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Seed only reference defaults per tenant on first settings access; do not create fake incidents.
- [ ] Allow schools to create, update, deactivate, and map default severity/points/actions.
- [ ] Validate duplicate codes per tenant.
- [ ] Audit category changes.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add configurable offense categories`.

### Task 7: Implement Behavior Points and Commendations

**Files:**

- Create: `apps/api/src/modules/discipline/behavior-points.service.ts`
- Create: `apps/api/src/modules/discipline/repositories/behavior-points.repository.ts`
- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add behavior point ledger writes for incidents and commendations.
- [ ] Support positive and negative points.
- [ ] Add student behavior score summary endpoint.
- [ ] Add repeat-offender and at-risk detection queries.
- [ ] Ensure points are append-only except audited correction entries.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add behavior scoring ledger`.

## Phase 4 - Disciplinary Actions and Approvals

### Task 8: Implement Disciplinary Actions

**Files:**

- Modify: `apps/api/src/modules/discipline/discipline.service.ts`
- Modify: `apps/api/src/modules/discipline/repositories/discipline.repository.ts`
- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add create, update, complete, and list action logic.
- [ ] Enforce due dates and completion status.
- [ ] Require approval for suspension and expulsion.
- [ ] Add printable letter metadata hooks.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add disciplinary action tracking`.

### Task 9: Implement Parent Acknowledgements

**Files:**

- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Modify: `apps/api/src/modules/discipline/discipline.service.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add parent acknowledgement endpoint.
- [ ] Verify parent-child relationship on the server.
- [ ] Store acknowledgement timestamp, device context, IP, and user agent.
- [ ] Move incident status to `awaiting_parent_response` when required.
- [ ] Audit acknowledgement events.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline parent acknowledgements`.

## Phase 5 - Counselling System

### Task 10: Add Counselling Encryption Service

**Files:**

- Create: `apps/api/src/modules/discipline/counselling-note-encryption.service.ts`
- Modify: `apps/api/src/modules/discipline/counselling.service.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Write tests confirming note encryption output does not contain raw note text.
- [ ] Write tests confirming unauthorized users receive redacted notes.
- [ ] Implement AES-GCM encryption using the configured PII encryption key.
- [ ] Ensure logs and audit metadata never include raw note body.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: encrypt counselling notes`.

### Task 11: Implement Counselling Referrals and Sessions

**Files:**

- Modify: `apps/api/src/modules/discipline/counselling.controller.ts`
- Modify: `apps/api/src/modules/discipline/counselling.service.ts`
- Modify: `apps/api/src/modules/discipline/repositories/counselling.repository.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add referral create, accept, decline, and list workflows.
- [ ] Add session schedule, update, history, and follow-up logic.
- [ ] Enforce school counsellor ownership for private notes.
- [ ] Allow discipline office visibility only when note visibility permits it.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add counselling referrals and sessions`.

### Task 12: Implement Improvement Plans

**Files:**

- Modify: `apps/api/src/modules/discipline/counselling.service.ts`
- Modify: `apps/api/src/modules/discipline/repositories/counselling.repository.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Add behavior goals, action steps, review dates, progress scoring, teacher observations, and parent involvement plan fields.
- [ ] Add follow-up reminder events.
- [ ] Add plan progress endpoint.
- [ ] Audit progress changes.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add counselling improvement plans`.

## Phase 6 - Notifications and Documents

### Task 13: Add Discipline Notification Service

**Files:**

- Create: `apps/api/src/modules/discipline/discipline-notification.service.ts`
- Modify: `apps/api/src/modules/discipline/discipline.service.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Queue notifications after incident submission, serious status changes, meetings, reminders, and commendations.
- [ ] Use existing SMS/email/in-app infrastructure.
- [ ] Store notification status in `discipline_notifications`.
- [ ] Avoid sending counselling private note contents.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline notifications`.

### Task 14: Add Document Generation

**Files:**

- Create: `apps/api/src/modules/discipline/discipline-document.service.ts`
- Modify: `apps/api/src/modules/discipline/discipline.controller.ts`
- Test: `apps/api/src/modules/discipline/discipline.test.ts`

- [ ] Generate warning letters, suspension letters, parent summons, counselling referrals, behavior reports, and commendation certificates.
- [ ] Store generated document metadata.
- [ ] Add signed download endpoint.
- [ ] Add QR verification token metadata.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline document generation`.

## Phase 7 - Frontend Integration

### Task 15: Add API Proxy Routes

**Files:**

- Create: `apps/web/src/app/api/discipline/[...path]/route.ts`
- Create: `apps/web/src/app/api/counselling/[...path]/route.ts`

- [ ] Reuse CSRF validation for mutations.
- [ ] Forward auth/session headers using existing server auth client patterns.
- [ ] Preserve backend status codes and sanitized error messages.
- [ ] Run `npm.cmd run web:build`.
- [ ] Commit: `feat: add discipline web api proxies`.

### Task 16: Build Discipline Dashboard and Incident List

**Files:**

- Create: `apps/web/src/components/discipline/discipline-workspace.tsx`
- Create: `apps/web/src/components/discipline/discipline-dashboard.tsx`
- Create: `apps/web/src/components/discipline/incident-list.tsx`
- Modify: `apps/web/src/components/school/erp-shell.tsx`
- Modify: `apps/web/src/components/school/school-pages.tsx`

- [ ] Add dashboard cards for open cases, severe incidents, pending approvals, repeat offender alerts, and behavior trends.
- [ ] Add incident table with search, filters, severity badges, pagination, and export actions.
- [ ] Add responsive mobile layouts.
- [ ] Run `npm.cmd run web:build`.
- [ ] Run `npm.cmd run web:test:design`.
- [ ] Commit: `feat: add discipline dashboard ui`.

### Task 17: Build Create Incident and Detail Views

**Files:**

- Create: `apps/web/src/components/discipline/create-incident-form.tsx`
- Create: `apps/web/src/components/discipline/incident-detail.tsx`
- Create: `apps/web/src/components/discipline/incident-timeline.tsx`
- Create: `apps/web/src/components/discipline/action-tracker.tsx`

- [ ] Add student quick search, offence templates, severity selection, autosave draft, file uploads, and recommendations.
- [ ] Add incident detail timeline, comments, evidence, actions, audit history, and counselling referral panel.
- [ ] Ensure confidential/internal panels are hidden for unauthorized roles.
- [ ] Run `npm.cmd run web:build`.
- [ ] Run `npm.cmd run web:test:design`.
- [ ] Commit: `feat: add discipline incident workflow ui`.

### Task 18: Build Counselling Center UI

**Files:**

- Create: `apps/web/src/components/discipline/counselling-center.tsx`
- Create: `apps/web/src/components/discipline/counselling-session-panel.tsx`
- Create: `apps/web/src/components/discipline/improvement-plan-panel.tsx`

- [ ] Add active referrals, upcoming sessions, high-risk students, follow-ups, and improvement cases.
- [ ] Add encrypted-note UX with visibility selector.
- [ ] Add improvement plan progress interface.
- [ ] Keep private note content out of list cards and browser logs.
- [ ] Run `npm.cmd run web:build`.
- [ ] Run `npm.cmd run web:test:design`.
- [ ] Commit: `feat: add counselling center ui`.

### Task 19: Build Settings, Analytics, Reports, and Student Profile

**Files:**

- Create: `apps/web/src/components/discipline/offense-settings.tsx`
- Create: `apps/web/src/components/discipline/discipline-analytics.tsx`
- Create: `apps/web/src/components/discipline/discipline-reporting.tsx`
- Create: `apps/web/src/components/discipline/student-discipline-profile.tsx`
- Modify: `apps/web/src/app/school/[role]/students/[studentId]/page.tsx`

- [ ] Add offense category settings and behavior point configuration.
- [ ] Add analytics charts and report filters.
- [ ] Add student profile discipline timeline and score trend.
- [ ] Add report export actions.
- [ ] Run `npm.cmd run web:build`.
- [ ] Run `npm.cmd run web:test:design`.
- [ ] Commit: `feat: add discipline analytics and profile ui`.

### Task 20: Build Parent Portal Discipline View

**Files:**

- Create: `apps/web/src/components/discipline/parent-discipline-view.tsx`
- Modify: `apps/web/src/components/portal/portal-pages.tsx`
- Modify: `apps/web/src/components/portal/portal-shell.tsx`

- [ ] Add parent-safe incidents, notices, acknowledgements, commendations, and documents.
- [ ] Use respectful non-hostile copy.
- [ ] Hide staff notes, investigations, private counselling notes, and unrelated students.
- [ ] Optimize for low-end Android phones and mobile data.
- [ ] Run `npm.cmd run web:build`.
- [ ] Run `npm.cmd run web:test:design`.
- [ ] Commit: `feat: add parent discipline portal`.

## Phase 8 - Reports, Load, Security, and Release

### Task 21: Add Report Export Coverage

**Files:**

- Modify: existing report artifact services if extension hooks are needed.
- Create: discipline report tests inside `apps/api/src/modules/discipline/discipline.test.ts`.

- [ ] Add CSV, Excel, and PDF report generation for incident and behavior summaries.
- [ ] Exclude private counselling notes from normal exports.
- [ ] Add audit rows for exports.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `feat: add discipline reports`.

### Task 22: Add Security and Tenant Isolation Tests

**Files:**

- Modify: `apps/api/src/modules/discipline/discipline.test.ts`
- Modify: security/release readiness scripts if they track module coverage.

- [ ] Test School A cannot read School B incidents, actions, counselling sessions, documents, or attachments.
- [ ] Test teacher cannot read unrelated student incidents.
- [ ] Test parent cannot read unrelated child records.
- [ ] Test counsellor private notes are redacted for discipline office unless visibility permits.
- [ ] Test principal approval is required for suspension/expulsion.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `test: add discipline tenant and confidentiality coverage`.

### Task 23: Add Performance Checks

**Files:**

- Modify: `apps/api/src/scripts/core-api-load.test.ts`
- Modify: `apps/api/src/scripts/high-volume-workflow-load.test.ts`
- Modify: `apps/api/src/scripts/query-plan-review.ts`

- [ ] Add protected query plan reviews for incident list, student timeline, behavior score, counselling dashboard, and parent notices.
- [ ] Add synthetic read journeys for school discipline dashboard and parent discipline summary.
- [ ] Add load probes that use monitor/scoped tokens, not human credentials.
- [ ] Run `npm.cmd test`.
- [ ] Commit: `test: add discipline performance gates`.

### Task 24: Final Verification

**Commands:**

```powershell
npm.cmd test
npm.cmd run web:build
npm.cmd run web:test:design
git status --short --branch
```

- [ ] Confirm backend tests pass.
- [ ] Confirm frontend build passes.
- [ ] Confirm design tests pass.
- [ ] Start local web server and verify discipline routes with browser screenshots.
- [ ] Verify no secrets, private notes, OTPs, or credentials appear in logs or UI.
- [ ] Commit final polish: `chore: verify discipline module release readiness`.

---

# 15. Release Checklist

Before production deployment:

- [ ] All new tables have `tenant_id`, timestamps, indexes, and forced RLS.
- [ ] All new endpoints have explicit route permission metadata.
- [ ] All record-level checks are enforced in backend services.
- [ ] Parent endpoints verify linked student access server-side.
- [ ] Counselling notes are encrypted at rest and redacted unless authorized.
- [ ] Attachments use tenant-scoped storage paths and signed URLs.
- [ ] Malware scanning is used when configured.
- [ ] Notifications use templates and never include private note content.
- [ ] Standard exports exclude confidential counselling notes.
- [ ] Document downloads are signed and audited.
- [ ] Incident/action/status changes write audit logs.
- [ ] Dashboards use paginated/summary endpoints, not full dataset loads.
- [ ] Query plan tests cover high-volume read paths.
- [ ] Mobile layouts are checked for parent portal and teacher incident creation.
- [ ] No demo incidents, fake counselling sessions, fake students, or sample behavior records are seeded.

---

# 16. Final Acceptance Criteria

The module is complete when:

- A teacher can create an incident with evidence and see it persist after reload.
- A discipline master can review, assign, escalate, action, and resolve an incident.
- A principal/admin can approve suspension/expulsion actions.
- A counsellor can accept a referral, schedule sessions, write encrypted notes, and create improvement plans.
- A parent can view permitted notices for their linked child and acknowledge them.
- Positive commendations update behavior score positively.
- Student profiles show a discipline timeline and behavior trend.
- Analytics show real tenant data with filters and exports.
- Standard reports exclude confidential notes.
- School A cannot access School B discipline or counselling data.
- Unauthorized users cannot retrieve private notes, internal comments, evidence, or unrelated student records.
- The UI feels serious, premium, and operational on desktop and mobile.
