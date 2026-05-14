import { formatCurrency } from "@/lib/dashboard/format";
import type { StatusTone } from "@/lib/dashboard/types";

export type StorekeeperPermission =
  | "inventory.view"
  | "inventory.issue"
  | "inventory.receive"
  | "inventory.adjust"
  | "inventory.transfer"
  | "inventory.reports";

export const storekeeperPermissions: StorekeeperPermission[] = [
  "inventory.view",
  "inventory.issue",
  "inventory.receive",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.reports",
];

export type StorekeeperSectionId =
  | "dashboard"
  | "items"
  | "receiving"
  | "issuing"
  | "transfers"
  | "suppliers"
  | "reorder-alerts"
  | "reports"
  | "activity-log";

export const storekeeperSections: StorekeeperSectionId[] = [
  "dashboard",
  "items",
  "receiving",
  "issuing",
  "transfers",
  "suppliers",
  "reorder-alerts",
  "reports",
  "activity-log",
];

export const storekeeperSidebarItems: Array<{
  id: StorekeeperSectionId;
  label: string;
  href: string;
}> = [
  { id: "dashboard", label: "Dashboard", href: "/inventory/dashboard" },
  { id: "items", label: "Inventory", href: "/inventory/items" },
  { id: "receiving", label: "Stock Receiving", href: "/inventory/receiving" },
  { id: "issuing", label: "Stock Issuing", href: "/inventory/issuing" },
  { id: "transfers", label: "Transfers", href: "/inventory/transfers" },
  { id: "suppliers", label: "Suppliers", href: "/inventory/suppliers" },
  { id: "reorder-alerts", label: "Reorder Alerts", href: "/inventory/reorder-alerts" },
  { id: "reports", label: "Reports", href: "/inventory/reports" },
  { id: "activity-log", label: "Activity Log", href: "/inventory/activity-log" },
];

export type StoreItemStatus = "healthy" | "low" | "critical";
export type StoreMovementType = "issue" | "receipt" | "adjustment" | "transfer" | "return";

export interface StorekeeperItem {
  id: string;
  code: string;
  barcode: string;
  name: string;
  category: string;
  quantityAvailable: number;
  reorderLevel: number;
  unit: string;
  location: string;
  unitCost: number;
  supplier: string;
  batchNumber?: string;
  expiryDate?: string;
  lastIssuedAt?: string;
  averageWeeklyIssue: number;
}

export interface StorekeeperSupplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  lastDelivery: string;
  activeOrders: number;
  status: "active" | "watch" | "on_hold";
}

export interface StorekeeperRequest {
  id: string;
  department: string;
  requestedBy: string;
  itemName: string;
  quantity: number;
  unit: string;
  status: "pending" | "approved" | "fulfilled";
  neededBy: string;
}

export interface StorekeeperTransfer {
  id: string;
  itemName: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  requestedBy: string;
  status: "requested" | "in_transit" | "completed";
  date: string;
}

export interface StorekeeperMovement {
  id: string;
  reference: string;
  actionType: StoreMovementType;
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  beforeQuantity: number;
  quantity: number;
  afterQuantity: number;
  unit: string;
  department?: string;
  supplier?: string;
  user: string;
  counterparty: string;
  timestamp: string;
  location: string;
  batchNumber?: string;
  expiryDate?: string;
  notes: string;
}

export interface StorekeeperAlert {
  id: string;
  title: string;
  detail: string;
  tone: StatusTone;
  actionLabel: string;
  section: StorekeeperSectionId;
}

export interface StorekeeperDataset {
  items: StorekeeperItem[];
  suppliers: StorekeeperSupplier[];
  requests: StorekeeperRequest[];
  transfers: StorekeeperTransfer[];
  movements: StorekeeperMovement[];
  processedSubmissionIds: string[];
}

export interface StorekeeperIssueInput {
  department: string;
  recipient: string;
  issuedBy: string;
  lines: Array<{ itemId: string; quantity: number }>;
  submissionId?: string;
}

export interface StorekeeperReceiveInput {
  supplier: string;
  purchaseReference: string;
  receivedBy: string;
  lines: Array<{
    itemId: string;
    quantity: number;
    unitCost: number;
    batchNumber: string;
    expiryDate: string;
  }>;
  submissionId?: string;
}

export interface StorekeeperIssueNote {
  reference: string;
  department: string;
  recipient: string;
  issuedBy: string;
  timestamp: string;
  lines: Array<{
    itemCode: string;
    itemName: string;
    quantity: number;
    unit: string;
  }>;
}

export interface StorekeeperReceiveNote {
  reference: string;
  supplier: string;
  purchaseReference: string;
  receivedBy: string;
  timestamp: string;
  lines: Array<{
    itemCode: string;
    itemName: string;
    quantity: number;
    unit: string;
    unitCost: number;
    batchNumber: string;
    expiryDate: string;
  }>;
}

export interface StorekeeperReport {
  id: string;
  title: string;
  description: string;
  filename: string;
  headers: string[];
  rows: string[][];
}

function formatStorekeeperTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function referenceDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function isoDateDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function cloneDataset(dataset: StorekeeperDataset): StorekeeperDataset {
  return {
    items: dataset.items.map((item) => ({ ...item })),
    suppliers: dataset.suppliers.map((supplier) => ({ ...supplier })),
    requests: dataset.requests.map((request) => ({ ...request })),
    transfers: dataset.transfers.map((transfer) => ({ ...transfer })),
    movements: dataset.movements.map((movement) => ({ ...movement })),
    processedSubmissionIds: [...dataset.processedSubmissionIds],
  };
}

function nextReference(prefix: "ISS" | "RCV", existingCount: number) {
  return `${prefix}-${referenceDateStamp()}-${String(existingCount + 1).padStart(3, "0")}`;
}

function requirePositiveQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }
}

function assertSubmissionIsNew(dataset: StorekeeperDataset, submissionId?: string) {
  if (submissionId && dataset.processedSubmissionIds.includes(submissionId)) {
    throw new Error("This stock transaction has already been submitted.");
  }
}

function pluralizeUnit(unit: string, quantity: number) {
  if (quantity === 1) {
    return unit;
  }

  if (unit === "box") {
    return "boxes";
  }

  if (unit.endsWith("y")) {
    return `${unit.slice(0, -1)}ies`;
  }

  return `${unit}s`;
}

export function formatStoreQuantity(quantity: number, unit: string) {
  return `${quantity} ${pluralizeUnit(unit, quantity)}`;
}

export function createStorekeeperInventoryDataset(): StorekeeperDataset {
  return cloneDataset({
    items: [],
    suppliers: [],
    requests: [],
    transfers: [],
    movements: [],
    processedSubmissionIds: [],
  });
}

export function isStorekeeperSection(value: string): value is StorekeeperSectionId {
  return storekeeperSections.includes(value as StorekeeperSectionId);
}

export function getStoreItemStatus(item: StorekeeperItem): StoreItemStatus {
  if (item.quantityAvailable <= 0 || item.quantityAvailable <= Math.ceil(item.reorderLevel / 2)) {
    return "critical";
  }

  if (item.quantityAvailable <= item.reorderLevel) {
    return "low";
  }

  return "healthy";
}

export function getStoreItemTone(status: StoreItemStatus): StatusTone {
  if (status === "critical") {
    return "critical";
  }

  if (status === "low") {
    return "warning";
  }

  return "ok";
}

export function formatStoreItemStatus(status: StoreItemStatus) {
  if (status === "critical") {
    return "Critical stock";
  }

  if (status === "low") {
    return "Low stock";
  }

  return "Healthy";
}

export function getMovementTone(type: StoreMovementType): StatusTone {
  if (type === "issue") {
    return "warning";
  }

  if (type === "adjustment") {
    return "critical";
  }

  return "ok";
}

export function formatMovementType(type: StoreMovementType) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function issueStoreStock(dataset: StorekeeperDataset, input: StorekeeperIssueInput) {
  assertSubmissionIsNew(dataset, input.submissionId);

  if (!input.department.trim()) {
    throw new Error("Select the department receiving stock.");
  }

  if (!input.recipient.trim()) {
    throw new Error("Enter the receiving staff member.");
  }

  if (input.lines.length === 0) {
    throw new Error("Add at least one item to issue.");
  }

  const nextDataset = cloneDataset(dataset);
  const reference = nextReference("ISS", nextDataset.movements.filter((item) => item.actionType === "issue").length);
  const movementTimestamp = formatStorekeeperTimestamp();
  const noteLines: StorekeeperIssueNote["lines"] = [];
  const movements: StorekeeperMovement[] = [];

  for (const line of input.lines) {
    requirePositiveQuantity(line.quantity);
    const itemIndex = nextDataset.items.findIndex((item) => item.id === line.itemId);
    const item = nextDataset.items[itemIndex];

    if (!item) {
      throw new Error("Select a valid inventory item.");
    }

    if (line.quantity > item.quantityAvailable) {
      throw new Error(
        `Only ${item.quantityAvailable} ${item.name} ${pluralizeUnit(item.unit, item.quantityAvailable)} are available.`,
      );
    }

    const beforeQuantity = item.quantityAvailable;
    const afterQuantity = beforeQuantity - line.quantity;
    nextDataset.items[itemIndex] = {
      ...item,
      quantityAvailable: afterQuantity,
      lastIssuedAt: movementTimestamp,
    };

    noteLines.push({
      itemCode: item.code,
      itemName: item.name,
      quantity: line.quantity,
      unit: item.unit,
    });

    movements.push({
      id: `${reference}-${item.id}`,
      reference,
      actionType: "issue",
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      category: item.category,
      beforeQuantity,
      quantity: line.quantity,
      afterQuantity,
      unit: item.unit,
      department: input.department,
      user: input.issuedBy,
      counterparty: input.recipient,
      timestamp: movementTimestamp,
      location: item.location,
      notes: `Issued to ${input.department}.`,
    });
  }

  nextDataset.movements = [...movements, ...nextDataset.movements];

  if (input.submissionId) {
    nextDataset.processedSubmissionIds = [...nextDataset.processedSubmissionIds, input.submissionId];
  }

  return {
    dataset: nextDataset,
    issueNote: {
      reference,
      department: input.department,
      recipient: input.recipient,
      issuedBy: input.issuedBy,
      timestamp: movementTimestamp,
      lines: noteLines,
    } satisfies StorekeeperIssueNote,
  };
}

export function receiveStoreStock(dataset: StorekeeperDataset, input: StorekeeperReceiveInput) {
  assertSubmissionIsNew(dataset, input.submissionId);

  if (!input.supplier.trim()) {
    throw new Error("Select the supplier delivering stock.");
  }

  if (!input.purchaseReference.trim()) {
    throw new Error("Enter the purchase reference.");
  }

  if (input.lines.length === 0) {
    throw new Error("Add at least one received item.");
  }

  const nextDataset = cloneDataset(dataset);
  const reference = nextReference("RCV", nextDataset.movements.filter((item) => item.actionType === "receipt").length);
  const movementTimestamp = formatStorekeeperTimestamp();
  const noteLines: StorekeeperReceiveNote["lines"] = [];
  const movements: StorekeeperMovement[] = [];

  for (const line of input.lines) {
    requirePositiveQuantity(line.quantity);
    requirePositiveQuantity(line.unitCost);
    const itemIndex = nextDataset.items.findIndex((item) => item.id === line.itemId);
    const item = nextDataset.items[itemIndex];

    if (!item) {
      throw new Error("Select a valid inventory item.");
    }

    const beforeQuantity = item.quantityAvailable;
    const afterQuantity = beforeQuantity + line.quantity;
    nextDataset.items[itemIndex] = {
      ...item,
      quantityAvailable: afterQuantity,
      unitCost: line.unitCost,
      supplier: input.supplier,
      batchNumber: line.batchNumber.trim() || item.batchNumber,
      expiryDate: line.expiryDate.trim() || item.expiryDate,
    };

    noteLines.push({
      itemCode: item.code,
      itemName: item.name,
      quantity: line.quantity,
      unit: item.unit,
      unitCost: line.unitCost,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
    });

    movements.push({
      id: `${reference}-${item.id}`,
      reference: input.purchaseReference,
      actionType: "receipt",
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      category: item.category,
      beforeQuantity,
      quantity: line.quantity,
      afterQuantity,
      unit: item.unit,
      supplier: input.supplier,
      user: input.receivedBy,
      counterparty: input.supplier,
      timestamp: movementTimestamp,
      location: item.location,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      notes: `Received against ${input.purchaseReference}.`,
    });
  }

  nextDataset.movements = [...movements, ...nextDataset.movements];

  if (input.submissionId) {
    nextDataset.processedSubmissionIds = [...nextDataset.processedSubmissionIds, input.submissionId];
  }

  return {
    dataset: nextDataset,
    receiveNote: {
      reference,
      supplier: input.supplier,
      purchaseReference: input.purchaseReference,
      receivedBy: input.receivedBy,
      timestamp: movementTimestamp,
      lines: noteLines,
    } satisfies StorekeeperReceiveNote,
  };
}

export function buildStorekeeperDashboard(dataset: StorekeeperDataset) {
  const todayPrefix = formatStorekeeperTimestamp().slice(0, 10);
  const expiryWindow = isoDateDaysFromNow(30);
  const lowStockItems = dataset.items.filter((item) => getStoreItemStatus(item) !== "healthy");
  const pendingRequests = dataset.requests.filter((request) => request.status !== "fulfilled");
  const recentlyIssuedItems = dataset.movements.filter((movement) => movement.actionType === "issue").slice(0, 5);
  const todayMovements = dataset.movements.filter((movement) => movement.timestamp.startsWith(todayPrefix));
  const receivedToday = dataset.movements.filter(
    (movement) => movement.actionType === "receipt" && movement.timestamp.startsWith(todayPrefix),
  );
  const expiringItems = dataset.items.filter((item) => item.expiryDate && item.expiryDate <= expiryWindow);
  const fastMovingItems = [...dataset.items]
    .sort((first, second) => second.averageWeeklyIssue - first.averageWeeklyIssue)
    .slice(0, 5);

  return {
    lowStockItems,
    pendingRequests,
    recentlyIssuedItems,
    todayMovements,
    receivedToday,
    expiringItems,
    fastMovingItems,
  };
}

export function buildStorekeeperAlerts(dataset: StorekeeperDataset): StorekeeperAlert[] {
  const dashboard = buildStorekeeperDashboard(dataset);
  const criticalItem = dashboard.lowStockItems.find((item) => getStoreItemStatus(item) === "critical");
  const expiringItem = dashboard.expiringItems[0];
  const unusualMovement = dashboard.todayMovements.find((movement) => movement.quantity >= 40);

  return [
    criticalItem
      ? {
          id: "critical-stock",
          title: `${criticalItem.name} needs action`,
          detail: `${formatStoreQuantity(criticalItem.quantityAvailable, criticalItem.unit)} available against reorder level ${criticalItem.reorderLevel}.`,
          tone: "critical",
          actionLabel: "Open reorder alerts",
          section: "reorder-alerts",
        }
      : null,
    expiringItem
      ? {
          id: "expiry",
          title: `${expiringItem.name} nearing expiry`,
          detail: `Batch ${expiringItem.batchNumber ?? "unbatched"} expires on ${expiringItem.expiryDate}.`,
          tone: "warning",
          actionLabel: "Review expiry report",
          section: "reports",
        }
      : null,
    unusualMovement
      ? {
          id: "unusual-movement",
          title: "Large stock movement today",
          detail: `${formatStoreQuantity(unusualMovement.quantity, unusualMovement.unit)} moved for ${unusualMovement.itemName}.`,
          tone: "warning",
          actionLabel: "Open activity log",
          section: "activity-log",
        }
      : null,
  ].filter((alert): alert is StorekeeperAlert => Boolean(alert));
}

export function buildStorekeeperStats(dataset: StorekeeperDataset) {
  const totalValue = dataset.items.reduce(
    (sum, item) => sum + item.quantityAvailable * item.unitCost,
    0,
  );
  const dashboard = buildStorekeeperDashboard(dataset);

  return [
    {
      id: "valuation",
      label: "Stock valuation",
      value: formatCurrency(totalValue, false),
      helper: "Current stores value",
      tone: "ok" as StatusTone,
    },
    {
      id: "low-stock",
      label: "Low stock items",
      value: `${dashboard.lowStockItems.length}`,
      helper: "Needs reorder action",
      tone: (dashboard.lowStockItems.length > 0 ? "critical" : "ok") as StatusTone,
    },
    {
      id: "requests",
      label: "Pending requests",
      value: `${dashboard.pendingRequests.length}`,
      helper: "Awaiting issue",
      tone: (dashboard.pendingRequests.length > 0 ? "warning" : "ok") as StatusTone,
    },
    {
      id: "movement",
      label: "Movements today",
      value: `${dashboard.todayMovements.length}`,
      helper: "Receipts and issues",
      tone: "ok" as StatusTone,
    },
  ];
}

export function buildStorekeeperReports(dataset: StorekeeperDataset): StorekeeperReport[] {
  const issueRows = dataset.movements
    .filter((movement) => movement.actionType === "issue")
    .map((movement) => [
      movement.reference,
      movement.timestamp,
      movement.department ?? "",
      movement.itemCode,
      movement.itemName,
      `${movement.quantity}`,
      movement.unit,
      movement.user,
      movement.counterparty,
    ]);
  const receiptRows = dataset.movements
    .filter((movement) => movement.actionType === "receipt")
    .map((movement) => [
      movement.reference,
      movement.timestamp,
      movement.supplier ?? "",
      movement.itemCode,
      movement.itemName,
      `${movement.quantity}`,
      movement.unit,
      movement.batchNumber ?? "",
      movement.expiryDate ?? "",
    ]);
  const valuationRows = dataset.items.map((item) => [
    item.code,
    item.name,
    item.category,
    `${item.quantityAvailable}`,
    item.unit,
    formatCurrency(item.unitCost, false),
    formatCurrency(item.quantityAvailable * item.unitCost, false),
    item.location,
  ]);
  const lowStockRows = dataset.items
    .filter((item) => getStoreItemStatus(item) !== "healthy")
    .map((item) => [
      item.code,
      item.name,
      item.category,
      `${item.quantityAvailable}`,
      `${item.reorderLevel}`,
      formatStoreItemStatus(getStoreItemStatus(item)),
    ]);
  const expiryRows = dataset.items
    .filter((item) => item.expiryDate)
    .map((item) => [
      item.code,
      item.name,
      item.batchNumber ?? "",
      item.expiryDate ?? "",
      `${item.quantityAvailable}`,
      item.location,
    ]);
  const fastMovingRows = [...dataset.items]
    .sort((first, second) => second.averageWeeklyIssue - first.averageWeeklyIssue)
    .map((item) => [
      item.code,
      item.name,
      item.category,
      `${item.averageWeeklyIssue}`,
      `${item.quantityAvailable}`,
      item.unit,
    ]);
  const deadStockRows = dataset.items
    .filter((item) => item.averageWeeklyIssue <= 4)
    .map((item) => [
      item.code,
      item.name,
      item.category,
      `${item.quantityAvailable}`,
      item.location,
    ]);
  const supplierRows = dataset.suppliers.map((supplier) => [
    supplier.name,
    supplier.contact,
    supplier.phone,
    supplier.lastDelivery,
    `${supplier.activeOrders}`,
    supplier.status,
  ]);

  return [
    {
      id: "stock-issue",
      title: "Stock issue report",
      description: "Department issues with issuer, receiver, and timestamp.",
      filename: "stock-issue-report.csv",
      headers: ["Reference", "Timestamp", "Department", "Item Code", "Item", "Qty", "Unit", "Issued By", "Received By"],
      rows: issueRows,
    },
    {
      id: "stock-received",
      title: "Stock received report",
      description: "Supplier receipts with batch and expiry tracking.",
      filename: "stock-received-report.csv",
      headers: ["Reference", "Timestamp", "Supplier", "Item Code", "Item", "Qty", "Unit", "Batch", "Expiry"],
      rows: receiptRows,
    },
    {
      id: "valuation",
      title: "Current stock valuation",
      description: "Quantity on hand multiplied by latest unit cost.",
      filename: "current-stock-valuation.csv",
      headers: ["Item Code", "Item", "Category", "Qty", "Unit", "Unit Cost", "Total Value", "Location"],
      rows: valuationRows,
    },
    {
      id: "low-stock",
      title: "Low stock report",
      description: "Amber and red stock lines requiring replenishment.",
      filename: "low-stock-report.csv",
      headers: ["Item Code", "Item", "Category", "Qty", "Reorder Level", "Status"],
      rows: lowStockRows,
    },
    {
      id: "expiry",
      title: "Expiry report",
      description: "Batched items with expiry visibility.",
      filename: "expiry-report.csv",
      headers: ["Item Code", "Item", "Batch", "Expiry", "Qty", "Location"],
      rows: expiryRows,
    },
    {
      id: "fast-moving",
      title: "Fast-moving inventory",
      description: "Items with highest average weekly issue volume.",
      filename: "fast-moving-inventory.csv",
      headers: ["Item Code", "Item", "Category", "Weekly Issue", "Qty", "Unit"],
      rows: fastMovingRows,
    },
    {
      id: "dead-stock",
      title: "Dead stock report",
      description: "Slow moving items tying up storage and value.",
      filename: "dead-stock-report.csv",
      headers: ["Item Code", "Item", "Category", "Qty", "Location"],
      rows: deadStockRows,
    },
    {
      id: "supplier-activity",
      title: "Supplier activity report",
      description: "Delivery recency, contacts, and active order exposure.",
      filename: "supplier-activity-report.csv",
      headers: ["Supplier", "Contact", "Phone", "Last Delivery", "Active Orders", "Status"],
      rows: supplierRows,
    },
  ];
}
