# Inventory And Admissions Redesign

**Date:** 2026-05-04

**Scope:** Build production-grade Inventory and Student Registration modules for Kenyan schools across both the Next.js frontend and NestJS backend.

## Product Decisions

- Add two first-class operational roles: `storekeeper` and `admissions`.
- Keep `admin` as an oversight role.
- Give `bursar` visibility into procurement and inventory cost exposure.
- Keep the existing `students` module for teacher/parent learner views.
- Add a new `admissions` module for front-office workflows instead of forcing admissions into the existing `students` workspace.
- Add a new `inventory` module instead of overloading `reports`, `finance`, or `settings`.
- Implement admissions documents as real uploads now through a storage abstraction backed by local server filesystem storage.
- Treat applications as a separate lifecycle from registered students:
  `Application -> Review -> Approval -> Registration -> Student Directory`.

## Frontend Architecture

### ERP Shell

- Extend dashboard roles to include `storekeeper` and `admissions`.
- Extend sidebar registry with top-level modules:
  - `inventory`
  - `admissions`
- Keep the existing role-aware dashboard shell, topbar, and tenant switching.
- Add meaningful dashboard home views for `storekeeper` and `admissions`.

### Module Navigation

- Each new module gets its own internal left-side section menu inside the content area.
- Section state is URL-backed through `?view=` search params so the module feels page-based without exploding route complexity.

### Shared UX Components

- `module-shell`: section sidebar + content frame + page summary
- `ops-table`: reusable enterprise table with:
  - search
  - filters
  - sortable columns
  - pagination
  - export action
  - row actions
  - empty states
- `workflow-card`: action list, queue summaries, status chips
- `form-section`: structured grouped forms with inline validation
- `stat-strip`: dense KPI rail tuned for operational dashboards

## Inventory Module Design

### Information Architecture

- Inventory Dashboard
- Items
- Categories
- Stock Movement
- Suppliers
- Purchase Orders
- Requests
- Transfers
- Damages / Losses
- Reports

### Frontend Behavior

- Dashboard surfaces financial and operational signals first:
  - inventory value
  - low stock pressure
  - open requests
  - recent purchases
- Items page is the primary working screen with:
  - low-stock highlighting
  - stock status badges
  - add/edit/archive/adjust actions
- Purchase Orders support:
  - draft
  - pending approval
  - approved
  - received
  - cancelled
- Requests support departmental demand from:
  - books
  - food
  - stationery
  - lab items
- Damages / Losses record:
  - reason
  - department
  - quantity impact
  - cost impact

### Backend Data Model

- `inventory_categories`
- `inventory_suppliers`
- `inventory_items`
- `inventory_stock_movements`
- `inventory_requests`
- `inventory_purchase_orders`
- `inventory_transfers`
- `inventory_incidents`

### Backend Behavior

- Item stock level is derived from `opening_quantity + movement totals`.
- Adjustment, receipt, fulfillment, transfer, and incident actions all write stock movement records.
- Purchase orders and requests store structured line arrays in `jsonb` for implementation speed while keeping item-level detail.
- Summary endpoints expose dashboard KPIs and recent operational feeds.

## Admissions Module Design

### Information Architecture

- Admissions Dashboard
- Applications
- New Registration
- Student Directory
- Parent Information
- Documents
- Class Allocation
- Transfers
- Reports

### Frontend Behavior

- Dashboard focuses on front-office pressure:
  - new applications
  - approved students
  - pending review
  - total registered
- Applications page supports:
  - pending
  - interview
  - approved
  - rejected
  - registered
- Registration form is grouped into:
  - personal
  - academic
  - parent/guardian
  - medical
  - documents
- Student Directory includes instant search by:
  - learner name
  - admission number
  - parent phone
- Student profile includes tabs:
  - overview
  - fees
  - academics
  - attendance
  - medical
  - discipline
  - documents

### Backend Data Model

- `admission_applications`
- `admission_documents`
- `student_allocations`
- `student_transfer_records`

### Backend Behavior

- Applications hold pre-registration data until formal registration.
- Approval does not create a student record yet.
- Registration creates a student record and binds the application to that student.
- Documents can belong to either an application or a registered student.
- Class allocation, dormitory, and transport route assignments are tracked separately from the base student record.

## Storage Strategy

- Add a local file storage service under the API app.
- Persist uploads to a tenant-scoped folder structure.
- Store document metadata, verification status, and file path in the database.
- Keep the interface swappable for future S3/R2 migration.

## Permissions And Roles

### New Permissions

- `inventory:read`
- `inventory:write`
- `procurement:read`
- `procurement:write`
- `admissions:read`
- `admissions:write`
- `documents:read`
- `documents:write`
- `transfers:read`
- `transfers:write`

### Role Intent

- `storekeeper`: item, movement, supplier, request, transfer, and incident execution
- `admissions`: applications, registration, document verification, and class allocation
- `admin`: full operational oversight
- `bursar`: procurement visibility and cost-aware inventory review

## API Shape

### Inventory

- `GET /inventory/summary`
- `GET /inventory/items`
- `POST /inventory/items`
- `PATCH /inventory/items/:itemId`
- `POST /inventory/items/:itemId/adjust`
- `GET /inventory/categories`
- `GET /inventory/stock-movements`
- `GET /inventory/suppliers`
- `GET /inventory/purchase-orders`
- `POST /inventory/purchase-orders`
- `PATCH /inventory/purchase-orders/:purchaseOrderId/status`
- `GET /inventory/requests`
- `POST /inventory/requests`
- `PATCH /inventory/requests/:requestId/status`
- `GET /inventory/transfers`
- `POST /inventory/transfers`
- `PATCH /inventory/transfers/:transferId/status`
- `GET /inventory/incidents`
- `POST /inventory/incidents`
- `GET /inventory/reports`

### Admissions

- `GET /admissions/summary`
- `GET /admissions/applications`
- `POST /admissions/applications`
- `PATCH /admissions/applications/:applicationId`
- `POST /admissions/applications/:applicationId/documents`
- `POST /admissions/applications/:applicationId/register`
- `GET /admissions/students`
- `GET /admissions/students/:studentId/profile`
- `GET /admissions/parents`
- `GET /admissions/documents`
- `GET /admissions/allocations`
- `POST /admissions/allocations/:studentId`
- `GET /admissions/transfers`
- `POST /admissions/transfers`
- `GET /admissions/reports`

## Validation And Operational Rules

- Inventory item SKU must be unique per tenant.
- Inventory quantities cannot fall below zero through standard issue or transfer actions.
- Receiving stock updates both PO status and inventory movement history.
- Admissions application status transitions are constrained to a valid sequence.
- Registration requires minimum required fields and at least one guardian contact.
- Document verification is tracked independently from upload presence.

## Testing Strategy

- API unit tests for:
  - stock adjustment logic
  - purchase order receiving
  - application registration
  - profile aggregation
- Frontend component tests for:
  - role visibility
  - low stock highlighting
  - admissions search behavior
  - internal section navigation
- Keep design tests green for the shared shell.

## Delivery Shape

- Backend first enough to define contracts and persistence.
- Frontend implemented with rich realistic mock data and reusable stateful workflows.
- New modules plugged into the current dashboard shell without breaking teacher/parent flows.
