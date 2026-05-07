import type { InventoryItem } from "@/lib/modules/inventory-data";

export interface InventoryWorkflowLineDraft {
  id: string;
  itemId: string;
  quantity: string;
  unitPrice: string;
}

export interface InventoryWorkflowSubmissionLine {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
}

function buildInventoryWorkflowLineId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInventoryWorkflowLineDraft(
  overrides: Partial<InventoryWorkflowLineDraft> = {},
): InventoryWorkflowLineDraft {
  return {
    id: overrides.id ?? buildInventoryWorkflowLineId(),
    itemId: overrides.itemId ?? "",
    quantity: overrides.quantity ?? "",
    unitPrice: overrides.unitPrice ?? "",
  };
}

export function updateInventoryWorkflowLineItem(
  draft: InventoryWorkflowLineDraft,
  itemId: string,
  items: InventoryItem[],
): InventoryWorkflowLineDraft {
  const matchedItem = items.find((item) => item.id === itemId);

  return {
    ...draft,
    itemId,
    unitPrice: matchedItem ? `${matchedItem.unitPrice}` : "",
  };
}

export function validateInventoryWorkflowLineDrafts(
  drafts: InventoryWorkflowLineDraft[],
  items: InventoryItem[],
) {
  const hasAnyValue = drafts.some(
    (draft) => draft.itemId.trim() || draft.quantity.trim() || draft.unitPrice.trim(),
  );

  if (!hasAnyValue) {
    return "Add at least one inventory line.";
  }

  for (const [index, draft] of drafts.entries()) {
    if (!draft.itemId.trim()) {
      return `Select an inventory item for line ${index + 1}.`;
    }

    const matchedItem = items.find((item) => item.id === draft.itemId);

    if (!matchedItem) {
      return `Selected inventory item on line ${index + 1} is no longer available.`;
    }

    if (!draft.quantity.trim() || Number(draft.quantity) <= 0) {
      return `Enter a quantity above zero for line ${index + 1}.`;
    }

    if (!draft.unitPrice.trim() || Number(draft.unitPrice) <= 0) {
      return `Enter a unit price above zero for line ${index + 1}.`;
    }
  }

  return null;
}

export function buildInventoryWorkflowLines(
  drafts: InventoryWorkflowLineDraft[],
  items: InventoryItem[],
): InventoryWorkflowSubmissionLine[] {
  return drafts.flatMap((draft) => {
    const matchedItem = items.find((item) => item.id === draft.itemId);
    const quantity = Number(draft.quantity);
    const unitPrice = Number(draft.unitPrice);

    if (!matchedItem || quantity <= 0 || unitPrice <= 0) {
      return [];
    }

    return [
      {
        item_id: matchedItem.id,
        item_name: matchedItem.name,
        quantity,
        unit_price: unitPrice,
      },
    ];
  });
}

export function summarizeInventoryWorkflowLines(
  lines: Array<{
    item_name: string;
    quantity: number;
  }>,
) {
  if (lines.length === 0) {
    return "No lines recorded";
  }

  const [first, ...rest] = lines;
  const firstSummary = `${first.item_name} x${first.quantity}`;

  if (rest.length === 0) {
    return firstSummary;
  }

  return `${firstSummary} +${rest.length} more`;
}

export function summarizeInventoryWorkflowLineDrafts(
  drafts: InventoryWorkflowLineDraft[],
  items: InventoryItem[],
) {
  return summarizeInventoryWorkflowLines(buildInventoryWorkflowLines(drafts, items));
}

export function calculateInventoryWorkflowDraftTotal(drafts: InventoryWorkflowLineDraft[]) {
  return drafts.reduce((sum, draft) => {
    const quantity = Number(draft.quantity);
    const unitPrice = Number(draft.unitPrice);

    if (quantity <= 0 || unitPrice <= 0) {
      return sum;
    }

    return sum + quantity * unitPrice;
  }, 0);
}

export function countInventoryWorkflowDraftUnits(drafts: InventoryWorkflowLineDraft[]) {
  return drafts.reduce((sum, draft) => {
    const quantity = Number(draft.quantity);
    return quantity > 0 ? sum + quantity : sum;
  }, 0);
}
