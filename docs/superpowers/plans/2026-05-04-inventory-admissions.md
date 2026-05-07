# Inventory And Admissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operational Inventory and Admissions modules with real backend persistence, new ERP roles, reusable enterprise UI, and realistic school workflows.

**Architecture:** Extend the existing role-based Next.js dashboard with two dedicated module families and add matching NestJS backend modules that follow the repo's schema-service, repository, service, and controller conventions. Use tenant-scoped Postgres tables, permission-gated endpoints, local file storage for admissions documents, and frontend stateful mock workflows shaped to the backend contracts.

**Tech Stack:** Next.js App Router, React 19, Tailwind 4, React Query, NestJS 11, PostgreSQL, class-validator, local filesystem upload storage

---

### Task 1: Expand roles, permissions, and shell registration

**Files:**
- Modify: `apps/api/src/auth/auth.constants.ts`
- Modify: `apps/api/src/seeders/user.seeder.ts`
- Modify: `apps/api/src/seeders/factories/user.factory.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/web/src/lib/dashboard/types.ts`
- Modify: `apps/web/src/lib/dashboard/role-config.ts`
- Test: `apps/web/tests/design/role.test.tsx`

- [ ] Add new permission keys and seeded role definitions for `storekeeper` and `admissions`.
- [ ] Register `InventoryModule` and `AdmissionsModule` in the Nest app module.
- [ ] Extend frontend dashboard role unions, role labels, module access, quick actions, and capabilities.
- [ ] Add seeded demo users for the new roles.
- [ ] Update role-oriented frontend tests so new role navigation and controls are covered.

### Task 2: Build inventory backend schema and service layer

**Files:**
- Create: `apps/api/src/modules/inventory/inventory.module.ts`
- Create: `apps/api/src/modules/inventory/inventory-schema.service.ts`
- Create: `apps/api/src/modules/inventory/inventory.controller.ts`
- Create: `apps/api/src/modules/inventory/inventory.service.ts`
- Create: `apps/api/src/modules/inventory/repositories/inventory.repository.ts`
- Create: `apps/api/src/modules/inventory/dto/*.ts`
- Create: `apps/api/src/modules/inventory/inventory.test.ts`

- [ ] Bootstrap inventory tables for categories, suppliers, items, movements, requests, purchase orders, transfers, and incidents.
- [ ] Add repository queries for inventory list and summary reads plus core write actions.
- [ ] Implement item creation, item update, stock adjustment, PO lifecycle, request lifecycle, transfer logging, and incident logging.
- [ ] Expose permission-gated inventory endpoints.
- [ ] Add unit tests for stock adjustment and purchase-order receiving logic.

### Task 3: Build admissions backend schema, uploads, and registration flow

**Files:**
- Create: `apps/api/src/modules/admissions/admissions.module.ts`
- Create: `apps/api/src/modules/admissions/admissions-schema.service.ts`
- Create: `apps/api/src/modules/admissions/admissions.controller.ts`
- Create: `apps/api/src/modules/admissions/admissions.service.ts`
- Create: `apps/api/src/modules/admissions/repositories/admissions.repository.ts`
- Create: `apps/api/src/modules/admissions/storage/local-document-storage.service.ts`
- Create: `apps/api/src/modules/admissions/dto/*.ts`
- Create: `apps/api/src/modules/admissions/admissions.test.ts`

- [ ] Bootstrap admissions application, document, allocation, and transfer tables.
- [ ] Implement local tenant-scoped file storage for uploaded documents.
- [ ] Add application create/list/update flows.
- [ ] Implement registration flow that creates a student record from an approved application.
- [ ] Aggregate directory and student profile responses from students plus admissions tables.
- [ ] Add unit tests for application registration and document metadata persistence.

### Task 4: Add shared enterprise frontend module components

**Files:**
- Create: `apps/web/src/components/modules/shared/module-shell.tsx`
- Create: `apps/web/src/components/modules/shared/ops-table.tsx`
- Create: `apps/web/src/components/modules/shared/form-section.tsx`
- Create: `apps/web/src/components/modules/shared/stat-strip.tsx`
- Create: `apps/web/src/components/modules/shared/workflow-card.tsx`
- Test: `apps/web/tests/design/interaction.test.tsx`

- [ ] Build reusable module shell and internal section navigation.
- [ ] Build an operations table with search, filters, sort, pagination, export, and empty states.
- [ ] Build reusable dense KPI strips and form section wrappers.
- [ ] Keep these components aligned to the current dashboard visual system.

### Task 5: Implement inventory frontend workflows

**Files:**
- Create: `apps/web/src/lib/modules/inventory-data.ts`
- Create: `apps/web/src/components/modules/inventory/inventory-dashboard-home.tsx`
- Create: `apps/web/src/components/modules/inventory/inventory-module-screen.tsx`
- Modify: `apps/web/src/components/dashboard/erp-pages.tsx`
- Modify: `apps/web/src/components/dashboard/dashboard-view.tsx`
- Modify: `apps/web/src/components/dashboard/module-view.tsx`
- Modify: `apps/web/src/lib/dashboard/mock-data.ts`
- Test: `apps/web/tests/design/layout.test.tsx`
- Test: `apps/web/tests/design/role.test.tsx`

- [ ] Create realistic inventory mock datasets for operational tables and alerts.
- [ ] Add a meaningful storekeeper dashboard home.
- [ ] Implement internal inventory sections:
  - dashboard
  - items
  - categories
  - stock movement
  - suppliers
  - purchase orders
  - requests
  - transfers
  - damages/losses
  - reports
- [ ] Add add-item, edit-item, and stock-adjust modals with validation messaging.
- [ ] Ensure low-stock and out-of-stock highlighting is visually obvious and finance-aware.

### Task 6: Implement admissions frontend workflows

**Files:**
- Create: `apps/web/src/lib/modules/admissions-data.ts`
- Create: `apps/web/src/components/modules/admissions/admissions-dashboard-home.tsx`
- Create: `apps/web/src/components/modules/admissions/admissions-module-screen.tsx`
- Modify: `apps/web/src/components/dashboard/erp-pages.tsx`
- Modify: `apps/web/src/lib/dashboard/mock-data.ts`
- Modify: `apps/web/src/components/dashboard/topbar.tsx`
- Modify: `apps/web/src/components/dashboard/dashboard-layout.tsx`
- Test: `apps/web/tests/design/interaction.test.tsx`
- Test: `apps/web/tests/design/role.test.tsx`

- [ ] Create realistic admissions and student registration datasets.
- [ ] Add a dedicated admissions dashboard home.
- [ ] Implement internal admissions sections:
  - dashboard
  - applications
  - new registration
  - student directory
  - parent information
  - documents
  - class allocation
  - transfers
  - reports
- [ ] Add instant global student search for name, admission number, and parent phone.
- [ ] Build student profile tabs and registration validation states.

### Task 7: Verification

**Files:**
- Test: `apps/api/src/modules/inventory/inventory.test.ts`
- Test: `apps/api/src/modules/admissions/admissions.test.ts`
- Test: `apps/web/tests/design/*.tsx`

- [ ] Run focused API unit tests for the new modules.
- [ ] Run focused web design tests that cover new roles and workflows.
- [ ] Run lint or targeted validation commands for touched frontend code if available.
- [ ] Fix any regressions before closing out.
