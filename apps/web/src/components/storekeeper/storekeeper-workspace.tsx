"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  ClipboardList,
  FileDown,
  FileText,
  History,
  PackageCheck,
  PackageMinus,
  Printer,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useDeferredValue, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  downloadCsvFile,
  openPrintDocument,
  type PrintableRow,
} from "@/lib/dashboard/export";
import { formatCurrency } from "@/lib/dashboard/format";
import type { StatusTone } from "@/lib/dashboard/types";
import {
  buildStorekeeperAlerts,
  buildStorekeeperDashboard,
  buildStorekeeperReports,
  buildStorekeeperStats,
  createStorekeeperInventoryDataset,
  formatMovementType,
  formatStoreItemStatus,
  formatStoreQuantity,
  getMovementTone,
  getStoreItemStatus,
  getStoreItemTone,
  issueStoreStock,
  receiveStoreStock,
  storekeeperSidebarItems,
  type StorekeeperDataset,
  type StorekeeperIssueNote,
  type StorekeeperItem,
  type StorekeeperMovement,
  type StorekeeperReceiveNote,
  type StorekeeperReport,
  type StorekeeperSectionId,
  type StorekeeperSupplier,
  type StorekeeperTransfer,
} from "@/lib/storekeeper/storekeeper-data";

type SortKey = "name" | "quantity" | "value" | "status";

type IssueFormState = {
  department: string;
  recipient: string;
  itemId: string;
  quantity: string;
};

type ReceiveFormState = {
  supplier: string;
  purchaseReference: string;
  itemId: string;
  quantity: string;
  unitCost: string;
  batchNumber: string;
  expiryDate: string;
};

type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  department: string;
  item: string;
  supplier: string;
  category: string;
  movementType: string;
};

const sectionCopy: Record<
  StorekeeperSectionId,
  { title: string; description: string; icon: typeof Boxes }
> = {
  dashboard: {
    title: "Storekeeper Dashboard",
    description: "Operational stock position, requests, receipts, issues, alerts, and audit activity.",
    icon: Boxes,
  },
  items: {
    title: "Inventory",
    description: "Barcode-ready stock cards with reorder levels, storage locations, and valuation.",
    icon: ClipboardList,
  },
  receiving: {
    title: "Stock Receiving",
    description: "Post supplier deliveries, capture batches, update costs, and create receipt movements.",
    icon: ArrowDownToLine,
  },
  issuing: {
    title: "Stock Issuing",
    description: "Issue stock to departments with validation, signatures, issue notes, and audit trails.",
    icon: PackageMinus,
  },
  transfers: {
    title: "Transfers",
    description: "Track store-to-store transfers with source, destination, status, and accountability.",
    icon: ArrowRightLeft,
  },
  suppliers: {
    title: "Suppliers",
    description: "Supplier contacts, delivery recency, active orders, and supply risk visibility.",
    icon: Truck,
  },
  "reorder-alerts": {
    title: "Reorder Alerts",
    description: "Critical, low, expiring, and unusual movement alerts requiring storekeeper action.",
    icon: AlertTriangle,
  },
  reports: {
    title: "Reports",
    description: "Generate stock issue, receipt, valuation, low stock, expiry, movement, and supplier reports.",
    icon: BarChart3,
  },
  "activity-log": {
    title: "Activity Log",
    description: "Trace every quantity change by user, timestamp, movement type, and counterparty.",
    icon: History,
  },
};

const departments = [
  "Exams Office",
  "Science Lab",
  "Lower School",
  "Kitchen",
  "Boarding",
  "Games Department",
  "Maintenance",
];

const recipients = [
  "Lucy Wambui",
  "Moses Otieno",
  "Chef Ruth Nduta",
  "Games Master",
  "Matron Akinyi",
  "Maintenance Lead",
];

const reportFilterDefaults: ReportFilters = {
  dateFrom: "2026-05-01",
  dateTo: "2026-05-07",
  department: "",
  item: "",
  supplier: "",
  category: "",
  movementType: "",
};

const initialIssueForm: IssueFormState = {
  department: "Exams Office",
  recipient: "Lucy Wambui",
  itemId: "item-paper",
  quantity: "4",
};

const initialReceiveForm: ReceiveFormState = {
  supplier: "Crown Office Supplies",
  purchaseReference: "PO-2026-031",
  itemId: "item-paper",
  quantity: "12",
  unitCost: "690",
  batchNumber: "COS-A4-0526",
  expiryDate: "",
};

function toneRing(tone: StatusTone) {
  if (tone === "critical") {
    return "border-danger/30 bg-danger/5";
  }

  if (tone === "warning") {
    return "border-warning/30 bg-warning/5";
  }

  return "border-success/25 bg-success/5";
}

function getStatusDotClass(item: StorekeeperItem) {
  const status = getStoreItemStatus(item);

  if (status === "critical") {
    return "bg-danger";
  }

  if (status === "low") {
    return "bg-warning";
  }

  return "bg-success";
}

function itemTotalValue(item: StorekeeperItem) {
  return item.quantityAvailable * item.unitCost;
}

function compareInventoryItems(sortKey: SortKey) {
  return (first: StorekeeperItem, second: StorekeeperItem) => {
    if (sortKey === "quantity") {
      return first.quantityAvailable - second.quantityAvailable;
    }

    if (sortKey === "value") {
      return itemTotalValue(second) - itemTotalValue(first);
    }

    if (sortKey === "status") {
      const weight = { critical: 0, low: 1, healthy: 2 };
      return weight[getStoreItemStatus(first)] - weight[getStoreItemStatus(second)];
    }

    return first.name.localeCompare(second.name);
  };
}

function matchesInventorySearch(item: StorekeeperItem, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    item.name,
    item.code,
    item.barcode,
    item.category,
    item.location,
    item.supplier,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the stock transaction.";
}

function selectRowsForReport(report: StorekeeperReport, filters: ReportFilters) {
  return report.rows.filter((row) => {
    const joined = row.join(" ").toLowerCase();
    const dateValue = row[1] ?? "";

    if (filters.dateFrom && dateValue && dateValue.slice(0, 10) < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && dateValue && dateValue.slice(0, 10) > filters.dateTo) {
      return false;
    }

    if (filters.department && !joined.includes(filters.department.toLowerCase())) {
      return false;
    }

    if (filters.item && !joined.includes(filters.item.toLowerCase())) {
      return false;
    }

    if (filters.supplier && !joined.includes(filters.supplier.toLowerCase())) {
      return false;
    }

    if (filters.category && !joined.includes(filters.category.toLowerCase())) {
      return false;
    }

    if (filters.movementType && !joined.includes(filters.movementType.toLowerCase())) {
      return false;
    }

    return true;
  });
}

function buildReportPrintRows(report: StorekeeperReport, rows: string[][]): PrintableRow[] {
  if (rows.length === 0) {
    return [{ label: "Result", value: "No rows matched the selected filters." }];
  }

  return rows.slice(0, 30).map((row) => ({
    label: row[0] ?? report.title,
    value: row.slice(1).join(" | "),
  }));
}

function buildIssuePrintRows(note: StorekeeperIssueNote): PrintableRow[] {
  return [
    { label: "Issue note", value: note.reference },
    { label: "Department", value: note.department },
    { label: "Received by", value: note.recipient },
    { label: "Issued by", value: note.issuedBy },
    { label: "Timestamp", value: note.timestamp },
    ...note.lines.map((line) => ({
      label: `${line.itemCode} - ${line.itemName}`,
      value: formatStoreQuantity(line.quantity, line.unit),
    })),
    { label: "Issuer signature", value: "____________________________" },
    { label: "Receiver signature", value: "____________________________" },
  ];
}

function buildReceivePrintRows(note: StorekeeperReceiveNote): PrintableRow[] {
  return [
    { label: "Receipt note", value: note.reference },
    { label: "Supplier", value: note.supplier },
    { label: "Purchase reference", value: note.purchaseReference },
    { label: "Received by", value: note.receivedBy },
    { label: "Timestamp", value: note.timestamp },
    ...note.lines.map((line) => ({
      label: `${line.itemCode} - ${line.itemName}`,
      value: `${formatStoreQuantity(line.quantity, line.unit)} at ${formatCurrency(line.unitCost, false)} | Batch ${line.batchNumber || "N/A"} | Expiry ${line.expiryDate || "N/A"}`,
    })),
  ];
}

function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function CompactRow({
  title,
  detail,
  value,
  tone = "ok",
}: {
  title: string;
  detail: string;
  value?: string;
  tone?: StatusTone;
}) {
  return (
    <div className={`rounded-[var(--radius-sm)] border px-3 py-2.5 ${toneRing(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{detail}</p>
        </div>
        {value ? (
          <span className="shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
            {value}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WorkflowSteps({ steps }: { steps: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, index) => (
        <div
          key={step}
          className="rounded-[var(--radius-sm)] border border-border bg-surface-muted px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Step {index + 1}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-foreground">{step}</p>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function inputClassName() {
  return "h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-[13px] font-medium text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";
}

function NotePreview({
  title,
  rows,
  onPrint,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  onPrint: () => void;
}) {
  return (
    <Card className="border-success/30 bg-success/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[12px] text-muted">Printable voucher generated for signatures.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className="rounded-[var(--radius-xs)] border border-border bg-surface px-3 py-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {row.label}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-foreground">{row.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StorekeeperWorkspace({
  section,
  userLabel = "Storekeeper Amani Prep",
  tenantSlug = "amani-prep",
}: {
  section: StorekeeperSectionId;
  userLabel?: string;
  tenantSlug?: string;
}) {
  const [dataset, setDataset] = useState<StorekeeperDataset>(() =>
    createStorekeeperInventoryDataset(),
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [issueForm, setIssueForm] = useState<IssueFormState>(initialIssueForm);
  const [receiveForm, setReceiveForm] = useState<ReceiveFormState>(initialReceiveForm);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [lastIssueNote, setLastIssueNote] = useState<StorekeeperIssueNote | null>(null);
  const [lastReceiveNote, setLastReceiveNote] = useState<StorekeeperReceiveNote | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportFilters, setReportFilters] = useState<ReportFilters>(reportFilterDefaults);
  const [isIssuePending, startIssueTransition] = useTransition();
  const [isReceivePending, startReceiveTransition] = useTransition();
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const activeCopy = sectionCopy[section];
  const ActiveIcon = activeCopy.icon;

  const categories = Array.from(new Set(dataset.items.map((item) => item.category))).sort();
  const locations = Array.from(new Set(dataset.items.map((item) => item.location))).sort();
  const suppliers = Array.from(new Set(dataset.suppliers.map((supplier) => supplier.name))).sort();
  const dashboard = buildStorekeeperDashboard(dataset);
  const alerts = buildStorekeeperAlerts(dataset);
  const stats = buildStorekeeperStats(dataset);
  const reports = buildStorekeeperReports(dataset);

  const filteredItems = dataset.items
    .filter((item) => matchesInventorySearch(item, deferredSearch))
    .filter((item) => (categoryFilter ? item.category === categoryFilter : true))
    .filter((item) => (locationFilter ? item.location === locationFilter : true))
    .filter((item) => (statusFilter ? getStoreItemStatus(item) === statusFilter : true))
    .sort(compareInventoryItems(sortKey));

  function handleIssueSubmit() {
    setActionError(null);
    startIssueTransition(() => {
      try {
        const result = issueStoreStock(dataset, {
          department: issueForm.department,
          recipient: issueForm.recipient,
          issuedBy: userLabel,
          lines: [
            {
              itemId: issueForm.itemId,
              quantity: Number(issueForm.quantity),
            },
          ],
          submissionId: `issue-${Date.now()}-${issueForm.itemId}`,
        });

        setDataset(result.dataset);
        setLastIssueNote(result.issueNote);
        setIssueModalOpen(false);
      } catch (error) {
        setActionError(getErrorMessage(error));
      }
    });
  }

  function handleReceiveSubmit() {
    setActionError(null);
    startReceiveTransition(() => {
      try {
        const result = receiveStoreStock(dataset, {
          supplier: receiveForm.supplier,
          purchaseReference: receiveForm.purchaseReference,
          receivedBy: userLabel,
          lines: [
            {
              itemId: receiveForm.itemId,
              quantity: Number(receiveForm.quantity),
              unitCost: Number(receiveForm.unitCost),
              batchNumber: receiveForm.batchNumber,
              expiryDate: receiveForm.expiryDate,
            },
          ],
          submissionId: `receive-${Date.now()}-${receiveForm.itemId}`,
        });

        setDataset(result.dataset);
        setLastReceiveNote(result.receiveNote);
        setReceiveModalOpen(false);
      } catch (error) {
        setActionError(getErrorMessage(error));
      }
    });
  }

  function printIssueNote(note: StorekeeperIssueNote) {
    openPrintDocument({
      eyebrow: "School stores issue voucher",
      title: `Issue note ${note.reference}`,
      subtitle: "Department receipt, stock voucher, and signature copy.",
      rows: buildIssuePrintRows(note),
      footer: "Stock issued from the school store. Receiver confirms items and quantities by signature.",
    });
  }

  function printReceiveNote(note: StorekeeperReceiveNote) {
    openPrintDocument({
      eyebrow: "School stores receiving voucher",
      title: `Receipt note ${note.reference}`,
      subtitle: `Supplier delivery posted against ${note.purchaseReference}.`,
      rows: buildReceivePrintRows(note),
      footer: "Storekeeper confirms delivery quantities, batches, expiry dates, and supplier reference.",
    });
  }

  function exportInventory() {
    downloadCsvFile({
      filename: "current-inventory-stock-card.csv",
      headers: [
        "Item Code",
        "Item Name",
        "Category",
        "Quantity Available",
        "Unit",
        "Reorder Level",
        "Location",
        "Status",
        "Unit Cost",
        "Total Value",
      ],
      rows: filteredItems.map((item) => [
        item.code,
        item.name,
        item.category,
        `${item.quantityAvailable}`,
        item.unit,
        `${item.reorderLevel}`,
        item.location,
        formatStoreItemStatus(getStoreItemStatus(item)),
        formatCurrency(item.unitCost, false),
        formatCurrency(itemTotalValue(item), false),
      ]),
    });
  }

  function renderSearchFilters() {
    return (
      <Card className="p-3">
        <div className="grid gap-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_0.7fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item, SKU, barcode, supplier, or location"
              className={`${inputClassName()} pl-9`}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={inputClassName()}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className={inputClassName()}
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClassName()}
            aria-label="Filter by stock status"
          >
            <option value="">All status</option>
            <option value="healthy">Healthy</option>
            <option value="low">Low</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className={inputClassName()}
            aria-label="Sort inventory"
          >
            <option value="status">Sort by risk</option>
            <option value="name">Sort by name</option>
            <option value="quantity">Sort by quantity</option>
            <option value="value">Sort by value</option>
          </select>
          <Button variant="secondary" onClick={exportInventory}>
            <FileDown className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </Card>
    );
  }

  function renderIssueForm(compact = false) {
    const selectedItem = dataset.items.find((item) => item.id === issueForm.itemId);
    const requestedQuantity = Number(issueForm.quantity);
    const isOverStock =
      selectedItem && Number.isFinite(requestedQuantity) && requestedQuantity > selectedItem.quantityAvailable;

    return (
      <div className={compact ? "space-y-3" : "space-y-4"}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Department">
            <select
              value={issueForm.department}
              onChange={(event) =>
                setIssueForm((current) => ({ ...current, department: event.target.value }))
              }
              className={inputClassName()}
            >
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipient">
            <select
              value={issueForm.recipient}
              onChange={(event) =>
                setIssueForm((current) => ({ ...current, recipient: event.target.value }))
              }
              className={inputClassName()}
            >
              {recipients.map((recipient) => (
                <option key={recipient} value={recipient}>
                  {recipient}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Item">
            <select
              value={issueForm.itemId}
              onChange={(event) =>
                setIssueForm((current) => ({ ...current, itemId: event.target.value }))
              }
              className={inputClassName()}
            >
              {dataset.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.name} ({formatStoreQuantity(item.quantityAvailable, item.unit)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min="1"
              value={issueForm.quantity}
              onChange={(event) =>
                setIssueForm((current) => ({ ...current, quantity: event.target.value }))
              }
              className={inputClassName()}
            />
          </Field>
        </div>
        {selectedItem ? (
          <div className={`rounded-[var(--radius-sm)] border px-3 py-2 ${isOverStock ? "border-danger bg-danger/5" : "border-success/30 bg-success/5"}`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] font-semibold text-foreground">
                Available now: {formatStoreQuantity(selectedItem.quantityAvailable, selectedItem.unit)}
              </p>
              <StatusPill
                label={isOverStock ? "Insufficient stock" : "Stock validated"}
                tone={isOverStock ? "critical" : "ok"}
              />
            </div>
          </div>
        ) : null}
        {actionError ? (
          <div className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] font-semibold text-danger">
            {actionError}
          </div>
        ) : null}
        {isIssuePending ? <SkeletonCard className="h-9" /> : null}
      </div>
    );
  }

  function renderReceiveForm(compact = false) {
    return (
      <div className={compact ? "space-y-3" : "space-y-4"}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Supplier">
            <select
              value={receiveForm.supplier}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, supplier: event.target.value }))
              }
              className={inputClassName()}
            >
              {suppliers.map((supplier) => (
                <option key={supplier} value={supplier}>
                  {supplier}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purchase reference">
            <input
              value={receiveForm.purchaseReference}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, purchaseReference: event.target.value }))
              }
              className={inputClassName()}
            />
          </Field>
          <Field label="Item">
            <select
              value={receiveForm.itemId}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, itemId: event.target.value }))
              }
              className={inputClassName()}
            >
              {dataset.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity received">
            <input
              type="number"
              min="1"
              value={receiveForm.quantity}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, quantity: event.target.value }))
              }
              className={inputClassName()}
            />
          </Field>
          <Field label="Unit cost">
            <input
              type="number"
              min="1"
              value={receiveForm.unitCost}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, unitCost: event.target.value }))
              }
              className={inputClassName()}
            />
          </Field>
          <Field label="Batch number">
            <input
              value={receiveForm.batchNumber}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, batchNumber: event.target.value }))
              }
              className={inputClassName()}
            />
          </Field>
          <Field label="Expiry date">
            <input
              type="date"
              value={receiveForm.expiryDate}
              onChange={(event) =>
                setReceiveForm((current) => ({ ...current, expiryDate: event.target.value }))
              }
              className={inputClassName()}
            />
          </Field>
        </div>
        {actionError ? (
          <div className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] font-semibold text-danger">
            {actionError}
          </div>
        ) : null}
        {isReceivePending ? <SkeletonCard className="h-9" /> : null}
      </div>
    );
  }

  function renderInventoryTable(items: StorekeeperItem[]) {
    const columns: DataTableColumn<StorekeeperItem>[] = [
      {
        id: "code",
        header: "Item code",
        render: (item) => <span className="font-mono text-[12px] font-semibold">{item.code}</span>,
      },
      {
        id: "name",
        header: "Item name",
        render: (item) => (
          <div>
            <p className="font-semibold">{item.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">Barcode {item.barcode}</p>
          </div>
        ),
      },
      { id: "category", header: "Category", render: (item) => item.category },
      {
        id: "quantity",
        header: "Quantity available",
        render: (item) => (
          <span className="font-semibold tabular-nums">
            {item.quantityAvailable} {item.unit}
          </span>
        ),
      },
      { id: "reorder", header: "Reorder level", render: (item) => item.reorderLevel },
      { id: "unit", header: "Unit", render: (item) => item.unit },
      { id: "location", header: "Location", render: (item) => item.location },
      {
        id: "status",
        header: "Status",
        render: (item) => (
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(item)}`} />
            <StatusPill
              label={formatStoreItemStatus(getStoreItemStatus(item))}
              tone={getStoreItemTone(getStoreItemStatus(item))}
              compact
            />
          </div>
        ),
      },
    ];

    if (dataset.items.length === 0) {
      return (
        <EmptyState
          title="No inventory items added yet"
          description="Create the first stock card to begin tracking school store quantities, locations, costs, and reorder levels."
          action={<Button>Add first stock item</Button>}
        />
      );
    }

    return (
      <DataTable
        title="Operational inventory table"
        subtitle={`${items.length} stock cards after search, category, location, status, and sort controls.`}
        columns={columns}
        rows={items}
        getRowKey={(item) => item.id}
        emptyMessage="No inventory items match the selected filters."
        pageSize={8}
      />
    );
  }

  function renderMovementTable(movements: StorekeeperMovement[], title = "Inventory movement log") {
    const columns: DataTableColumn<StorekeeperMovement>[] = [
      {
        id: "reference",
        header: "Reference",
        render: (movement) => <span className="font-mono text-[12px] font-semibold">{movement.reference}</span>,
      },
      {
        id: "item",
        header: "Item",
        render: (movement) => (
          <div>
            <p className="font-semibold">{movement.itemName}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">{movement.itemCode}</p>
          </div>
        ),
      },
      {
        id: "type",
        header: "Action type",
        render: (movement) => (
          <StatusPill
            label={formatMovementType(movement.actionType)}
            tone={getMovementTone(movement.actionType)}
            compact
          />
        ),
      },
      {
        id: "quantity",
        header: "Qty",
        render: (movement) => `${movement.quantity} ${movement.unit}`,
      },
      { id: "before", header: "Before", render: (movement) => movement.beforeQuantity },
      { id: "after", header: "After", render: (movement) => movement.afterQuantity },
      { id: "user", header: "User", render: (movement) => movement.user },
      { id: "time", header: "Timestamp", render: (movement) => movement.timestamp },
      { id: "notes", header: "Notes", render: (movement) => movement.notes },
    ];

    return (
      <DataTable
        title={title}
        subtitle="Before and after quantities make every stock action traceable."
        columns={columns}
        rows={movements}
        getRowKey={(movement) => movement.id}
        emptyMessage="No stock movements have been recorded yet."
        pageSize={8}
      />
    );
  }

  function renderDashboard() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.id} className={`p-4 ${toneRing(stat.tone)}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {stat.id === "low-stock"
                  ? "Reorder pressure"
                  : stat.id === "requests"
                    ? "Request queue"
                    : stat.label}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{stat.value}</p>
              <p className="mt-1 text-[12px] text-muted">{stat.helper}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Low stock items" subtitle="Amber and red stock lines to replenish.">
                <div className="space-y-2">
                  {dashboard.lowStockItems.map((item) => (
                    <CompactRow
                      key={item.id}
                      title={item.name}
                      detail={`${item.code} | ${item.location}`}
                      value={`${item.quantityAvailable}/${item.reorderLevel} ${item.unit}`}
                      tone={getStoreItemTone(getStoreItemStatus(item))}
                    />
                  ))}
                </div>
              </Panel>
              <Panel title="Pending stock requests" subtitle="Approved or pending department demand.">
                <div className="space-y-2">
                  {dashboard.pendingRequests.map((request) => (
                    <CompactRow
                      key={request.id}
                      title={`${request.department} - ${request.itemName}`}
                      detail={`Requested by ${request.requestedBy} | Needed ${request.neededBy}`}
                      value={`${request.quantity} ${request.unit}`}
                      tone={request.status === "approved" ? "ok" : "warning"}
                    />
                  ))}
                </div>
              </Panel>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Recently issued items" subtitle="Latest department issues and receivers.">
                <div className="space-y-2">
                  {dashboard.recentlyIssuedItems.map((movement) => (
                    <CompactRow
                      key={movement.id}
                      title={movement.itemName}
                      detail={`${movement.department ?? "Store"} | ${movement.counterparty}`}
                      value={`${movement.quantity} ${movement.unit}`}
                      tone="warning"
                    />
                  ))}
                </div>
              </Panel>
              <Panel title="Today's stock movement" subtitle="All receipts, issues, transfers, and adjustments.">
                <div className="space-y-2">
                  {dashboard.todayMovements.map((movement) => (
                    <CompactRow
                      key={movement.id}
                      title={movement.itemName}
                      detail={`${formatMovementType(movement.actionType)} | ${movement.timestamp}`}
                      value={`${movement.beforeQuantity} -> ${movement.afterQuantity}`}
                      tone={getMovementTone(movement.actionType)}
                    />
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="space-y-4">
            <Panel title="Items received today" subtitle="Receipt movements posted into stock.">
              <div className="space-y-2">
                {dashboard.receivedToday.map((movement) => (
                  <CompactRow
                    key={movement.id}
                    title={movement.itemName}
                    detail={`${movement.supplier ?? movement.counterparty} | ${movement.reference}`}
                    value={`${movement.quantity} ${movement.unit}`}
                    tone="ok"
                  />
                ))}
              </div>
            </Panel>
            <Panel title="Expiring items" subtitle="Batched items that need attention.">
              <div className="space-y-2">
                {dashboard.expiringItems.map((item) => (
                  <CompactRow
                    key={item.id}
                    title={item.name}
                    detail={`Batch ${item.batchNumber ?? "N/A"} | ${item.location}`}
                    value={item.expiryDate}
                    tone="warning"
                  />
                ))}
              </div>
            </Panel>
            <Panel title="Fast-moving items" subtitle="High weekly issue volume.">
              <div className="space-y-2">
                {dashboard.fastMovingItems.map((item) => (
                  <CompactRow
                    key={item.id}
                    title={item.name}
                    detail={`${item.category} | ${item.location}`}
                    value={`${item.averageWeeklyIssue}/week`}
                    tone={getStoreItemTone(getStoreItemStatus(item))}
                  />
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Panel title="Operational alerts" subtitle="Low stock, expiry, and unusual movement signals.">
            <div className="space-y-2">
              {alerts.map((alert) => (
                <CompactRow
                  key={alert.id}
                  title={alert.title}
                  detail={alert.detail}
                  value={alert.actionLabel}
                  tone={alert.tone}
                />
              ))}
            </div>
          </Panel>
          {renderMovementTable(dataset.movements.slice(0, 6), "Latest audit movements")}
        </div>
      </div>
    );
  }

  function renderItems() {
    return (
      <div className="space-y-4">
        {renderSearchFilters()}
        {renderInventoryTable(filteredItems)}
      </div>
    );
  }

  function renderIssuing() {
    const issueMovements = dataset.movements.filter((movement) => movement.actionType === "issue");

    return (
      <div className="space-y-4">
        <Panel
          title="Stock issue workflow"
          subtitle="The storekeeper can complete a validated issue in one screen."
          action={
            <Button onClick={() => setIssueModalOpen(true)}>
              <PackageMinus className="h-3.5 w-3.5" />
              Issue stock
            </Button>
          }
        >
          <WorkflowSteps
            steps={[
              "Select department",
              "Select recipient",
              "Select items",
              "Enter quantity",
              "Validate availability",
              "Submit issue",
              "Generate issue note",
              "Update inventory",
            ]}
          />
          <div className="mt-4">{renderIssueForm()}</div>
          <div className="mt-4 flex justify-end">
            <Button disabled={isIssuePending} onClick={handleIssueSubmit}>
              Submit issue
            </Button>
          </div>
        </Panel>
        {lastIssueNote ? (
          <NotePreview
            title={`Issue note ${lastIssueNote.reference}`}
            rows={[
              { label: "Department", value: lastIssueNote.department },
              { label: "Receiver", value: lastIssueNote.recipient },
              { label: "Issued by", value: lastIssueNote.issuedBy },
              { label: "Lines", value: `${lastIssueNote.lines.length}` },
            ]}
            onPrint={() => printIssueNote(lastIssueNote)}
          />
        ) : null}
        {renderMovementTable(issueMovements, "Issued stock audit trail")}
      </div>
    );
  }

  function renderReceiving() {
    const receiptMovements = dataset.movements.filter((movement) => movement.actionType === "receipt");

    return (
      <div className="space-y-4">
        <Panel
          title="Stock receiving workflow"
          subtitle="Post supplier deliveries with purchase reference, batches, expiry dates, and cost."
          action={
            <Button onClick={() => setReceiveModalOpen(true)}>
              <PackageCheck className="h-3.5 w-3.5" />
              Receive stock
            </Button>
          }
        >
          <WorkflowSteps
            steps={[
              "Select supplier",
              "Enter purchase reference",
              "Select items received",
              "Capture quantities",
              "Capture unit costs",
              "Add batch numbers",
              "Add expiry dates",
              "Post receipt",
            ]}
          />
          <div className="mt-4">{renderReceiveForm()}</div>
          <div className="mt-4 flex justify-end">
            <Button disabled={isReceivePending} onClick={handleReceiveSubmit}>
              Post receipt
            </Button>
          </div>
        </Panel>
        {lastReceiveNote ? (
          <NotePreview
            title={`Receipt note ${lastReceiveNote.reference}`}
            rows={[
              { label: "Supplier", value: lastReceiveNote.supplier },
              { label: "Purchase reference", value: lastReceiveNote.purchaseReference },
              { label: "Received by", value: lastReceiveNote.receivedBy },
              { label: "Lines", value: `${lastReceiveNote.lines.length}` },
            ]}
            onPrint={() => printReceiveNote(lastReceiveNote)}
          />
        ) : null}
        {renderMovementTable(receiptMovements, "Received stock audit trail")}
      </div>
    );
  }

  function renderTransfers() {
    const columns: DataTableColumn<StorekeeperTransfer>[] = [
      { id: "item", header: "Item", render: (transfer) => transfer.itemName },
      { id: "from", header: "From", render: (transfer) => transfer.fromLocation },
      { id: "to", header: "To", render: (transfer) => transfer.toLocation },
      { id: "qty", header: "Quantity", render: (transfer) => transfer.quantity },
      { id: "by", header: "Requested by", render: (transfer) => transfer.requestedBy },
      {
        id: "status",
        header: "Status",
        render: (transfer) => (
          <StatusPill
            label={transfer.status.replaceAll("_", " ")}
            tone={transfer.status === "completed" ? "ok" : "warning"}
            compact
          />
        ),
      },
      { id: "date", header: "Date", render: (transfer) => transfer.date },
    ];

    return (
      <div className="space-y-4">
        <Panel title="Transfer command center" subtitle="Move stock between school storage locations.">
          <div className="grid gap-3 md:grid-cols-3">
            <CompactRow title="Requested" detail="Waiting dispatch" value="1" tone="warning" />
            <CompactRow title="In transit" detail="Physical movement underway" value="1" tone="warning" />
            <CompactRow title="Completed today" detail="Closed with audit entry" value="1" tone="ok" />
          </div>
        </Panel>
        <DataTable
          title="Transfer register"
          subtitle="Source, destination, status, and responsible staff."
          columns={columns}
          rows={dataset.transfers}
          getRowKey={(transfer) => transfer.id}
          pageSize={8}
        />
      </div>
    );
  }

  function renderSuppliers() {
    const columns: DataTableColumn<StorekeeperSupplier>[] = [
      { id: "name", header: "Supplier name", render: (supplier) => supplier.name },
      { id: "contact", header: "Contact", render: (supplier) => supplier.contact },
      { id: "email", header: "Email", render: (supplier) => supplier.email },
      { id: "phone", header: "Phone", render: (supplier) => supplier.phone },
      { id: "last", header: "Last delivery", render: (supplier) => supplier.lastDelivery },
      { id: "orders", header: "Active orders", render: (supplier) => supplier.activeOrders },
      {
        id: "status",
        header: "Status",
        render: (supplier) => (
          <StatusPill
            label={supplier.status.replaceAll("_", " ")}
            tone={supplier.status === "active" ? "ok" : supplier.status === "watch" ? "warning" : "critical"}
            compact
          />
        ),
      },
    ];

    return (
      <DataTable
        title="Supplier directory"
        subtitle="Contacts, delivery recency, and order exposure for school stores."
        columns={columns}
        rows={dataset.suppliers}
        getRowKey={(supplier) => supplier.id}
        pageSize={8}
      />
    );
  }

  function renderReorderAlerts() {
    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Critical and low stock" subtitle="Prioritized by reorder pressure.">
          <div className="space-y-2">
            {dashboard.lowStockItems.map((item) => (
              <CompactRow
                key={item.id}
                title={item.name}
                detail={`${item.code} | ${item.supplier} | ${item.location}`}
                value={`${item.quantityAvailable}/${item.reorderLevel} ${item.unit}`}
                tone={getStoreItemTone(getStoreItemStatus(item))}
              />
            ))}
          </div>
        </Panel>
        <Panel title="Expiry and unusual movement alerts" subtitle="Signals that need daily storekeeper review.">
          <div className="space-y-2">
            {alerts.map((alert) => (
              <CompactRow
                key={alert.id}
                title={alert.title}
                detail={alert.detail}
                value={alert.actionLabel}
                tone={alert.tone}
              />
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  function renderReports() {
    return (
      <div className="space-y-4">
        <Card className="p-3">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Date from">
              <input
                type="date"
                value={reportFilters.dateFrom}
                onChange={(event) =>
                  setReportFilters((current) => ({ ...current, dateFrom: event.target.value }))
                }
                className={inputClassName()}
              />
            </Field>
            <Field label="Date to">
              <input
                type="date"
                value={reportFilters.dateTo}
                onChange={(event) =>
                  setReportFilters((current) => ({ ...current, dateTo: event.target.value }))
                }
                className={inputClassName()}
              />
            </Field>
            <Field label="Department">
              <select
                value={reportFilters.department}
                onChange={(event) =>
                  setReportFilters((current) => ({ ...current, department: event.target.value }))
                }
                className={inputClassName()}
              >
                <option value="">All</option>
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Item">
              <select
                value={reportFilters.item}
                onChange={(event) =>
                  setReportFilters((current) => ({ ...current, item: event.target.value }))
                }
                className={inputClassName()}
              >
                <option value="">All</option>
                {dataset.items.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Supplier">
              <select
                value={reportFilters.supplier}
                onChange={(event) =>
                  setReportFilters((current) => ({ ...current, supplier: event.target.value }))
                }
                className={inputClassName()}
              >
                <option value="">All</option>
                {suppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Movement type">
              <select
                value={reportFilters.movementType}
                onChange={(event) =>
                  setReportFilters((current) => ({ ...current, movementType: event.target.value }))
                }
                className={inputClassName()}
              >
                <option value="">All</option>
                <option value="issue">Issue</option>
                <option value="receipt">Receipt</option>
                <option value="transfer">Transfer</option>
                <option value="adjustment">Adjustment</option>
                <option value="return">Return</option>
              </select>
            </Field>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {reports.map((report) => {
            const rows = selectRowsForReport(report, reportFilters);
            const previewRows = rows.slice(0, 5).map((row, index) => ({
              id: `${report.id}-${index}`,
              primary: row[0] ?? report.title,
              secondary: row.slice(1, 4).join(" | "),
              count: row.length > 4 ? row.slice(4).join(" | ") : `${row.length} fields`,
            }));

            return (
              <Card key={report.id} className="overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-[14px] font-semibold text-foreground">{report.title}</h3>
                      <p className="mt-0.5 text-[12px] text-muted">{report.description}</p>
                    </div>
                    <StatusPill label={`${rows.length} rows`} tone={rows.length ? "ok" : "warning"} compact />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        openPrintDocument({
                          eyebrow: "Storekeeper report PDF",
                          title: report.title,
                          subtitle: report.description,
                          rows: buildReportPrintRows(report, rows),
                          footer: "Use the browser print dialog to save this report as PDF.",
                        })
                      }
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Export PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        downloadCsvFile({
                          filename: report.filename,
                          headers: report.headers,
                          rows,
                        })
                      }
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      Export Excel
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        openPrintDocument({
                          eyebrow: "Storekeeper report print",
                          title: report.title,
                          subtitle: report.description,
                          rows: buildReportPrintRows(report, rows),
                          footer: "Printed from the school stores workspace.",
                        })
                      }
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  {previewRows.length ? (
                    previewRows.map((row) => (
                      <CompactRow
                        key={row.id}
                        title={row.primary}
                        detail={row.secondary || "Report row"}
                        value={row.count}
                        tone="ok"
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="No rows for this filter"
                      description="Change the report filters to widen the report result set."
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  function renderActivityLog() {
    return renderMovementTable(dataset.movements, "Complete stock movement audit trail");
  }

  function renderActiveSection() {
    switch (section) {
      case "dashboard":
        return renderDashboard();
      case "items":
        return renderItems();
      case "issuing":
        return renderIssuing();
      case "receiving":
        return renderReceiving();
      case "transfers":
        return renderTransfers();
      case "suppliers":
        return renderSuppliers();
      case "reorder-alerts":
        return renderReorderAlerts();
      case "reports":
        return renderReports();
      case "activity-log":
        return renderActivityLog();
    }
  }

  return (
    <main className="min-h-screen bg-[#edf3ef] text-foreground">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-slate-800 bg-slate-950 text-white lg:w-[260px] lg:border-b-0 lg:border-r">
          <div className="sticky top-0 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-emerald-500/15 text-emerald-300">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-semibold">School Stores</p>
                <p className="font-mono text-[11px] text-slate-400">{tenantSlug}</p>
              </div>
            </div>
            <div className="mt-4 rounded-[var(--radius-sm)] border border-slate-800 bg-slate-900/80 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Signed in</p>
              <p className="mt-1 truncate text-[13px] font-semibold">{userLabel}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Storekeeper access only
              </div>
            </div>
            <nav className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
              {storekeeperSidebarItems.map((item) => {
                const isActive = item.id === section;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold transition ${
                      isActive
                        ? "bg-emerald-400 text-slate-950"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                    {activeCopy.title}
                  </h1>
                  <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted">
                    {activeCopy.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setReceiveModalOpen(true)}>
                  <PackageCheck className="h-3.5 w-3.5" />
                  Receive stock
                </Button>
                <Button onClick={() => setIssueModalOpen(true)}>
                  <PackageMinus className="h-3.5 w-3.5" />
                  Issue stock
                </Button>
              </div>
            </div>
          </header>

          <div className="px-4 py-4 md:px-6">{renderActiveSection()}</div>
        </section>
      </div>

      <Modal
        open={issueModalOpen}
        title="Issue stock voucher"
        description="Validate stock availability, capture receiver details, and generate a printable issue note."
        onClose={() => {
          setIssueModalOpen(false);
          setActionError(null);
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIssueModalOpen(false);
                setActionError(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={isIssuePending} onClick={handleIssueSubmit}>
              Submit issue
            </Button>
          </>
        }
      >
        {renderIssueForm(true)}
      </Modal>

      <Modal
        open={receiveModalOpen}
        title="Receive supplier stock"
        description="Post delivery quantities, costs, batch numbers, and expiry dates into inventory."
        onClose={() => {
          setReceiveModalOpen(false);
          setActionError(null);
        }}
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReceiveModalOpen(false);
                setActionError(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={isReceivePending} onClick={handleReceiveSubmit}>
              Post receipt
            </Button>
          </>
        }
      >
        {renderReceiveForm(true)}
      </Modal>
    </main>
  );
}
