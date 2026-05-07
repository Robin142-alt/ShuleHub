import type { InventoryItem } from "@/lib/modules/inventory-data";
import {
  buildInventoryWorkflowLines,
  calculateInventoryWorkflowDraftTotal,
  countInventoryWorkflowDraftUnits,
  createInventoryWorkflowLineDraft,
  summarizeInventoryWorkflowLineDrafts,
  updateInventoryWorkflowLineItem,
  validateInventoryWorkflowLineDrafts,
} from "@/lib/modules/inventory-workflow";

const inventoryItems: InventoryItem[] = [
  {
    id: "itm-1",
    name: "A4 Printing Paper",
    sku: "STAT-A4-001",
    category: "Stationery",
    unit: "pack",
    quantity: 18,
    supplier: "Crown Office Supplies",
    unitPrice: 650,
    reorderLevel: 25,
    location: "Admin Store Shelf A2",
    notes: "Exam office issue line",
    archived: false,
  },
  {
    id: "itm-2",
    name: "Whiteboard Marker",
    sku: "STAT-MRK-002",
    category: "Stationery",
    unit: "box",
    quantity: 9,
    supplier: "Crown Office Supplies",
    unitPrice: 1200,
    reorderLevel: 12,
    location: "Staffroom Store Cabinet B1",
    notes: "CBC lesson delivery support",
    archived: false,
  },
];

describe("inventory workflow helpers", () => {
  test("hydrates selected items into submission-ready workflow lines", () => {
    const selectedLine = updateInventoryWorkflowLineItem(
      createInventoryWorkflowLineDraft({
        id: "line-1",
        quantity: "12",
      }),
      "itm-1",
      inventoryItems,
    );

    const lines = buildInventoryWorkflowLines([selectedLine], inventoryItems);

    expect(selectedLine.unitPrice).toBe("650");
    expect(lines).toEqual([
      {
        item_id: "itm-1",
        item_name: "A4 Printing Paper",
        quantity: 12,
        unit_price: 650,
      },
    ]);
  });

  test("summarizes multi-line workflows and calculates totals", () => {
    const lines = [
      createInventoryWorkflowLineDraft({
        id: "line-1",
        itemId: "itm-1",
        quantity: "12",
        unitPrice: "650",
      }),
      createInventoryWorkflowLineDraft({
        id: "line-2",
        itemId: "itm-2",
        quantity: "4",
        unitPrice: "1200",
      }),
    ];

    expect(summarizeInventoryWorkflowLineDrafts(lines, inventoryItems)).toBe(
      "A4 Printing Paper x12 +1 more",
    );
    expect(calculateInventoryWorkflowDraftTotal(lines)).toBe(12600);
    expect(countInventoryWorkflowDraftUnits(lines)).toBe(16);
  });

  test("flags incomplete workflow lines before live submission", () => {
    const invalidLines = [
      createInventoryWorkflowLineDraft({
        id: "line-1",
        itemId: "itm-1",
        quantity: "",
        unitPrice: "650",
      }),
    ];

    expect(validateInventoryWorkflowLineDrafts(invalidLines, inventoryItems)).toBe(
      "Enter a quantity above zero for line 1.",
    );
  });
});
