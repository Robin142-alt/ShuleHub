import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { StorekeeperWorkspace } from "@/components/storekeeper/storekeeper-workspace";
import {
  createStorekeeperInventoryDataset,
  issueStoreStock,
  receiveStoreStock,
  storekeeperPermissions,
  storekeeperSidebarItems,
  type StorekeeperDataset,
} from "@/lib/storekeeper/storekeeper-data";
import {
  buildStockIssueSyncPayload,
  buildStockReceiptSyncPayload,
  syncStorekeeperStockIssue,
} from "@/lib/storekeeper/storekeeper-sync";

import { renderWithProviders } from "./test-utils";

function createStorekeeperTestDataset(): StorekeeperDataset {
  return {
    items: [
      {
        id: "item-paper",
        code: "STAT-A4-001",
        barcode: "TEST-A4",
        name: "A4 Printing Paper",
        category: "Stationery",
        quantityAvailable: 18,
        reorderLevel: 8,
        unit: "ream",
        location: "Main store",
        unitCost: 650,
        supplier: "Test stationery supplier",
        averageWeeklyIssue: 6,
      },
      {
        id: "item-lab-gloves",
        code: "LAB-GLV-001",
        barcode: "TEST-GLOVES",
        name: "Lab Gloves",
        category: "Science",
        quantityAvailable: 4,
        reorderLevel: 10,
        unit: "box",
        location: "Science store",
        unitCost: 1200,
        supplier: "Test laboratory supplier",
        averageWeeklyIssue: 3,
      },
    ],
    suppliers: [],
    requests: [],
    transfers: [],
    movements: [],
    processedSubmissionIds: [],
  };
}

describe("storekeeper inventory workspace", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("exposes only inventory operations in the storekeeper sidebar", () => {
    expect(storekeeperPermissions).toEqual([
      "inventory.view",
      "inventory.issue",
      "inventory.receive",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.reports",
    ]);

    expect(storekeeperSidebarItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Inventory",
      "Stock Receiving",
      "Stock Issuing",
      "Transfers",
      "Suppliers",
      "Reorder Alerts",
      "Reports",
      "Activity Log",
    ]);
  });

  it("issues stock with before and after quantities in the audit trail", () => {
    const dataset = createStorekeeperTestDataset();
    const paper = dataset.items.find((item) => item.code === "STAT-A4-001");

    expect(paper?.quantityAvailable).toBe(18);

    const result = issueStoreStock(dataset, {
      department: "Exams Office",
      recipient: "Lucy Wambui",
      issuedBy: "Storekeeper Test Operator",
      lines: [{ itemId: "item-paper", quantity: 4 }],
    });

    const updatedPaper = result.dataset.items.find((item) => item.id === "item-paper");
    expect(updatedPaper?.quantityAvailable).toBe(14);
    expect(result.issueNote.reference).toMatch(/^ISS-/);
    expect(result.issueNote.lines[0]).toEqual({
      itemCode: "STAT-A4-001",
      itemName: "A4 Printing Paper",
      quantity: 4,
      unit: "ream",
    });
    expect(result.dataset.movements[0]).toMatchObject({
      actionType: "issue",
      itemCode: "STAT-A4-001",
      beforeQuantity: 18,
      quantity: 4,
      afterQuantity: 14,
      department: "Exams Office",
      user: "Storekeeper Test Operator",
      counterparty: "Lucy Wambui",
    });
  });

  it("prevents stock issue when quantity exceeds available stock", () => {
    const dataset = createStorekeeperTestDataset();

    expect(() =>
      issueStoreStock(dataset, {
        department: "Science Lab",
        recipient: "Moses Otieno",
        issuedBy: "Storekeeper Test Operator",
        lines: [{ itemId: "item-lab-gloves", quantity: 99 }],
      }),
    ).toThrow("Only 4 Lab Gloves boxes are available.");
  });

  it("receives stock with batch, expiry, and movement audit details", () => {
    const dataset = createStorekeeperTestDataset();

    const result = receiveStoreStock(dataset, {
      supplier: "Test stationery supplier",
      purchaseReference: "PO-TEST-001",
      receivedBy: "Storekeeper Test Operator",
      lines: [
        {
          itemId: "item-paper",
          quantity: 12,
          unitCost: 690,
          batchNumber: "COS-A4-0526",
          expiryDate: "",
        },
      ],
    });

    const updatedPaper = result.dataset.items.find((item) => item.id === "item-paper");
    expect(updatedPaper?.quantityAvailable).toBe(30);
    expect(updatedPaper?.unitCost).toBe(690);
    expect(result.dataset.movements[0]).toMatchObject({
      actionType: "receipt",
      beforeQuantity: 18,
      quantity: 12,
      afterQuantity: 30,
      supplier: "Test stationery supplier",
      reference: "PO-TEST-001",
      batchNumber: "COS-A4-0526",
    });
  });

  it("starts with an empty production inventory dataset", () => {
    expect(createStorekeeperInventoryDataset()).toEqual({
      items: [],
      suppliers: [],
      requests: [],
      transfers: [],
      movements: [],
      processedSubmissionIds: [],
    });
  });

  it("maps local storekeeper issue and receipt workflows to backend sync payloads", () => {
    expect(
      buildStockIssueSyncPayload({
        department: "Exams Office",
        recipient: "Lucy Wambui",
        issuedBy: "Storekeeper Amani Prep",
        submissionId: "issue-001",
        lines: [{ itemId: "00000000-0000-0000-0000-000000000401", quantity: 4 }],
      }),
    ).toEqual({
      department: "Exams Office",
      received_by: "Lucy Wambui",
      submission_id: "issue-001",
      lines: [{ item_id: "00000000-0000-0000-0000-000000000401", quantity: 4 }],
      notes: "Issued by Storekeeper Amani Prep",
    });

    expect(
      buildStockReceiptSyncPayload({
        supplier: "Crown Office Supplies",
        purchaseReference: "PO-2026-031",
        receivedBy: "Storekeeper Amani Prep",
        submissionId: "receipt-001",
        lines: [
          {
            itemId: "00000000-0000-0000-0000-000000000401",
            quantity: 12,
            unitCost: 690,
            batchNumber: "COS-A4-0526",
            expiryDate: "2026-12-31",
          },
        ],
      }),
    ).toEqual({
      supplier_name: "Crown Office Supplies",
      purchase_reference: "PO-2026-031",
      submission_id: "receipt-001",
      lines: [
        {
          item_id: "00000000-0000-0000-0000-000000000401",
          quantity: 12,
          unit_cost: 690,
          batch_number: "COS-A4-0526",
          expiry_date: "2026-12-31",
        },
      ],
      notes: "Received by Storekeeper Amani Prep",
    });
  });

  it("attaches CSRF protection to live storekeeper sync writes", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "csrf-inventory-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          synced: true,
          message: "Stock issue synced to the live inventory API.",
        }),
      });
    Object.assign(global, { fetch: fetchMock });

    await syncStorekeeperStockIssue({
      department: "Exams Office",
      recipient: "Lucy Wambui",
      issuedBy: "Storekeeper Amani Prep",
      submissionId: "issue-001",
      lines: [{ itemId: "00000000-0000-0000-0000-000000000401", quantity: 4 }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/csrf",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/inventory/stock-issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-shulehub-csrf": "csrf-inventory-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("renders a dense warehouse dashboard without unrelated modules", async () => {
    renderWithProviders(createElement(StorekeeperWorkspace, { section: "dashboard" }));

    expect(screen.getByRole("heading", { name: /storekeeper dashboard/i })).toBeVisible();
    expect(screen.getByText(/Low stock items/i)).toBeVisible();
    expect(screen.getByText(/Pending stock requests/i)).toBeVisible();
    expect(screen.getByText(/Recently issued items/i)).toBeVisible();
    expect(screen.getByText(/Today's stock movement/i)).toBeVisible();
    expect(screen.getByText(/Items received today/i)).toBeVisible();
    expect(screen.getByText(/Expiring items/i)).toBeVisible();
    expect(screen.getByText(/Fast-moving items/i)).toBeVisible();
    expect(screen.queryByText(/Finance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Admissions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Academics/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Issue stock/i }));
    expect(screen.getByRole("heading", { name: /Issue stock voucher/i })).toBeVisible();
  });
});
