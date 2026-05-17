# Implementation 11 Maintainability & Workflow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining user-facing workflow friction, incomplete operational states, and maintainability risks discovered after the Implementation 10 hardening pass.

**Architecture:** Keep the current monorepo and module boundaries. Add lightweight automated maintainability gates, reuse existing tenant-scoped APIs, and replace internal-ID workflows with operator-friendly lookup components instead of introducing new services.

**Tech Stack:** Next.js App Router, React, NestJS, PostgreSQL RLS, TypeScript, Jest/node:test, existing ShuleHub dashboard proxy routes.

---

## Scan Evidence

Commands run on 2026-05-17:

| Command | Result |
| --- | --- |
| `npm run security:scan` | pass |
| `npm run tenant:isolation:audit` | pass |
| `npm run release:readiness` | pass |
| `npm run web:lint` | pass |
| `npm --prefix apps/web run test:design` | 29 suites / 144 tests passed |
| `npm run web:build` | pass |

The system is not failing its current gates. The remaining risks are maintainability and real-user workflow gaps that the current gates do not catch.

## Findings To Amend

| Severity | Area | Evidence | Risk |
| --- | --- | --- | --- |
| High | Finance/manual payments | `apps/web/src/components/school/school-pages.tsx` asks for `Student UUID` and `Invoice UUID` in invoice and payment forms. | Accountants can post to wrong records or fail the workflow because Kenyan schools work with names/admission numbers, not UUIDs. |
| High | Discipline/counselling | `apps/web/src/components/discipline/discipline-workspace.tsx` asks for `Student record ID`, `Class record ID`, `Academic term ID`, and `Academic year ID`; tables render short UUIDs as the student display. | Discipline is operationally hard to use and can create cases against wrong internal records. |
| Medium | Library scanner UX | `apps/web/src/components/library/library-workspace.tsx` still says `Student ID` / `Scan student ID`. | Conflicts with the practical Kenyan workflow: enter name or admission number, then scan book. |
| Medium | System status truthfulness | `apps/web/src/app/support/status/page.tsx` returns fallback components with `N/A` uptime/latency when the live status API is unavailable. | Public status can feel unfinished and gives operators weak diagnostic evidence. |
| Medium | Maintainability gates | Current release/security gates pass while the above user-hostile internal-ID copy remains. | Regression gates are too narrow and will not stop future UX debt from reappearing. |
| Medium | Generated artifacts | `apps/web/test-results/...` directories appear as untracked files; `.gitignore` does not ignore `apps/web/test-results/`. | Dirty worktrees become hard to review, commit, merge, and reason about. |
| Low | Plan drift | Implementation 10 artifacts mention fallback telemetry and live validation residuals, but no single follow-up gate tracks the practical cleanup. | Future agents may repeat work or optimize the wrong areas. |

## Implementation Principles

- Do not add microservices.
- Do not add new hardware integrations for scanners; browser input remains the scanner interface.
- Do not reintroduce demo credentials, seeded accounts, fake tenants, or fake operational data.
- Prefer existing APIs: `/admissions/students`, `/admissions/students/:id/profile`, `/billing/student-balances`, `/billing/invoices`, and existing Next proxy routes.
- Any new backend query must stay tenant-scoped through the existing request context and RLS.
- Every user-facing workflow must accept human identifiers first: learner name, admission number, phone, receipt code, invoice number, or visible case number.

---

## Phase 1 - Maintainability Regression Gate

### Task 1: Add A Maintainability Scan Script

**Files:**
- Create: `apps/api/src/scripts/maintainability-scan.ts`
- Create: `apps/api/src/scripts/maintainability-scan.test.ts`
- Modify: `package.json`
- Modify: `apps/api/src/scripts/release-readiness-gate.ts`
- Modify: `apps/api/src/scripts/release-readiness-gate.test.ts`

- [ ] **Step 1: Write the failing scan tests**

Add tests that prove the scan fails when production UI asks for internal UUIDs, when public status uses `N/A` as operational telemetry, and when generated Playwright results are not ignored.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { runMaintainabilityScan } from './maintainability-scan';

test('runMaintainabilityScan fails internal UUID copy in production forms', () => {
  const result = runMaintainabilityScan({
    workspaceRoot: process.cwd(),
    sourceOverrides: {
      'apps/web/src/components/school/school-pages.tsx': 'placeholder="Student UUID"',
      'apps/web/src/components/discipline/discipline-workspace.tsx': 'Student record ID',
      'apps/web/src/components/library/library-workspace.tsx': 'Scan student ID',
      'apps/web/src/app/support/status/page.tsx': 'Live status unavailable',
      '.gitignore': 'apps/web/test-results/',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'no-internal-id-copy')?.status, 'fail');
});

test('runMaintainabilityScan passes practical production copy and artifact hygiene', () => {
  const result = runMaintainabilityScan({
    workspaceRoot: process.cwd(),
    sourceOverrides: {
      'apps/web/src/components/school/school-pages.tsx': 'Search learner by name or admission number',
      'apps/web/src/components/discipline/discipline-workspace.tsx': 'Search learner by name or admission number',
      'apps/web/src/components/library/library-workspace.tsx': 'Learner name or admission number',
      'apps/web/src/app/support/status/page.tsx': 'Live status temporarily unavailable',
      '.gitignore': 'apps/web/test-results/',
    },
  });

  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run build
node --test dist/apps/api/src/scripts/maintainability-scan.test.js
```

Expected: FAIL because `maintainability-scan.ts` does not exist.

- [ ] **Step 3: Implement the scan script**

Create `apps/api/src/scripts/maintainability-scan.ts` with a small source-evidence scanner. It should not parse every React tree; keep it simple and auditable.

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type MaintainabilityCheck = {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  details: string[];
};

export type MaintainabilityScanResult = {
  generated_at: string;
  ok: boolean;
  checks: MaintainabilityCheck[];
};

export type MaintainabilityScanOptions = {
  workspaceRoot?: string;
  generatedAt?: string;
  sourceOverrides?: Record<string, string>;
};

const HUMAN_ID_FILES = [
  'apps/web/src/components/school/school-pages.tsx',
  'apps/web/src/components/discipline/discipline-workspace.tsx',
  'apps/web/src/components/library/library-workspace.tsx',
];

const INTERNAL_ID_COPY = /Student UUID|Invoice UUID|Student record ID|Class record ID|Academic term ID|Academic year ID|Scan student ID|Student ID or admission barcode/i;

export function runMaintainabilityScan(options: MaintainabilityScanOptions = {}): MaintainabilityScanResult {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const checks: MaintainabilityCheck[] = [
    checkNoInternalIdCopy(workspaceRoot, options.sourceOverrides),
    checkPublicStatusTruth(workspaceRoot, options.sourceOverrides),
    checkGeneratedArtifactHygiene(workspaceRoot, options.sourceOverrides),
  ];

  return {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    ok: checks.every((check) => check.status === 'pass'),
    checks,
  };
}

function checkNoInternalIdCopy(
  workspaceRoot: string,
  sourceOverrides?: Record<string, string>,
): MaintainabilityCheck {
  const details = HUMAN_ID_FILES.flatMap((file) => {
    const source = readSource(workspaceRoot, file, sourceOverrides);
    return INTERNAL_ID_COPY.test(source)
      ? [`${file} exposes internal record IDs instead of name/admission-number lookup.`]
      : [];
  });

  return buildCheck('no-internal-id-copy', 'Production forms avoid internal UUID copy.', details);
}

function checkPublicStatusTruth(
  workspaceRoot: string,
  sourceOverrides?: Record<string, string>,
): MaintainabilityCheck {
  const file = 'apps/web/src/app/support/status/page.tsx';
  const source = readSource(workspaceRoot, file, sourceOverrides);
  const details = /uptime:\s*["']N\/A["']|latency:\s*["']N\/A["']/.test(source)
    ? [`${file} uses N/A telemetry in the public status fallback.`]
    : [];

  return buildCheck('public-status-truth', 'Public status fallback is explicit and diagnostic.', details);
}

function checkGeneratedArtifactHygiene(
  workspaceRoot: string,
  sourceOverrides?: Record<string, string>,
): MaintainabilityCheck {
  const source = readSource(workspaceRoot, '.gitignore', sourceOverrides);
  const details = source.includes('apps/web/test-results/')
    ? []
    : ['.gitignore must ignore apps/web/test-results/ generated browser artifacts.'];

  return buildCheck('generated-artifact-hygiene', 'Generated browser artifacts are ignored.', details);
}

function buildCheck(id: string, label: string, details: string[]): MaintainabilityCheck {
  return {
    id,
    label,
    status: details.length === 0 ? 'pass' : 'fail',
    details,
  };
}

function readSource(
  workspaceRoot: string,
  relativePath: string,
  sourceOverrides?: Record<string, string>,
): string {
  if (sourceOverrides?.[relativePath] !== undefined) {
    return sourceOverrides[relativePath];
  }

  const absolutePath = join(workspaceRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

export function renderMaintainabilityScanMarkdown(result: MaintainabilityScanResult): string {
  const lines = [
    '# Implementation 11 Maintainability Scan',
    '',
    `Generated at: ${result.generated_at}`,
    '',
    `Status: ${result.ok ? 'pass' : 'fail'}`,
    '',
    '| Check | Status | Details |',
    '| --- | --- | --- |',
  ];

  for (const check of result.checks) {
    lines.push(`| ${check.label} | ${check.status} | ${check.details.join('; ') || 'clear'} |`);
  }

  return `${lines.join('\n')}\n`;
}

export function writeMaintainabilityScanArtifact(result: MaintainabilityScanResult, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderMaintainabilityScanMarkdown(result), 'utf8');
}

if (require.main === module) {
  const result = runMaintainabilityScan();
  const outputPath = join(process.cwd(), 'docs', 'validation', 'implementation11-maintainability-scan.md');
  writeMaintainabilityScanArtifact(result, outputPath);
  console.log(`Maintainability scan artifact written to ${outputPath}`);
  console.log(`Maintainability scan status: ${result.ok ? 'pass' : 'fail'}`);
  if (!result.ok) process.exitCode = 1;
}
```

- [ ] **Step 4: Add npm scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "maintainability:scan": "node -r ts-node/register/transpile-only -r tsconfig-paths/register apps/api/src/scripts/maintainability-scan.ts"
  }
}
```

Also add `dist/apps/api/src/scripts/maintainability-scan.test.js` to the root `test` script after `security-scan.test.js`.

- [ ] **Step 5: Add release-readiness coverage**

In `apps/api/src/scripts/release-readiness-gate.ts`, add `maintainability:scan` to `REQUIRED_NPM_SCRIPTS`, add `maintainability-scan.test.js` to `REQUIRED_DEFAULT_TEST_ARTIFACTS`, and add a check that `docs/validation/implementation11-maintainability-scan.md` is generated by CI.

- [ ] **Step 6: Verify**

Run:

```powershell
npm run build
node --test dist/apps/api/src/scripts/maintainability-scan.test.js dist/apps/api/src/scripts/release-readiness-gate.test.js
npm run maintainability:scan
```

Expected: tests pass once the production copy is fixed in later tasks; before later tasks the scan should fail with exact file paths.

---

## Phase 2 - Shared Human-Friendly Learner Lookup

### Task 2: Build A Reusable Learner Picker

**Files:**
- Create: `apps/web/src/lib/students/student-lookup.ts`
- Create: `apps/web/src/components/common/learner-picker.tsx`
- Create: `apps/web/tests/design/learner-picker.test.tsx`

- [ ] **Step 1: Write the learner lookup client**

Use the existing admissions student directory because it already supports tenant-scoped search by name/admission number.

```ts
export type LearnerLookupItem = {
  id: string;
  admissionNumber: string;
  name: string;
  classLabel?: string | null;
  guardianPhone?: string | null;
};

export async function fetchLearnerLookup(input: {
  tenantSlug: string;
  query: string;
  limit?: number;
}): Promise<LearnerLookupItem[]> {
  const params = new URLSearchParams({
    tenantSlug: input.tenantSlug,
    search: input.query.trim(),
    limit: String(input.limit ?? 10),
  });
  const response = await fetch(`/api/admissions/students?${params.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Learner search is unavailable.');
  }

  const payload = (await response.json()) as Array<{
    id: string;
    admission_number: string;
    first_name: string;
    last_name: string;
    class_name?: string | null;
    stream_name?: string | null;
    primary_guardian_phone?: string | null;
  }>;

  return payload.map((student) => ({
    id: student.id,
    admissionNumber: student.admission_number,
    name: `${student.first_name} ${student.last_name}`.trim(),
    classLabel: [student.class_name, student.stream_name].filter(Boolean).join(' ') || null,
    guardianPhone: student.primary_guardian_phone ?? null,
  }));
}
```

- [ ] **Step 2: Write the picker test**

Test that the component displays name/admission number and never renders the internal UUID as the main label.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearnerPicker } from '@/components/common/learner-picker';

test('LearnerPicker selects a learner by admission number without exposing UUID copy', async () => {
  render(
    <LearnerPicker
      label="Learner"
      tenantSlug="green-valley"
      value={null}
      onChange={jest.fn()}
      fetchLearners={async () => [
        {
          id: '00000000-0000-0000-0000-000000000123',
          admissionNumber: 'ADM-001',
          name: 'Mary Wanjiku',
          classLabel: 'Grade 6 East',
        },
      ]}
    />,
  );

  await userEvent.type(screen.getByLabelText('Learner'), 'Mary');
  expect(await screen.findByText('Mary Wanjiku')).toBeInTheDocument();
  expect(screen.getByText('ADM-001')).toBeInTheDocument();
  expect(screen.queryByText(/Student UUID|record ID/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Implement `LearnerPicker`**

Create a compact, keyboard-friendly combobox using normal input and a result list. Keep it dependency-free.

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { fetchLearnerLookup, type LearnerLookupItem } from '@/lib/students/student-lookup';

type LearnerPickerProps = {
  label: string;
  tenantSlug: string;
  value: LearnerLookupItem | null;
  onChange: (learner: LearnerLookupItem | null) => void;
  fetchLearners?: typeof fetchLearnerLookup;
};

export function LearnerPicker({
  label,
  tenantSlug,
  value,
  onChange,
  fetchLearners = fetchLearnerLookup,
}: LearnerPickerProps) {
  const [query, setQuery] = useState(value ? `${value.name} (${value.admissionNumber})` : '');
  const [results, setResults] = useState<LearnerLookupItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canSearch = useMemo(() => query.trim().length >= 2 && query !== `${value?.name} (${value?.admissionNumber})`, [query, value]);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      fetchLearners({ tenantSlug, query, limit: 8 })
        .then((items) => {
          setResults(items);
          setError(null);
        })
        .catch((lookupError) => {
          setResults([]);
          setError(lookupError instanceof Error ? lookupError.message : 'Learner search failed.');
        });
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [canSearch, fetchLearners, query, tenantSlug]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground" htmlFor={`learner-${label.replace(/\s+/g, '-').toLowerCase()}`}>
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          id={`learner-${label.replace(/\s+/g, '-').toLowerCase()}`}
          className="input-base pl-9"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(null);
          }}
          placeholder="Search name or admission number"
        />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {results.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          {results.map((learner) => (
            <button
              key={learner.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                onChange(learner);
                setQuery(`${learner.name} (${learner.admissionNumber})`);
                setResults([]);
              }}
            >
              <span>
                <span className="block font-medium text-foreground">{learner.name}</span>
                <span className="block text-xs text-muted">{learner.classLabel ?? 'No active class recorded'}</span>
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                {learner.admissionNumber}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm --prefix apps/web run test:design -- learner-picker
npm run web:lint
```

Expected: learner picker test and lint pass.

---

## Phase 3 - Finance Forms Without UUID Entry

### Task 3: Replace Finance UUID Inputs With Search And Select Controls

**Files:**
- Modify: `apps/web/src/components/school/school-pages.tsx`
- Create: `apps/web/tests/design/finance-human-workflows.test.tsx`

- [ ] **Step 1: Write the production-copy regression test**

```tsx
import fs from 'node:fs';
import path from 'node:path';

test('finance forms do not ask school staff for internal UUIDs', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/school/school-pages.tsx'),
    'utf8',
  );

  expect(source).not.toMatch(/Student UUID|Invoice UUID|Student ID<\/span>|Invoice ID<\/span>/);
  expect(source).toMatch(/Search name or admission number|Select invoice/i);
});
```

- [ ] **Step 2: Replace invoice learner input**

In the create-invoice modal, replace `Student ID` input with `LearnerPicker`. Keep `invoiceDraft.studentId` as the backend id after selection.

```tsx
<LearnerPicker
  label="Learner"
  tenantSlug={tenantSlug}
  value={selectedInvoiceLearner}
  onChange={(learner) => {
    setSelectedInvoiceLearner(learner);
    setInvoiceDraft((current) => ({
      ...current,
      studentId: learner?.id ?? '',
      studentName: learner?.name ?? current.studentName,
    }));
    setInvoiceError(null);
  }}
/>
```

- [ ] **Step 3: Replace manual payment learner and invoice inputs**

Use `LearnerPicker` for student selection and a simple searchable invoice select from already-loaded invoice rows. The payment payload must still send backend ids, but the UI must display invoice number, learner name, amount, and balance.

```tsx
<LearnerPicker
  label="Learner or admission number"
  tenantSlug={tenantSlug}
  value={selectedPaymentLearner}
  onChange={(learner) => {
    setSelectedPaymentLearner(learner);
    setPaymentDraft((current) => ({ ...current, student_id: learner?.id ?? '' }));
    setPaymentError(null);
  }}
/>
```

Add an invoice select:

```tsx
<select
  aria-label="Payment invoice"
  className="input-base"
  value={paymentDraft.invoice_id}
  onChange={(event) => setPaymentDraft((current) => ({ ...current, invoice_id: event.target.value }))}
>
  <option value="">Match automatically or select invoice</option>
  {invoices
    .filter((invoice) => !selectedPaymentLearner || invoice.student_id === selectedPaymentLearner.id)
    .map((invoice) => (
      <option key={invoice.id} value={invoice.id}>
        {invoice.invoice_number} - {invoice.student_name ?? invoice.student_id} - {formatCurrency(invoice.balance_minor)}
      </option>
    ))}
</select>
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm --prefix apps/web run test:design -- finance-human-workflows
npm --prefix apps/web run test:design
npm run web:build
```

Expected: no finance UI source contains `Student UUID` or `Invoice UUID`; all design tests and build pass.

---

## Phase 4 - Discipline And Counselling Operator UX

### Task 4: Replace Discipline Record-ID Forms With Learner Context

**Files:**
- Modify: `apps/web/src/components/discipline/discipline-workspace.tsx`
- Modify: `apps/web/src/lib/discipline/discipline-live.ts`
- Create: `apps/web/tests/design/discipline-human-workflows.test.tsx`

- [ ] **Step 1: Write the copy regression test**

```tsx
import fs from 'node:fs';
import path from 'node:path';

test('discipline workspace avoids internal record-id copy', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/discipline/discipline-workspace.tsx'),
    'utf8',
  );

  expect(source).not.toMatch(/Student record ID|Class record ID|Academic term ID|Academic year ID/);
  expect(source).not.toMatch(/student_id\.slice\(0,\s*8\)/);
  expect(source).toMatch(/Search learner by name or admission number/i);
});
```

- [ ] **Step 2: Use `LearnerPicker` in incident creation**

Replace the four raw record-id inputs with a learner selector and a context panel. The selector fills `incidentForm.student_id`. Keep class/term/year backend values in hidden state only after they have been resolved.

```tsx
<LearnerPicker
  label="Search learner by name or admission number"
  tenantSlug={normalizedTenantSlug}
  value={selectedIncidentLearner}
  onChange={(learner) => {
    setSelectedIncidentLearner(learner);
    setIncidentForm((current) => ({
      ...current,
      student_id: learner?.id ?? '',
    }));
  }}
/>
```

- [ ] **Step 3: Add a learner context resolver**

In `apps/web/src/lib/discipline/discipline-live.ts`, add a helper that loads `/api/admissions/students/:studentId/profile` and maps visible labels for the discipline form.

```ts
export async function fetchLearnerDisciplineContext(
  tenantSlug: string,
  studentId: string,
): Promise<{
  student_id: string;
  learner_label: string;
  admission_number: string;
  class_label: string | null;
  academic_year_label: string | null;
}> {
  const response = await fetch(
    `/api/admissions/students/${encodeURIComponent(studentId)}/profile?tenantSlug=${encodeURIComponent(tenantSlug)}`,
    { credentials: 'same-origin', cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error('Learner context could not be loaded.');
  }

  const payload = await response.json();
  const student = payload.student;
  const enrollment = payload.academic_enrollment ?? null;

  return {
    student_id: student.id,
    learner_label: `${student.first_name} ${student.last_name}`.trim(),
    admission_number: student.admission_number,
    class_label: enrollment ? `${enrollment.class_name} ${enrollment.stream_name}` : null,
    academic_year_label: enrollment?.academic_year ?? null,
  };
}
```

- [ ] **Step 4: Keep unresolved class/term/year honest**

If discipline still needs UUID `class_id`, `academic_term_id`, and `academic_year_id` before a proper academic calendar selector exists, display a blocking notice:

```tsx
<Notice tone="warning">
  Select the learner's active class and term before creating this case. Discipline records cannot be saved against unknown academic context.
</Notice>
```

Do not ask users to type UUIDs. Either auto-resolve the ids from a real endpoint or disable submit until a real selector is available.

- [ ] **Step 5: Render learner labels in incident tables**

Use row metadata or resolved context to show learner name/admission number. If unavailable, display `Learner not resolved` and keep the case open for data cleanup rather than showing a UUID slice.

- [ ] **Step 6: Verify**

Run:

```powershell
npm --prefix apps/web run test:design -- discipline-human-workflows
npm --prefix apps/web run test:design
npm run web:build
```

Expected: discipline UI no longer exposes record-id copy, and build passes.

---

## Phase 5 - Library Scanner Copy Alignment

### Task 5: Align Library Scanner With Kenyan School Workflow

**Files:**
- Modify: `apps/web/src/components/library/library-workspace.tsx`
- Modify: `apps/web/tests/design/production-copy.test.ts`

- [ ] **Step 1: Change scanner copy**

Replace:

```tsx
description="Scan the student ID, scan the book QR/barcode, and the system issues the copy through the live library API."
```

with:

```tsx
description="Enter the learner name or admission number, scan the book QR/barcode, and the system issues the copy through the live library API."
```

Replace `Student ID or admission barcode` with `Learner name or admission number`.

Replace `placeholder="Scan student ID"` with `placeholder="Type name or admission number"`.

- [ ] **Step 2: Preserve scanner behavior**

Do not change the book scanner input or the backend scan endpoint contract in this task. The scanner remains a keyboard-emulating input device.

- [ ] **Step 3: Verify**

Run:

```powershell
npm --prefix apps/web run test:design -- production-copy
```

Expected: test passes and no source line says `Scan student ID`.

---

## Phase 6 - Truthful Public Status Fallback

### Task 6: Replace `N/A` Operational Telemetry With Explicit Unavailable State

**Files:**
- Modify: `apps/web/src/app/support/status/page.tsx`
- Create or modify: `apps/web/tests/design/public-status.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import fs from 'node:fs';
import path from 'node:path';

test('public status fallback does not present N/A metrics as service telemetry', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/app/support/status/page.tsx'), 'utf8');

  expect(source).not.toMatch(/uptime:\s*["']N\/A["']/);
  expect(source).not.toMatch(/latency:\s*["']N\/A["']/);
  expect(source).toMatch(/Live status temporarily unavailable|Status feed unavailable/i);
});
```

- [ ] **Step 2: Change `emptyStatus`**

Use explicit status labels:

```ts
function emptyStatus(unavailable: boolean): PublicStatusView {
  return {
    components: [
      {
        id: 'status-api',
        name: 'Status feed',
        status: unavailable ? 'Live status temporarily unavailable' : 'Operational',
        uptime: unavailable ? 'Checking' : 'Tracked',
        latency: unavailable ? 'Checking' : 'Tracked',
        tone: unavailable ? 'warning' : 'ok',
      },
    ],
    incidents: [],
    historicalIncidents: [],
    generatedAt: formatGeneratedAt(new Date().toISOString()),
    unavailable,
  };
}
```

- [ ] **Step 3: Verify**

Run:

```powershell
npm --prefix apps/web run test:design -- public-status
npm run web:build
```

Expected: public status build succeeds and no fallback component displays `N/A` telemetry.

---

## Phase 7 - Generated Artifact Hygiene

### Task 7: Keep Test Artifacts Out Of Reviews

**Files:**
- Modify: `.gitignore`
- Modify: `apps/api/src/scripts/maintainability-scan.ts`

- [ ] **Step 1: Ignore generated browser artifacts**

Add:

```gitignore
apps/web/test-results/
apps/web/playwright-report/
```

- [ ] **Step 2: Remove generated folders from the working tree after review**

Before removal, list the generated folders:

```powershell
Get-ChildItem -LiteralPath 'apps/web/test-results' -Force
```

Then remove only generated Playwright output:

```powershell
Remove-Item -LiteralPath 'apps/web/test-results' -Recurse -Force
```

Do not remove committed source files or screenshots outside `apps/web/test-results/`.

- [ ] **Step 3: Verify**

Run:

```powershell
git status --short
npm run maintainability:scan
```

Expected: generated `apps/web/test-results/...` directories do not appear as untracked files.

---

## Phase 8 - CI And Documentation

### Task 8: Add Implementation 11 To CI And Docs

**Files:**
- Modify: `.github/workflows/production-operability.yml`
- Modify: `.github/workflows/security-audit.yml`
- Modify: `docs/runbooks/production-monitoring.md`
- Create: `docs/validation/implementation11-maintainability-scan.md` through the scan script

- [ ] **Step 1: Add maintainability scan to CI**

Add this command after security and tenant isolation checks:

```yaml
- name: Maintainability scan
  run: npm run maintainability:scan
```

- [ ] **Step 2: Document the new gate**

Add to `docs/runbooks/production-monitoring.md`:

```md
## Maintainability Gate

Run `npm run maintainability:scan` before every production deployment. The gate blocks internal UUID copy in school workflows, public status fallback telemetry that looks unfinished, and generated browser artifacts in review scope.
```

- [ ] **Step 3: Verify full release posture**

Run:

```powershell
npm run build
npm run web:lint
npm --prefix apps/web run test:design
npm run maintainability:scan
npm run security:scan
npm run tenant:isolation:audit
npm run release:readiness
npm run web:build
npm run test
```

Expected:

- Backend tests pass.
- Web lint/design/build pass.
- Maintainability scan passes.
- Security scan passes.
- Tenant isolation audit passes.
- Release readiness passes.

---

## Final Acceptance Criteria

- No production UI asks staff to type `Student UUID`, `Invoice UUID`, `Student record ID`, `Class record ID`, `Academic term ID`, or `Academic year ID`.
- Library issuing copy says learner name/admission number, not student ID scanning.
- Finance manual payment and invoice workflows use human search/select controls and still submit backend IDs safely.
- Discipline creation uses learner search and blocks submission until academic context is resolved through real selectors or real backend context.
- Public status fallback is honest and diagnostic, not `N/A`.
- Generated browser test artifacts are ignored and absent from review noise.
- `npm run maintainability:scan` exists and is included in release readiness/CI.
- All existing security, tenant isolation, build, lint, design, and backend tests remain green.

## Recommended Execution Order

1. Task 7 first if the worktree is too noisy to review.
2. Task 1 next so the gate catches the remaining issues.
3. Task 2 once, then reuse it in finance and discipline.
4. Task 3 and Task 4 as separate commits because they touch large UI surfaces.
5. Task 5 and Task 6 as small copy/operability commits.
6. Task 8 last to wire the new gate into CI once it passes locally.

## Commit Plan

1. `chore: add maintainability scan gate`
2. `feat: add learner lookup picker`
3. `fix: replace finance uuid entry workflows`
4. `fix: simplify discipline learner selection`
5. `fix: align library scanner copy`
6. `fix: make public status fallback truthful`
7. `chore: ignore generated browser artifacts`
8. `ci: enforce implementation 11 maintainability gate`
