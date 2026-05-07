"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/dashboard/format";
import type { InventoryItem } from "@/lib/modules/inventory-data";
import {
  calculateInventoryWorkflowDraftTotal,
  createInventoryWorkflowLineDraft,
  updateInventoryWorkflowLineItem,
  type InventoryWorkflowLineDraft,
} from "@/lib/modules/inventory-workflow";

const fieldClassName =
  "w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none transition duration-150 focus:border-accent/40 focus:bg-surface";

export function InventoryLineItemsEditor({
  label,
  description,
  lines,
  items,
  onChange,
  error,
  allowUnitPriceEdit = false,
  addButtonLabel = "Add line",
}: {
  label: string;
  description: string;
  lines: InventoryWorkflowLineDraft[];
  items: InventoryItem[];
  onChange: (lines: InventoryWorkflowLineDraft[]) => void;
  error?: string;
  allowUnitPriceEdit?: boolean;
  addButtonLabel?: string;
}) {
  const totalValue = calculateInventoryWorkflowDraftTotal(lines);

  function updateLine(lineId: string, updater: (line: InventoryWorkflowLineDraft) => InventoryWorkflowLineDraft) {
    onChange(lines.map((line) => (line.id === lineId ? updater(line) : line)));
  }

  function removeLine(lineId: string) {
    if (lines.length === 1) {
      onChange([createInventoryWorkflowLineDraft()]);
      return;
    }

    onChange(lines.filter((line) => line.id !== lineId));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        </div>
        <Button onClick={() => onChange([...lines, createInventoryWorkflowLineDraft()])} variant="secondary">
          <Plus className="h-4 w-4" />
          {addButtonLabel}
        </Button>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const selectedItem = items.find((item) => item.id === line.itemId) ?? null;
          const lineTotal =
            Number(line.quantity) > 0 && Number(line.unitPrice) > 0
              ? Number(line.quantity) * Number(line.unitPrice)
              : 0;

          return (
            <div
              key={line.id}
              className="rounded-2xl border border-border bg-surface-muted px-4 py-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Line {index + 1}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLine(line.id)}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </div>

              <div className="grid gap-3 lg:grid-cols-4">
                <label className="space-y-2 lg:col-span-2">
                  <span className="text-sm font-semibold text-foreground">Item</span>
                  <select
                    className={fieldClassName}
                    value={line.itemId}
                    onChange={(event) =>
                      updateLine(line.id, (current) =>
                        updateInventoryWorkflowLineItem(current, event.target.value, items),
                      )
                    }
                  >
                    <option value="">Select inventory item</option>
                    {items
                      .filter((item) => !item.archived)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                  </select>
                  {selectedItem ? (
                    <p className="text-xs text-muted">
                      In store: {selectedItem.quantity} {selectedItem.unit} · {selectedItem.location}
                    </p>
                  ) : null}
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-foreground">Quantity</span>
                  <input
                    className={fieldClassName}
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.id, (current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </label>

                {allowUnitPriceEdit ? (
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Unit price</span>
                    <input
                      className={fieldClassName}
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(line.id, (current) => ({
                          ...current,
                          unitPrice: event.target.value,
                        }))
                      }
                      placeholder="0"
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">Unit price</span>
                    <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground">
                      {selectedItem ? formatCurrency(Number(line.unitPrice || selectedItem.unitPrice), false) : "Select item"}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  {allowUnitPriceEdit ? "Line total" : "Reference value"}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {lineTotal > 0 ? formatCurrency(lineTotal, false) : "Awaiting item and quantity"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Estimated total value</p>
        <p className="mt-2 text-sm font-semibold text-foreground">
          {totalValue > 0 ? formatCurrency(totalValue, false) : "No value yet"}
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
