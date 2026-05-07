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
} from "@/lib/storekeeper/storekeeper-data";

import { renderWithProviders } from "./test-utils";

describe("storekeeper inventory workspace", () => {
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
    const dataset = createStorekeeperInventoryDataset();
    const paper = dataset.items.find((item) => item.code === "STAT-A4-001");

    expect(paper?.quantityAvailable).toBe(18);

    const result = issueStoreStock(dataset, {
      department: "Exams Office",
      recipient: "Lucy Wambui",
      issuedBy: "Storekeeper Amani Prep",
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
      user: "Storekeeper Amani Prep",
      counterparty: "Lucy Wambui",
    });
  });

  it("prevents stock issue when quantity exceeds available stock", () => {
    const dataset = createStorekeeperInventoryDataset();

    expect(() =>
      issueStoreStock(dataset, {
        department: "Science Lab",
        recipient: "Moses Otieno",
        issuedBy: "Storekeeper Amani Prep",
        lines: [{ itemId: "item-lab-gloves", quantity: 99 }],
      }),
    ).toThrow("Only 4 Lab Gloves boxes are available.");
  });

  it("receives stock with batch, expiry, and movement audit details", () => {
    const dataset = createStorekeeperInventoryDataset();

    const result = receiveStoreStock(dataset, {
      supplier: "Crown Office Supplies",
      purchaseReference: "PO-2026-031",
      receivedBy: "Storekeeper Amani Prep",
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
      supplier: "Crown Office Supplies",
      reference: "PO-2026-031",
      batchNumber: "COS-A4-0526",
    });
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
