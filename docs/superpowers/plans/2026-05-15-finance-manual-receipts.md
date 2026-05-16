# Finance Manual Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade accountant-recorded fee payments for cheque, cash, bank deposit, and EFT flows.

**Architecture:** Manual receipts live in the billing module because they settle invoices and student balances. The receipt record is tenant-scoped and auditable; only cleared/instant methods post ledger entries and allocate invoices. Cheques start pending clearance, then clear, bounce, or reverse through explicit accountant actions.

**Tech Stack:** NestJS, PostgreSQL/RLS, existing finance ledger service, existing billing invoice allocation service, Next.js API proxy, React school workspace.

---

### Task 1: Backend Domain

**Files:**
- Create: `apps/api/src/modules/billing/entities/manual-fee-payment.entity.ts`
- Create: `apps/api/src/modules/billing/dto/create-manual-fee-payment.dto.ts`
- Create: `apps/api/src/modules/billing/dto/update-manual-fee-payment-status.dto.ts`
- Create: `apps/api/src/modules/billing/dto/manual-fee-payment-response.dto.ts`
- Create: `apps/api/src/modules/billing/repositories/manual-fee-payments.repository.ts`
- Create: `apps/api/src/modules/billing/manual-fee-payment.service.ts`
- Modify: `apps/api/src/modules/billing/billing.module.ts`
- Modify: `apps/api/src/modules/billing/billing.controller.ts`
- Modify: `apps/api/src/modules/billing/billing-schema.service.ts`

- [ ] Add `manual_fee_payments` and `manual_fee_payment_allocations` tables with tenant RLS.
- [ ] Add repository methods for create, list, lock, mark deposited, clear, bounce, and reverse.
- [ ] Add service logic for method-specific status rules and ledger posting.
- [ ] Add controller endpoints under `/billing/manual-fee-payments`.

### Task 2: Tests

**Files:**
- Modify: `apps/api/src/modules/billing/billing.test.ts`

- [ ] Add a test proving cash/EFT/bank deposit receipts post immediately and allocate invoices.
- [ ] Add a test proving cheque receipts stay `received` until cleared.
- [ ] Add a test proving cleared cheques post once and update allocation.
- [ ] Add a test proving bounced/reversed cheques do not leave paid invoices behind.

### Task 3: Frontend Operations

**Files:**
- Create: `apps/web/src/app/api/billing/[...path]/route.ts`
- Modify: `apps/web/src/components/school/school-pages.tsx`

- [ ] Add a tenant-aware billing API proxy.
- [ ] Add a manual receipts panel to the finance/M-PESA workspace.
- [ ] Support accountant input for method, amount, student, invoice/reference, cheque number, bank, and status notes.
- [ ] Show pending clearance and cleared/bounced/reversed states.

### Task 4: Verification

- [ ] Run the focused billing tests.
- [ ] Run the TypeScript build.
- [ ] Report any remaining finance gaps, especially full C2B Paybill confirmation support.
