import { formatCurrency } from "@/lib/dashboard/format";
import type { StatusTone } from "@/lib/dashboard/types";

export interface ModuleShellSectionData {
  id: string;
  label: string;
  description: string;
  badge?: string;
  tone?: StatusTone;
}

export interface StatStripDataItem {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone?: StatusTone;
}

export type InventorySectionId =
  | "dashboard"
  | "items"
  | "categories"
  | "stock-movement"
  | "suppliers"
  | "purchase-orders"
  | "requests"
  | "transfers"
  | "damages-losses"
  | "reports";

export type InventoryMovementType = "stock_in" | "stock_out" | "transfer" | "damage" | "adjustment";
export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock" | "archived";
export type PurchaseOrderStatus = "draft" | "pending" | "approved" | "received" | "cancelled";
export type RequestStatus = "pending" | "approved" | "fulfilled" | "rejected";
export type TransferStatus = "requested" | "in_transit" | "completed";
export type IncidentType = "broken" | "lost" | "expired";

export interface InventoryCategory {
  id: string;
  code: string;
  name: string;
  manager: string;
  storageZones: string;
  notes: string;
}

export interface InventorySupplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  lastDelivery: string;
  status: "active" | "on_hold";
  county: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  quantity: number;
  supplier: string;
  unitPrice: number;
  reorderLevel: number;
  location: string;
  notes: string;
  archived: boolean;
}

export interface InventoryMovement {
  id: string;
  item: string;
  type: InventoryMovementType;
  quantity: number;
  date: string;
  user: string;
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  requestedBy: string;
  orderDate: string;
  expectedDelivery: string;
  lineSummary: string;
  totalAmount: number;
  status: PurchaseOrderStatus;
}

export interface DepartmentRequest {
  id: string;
  department: string;
  itemGroup: string;
  requestedBy: string;
  requestDate: string;
  quantity: string;
  purpose: string;
  status: RequestStatus;
}

export interface StockTransfer {
  id: string;
  item: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  requestedBy: string;
  date: string;
  status: TransferStatus;
}

export interface InventoryIncident {
  id: string;
  item: string;
  type: IncidentType;
  quantity: number;
  department: string;
  date: string;
  reason: string;
  costImpact: number;
}

export interface InventoryReportCard {
  id: string;
  title: string;
  description: string;
  filename: string;
  serverExportId?: string;
  headers: string[];
  rows: string[][];
}

export interface InventoryDataset {
  categories: InventoryCategory[];
  suppliers: InventorySupplier[];
  items: InventoryItem[];
  movements: InventoryMovement[];
  purchaseOrders: PurchaseOrder[];
  requests: DepartmentRequest[];
  transfers: StockTransfer[];
  incidents: InventoryIncident[];
}

export function createInventoryDataset(): InventoryDataset {
  return {
    categories: [],
    suppliers: [],
    items: [],
    movements: [],
    purchaseOrders: [],
    requests: [],
    transfers: [],
    incidents: [],
  };
}

export function getInventoryItemStatus(item: InventoryItem): InventoryStatus {
  if (item.archived) {
    return "archived";
  }

  if (item.quantity <= 0) {
    return "out_of_stock";
  }

  if (item.quantity <= item.reorderLevel) {
    return "low_stock";
  }

  return "in_stock";
}

export function getInventoryStatusTone(status: InventoryStatus): StatusTone {
  if (status === "out_of_stock") {
    return "critical";
  }

  if (status === "low_stock") {
    return "warning";
  }

  return "ok";
}

export function formatInventoryStatus(status: InventoryStatus) {
  if (status === "out_of_stock") {
    return "Out of stock";
  }

  if (status === "low_stock") {
    return "Low stock";
  }

  if (status === "archived") {
    return "Archived";
  }

  return "In stock";
}

export function formatMovementType(type: InventoryMovementType) {
  return type.replace("_", " ");
}

export function formatPurchaseOrderStatus(status: PurchaseOrderStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getPurchaseOrderTone(status: PurchaseOrderStatus): StatusTone {
  if (status === "cancelled") {
    return "critical";
  }

  if (status === "pending" || status === "draft") {
    return "warning";
  }

  return "ok";
}

export function formatRequestStatus(status: RequestStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getRequestTone(status: RequestStatus): StatusTone {
  if (status === "rejected") {
    return "critical";
  }

  if (status === "pending" || status === "approved") {
    return "warning";
  }

  return "ok";
}

export function formatTransferStatus(status: TransferStatus) {
  return status.replace("_", " ");
}

export function getTransferTone(status: TransferStatus): StatusTone {
  if (status === "requested" || status === "in_transit") {
    return "warning";
  }

  return "ok";
}

export function formatIncidentType(type: IncidentType) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function getIncidentTone(type: IncidentType): StatusTone {
  if (type === "lost") {
    return "critical";
  }

  if (type === "expired") {
    return "warning";
  }

  return "ok";
}

export function buildInventoryModuleSections(data: InventoryDataset): ModuleShellSectionData[] {
  const lowStockCount = data.items.filter((item) => {
    const status = getInventoryItemStatus(item);
    return status === "low_stock" || status === "out_of_stock";
  }).length;

  const pendingRequests = data.requests.filter((request) => request.status === "pending").length;

  return [
    {
      id: "dashboard",
      label: "Inventory Dashboard",
      description: "Daily stock pressure, approvals, and recent movements.",
    },
    {
      id: "items",
      label: "Items",
      description: "Search and control school stores line by line.",
      badge: `${data.items.length}`,
    },
    {
      id: "categories",
      label: "Categories",
      description: "Category valuation, zones, and store ownership.",
      badge: `${data.categories.length}`,
    },
    {
      id: "stock-movement",
      label: "Stock Movement",
      description: "Receipts, issues, transfers, and damage trail.",
      badge: `${data.movements.length}`,
    },
    {
      id: "suppliers",
      label: "Suppliers",
      description: "Approved vendors, delivery cadence, and hold status.",
      badge: `${data.suppliers.length}`,
    },
    {
      id: "purchase-orders",
      label: "Purchase Orders",
      description: "Draft, approval, and stock receipt lifecycle.",
      badge: `${data.purchaseOrders.length}`,
    },
    {
      id: "requests",
      label: "Requests",
      description: "Department demand from classrooms, labs, and boarding.",
      badge: `${pendingRequests}`,
      tone: pendingRequests > 0 ? "warning" : "ok",
    },
    {
      id: "transfers",
      label: "Transfers",
      description: "Internal movement between stores and departments.",
      badge: `${data.transfers.length}`,
    },
    {
      id: "damages-losses",
      label: "Damages / Losses",
      description: "Breakages, losses, expiry, and cost exposure.",
      badge: `${data.incidents.length}`,
      tone: data.incidents.length > 0 ? "warning" : "ok",
    },
    {
      id: "reports",
      label: "Reports",
      description: "Valuation, low-stock, movements, and supplier spend.",
      badge: `${lowStockCount} alerts`,
      tone: lowStockCount > 0 ? "critical" : "ok",
    },
  ];
}

export function buildInventoryStatStrip(data: InventoryDataset): StatStripDataItem[] {
  const totalValue = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const lowStockItems = data.items.filter((item) => {
    const status = getInventoryItemStatus(item);
    return status === "low_stock" || status === "out_of_stock";
  }).length;
  const pendingRequests = data.requests.filter((item) => item.status === "pending").length;
  const recentPurchases = data.purchaseOrders.filter((item) => item.status === "received").length;

  return [
    {
      id: "value",
      label: "Total Inventory Value",
      value: formatCurrency(totalValue, false),
      helper: "Current stores valuation at unit-price weighted quantity on hand.",
    },
    {
      id: "low-stock",
      label: "Low Stock Items",
      value: `${lowStockItems}`,
      helper: "Lines below reorder or already out of stock across school stores.",
      tone: lowStockItems > 0 ? "critical" : "ok",
    },
    {
      id: "pending-requests",
      label: "Pending Requests",
      value: `${pendingRequests}`,
      helper: "Department issues still waiting for review or fulfillment.",
      tone: pendingRequests > 0 ? "warning" : "ok",
    },
    {
      id: "recent-purchases",
      label: "Recent Purchases",
      value: `${recentPurchases}`,
      helper: "Purchase orders received into stock in the current cycle.",
    },
  ];
}

export function buildInventoryCategoryBreakdown(data: InventoryDataset) {
  return data.categories.map((category) => {
    const items = data.items.filter((item) => item.category === category.name);
    const totalValue = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return {
      id: category.id,
      code: category.code,
      name: category.name,
      manager: category.manager,
      itemCount: items.length,
      totalValue: formatCurrency(totalValue, false),
      storageZones: category.storageZones,
      notes: category.notes,
    };
  });
}

export function buildInventoryReports(data: InventoryDataset): InventoryReportCard[] {
  const stockValuationRows = data.items.map((item) => [
    item.name,
    item.sku,
    `${item.quantity}`,
    formatCurrency(item.unitPrice, false),
    formatCurrency(item.quantity * item.unitPrice, false),
  ]);

  const lowStockRows = data.items
    .filter((item) => {
      const status = getInventoryItemStatus(item);
      return status === "low_stock" || status === "out_of_stock";
    })
    .map((item) => [
      item.name,
      item.category,
      `${item.quantity}`,
      `${item.reorderLevel}`,
      formatInventoryStatus(getInventoryItemStatus(item)),
    ]);

  const movementRows = data.movements.map((movement) => [
    movement.item,
    formatMovementType(movement.type),
    `${movement.quantity}`,
    movement.date,
    movement.user,
  ]);

  const supplierRows = data.purchaseOrders.map((purchaseOrder) => [
    purchaseOrder.poNumber,
    purchaseOrder.supplier,
    purchaseOrder.lineSummary,
    formatCurrency(purchaseOrder.totalAmount, false),
    formatPurchaseOrderStatus(purchaseOrder.status),
  ]);

  return [
    {
      id: "report-stock-valuation",
      title: "Stock valuation",
      description: "Quantity, price, and current stores value by item.",
      filename: "inventory-stock-valuation.csv",
      serverExportId: "stock-valuation",
      headers: ["Item", "SKU", "Quantity", "Unit Price", "Total Value"],
      rows: stockValuationRows,
    },
    {
      id: "report-low-stock",
      title: "Low stock report",
      description: "Lines that need replenishment before service disruption.",
      filename: "inventory-low-stock.csv",
      serverExportId: "low-stock",
      headers: ["Item", "Category", "Qty", "Reorder", "Status"],
      rows: lowStockRows,
    },
    {
      id: "report-movement-history",
      title: "Movement history",
      description: "Full stock trail across issue, receipt, transfer, and damage.",
      filename: "inventory-movement-history.csv",
      serverExportId: "movement-history",
      headers: ["Item", "Type", "Quantity", "Date", "User"],
      rows: movementRows,
    },
    {
      id: "report-supplier-purchases",
      title: "Supplier purchases",
      description: "Supplier spend and PO lifecycle summary for procurement review.",
      filename: "inventory-supplier-purchases.csv",
      serverExportId: "supplier-purchases",
      headers: ["PO", "Supplier", "Line Summary", "Amount", "Status"],
      rows: supplierRows,
    },
  ];
}
