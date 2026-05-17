"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  ClipboardList,
  FileDown,
  FileText,
  History,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import {
  downloadCsvFile,
  openPrintDocument,
  type PrintableRow,
} from "@/lib/dashboard/export";
import { formatCurrency } from "@/lib/dashboard/format";
import type { StatusTone } from "@/lib/dashboard/types";
import {
  buildLibraryAlerts,
  buildLibraryDashboard,
  buildLibraryReports,
  buildLibraryStats,
  calculateOverdueDays,
  createLibraryDataset,
  getBookById,
  getLibraryStatusTone,
  getMemberBorrowings,
  getMemberById,
  getOpenBorrowings,
  getOverdueBorrowings,
  issueLibraryBook,
  librarySidebarItems,
  returnLibraryBook,
  schoolLibraryCategories,
  type LibraryActivityLog,
  type LibraryBook,
  type LibraryBookStatus,
  type LibraryBorrowing,
  type LibraryBorrowReceipt,
  type LibraryDataset,
  type LibraryFine,
  type LibraryReport,
  type LibraryReturnCondition,
  type LibraryReturnReceipt,
  type LibrarySectionId,
} from "@/lib/library/library-data";
import {
  syncLibraryBorrowing,
  syncLibraryReturn,
} from "@/lib/library/library-sync";
import { getCsrfToken } from "@/lib/auth/csrf-client";
import { supportSidebarItems } from "@/lib/support/support-data";

type CatalogSortKey = "title" | "availability" | "category" | "status";

type BorrowFormState = {
  memberId: string;
  bookId: string;
  dueDate: string;
};

type ReturnFormState = {
  borrowingId: string;
  condition: LibraryReturnCondition;
  returnedAt: string;
  notes: string;
};

type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  category: string;
  member: string;
  status: string;
};

const sectionCopy: Record<
  LibrarySectionId,
  { title: string; description: string; icon: typeof BookOpen }
> = {
  dashboard: {
    title: "Librarian Dashboard",
    description: "Daily issue volume, overdue pressure, stock condition, recent returns, alerts, and activity.",
    icon: BookOpenCheck,
  },
  catalog: {
    title: "Catalog",
    description: "Accession-ready school resource catalog with ISBN, shelves, quantities, and condition visibility.",
    icon: BookOpen,
  },
  borrowing: {
    title: "Borrowing",
    description: "Search member, search book, check availability, assign due date, issue, and print receipt.",
    icon: ClipboardList,
  },
  "scan-issue": {
    title: "Scan Issue",
    description: "Issue books quickly with USB, Bluetooth, or handheld QR/barcode scanners that type into normal browser fields.",
    icon: BookOpenCheck,
  },
  "scan-return": {
    title: "Scan Return",
    description: "Return scanned books, calculate overdue fines, and update copy availability without hardware-specific drivers.",
    icon: RotateCcw,
  },
  returns: {
    title: "Returns",
    description: "Validate borrower, calculate overdue days, assess fines, update stock, and print return receipt.",
    icon: RotateCcw,
  },
  overdue: {
    title: "Overdue",
    description: "Track overdue borrowers, classes, contacts, titles, days late, and reminder actions.",
    icon: AlertTriangle,
  },
  members: {
    title: "Members",
    description: "Students, teachers, and staff with active borrowings, overdue books, history, and fines.",
    icon: Users,
  },
  fines: {
    title: "Fines",
    description: "Overdue, lost, and damaged penalties with paid, pending, and waived status tracking.",
    icon: ReceiptText,
  },
  reports: {
    title: "Reports",
    description: "Borrowing, overdue, popular books, losses, damages, student history, and valuation exports.",
    icon: BarChart3,
  },
  "activity-log": {
    title: "Activity Log",
    description: "Audit trail for issued books, returns, fines, inventory edits, adjustments, and affected items.",
    icon: History,
  },
};

const initialBorrowForm: BorrowFormState = {
  memberId: "member-sh-24011",
  bookId: "book-math-g7",
  dueDate: "2026-05-21",
};

const initialReturnForm: ReturnFormState = {
  borrowingId: "borrow-overdue-blossoms",
  condition: "good",
  returnedAt: "2026-05-07",
  notes: "",
};

const reportFilterDefaults: ReportFilters = {
  dateFrom: "2026-05-01",
  dateTo: "2026-05-07",
  category: "",
  member: "",
  status: "",
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

function ScannerIssueSection() {
  const [borrowerCode, setBorrowerCode] = useState("");
  const [bookCode, setBookCode] = useState("");
  const [dueOn, setDueOn] = useState(defaultLibraryDueDate());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!borrowerCode.trim() || !bookCode.trim() || !dueOn) {
      setError("Enter the learner name or admission number, scan the book code, then choose a due date.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await postScannerAction("/api/library/scan-issue", {
        borrower_scan_code: borrowerCode.trim(),
        book_scan_code: bookCode.trim(),
        due_on: dueOn,
      });

      setMessage(result);
      setBookCode("");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Book issue failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
      <ScannerPanel
        title="Scan-to-issue"
        description="Enter the learner name or admission number, scan the book QR/barcode, and the system issues the copy through the live library API."
      message={message}
      error={error}
    >
      <form className="grid gap-3 lg:grid-cols-[1fr_1fr_180px_auto]" onSubmit={handleSubmit}>
          <label className="space-y-1">
          <span className="text-[12px] font-semibold text-muted">Learner name or admission number</span>
          <input
            autoFocus
            className="w-full rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2 text-[13px] outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={borrowerCode}
            onChange={(event) => setBorrowerCode(event.target.value)}
              placeholder="Type name or admission number"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-semibold text-muted">Book QR/barcode</span>
          <input
            className="w-full rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2 text-[13px] outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={bookCode}
            onChange={(event) => setBookCode(event.target.value)}
            placeholder="Scan book"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-semibold text-muted">Due date</span>
          <input
            type="date"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2 text-[13px] outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button className="w-full lg:w-auto" disabled={isSubmitting} type="submit">
            <BookOpenCheck className="h-3.5 w-3.5" />
            {isSubmitting ? "Issuing..." : "Issue"}
          </Button>
        </div>
      </form>
    </ScannerPanel>
  );
}

function ScannerReturnSection() {
  const [bookCode, setBookCode] = useState("");
  const [returnedOn, setReturnedOn] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!bookCode.trim() || !returnedOn) {
      setError("Scan the book code and confirm the return date.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await postScannerAction("/api/library/scan-return", {
        book_scan_code: bookCode.trim(),
        returned_on: returnedOn,
      });

      setMessage(result);
      setBookCode("");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Book return failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScannerPanel
      title="Scan-to-return"
      description="Scan the returned book and the system closes the active loan, calculates overdue fines, and restores availability."
      message={message}
      error={error}
    >
      <form className="grid gap-3 lg:grid-cols-[1fr_180px_auto]" onSubmit={handleSubmit}>
        <label className="space-y-1">
          <span className="text-[12px] font-semibold text-muted">Book QR/barcode</span>
          <input
            autoFocus
            className="w-full rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2 text-[13px] outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={bookCode}
            onChange={(event) => setBookCode(event.target.value)}
            placeholder="Scan book"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-semibold text-muted">Returned on</span>
          <input
            type="date"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-white px-3 py-2 text-[13px] outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={returnedOn}
            onChange={(event) => setReturnedOn(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button className="w-full lg:w-auto" disabled={isSubmitting} type="submit">
            <RotateCcw className="h-3.5 w-3.5" />
            {isSubmitting ? "Returning..." : "Return"}
          </Button>
        </div>
      </form>
    </ScannerPanel>
  );
}

function ScannerPanel({
  title,
  description,
  message,
  error,
  children,
}: {
  title: string;
  description: string;
  message: string | null;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted">{description}</p>
        </div>
        <StatusPill label="Keyboard scanner ready" tone="ok" compact />
      </div>
      <div className="mt-4">{children}</div>
      {message ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-teal-200 bg-teal-50 px-3 py-2 text-[13px] font-semibold text-teal-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">
          {error}
        </div>
      ) : null}
      <div className="mt-4 rounded-[var(--radius-sm)] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">
        USB and Bluetooth scanners usually behave like keyboards. Keep the cursor in the scan field and scan; most scanners submit with Enter automatically.
      </div>
    </Card>
  );
}

async function postScannerAction(endpoint: string, body: Record<string, string>) {
  const csrfToken = await getCsrfToken();
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-shulehub-csrf": csrfToken,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { synced?: boolean; message?: string }
    | null;

  if (!response.ok || payload?.synced === false) {
    throw new Error(payload?.message ?? "Scanner action could not be completed.");
  }

  return payload?.message ?? "Scanner action completed.";
}

function defaultLibraryDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  return dueDate.toISOString().slice(0, 10);
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the library transaction.";
}

function compareBooks(sortKey: CatalogSortKey) {
  return (first: LibraryBook, second: LibraryBook) => {
    if (sortKey === "availability") {
      return second.quantityAvailable - first.quantityAvailable;
    }

    if (sortKey === "category") {
      return first.category.localeCompare(second.category) || first.title.localeCompare(second.title);
    }

    if (sortKey === "status") {
      const weight: Record<LibraryBookStatus, number> = {
        overdue: 0,
        lost: 1,
        damaged: 2,
        reserved: 3,
        borrowed: 4,
        available: 5,
      };
      return weight[first.status] - weight[second.status];
    }

    return first.title.localeCompare(second.title);
  };
}

function matchesBookSearch(book: LibraryBook, query: string) {
  if (!query) {
    return true;
  }

  return [
    book.accessionNumber,
    book.isbn,
    book.title,
    book.subtitle,
    book.author,
    book.publisher,
    book.category,
    book.subject,
    book.shelfLocation,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function selectRowsForReport(report: LibraryReport, filters: ReportFilters) {
  return report.rows.filter((row) => {
    const joined = row.join(" ").toLowerCase();

    if (filters.dateFrom && joined.includes("2026-") && !joined.includes(filters.dateFrom.slice(0, 7))) {
      return false;
    }

    if (filters.category && !joined.includes(filters.category.toLowerCase())) {
      return false;
    }

    if (filters.member && !joined.includes(filters.member.toLowerCase())) {
      return false;
    }

    if (filters.status && !joined.includes(filters.status.toLowerCase())) {
      return false;
    }

    return true;
  });
}

function buildReportPrintRows(report: LibraryReport, rows: string[][]): PrintableRow[] {
  if (rows.length === 0) {
    return [{ label: "Result", value: "No rows matched the selected filters." }];
  }

  return rows.slice(0, 30).map((row) => ({
    label: row[0] ?? report.title,
    value: row.slice(1).join(" | "),
  }));
}

function buildBorrowReceiptRows(receipt: LibraryBorrowReceipt): PrintableRow[] {
  return [
    { label: "Receipt", value: receipt.reference },
    { label: "Borrower", value: receipt.borrower },
    { label: "Admission/Staff No", value: receipt.admissionOrStaffNo },
    { label: "Class/Department", value: receipt.className },
    { label: "Book", value: receipt.title },
    { label: "Accession", value: receipt.accessionNumber },
    { label: "Issued at", value: receipt.issuedAt },
    { label: "Due date", value: receipt.dueDate },
    { label: "Issued by", value: receipt.issuedBy },
  ];
}

function buildReturnReceiptRows(receipt: LibraryReturnReceipt): PrintableRow[] {
  return [
    { label: "Receipt", value: receipt.reference },
    { label: "Borrower", value: receipt.borrower },
    { label: "Book", value: receipt.title },
    { label: "Accession", value: receipt.accessionNumber },
    { label: "Returned at", value: receipt.returnedAt },
    { label: "Overdue days", value: `${receipt.overdueDays}` },
    {
      label: "Fine amount",
      value: formatCurrency(receipt.fineAmount, false),
      tone: receipt.fineAmount > 0 ? "danger" : "default",
    },
    { label: "Received by", value: receipt.receivedBy },
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

function WorkflowSteps({ steps }: { steps: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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

function ReceiptPreview({
  title,
  rows,
  onPrint,
}: {
  title: string;
  rows: PrintableRow[];
  onPrint: () => void;
}) {
  return (
    <Card className="border-success/30 bg-success/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[12px] text-muted">Printable library transaction receipt generated.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.slice(0, 6).map((row) => (
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

export function LibraryWorkspace({
  section,
  userLabel = "Librarian Amani Prep",
  tenantSlug = "amani-prep",
}: {
  section: LibrarySectionId;
  userLabel?: string;
  tenantSlug?: string;
}) {
  const [dataset, setDataset] = useState<LibraryDataset>(() => createLibraryDataset());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<CatalogSortKey>("status");
  const [borrowForm, setBorrowForm] = useState<BorrowFormState>(initialBorrowForm);
  const [returnForm, setReturnForm] = useState<ReturnFormState>(initialReturnForm);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [lastBorrowReceipt, setLastBorrowReceipt] = useState<LibraryBorrowReceipt | null>(null);
  const [lastReturnReceipt, setLastReturnReceipt] = useState<LibraryReturnReceipt | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reportFilters, setReportFilters] = useState<ReportFilters>(reportFilterDefaults);
  const [isBorrowPending, startBorrowTransition] = useTransition();
  const [isReturnPending, startReturnTransition] = useTransition();
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const activeCopy = sectionCopy[section];
  const ActiveIcon = activeCopy.icon;
  const dashboard = buildLibraryDashboard(dataset);
  const alerts = buildLibraryAlerts(dataset);
  const stats = buildLibraryStats(dataset);
  const reports = buildLibraryReports(dataset);
  const openBorrowings = getOpenBorrowings(dataset);

  const categories = useMemo(
    () => Array.from(new Set([...schoolLibraryCategories, ...dataset.books.map((book) => book.category)])).sort(),
    [dataset.books],
  );

  const filteredBooks = dataset.books
    .filter((book) => matchesBookSearch(book, deferredSearch))
    .filter((book) => (categoryFilter ? book.category === categoryFilter : true))
    .filter((book) => {
      if (availabilityFilter === "available") {
        return book.quantityAvailable > 0;
      }

      if (availabilityFilter === "unavailable") {
        return book.quantityAvailable <= 0;
      }

      return true;
    })
    .filter((book) => (statusFilter ? book.status === statusFilter : true))
    .sort(compareBooks(sortKey));

  function handleBorrowSubmit() {
    setActionError(null);
    const submissionId = `borrow-${Date.now()}-${borrowForm.bookId}`;
    const input = {
      ...borrowForm,
      issuedBy: userLabel,
      submissionId,
    };

    startBorrowTransition(() => {
      try {
        const result = issueLibraryBook(dataset, input);

        setDataset(result.dataset);
        setLastBorrowReceipt(result.borrowReceipt);
        setBorrowModalOpen(false);
        setSyncMessage("Borrowing saved locally. Syncing with live library API...");
        void syncLibraryBorrowing(input)
          .then((syncResult) => setSyncMessage(syncResult.message))
          .catch((error: unknown) => setSyncMessage(getErrorMessage(error)));
      } catch (error) {
        setActionError(getErrorMessage(error));
      }
    });
  }

  function handleReturnSubmit() {
    setActionError(null);
    const input = {
      ...returnForm,
      receivedBy: userLabel,
    };

    startReturnTransition(() => {
      try {
        const result = returnLibraryBook(dataset, input);

        setDataset(result.dataset);
        setLastReturnReceipt(result.returnReceipt);
        setReturnModalOpen(false);
        setSyncMessage("Return saved locally. Syncing with live library API...");
        void syncLibraryReturn(input)
          .then((syncResult) => setSyncMessage(syncResult.message))
          .catch((error: unknown) => setSyncMessage(getErrorMessage(error)));
      } catch (error) {
        setActionError(getErrorMessage(error));
      }
    });
  }

  function printBorrowReceipt(receipt: LibraryBorrowReceipt) {
    openPrintDocument({
      eyebrow: "School library borrow receipt",
      title: `Borrow receipt ${receipt.reference}`,
      subtitle: "Borrower copy, librarian copy, and book-card record.",
      rows: buildBorrowReceiptRows(receipt),
      footer: "Borrower confirms book condition and undertakes to return the resource by the due date.",
    });
  }

  function printReturnReceipt(receipt: LibraryReturnReceipt) {
    openPrintDocument({
      eyebrow: "School library return receipt",
      title: `Return receipt ${receipt.reference}`,
      subtitle: "Return validation, overdue calculation, and fine assessment.",
      rows: buildReturnReceiptRows(receipt),
      footer: "Fine balances remain pending until paid or waived by authorized school staff.",
    });
  }

  function renderSearchFilters() {
    return (
      <Card className="p-3">
        <div className="grid gap-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.7fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputClassName()} pl-9`}
              placeholder="Instant catalog search: title, ISBN, accession, author, shelf"
              aria-label="Search catalog"
            />
          </div>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={inputClassName()} aria-label="Category filter">
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} className={inputClassName()} aria-label="Availability filter">
            <option value="">All availability</option>
            <option value="available">Available only</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClassName()} aria-label="Status filter">
            <option value="">All status</option>
            <option value="available">Available</option>
            <option value="borrowed">Borrowed</option>
            <option value="overdue">Overdue</option>
            <option value="damaged">Damaged</option>
            <option value="lost">Lost</option>
            <option value="reserved">Reserved</option>
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as CatalogSortKey)} className={inputClassName()} aria-label="Sort catalog">
            <option value="status">Risk first</option>
            <option value="title">Title</option>
            <option value="category">Category</option>
            <option value="availability">Availability</option>
          </select>
        </div>
      </Card>
    );
  }

  function renderBorrowForm(inModal = false) {
    const selectedBook = getBookById(dataset, borrowForm.bookId);
    const selectedMember = getMemberById(dataset, borrowForm.memberId);
    const available = selectedBook?.quantityAvailable ?? 0;

    return (
      <div className="space-y-4">
        {actionError && inModal ? (
          <div role="alert" className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-3 py-2 text-[13px] font-semibold text-foreground">
            {actionError}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Student / staff">
            <select value={borrowForm.memberId} onChange={(event) => setBorrowForm((current) => ({ ...current, memberId: event.target.value }))} className={inputClassName()}>
              {dataset.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} - {member.admissionOrStaffNo}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Book">
            <select value={borrowForm.bookId} onChange={(event) => setBorrowForm((current) => ({ ...current, bookId: event.target.value }))} className={inputClassName()}>
              {dataset.books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.accessionNumber} - {book.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" value={borrowForm.dueDate} onChange={(event) => setBorrowForm((current) => ({ ...current, dueDate: event.target.value }))} className={inputClassName()} />
          </Field>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <CompactRow
            title="Borrower validation"
            detail={selectedMember ? `${selectedMember.memberType} | ${selectedMember.className} | ${selectedMember.contact}` : "No member selected"}
            value={selectedMember?.status ?? "-"}
            tone={selectedMember?.status === "active" ? "ok" : "critical"}
          />
          <CompactRow
            title="Availability check"
            detail={selectedBook ? `${selectedBook.shelfLocation} | ${selectedBook.category}` : "No book selected"}
            value={`${available} available`}
            tone={available > 0 ? "ok" : "critical"}
          />
          <CompactRow
            title="Receipt"
            detail="Generated immediately after issue"
            value="Ready"
            tone="ok"
          />
        </div>
      </div>
    );
  }

  function renderReturnForm(inModal = false) {
    const selectedBorrowing = dataset.borrowings.find((borrowing) => borrowing.id === returnForm.borrowingId);
    const selectedBook = selectedBorrowing ? getBookById(dataset, selectedBorrowing.bookId) : null;
    const selectedMember = selectedBorrowing ? getMemberById(dataset, selectedBorrowing.memberId) : null;
    const overdueDays = selectedBorrowing ? calculateOverdueDays(selectedBorrowing.dueDate, returnForm.returnedAt) : 0;

    return (
      <div className="space-y-4">
        {actionError && inModal ? (
          <div role="alert" className="rounded-[var(--radius-sm)] border border-danger/20 bg-danger/10 px-3 py-2 text-[13px] font-semibold text-foreground">
            {actionError}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Borrowed book">
            <select value={returnForm.borrowingId} onChange={(event) => setReturnForm((current) => ({ ...current, borrowingId: event.target.value }))} className={inputClassName()}>
              {openBorrowings.map((borrowing) => {
                const book = getBookById(dataset, borrowing.bookId);
                const member = getMemberById(dataset, borrowing.memberId);
                return (
                  <option key={borrowing.id} value={borrowing.id}>
                    {book?.accessionNumber} - {member?.fullName}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Condition">
            <select value={returnForm.condition} onChange={(event) => setReturnForm((current) => ({ ...current, condition: event.target.value as LibraryReturnCondition }))} className={inputClassName()}>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </select>
          </Field>
          <Field label="Returned at">
            <input type="date" value={returnForm.returnedAt} onChange={(event) => setReturnForm((current) => ({ ...current, returnedAt: event.target.value }))} className={inputClassName()} />
          </Field>
          <Field label="Notes">
            <input value={returnForm.notes} onChange={(event) => setReturnForm((current) => ({ ...current, notes: event.target.value }))} className={inputClassName()} placeholder="Condition or reminder note" />
          </Field>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <CompactRow
            title="Borrower"
            detail={selectedMember ? `${selectedMember.fullName} | ${selectedMember.className}` : "No borrower selected"}
            value={selectedMember?.admissionOrStaffNo}
            tone="ok"
          />
          <CompactRow
            title="Book"
            detail={selectedBook ? `${selectedBook.title} | ${selectedBook.shelfLocation}` : "No book selected"}
            value={selectedBook?.accessionNumber}
            tone="ok"
          />
          <CompactRow
            title="Overdue calculation"
            detail={selectedBorrowing ? `Due ${selectedBorrowing.dueDate}` : "No due date selected"}
            value={`${overdueDays} days`}
            tone={overdueDays > 0 ? "critical" : "ok"}
          />
        </div>
      </div>
    );
  }

  function renderDashboard() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {stats.map((stat) => (
            <Card key={stat.id} className={`p-4 ${toneRing(stat.tone)}`}>
              <p className="text-[12px] font-semibold text-muted">{stat.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{stat.value}</p>
              <p className="mt-1 text-[12px] text-muted">{stat.helper}</p>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Popular books" subtitle="High-use resources that may need extra copies.">
            <div className="space-y-2">
              {dashboard.popularBooks.map((book) => (
                <CompactRow
                  key={book.id}
                  title={book.title}
                  detail={`${book.accessionNumber} | ${book.category} | ${book.shelfLocation}`}
                  value={`${book.popularityScore} uses`}
                  tone={book.quantityAvailable > 0 ? "ok" : "warning"}
                />
              ))}
            </div>
          </Panel>
          <Panel title="Recently returned books" subtitle="Returns processed today with condition and borrower.">
            <div className="space-y-2">
              {dashboard.recentlyReturnedBooks.map((item) => (
                <CompactRow
                  key={item.id}
                  title={item.book?.title ?? "Library return"}
                  detail={`${item.member?.fullName ?? "Member"} | ${item.condition} | ${item.returnedAt}`}
                  value={formatCurrency(item.fineAmount, false)}
                  tone={item.fineAmount > 0 ? "warning" : "ok"}
                />
              ))}
            </div>
          </Panel>
        </div>
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Alerts" subtitle="Overdue warnings, no-copy titles, and pending fines.">
            <div className="space-y-2">
              {alerts.map((alert) => (
                <CompactRow key={alert.id} title={alert.title} detail={alert.detail} value={alert.actionLabel} tone={alert.tone} />
              ))}
            </div>
          </Panel>
          <Panel title="Recent activity feed" subtitle="Live operational audit trail.">
            <div className="space-y-2">
              {dataset.activityLogs.slice(0, 6).map((log) => (
                <CompactRow
                  key={log.id}
                  title={`${log.action} - ${log.affectedItem}`}
                  detail={`${log.timestamp} | ${log.librarian} | ${log.detail}`}
                  tone={log.action.includes("fine") ? "warning" : "ok"}
                />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  function renderCatalog() {
    const columns: DataTableColumn<LibraryBook>[] = [
      { id: "accession", header: "Accession no", render: (book) => <span className="font-mono text-[12px]">{book.accessionNumber}</span> },
      { id: "title", header: "Title", render: (book) => <div><p className="font-semibold">{book.title}</p><p className="text-[12px] text-muted">{book.author}</p></div> },
      { id: "category", header: "Category", render: (book) => book.category },
      { id: "availability", header: "Availability", render: (book) => `${book.quantityAvailable}/${book.quantityTotal}` },
      { id: "shelf", header: "Shelf", render: (book) => book.shelfLocation },
      {
        id: "status",
        header: "Status",
        render: (book) => <StatusPill label={formatStatus(book.status)} tone={getLibraryStatusTone(book.status)} compact />,
      },
    ];

    return (
      <div className="space-y-4">
        {renderSearchFilters()}
        <DataTable
          title="Book catalog"
          subtitle="Accession, ISBN, category, shelf, and stock state."
          columns={columns}
          rows={filteredBooks}
          getRowKey={(book) => book.id}
          emptyMessage="No books added yet. Add first library resource."
          pageSize={8}
        />
      </div>
    );
  }

  function renderBorrowing() {
    return (
      <div className="space-y-4">
        <Panel title="Borrow flow" subtitle="Search, validate, issue, print receipt, and update stock instantly.">
          <WorkflowSteps steps={["Search student/staff", "Search book", "Check availability", "Assign due date", "Issue book", "Generate receipt", "Update inventory"]} />
          <div className="mt-4">{renderBorrowForm()}</div>
          <div className="mt-4 flex justify-end">
            <Button disabled={isBorrowPending} onClick={handleBorrowSubmit}>
              Issue book
            </Button>
          </div>
        </Panel>
        {lastBorrowReceipt ? (
          <ReceiptPreview
            title={`Borrow receipt ${lastBorrowReceipt.reference}`}
            rows={buildBorrowReceiptRows(lastBorrowReceipt)}
            onPrint={() => printBorrowReceipt(lastBorrowReceipt)}
          />
        ) : null}
        {renderBorrowingsTable(openBorrowings, "Current borrowed books")}
      </div>
    );
  }

  function renderReturns() {
    return (
      <div className="space-y-4">
        <Panel title="Return flow" subtitle="Select borrowed book, validate borrower, calculate overdue, fine, and restore stock.">
          <WorkflowSteps steps={["Scan/select borrowed book", "Validate borrower", "Calculate overdue", "Apply fines", "Mark returned", "Update stock"]} />
          <div className="mt-4">{renderReturnForm()}</div>
          <div className="mt-4 flex justify-end">
            <Button disabled={isReturnPending} onClick={handleReturnSubmit}>
              Process return
            </Button>
          </div>
        </Panel>
        {lastReturnReceipt ? (
          <ReceiptPreview
            title={`Return receipt ${lastReturnReceipt.reference}`}
            rows={buildReturnReceiptRows(lastReturnReceipt)}
            onPrint={() => printReturnReceipt(lastReturnReceipt)}
          />
        ) : null}
      </div>
    );
  }

  function renderBorrowingsTable(rows: LibraryBorrowing[], title: string) {
    const columns: DataTableColumn<LibraryBorrowing>[] = [
      { id: "reference", header: "Reference", render: (borrowing) => <span className="font-mono text-[12px]">{borrowing.reference}</span> },
      { id: "book", header: "Book title", render: (borrowing) => getBookById(dataset, borrowing.bookId)?.title ?? "-" },
      { id: "borrower", header: "Borrower", render: (borrowing) => getMemberById(dataset, borrowing.memberId)?.fullName ?? "-" },
      { id: "class", header: "Class", render: (borrowing) => getMemberById(dataset, borrowing.memberId)?.className ?? "-" },
      { id: "due", header: "Due date", render: (borrowing) => borrowing.dueDate },
      {
        id: "status",
        header: "Status",
        render: (borrowing) => <StatusPill label={formatStatus(borrowing.status)} tone={getLibraryStatusTone(borrowing.status)} compact />,
      },
    ];

    return (
      <DataTable
        title={title}
        subtitle="Borrower, class, title, due date, and status in one table."
        columns={columns}
        rows={rows}
        getRowKey={(borrowing) => borrowing.id}
        pageSize={8}
      />
    );
  }

  function renderOverdue() {
    const columns: DataTableColumn<LibraryBorrowing>[] = [
      { id: "days", header: "Overdue days", render: (borrowing) => calculateOverdueDays(borrowing.dueDate, "2026-05-07"), className: "font-semibold text-danger" },
      { id: "borrower", header: "Borrower", render: (borrowing) => getMemberById(dataset, borrowing.memberId)?.fullName ?? "-" },
      { id: "class", header: "Class", render: (borrowing) => getMemberById(dataset, borrowing.memberId)?.className ?? "-" },
      { id: "contact", header: "Contact info", render: (borrowing) => getMemberById(dataset, borrowing.memberId)?.contact ?? "-" },
      { id: "title", header: "Book title", render: (borrowing) => getBookById(dataset, borrowing.bookId)?.title ?? "-" },
      { id: "due", header: "Due date", render: (borrowing) => borrowing.dueDate },
    ];

    return (
      <DataTable
        title="Overdue register"
        subtitle="Daily reminder queue with borrower class and contact information."
        columns={columns}
        rows={getOverdueBorrowings(dataset)}
        getRowKey={(borrowing) => borrowing.id}
        pageSize={8}
      />
    );
  }

  function renderMembers() {
    const rows = dataset.members.map((member) => {
      const borrowings = getMemberBorrowings(dataset, member.id);
      const active = borrowings.filter((borrowing) => borrowing.status !== "returned").length;
      const overdue = borrowings.filter((borrowing) => borrowing.status === "overdue").length;
      const fines = dataset.fines.filter((fine) => fine.memberId === member.id && fine.status === "pending");

      return { ...member, active, overdue, history: borrowings.length, fineTotal: fines.reduce((sum, fine) => sum + fine.amount, 0) };
    });
    const columns: DataTableColumn<(typeof rows)[number]>[] = [
      { id: "name", header: "Member", render: (member) => <div><p className="font-semibold">{member.fullName}</p><p className="text-[12px] text-muted">{member.memberType} | {member.admissionOrStaffNo}</p></div> },
      { id: "class", header: "Class/Dept", render: (member) => member.className },
      { id: "active", header: "Active borrowings", render: (member) => member.active },
      { id: "overdue", header: "Overdue books", render: (member) => member.overdue },
      { id: "history", header: "Borrowing history", render: (member) => member.history },
      { id: "fines", header: "Fines", render: (member) => formatCurrency(member.fineTotal, false) },
    ];

    return (
      <DataTable
        title="Library members"
        subtitle="Students, teachers, and staff with borrowing pressure visible."
        columns={columns}
        rows={rows}
        getRowKey={(member) => member.id}
        pageSize={8}
      />
    );
  }

  function renderFines() {
    const columns: DataTableColumn<LibraryFine>[] = [
      { id: "fine", header: "Fine no", render: (fine) => <span className="font-mono text-[12px]">{fine.fineNumber}</span> },
      { id: "borrower", header: "Borrower", render: (fine) => getMemberById(dataset, fine.memberId)?.fullName ?? "-" },
      { id: "category", header: "Penalty", render: (fine) => formatStatus(fine.category) },
      { id: "amount", header: "Amount", render: (fine) => formatCurrency(fine.amount, false), className: "font-semibold" },
      {
        id: "status",
        header: "Status",
        render: (fine) => <StatusPill label={formatStatus(fine.status)} tone={getLibraryStatusTone(fine.status)} compact />,
      },
      { id: "notes", header: "Notes", render: (fine) => fine.notes },
    ];

    const pendingTotal = dataset.fines.filter((fine) => fine.status === "pending").reduce((sum, fine) => sum + fine.amount, 0);

    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <CompactRow title="Pending fines" detail="Overdue, lost, and damaged penalties" value={formatCurrency(pendingTotal, false)} tone={pendingTotal > 0 ? "critical" : "ok"} />
          <CompactRow title="Paid fines" detail="Cleared this term" value={formatCurrency(dataset.fines.filter((fine) => fine.status === "paid").reduce((sum, fine) => sum + fine.amount, 0), false)} tone="ok" />
          <CompactRow title="Fine rule" detail="Overdue daily penalty" value={formatCurrency(10, false)} tone="warning" />
        </div>
        <DataTable
          title="Fine register"
          subtitle="Pending, paid, and waived fines with member and reason."
          columns={columns}
          rows={dataset.fines}
          getRowKey={(fine) => fine.id}
          pageSize={8}
        />
      </div>
    );
  }

  function renderReports() {
    return (
      <div className="space-y-4">
        <Card className="p-3">
          <div className="grid gap-2 md:grid-cols-5">
            <Field label="Date from">
              <input type="date" value={reportFilters.dateFrom} onChange={(event) => setReportFilters((current) => ({ ...current, dateFrom: event.target.value }))} className={inputClassName()} />
            </Field>
            <Field label="Date to">
              <input type="date" value={reportFilters.dateTo} onChange={(event) => setReportFilters((current) => ({ ...current, dateTo: event.target.value }))} className={inputClassName()} />
            </Field>
            <Field label="Category">
              <select value={reportFilters.category} onChange={(event) => setReportFilters((current) => ({ ...current, category: event.target.value }))} className={inputClassName()}>
                <option value="">All</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Member">
              <select value={reportFilters.member} onChange={(event) => setReportFilters((current) => ({ ...current, member: event.target.value }))} className={inputClassName()}>
                <option value="">All</option>
                {dataset.members.map((member) => <option key={member.id} value={member.fullName}>{member.fullName}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={reportFilters.status} onChange={(event) => setReportFilters((current) => ({ ...current, status: event.target.value }))} className={inputClassName()}>
                <option value="">All</option>
                <option value="borrowed">Borrowed</option>
                <option value="overdue">Overdue</option>
                <option value="returned">Returned</option>
                <option value="pending">Pending fine</option>
              </select>
            </Field>
          </div>
        </Card>
        <div className="grid gap-4 xl:grid-cols-2">
          {reports.map((report) => {
            const rows = selectRowsForReport(report, reportFilters);
            const previewRows = rows.slice(0, 5);

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
                    <Button size="sm" variant="secondary" onClick={() => openPrintDocument({ eyebrow: "Library report PDF", title: report.title, subtitle: report.description, rows: buildReportPrintRows(report, rows), footer: "Use the browser print dialog to save this library report as PDF." })}>
                      <FileText className="h-3.5 w-3.5" />
                      Export PDF
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => downloadCsvFile({ filename: report.filename, headers: report.headers, rows })}>
                      <FileDown className="h-3.5 w-3.5" />
                      Export Excel
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openPrintDocument({ eyebrow: "Library report print", title: report.title, subtitle: report.description, rows: buildReportPrintRows(report, rows), footer: "Printed from the school library workspace." })}>
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  {previewRows.length ? (
                    previewRows.map((row, index) => (
                      <CompactRow key={`${report.id}-${index}`} title={row[0] ?? report.title} detail={row.slice(1, 4).join(" | ")} value={row.length > 4 ? row.slice(4).join(" | ") : `${row.length} fields`} tone="ok" />
                    ))
                  ) : (
                    <EmptyState title="No rows for this filter" description="Change the library report filters to widen the result set." />
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
    const columns: DataTableColumn<LibraryActivityLog>[] = [
      { id: "time", header: "Timestamp", render: (log) => log.timestamp },
      { id: "librarian", header: "Librarian", render: (log) => log.librarian },
      { id: "action", header: "Action", render: (log) => log.action },
      { id: "item", header: "Affected item", render: (log) => log.affectedItem },
      { id: "detail", header: "Detail", render: (log) => log.detail },
    ];

    return (
      <DataTable
        title="Library activity log"
        subtitle="Issued books, returns, fines, adjustments, and catalog edits."
        columns={columns}
        rows={dataset.activityLogs}
        getRowKey={(log) => log.id}
        pageSize={10}
      />
    );
  }

  function renderScannerIssue() {
    return <ScannerIssueSection />;
  }

  function renderScannerReturn() {
    return <ScannerReturnSection />;
  }

  function renderActiveSection() {
    switch (section) {
      case "dashboard":
        return renderDashboard();
      case "catalog":
        return renderCatalog();
      case "borrowing":
        return renderBorrowing();
      case "scan-issue":
        return renderScannerIssue();
      case "scan-return":
        return renderScannerReturn();
      case "returns":
        return renderReturns();
      case "overdue":
        return renderOverdue();
      case "members":
        return renderMembers();
      case "fines":
        return renderFines();
      case "reports":
        return renderReports();
      case "activity-log":
        return renderActivityLog();
    }
  }

  return (
    <main className="min-h-screen bg-[#eef3f1] text-foreground">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-slate-800 bg-slate-950 text-white lg:w-[250px] lg:border-b-0 lg:border-r">
          <div className="sticky top-0 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-teal-500/15 text-teal-300">
                <BookOpenCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] font-semibold">School Library</p>
                <p className="font-mono text-[11px] text-slate-400">{tenantSlug}</p>
              </div>
            </div>
            <div className="mt-4 rounded-[var(--radius-sm)] border border-slate-800 bg-slate-900/80 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Signed in</p>
              <p className="mt-1 truncate text-[13px] font-semibold">{userLabel}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-teal-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Librarian access only
              </div>
            </div>
            <nav className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
              {librarySidebarItems.map((item) => {
                const isActive = item.id === section;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold transition ${
                      isActive
                        ? "bg-teal-400 text-slate-950"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-4 border-t border-slate-800 pt-4">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Support Center
              </p>
              <nav className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                {supportSidebarItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.id}
                      href={`/school/librarian/${item.id}`}
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-teal-200 bg-teal-50 text-teal-700">
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
                <Button variant="secondary" onClick={() => setReturnModalOpen(true)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Return book
                </Button>
                <Button onClick={() => setBorrowModalOpen(true)}>
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  Issue book
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 md:px-6">
            {syncMessage ? (
              <Card className="border-teal-200 bg-teal-50 px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-teal-800">
                  <ShieldCheck className="h-4 w-4" />
                  {syncMessage}
                </div>
              </Card>
            ) : null}
            {renderActiveSection()}
          </div>
        </section>
      </div>

      <Modal
        open={borrowModalOpen}
        title="Issue library book"
        description="Validate borrower, verify availability, set the due date, and print a borrow receipt."
        onClose={() => {
          setBorrowModalOpen(false);
          setActionError(null);
        }}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBorrowModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isBorrowPending} onClick={handleBorrowSubmit}>
              Issue book
            </Button>
          </>
        }
      >
        {renderBorrowForm(true)}
      </Modal>

      <Modal
        open={returnModalOpen}
        title="Process library return"
        description="Validate the borrower, calculate overdue days, apply fines, and update catalog stock."
        onClose={() => {
          setReturnModalOpen(false);
          setActionError(null);
        }}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isReturnPending} onClick={handleReturnSubmit}>
              Process return
            </Button>
          </>
        }
      >
        {renderReturnForm(true)}
      </Modal>
    </main>
  );
}
