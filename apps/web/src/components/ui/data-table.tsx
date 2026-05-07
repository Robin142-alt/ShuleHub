"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  className?: string;
  headerClassName?: string;
  mobileLabel?: string;
  render: (row: T) => ReactNode;
}

const PAGE_SIZE = 10;

export function DataTable<T>({
  title,
  subtitle,
  columns,
  rows,
  getRowKey,
  emptyMessage = "No records available.",
  pageSize = PAGE_SIZE,
}: {
  title?: string;
  subtitle?: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  pageSize?: number;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);

  const paginatedRows = useMemo(() => {
    const start = safeCurrentPage * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, pageSize, safeCurrentPage]);

  return (
    <Card className="overflow-hidden">
      {title || subtitle ? (
        <div className="border-b border-border px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              {title ? (
                <h3 className="section-title text-lg">
                  {title}
                </h3>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-[13px] text-muted line-clamp-1">{subtitle}</p>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <span className="badge badge-neutral shrink-0">
                {rows.length} {rows.length === 1 ? "record" : "records"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="px-5 py-10">
          <EmptyState
            title="Nothing to show yet"
            description={emptyMessage}
          />
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full table-auto border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted/50">
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className={`sticky top-0 z-10 bg-surface-muted/50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted select-none ${column.headerClassName ?? ""}`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedRows.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    className="table-row-hover group"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={`px-4 py-2.5 align-middle text-[13px] text-foreground ${column.className ?? ""}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-2 p-3 md:hidden">
            {paginatedRows.map((row) => (
              <div
                key={getRowKey(row)}
                className="rounded-[var(--radius-sm)] border border-border bg-surface-muted/50 px-4 py-3"
              >
                <div className="space-y-2">
                  {columns.map((column) => (
                    <div key={column.id} className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                        {column.mobileLabel ?? column.header}
                      </p>
                      <div className="text-[13px] text-foreground text-right">
                        {column.render(row)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <p className="text-[13px] text-muted">
                <span className="font-medium text-foreground">
                  {safeCurrentPage * pageSize + 1}
                </span>
                –
                <span className="font-medium text-foreground">
                  {Math.min((safeCurrentPage + 1) * pageSize, rows.length)}
                </span>
                {" "}of{" "}
                <span className="font-medium text-foreground">{rows.length}</span>
              </p>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={safeCurrentPage === 0}
                  onClick={() => setCurrentPage(0)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition-colors hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage === 0}
                  onClick={() =>
                    setCurrentPage((page) => Math.max(0, Math.min(page, totalPages - 1) - 1))
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition-colors hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 text-[13px] font-medium text-foreground tabular-nums">
                  {safeCurrentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages - 1}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages - 1, Math.min(page, totalPages - 1) + 1))
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition-colors hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages - 1}
                  onClick={() => setCurrentPage(totalPages - 1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-muted transition-colors hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
