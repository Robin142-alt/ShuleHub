import type {
  StorekeeperIssueInput,
  StorekeeperReceiveInput,
} from "@/lib/storekeeper/storekeeper-data";

export interface StorekeeperSyncResult {
  synced: boolean;
  message: string;
  upstream?: unknown;
}

export function buildStockIssueSyncPayload(input: StorekeeperIssueInput) {
  return {
    department: input.department,
    received_by: input.recipient,
    submission_id: input.submissionId,
    lines: input.lines.map((line) => ({
      item_id: line.itemId,
      quantity: line.quantity,
    })),
    notes: `Issued by ${input.issuedBy}`,
  };
}

export function buildStockReceiptSyncPayload(input: StorekeeperReceiveInput) {
  return {
    supplier_name: input.supplier,
    purchase_reference: input.purchaseReference,
    submission_id: input.submissionId,
    lines: input.lines.map((line) => ({
      item_id: line.itemId,
      quantity: line.quantity,
      unit_cost: line.unitCost,
      batch_number: line.batchNumber,
      expiry_date: line.expiryDate,
    })),
    notes: `Received by ${input.receivedBy}`,
  };
}

async function postStorekeeperSync(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as StorekeeperSyncResult | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Live inventory API sync failed.");
  }

  return body ?? {
    synced: false,
    message: "Live inventory API did not return a sync response.",
  };
}

export function syncStorekeeperStockIssue(input: StorekeeperIssueInput) {
  return postStorekeeperSync(
    "/api/inventory/stock-issues",
    buildStockIssueSyncPayload(input),
  );
}

export function syncStorekeeperStockReceipt(input: StorekeeperReceiveInput) {
  return postStorekeeperSync(
    "/api/inventory/stock-receipts",
    buildStockReceiptSyncPayload(input),
  );
}
