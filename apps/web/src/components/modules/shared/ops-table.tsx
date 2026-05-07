"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadCsvFile } from "@/lib/dashboard/export";

export interface OpsTableColumn<T> {
  id: string;
  header: string;
  mobileLabel?: string;
  className?: string;
  headerClassName?: string;
  render: (row: T) => ReactNode;
}

export interface OpsTableFilter {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export interface OpsTableSortOption {
  value: string;
  label: string;
}

export interface OpsTableExportConfig {
  filename: string;
  headers: string[];
  rows: string[][];
}

export function OpsTable<T>({
  title,
  subtitle,
  rows,
  columns,
  getRowId,
  searchValue,
  onSearchValueChange,
  searchPlaceholder = "Search records",
  filters = [],
  sortValue,
  onSortValueChange,
  sortOptions = [],
  totalRows,
  page,
  pageSize,
  onPageChange,
  loading = false,
  loadingLabel = "Loading records...",
  emptyTitle = "Nothing to show yet",
  emptyDescription = "The current filters returned no records.",
  emptyAction,
  exportConfig,
  actions,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  columns: OpsTableColumn<T>[];
  getRowId: (row: T) => string;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: OpsTableFilter[];
  sortValue?: string;
  onSortValueChange?: (value: string) => void;
  sortOptions?: OpsTableSortOption[];
  totalRows: number;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  loading?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  exportConfig?: OpsTableExportConfig;
  actions?: ReactNode;
}) {
  const pageCount = Math.max(1, Math.ceil(Math.max(totalRows, 1) / pageSize));
  const start = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Operational view
            </p>
            <h3 className="mt-2 text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.8fr))_auto]">
            <label className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3">
              <Search className="h-4 w-4 text-muted" />
              <input
                type="search"
                value={searchValue ?? ""}
                onChange={(event) => onSearchValueChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </label>

            {filters.map((filter) => (
              <label
                key={filter.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3"
              >
                <SlidersHorizontal className="h-4 w-4 text-muted" />
                <select
                  aria-label={filter.label}
                  value={filter.value}
                  onChange={(event) => filter.onChange(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            {sortOptions.length > 0 ? (
              <label className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3">
                <SlidersHorizontal className="h-4 w-4 text-muted" />
                <select
                  aria-label="Sort records"
                  value={sortValue}
                  onChange={(event) => onSortValueChange?.(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {exportConfig ? (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsvFile({
                    filename: exportConfig.filename,
                    headers: exportConfig.headers,
                    rows: exportConfig.rows,
                  })
                }
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm text-muted">
              Showing{" "}
              <span className="font-semibold text-foreground">
                {start}-{end}
              </span>{" "}
              of <span className="font-semibold text-foreground">{totalRows}</span> records
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPageChange(Math.min(pageCount, page + 1))}
                disabled={page >= pageCount}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-16">
          <EmptyState
            eyebrow="Loading"
            title={loadingLabel}
            description="The latest operational data is being prepared for this view."
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10">
          <EmptyState
            eyebrow="Empty result"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto xl:block">
            <table className="min-w-full table-auto border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted">
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted ${column.headerClassName ?? ""}`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={getRowId(row)}
                    className="border-b border-border transition duration-150 hover:bg-surface-muted/60 last:border-b-0"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={`px-4 py-3 align-top text-sm text-foreground ${column.className ?? ""}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 xl:hidden">
            {rows.map((row) => (
              <div
                key={getRowId(row)}
                className="rounded-xl border border-border bg-surface-muted px-4 py-4"
              >
                <div className="space-y-3">
                  {columns.map((column) => (
                    <div key={column.id} className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                        {column.mobileLabel ?? column.header}
                      </p>
                      <div className="text-sm text-foreground">{column.render(row)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
