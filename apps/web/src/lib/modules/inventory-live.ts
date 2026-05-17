import type { LiveAuthSession } from "@/lib/dashboard/api-client";
import { formatCurrency } from "@/lib/dashboard/format";
import { requestSchoolApiProxy } from "@/lib/dashboard/school-api-proxy-client";
import {
  type DepartmentRequest,
  type InventoryCategory,
  type InventoryDataset,
  type InventoryIncident,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryReportCard,
  type InventorySupplier,
  type PurchaseOrder,
  type RequestStatus,
  type StockTransfer,
} from "@/lib/modules/inventory-data";

export interface LiveInventoryCategory {
  id: string;
  code: string;
  name: string;
  manager?: string | null;
  storage_zones?: string | null;
  description?: string | null;
}

export interface LiveInventorySupplier {
  id: string;
  supplier_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  county?: string | null;
  last_delivery_at?: string | null;
  status: string;
}

export interface LiveInventoryItem {
  id: string;
  item_name: string;
  sku: string;
  category_id?: string | null;
  category_name?: string | null;
  unit: string;
  quantity_on_hand: number;
  unit_price: number;
  reorder_level: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  status: string;
  is_archived: boolean;
}

export interface LiveInventoryMovement {
  id: string;
  item_name: string;
  movement_type: string;
  quantity: number;
  reference?: string | null;
  notes?: string | null;
  occurred_at?: string | null;
  actor_display_name?: string | null;
}

export interface LiveInventoryPurchaseOrder {
  id: string;
  tenant_id: string;
  po_number: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  status: string;
  expected_delivery_date?: string | null;
  ordered_at?: string | null;
  received_at?: string | null;
  total_amount: number;
  lines: Array<Record<string, unknown>>;
  notes?: string | null;
  requested_by_display_name?: string | null;
}

export interface LiveInventoryRequest {
  id: string;
  request_number: string;
  department: string;
  requested_by: string;
  status: string;
  needed_by?: string | null;
  priority?: string | null;
  lines: Array<Record<string, unknown>>;
  notes?: string | null;
  created_at?: string | null;
}

export interface LiveInventoryTransfer {
  id: string;
  transfer_number: string;
  from_location: string;
  to_location: string;
  status: string;
  requested_by: string;
  lines: Array<Record<string, unknown>>;
  notes?: string | null;
  created_at?: string | null;
}

export interface LiveInventoryIncident {
  id: string;
  incident_number: string;
  item_name: string;
  incident_type: "broken" | "lost" | "expired";
  quantity: number;
  reason: string;
  responsible_department: string;
  cost_impact: number;
  status: string;
  notes?: string | null;
  reported_at?: string | null;
}

export interface LiveInventoryReportsResponse {
  stock_valuation: Array<{
    item_name: string;
    sku: string;
    quantity_on_hand: number;
    unit_price: number;
    total_value: number;
  }>;
  low_stock_report: Array<{
    item_name: string;
    sku: string;
    quantity_on_hand: number;
    reorder_level: number;
  }>;
  movement_history: Array<{
    movement_type: string;
    movement_count: number;
  }>;
  supplier_purchases: Array<{
    supplier_name: string;
    purchase_orders: number;
    total_spend: number;
  }>;
  stock_reconciliation?: Array<{
    item_name: string;
    sku: string;
    item_quantity_on_hand: number;
    location_quantity_on_hand: number;
    variance_quantity: number;
    status: string;
  }>;
}

export interface LiveInventoryReportExportResponse {
  report_id: string;
  title: string;
  filename: string;
  content_type: string;
  generated_at: string;
  row_count: number;
  checksum_sha256: string;
  csv: string;
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) {
    return "-";
  }

  const normalized = value.replace("T", " ");
  return withTime ? normalized.slice(0, 16) : normalized.slice(0, 10);
}

function normalizeMovementType(value: string): InventoryMovementType {
  if (
    value === "stock_in"
    || value === "stock_out"
    || value === "transfer"
    || value === "damage"
    || value === "adjustment"
  ) {
    return value;
  }

  return "stock_out";
}

function buildLineSummary(lines: Array<Record<string, unknown>>) {
  if (lines.length === 0) {
    return "No lines recorded";
  }

  const first = lines[0];
  const firstLabel = typeof first?.item_name === "string" ? first.item_name : "Inventory line";
  const firstQuantity = Number(first?.quantity ?? 0);

  if (lines.length === 1) {
    return `${firstLabel} x${firstQuantity}`;
  }

  return `${firstLabel} x${firstQuantity} +${lines.length - 1} more`;
}

function formatRequestQuantity(lines: Array<Record<string, unknown>>) {
  const total = lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
  return `${total} units`;
}

function mapCategory(category: LiveInventoryCategory): InventoryCategory {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    manager: category.manager ?? "Not assigned",
    storageZones: category.storage_zones ?? "Not configured",
    notes: category.description ?? "No notes recorded.",
  };
}

function mapSupplier(supplier: LiveInventorySupplier): InventorySupplier {
  return {
    id: supplier.id,
    name: supplier.supplier_name,
    contact: supplier.contact_person ?? "Not recorded",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "Not on file",
    lastDelivery: formatDate(supplier.last_delivery_at),
    status: supplier.status === "on_hold" ? "on_hold" : "active",
    county: supplier.county ?? "Not recorded",
  };
}

function mapItem(item: LiveInventoryItem): InventoryItem {
  return {
    id: item.id,
    name: item.item_name,
    sku: item.sku,
    category: item.category_name ?? "Uncategorized",
    unit: item.unit,
    quantity: Number(item.quantity_on_hand ?? 0),
    supplier: item.supplier_name ?? "Unassigned supplier",
    unitPrice: Number(item.unit_price ?? 0),
    reorderLevel: Number(item.reorder_level ?? 0),
    location: item.storage_location ?? "Not assigned",
    notes: item.notes ?? "No notes recorded.",
    archived: Boolean(item.is_archived),
  };
}

function mapMovement(movement: LiveInventoryMovement): InventoryMovement {
  return {
    id: movement.id,
    item: movement.item_name,
    type: normalizeMovementType(movement.movement_type),
    quantity: Number(movement.quantity ?? 0),
    date: formatDate(movement.occurred_at, true),
    user: movement.actor_display_name ?? "Stores team",
    notes: movement.notes ?? movement.reference ?? "Operational stock movement",
  };
}

function mapPurchaseOrder(order: LiveInventoryPurchaseOrder): PurchaseOrder {
  return {
    id: order.id,
    poNumber: order.po_number,
    supplier: order.supplier_name ?? "Unknown supplier",
    requestedBy: order.requested_by_display_name ?? "Procurement desk",
    orderDate: formatDate(order.ordered_at),
    expectedDelivery: formatDate(order.expected_delivery_date),
    lineSummary: buildLineSummary(order.lines),
    totalAmount: Number(order.total_amount ?? 0),
    status:
      order.status === "draft"
      || order.status === "pending"
      || order.status === "approved"
      || order.status === "received"
      || order.status === "cancelled"
        ? order.status
        : "pending",
  };
}

function mapRequest(request: LiveInventoryRequest): DepartmentRequest {
  const status: RequestStatus =
    request.status === "pending"
    || request.status === "approved"
    || request.status === "fulfilled"
    || request.status === "rejected"
      ? request.status
      : "pending";

  return {
    id: request.id,
    department: request.department,
    itemGroup: buildLineSummary(request.lines),
    requestedBy: request.requested_by,
    requestDate: formatDate(request.created_at ?? request.needed_by),
    quantity: formatRequestQuantity(request.lines),
    purpose: request.notes ?? `${request.priority ?? "Normal"} priority issue request`,
    status,
  };
}

function mapTransfer(transfer: LiveInventoryTransfer): StockTransfer {
  return {
    id: transfer.id,
    item: buildLineSummary(transfer.lines),
    fromLocation: transfer.from_location,
    toLocation: transfer.to_location,
    quantity: transfer.lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0),
    requestedBy: transfer.requested_by,
    date: formatDate(transfer.created_at),
    status:
      transfer.status === "in_transit"
      || transfer.status === "completed"
        ? transfer.status
        : "requested",
  };
}

function mapIncident(incident: LiveInventoryIncident): InventoryIncident {
  return {
    id: incident.id,
    item: incident.item_name,
    type: incident.incident_type,
    quantity: Number(incident.quantity ?? 0),
    department: incident.responsible_department,
    date: formatDate(incident.reported_at),
    reason: incident.reason,
    costImpact: Number(incident.cost_impact ?? 0),
  };
}

export function mapInventoryDatasetFromLive(input: {
  categories: LiveInventoryCategory[];
  suppliers: LiveInventorySupplier[];
  items: LiveInventoryItem[];
  movements: LiveInventoryMovement[];
  purchaseOrders: LiveInventoryPurchaseOrder[];
  requests: LiveInventoryRequest[];
  transfers: LiveInventoryTransfer[];
  incidents: LiveInventoryIncident[];
}): InventoryDataset {
  return {
    categories: input.categories.map(mapCategory),
    suppliers: input.suppliers.map(mapSupplier),
    items: input.items.map(mapItem),
    movements: input.movements.map(mapMovement),
    purchaseOrders: input.purchaseOrders.map(mapPurchaseOrder),
    requests: input.requests.map(mapRequest),
    transfers: input.transfers.map(mapTransfer),
    incidents: input.incidents.map(mapIncident),
  };
}

export function mapInventoryReportsFromLive(
  reports: LiveInventoryReportsResponse,
): InventoryReportCard[] {
  return [
    {
      id: "report-stock-valuation",
      title: "Stock valuation",
      description: "Quantity, price, and current stores value by item.",
      filename: "inventory-stock-valuation.csv",
      serverExportId: "stock-valuation",
      headers: ["Item", "SKU", "Quantity", "Unit Price", "Total Value"],
      rows: reports.stock_valuation.map((row) => [
        row.item_name,
        row.sku,
        `${row.quantity_on_hand}`,
        formatCurrency(row.unit_price, false),
        formatCurrency(row.total_value, false),
      ]),
    },
    {
      id: "report-low-stock",
      title: "Low stock report",
      description: "Lines that need replenishment before service disruption.",
      filename: "inventory-low-stock.csv",
      serverExportId: "low-stock",
      headers: ["Item", "SKU", "Qty", "Reorder"],
      rows: reports.low_stock_report.map((row) => [
        row.item_name,
        row.sku,
        `${row.quantity_on_hand}`,
        `${row.reorder_level}`,
      ]),
    },
    {
      id: "report-movement-history",
      title: "Movement history",
      description: "Movement counts across issue, receipt, transfer, and damage workflows.",
      filename: "inventory-movement-history.csv",
      serverExportId: "movement-history",
      headers: ["Movement Type", "Count"],
      rows: reports.movement_history.map((row) => [
        normalizeMovementType(row.movement_type).replaceAll("_", " "),
        `${row.movement_count}`,
      ]),
    },
    {
      id: "report-supplier-purchases",
      title: "Supplier purchases",
      description: "Supplier spend and purchase-order volume for procurement review.",
      filename: "inventory-supplier-purchases.csv",
      serverExportId: "supplier-purchases",
      headers: ["Supplier", "Purchase Orders", "Total Spend"],
      rows: reports.supplier_purchases.map((row) => [
        row.supplier_name,
        `${row.purchase_orders}`,
        formatCurrency(row.total_spend, false),
      ]),
    },
    {
      id: "report-stock-reconciliation",
      title: "Stock reconciliation",
      description: "Item-level stock compared with location balances for variance review.",
      filename: "inventory-stock-reconciliation.csv",
      serverExportId: "stock-reconciliation",
      headers: ["Item", "SKU", "Item Qty", "Location Qty", "Variance", "Status"],
      rows: (reports.stock_reconciliation ?? []).map((row) => [
        row.item_name,
        row.sku,
        `${row.item_quantity_on_hand}`,
        `${row.location_quantity_on_hand}`,
        `${row.variance_quantity}`,
        row.status,
      ]),
    },
  ];
}

function withSession<T>(
  session: LiveAuthSession,
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH";
    body?: BodyInit | Record<string, unknown> | null;
  },
) {
  void session;

  return requestSchoolApiProxy<T>(path, {
    method: options?.method,
    body: options?.body,
  });
}

export async function fetchInventoryDatasetLive(session: LiveAuthSession) {
  const [categories, suppliers, items, movements, purchaseOrders, requests, transfers, incidents] =
    await Promise.all([
      withSession<LiveInventoryCategory[]>(session, "/inventory/categories"),
      withSession<LiveInventorySupplier[]>(session, "/inventory/suppliers"),
      withSession<LiveInventoryItem[]>(session, "/inventory/items?limit=200"),
      withSession<LiveInventoryMovement[]>(session, "/inventory/stock-movements?limit=200"),
      withSession<LiveInventoryPurchaseOrder[]>(session, "/inventory/purchase-orders"),
      withSession<LiveInventoryRequest[]>(session, "/inventory/requests"),
      withSession<LiveInventoryTransfer[]>(session, "/inventory/transfers"),
      withSession<LiveInventoryIncident[]>(session, "/inventory/incidents"),
    ]);

  return mapInventoryDatasetFromLive({
    categories,
    suppliers,
    items,
    movements,
    purchaseOrders,
    requests,
    transfers,
    incidents,
  });
}

export async function fetchInventoryReportsLive(session: LiveAuthSession) {
  return mapInventoryReportsFromLive(
    await withSession<LiveInventoryReportsResponse>(session, "/inventory/reports"),
  );
}

export function fetchInventoryReportExportLive(
  session: LiveAuthSession,
  reportId: string,
) {
  return withSession<LiveInventoryReportExportResponse>(
    session,
    `/inventory/reports/${encodeURIComponent(reportId)}/export`,
  );
}

export interface SaveInventoryItemInput {
  item_name: string;
  sku: string;
  category_id?: string;
  unit: string;
  quantity?: number;
  supplier_id?: string;
  unit_price: number;
  reorder_level: number;
  storage_location?: string;
  notes?: string;
}

export interface SaveInventoryCategoryInput {
  code: string;
  name: string;
  manager: string;
  storage_zones: string;
  description?: string;
}

export interface SaveInventorySupplierInput {
  supplier_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  county?: string;
  status?: "active" | "on_hold";
}

export function createInventoryItemLive(
  session: LiveAuthSession,
  input: SaveInventoryItemInput,
) {
  return withSession(session, "/inventory/items", {
    method: "POST",
    body: {
      ...input,
      quantity: input.quantity ?? 0,
    },
  });
}

export function createInventoryCategoryLive(
  session: LiveAuthSession,
  input: SaveInventoryCategoryInput,
) {
  return withSession(session, "/inventory/categories", {
    method: "POST",
    body: { ...input },
  });
}

export function updateInventoryCategoryLive(
  session: LiveAuthSession,
  categoryId: string,
  input: Partial<SaveInventoryCategoryInput>,
) {
  return withSession(session, `/inventory/categories/${categoryId}`, {
    method: "PATCH",
    body: { ...input },
  });
}

export function createInventorySupplierLive(
  session: LiveAuthSession,
  input: SaveInventorySupplierInput,
) {
  return withSession(session, "/inventory/suppliers", {
    method: "POST",
    body: { ...input },
  });
}

export function updateInventorySupplierLive(
  session: LiveAuthSession,
  supplierId: string,
  input: Partial<SaveInventorySupplierInput>,
) {
  return withSession(session, `/inventory/suppliers/${supplierId}`, {
    method: "PATCH",
    body: { ...input },
  });
}

export function updateInventoryItemLive(
  session: LiveAuthSession,
  itemId: string,
  input: Omit<SaveInventoryItemInput, "quantity"> & {
    is_archived?: boolean;
    status?: string;
  },
) {
  return withSession(session, `/inventory/items/${itemId}`, {
    method: "PATCH",
    body: input,
  });
}

export function adjustInventoryItemStockLive(
  session: LiveAuthSession,
  itemId: string,
  input: {
    movement_type: "stock_in" | "stock_out" | "adjustment";
    quantity: number;
    notes?: string;
    reference?: string;
  },
) {
  return withSession(session, `/inventory/items/${itemId}/adjust`, {
    method: "POST",
    body: input,
  });
}

export function createInventoryPurchaseOrderLive(
  session: LiveAuthSession,
  input: {
    supplier_id: string;
    expected_delivery_date?: string;
    lines: Array<{
      item_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
    }>;
    notes?: string;
  },
) {
  return withSession(session, "/inventory/purchase-orders", {
    method: "POST",
    body: input,
  });
}

export function updateInventoryPurchaseOrderStatusLive(
  session: LiveAuthSession,
  purchaseOrderId: string,
  input: {
    status: "draft" | "pending" | "approved" | "received" | "cancelled";
    notes?: string;
  },
) {
  return withSession(session, `/inventory/purchase-orders/${purchaseOrderId}/status`, {
    method: "PATCH",
    body: input,
  });
}

export function createInventoryRequestLive(
  session: LiveAuthSession,
  input: {
    department: string;
    requested_by: string;
    needed_by?: string;
    priority?: string;
    lines: Array<{
      item_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
    }>;
    notes?: string;
  },
) {
  return withSession(session, "/inventory/requests", {
    method: "POST",
    body: input,
  });
}

export function updateInventoryRequestStatusLive(
  session: LiveAuthSession,
  requestId: string,
  input: {
    status: "pending" | "approved" | "fulfilled";
    notes?: string;
  },
) {
  return withSession(session, `/inventory/requests/${requestId}/status`, {
    method: "PATCH",
    body: input,
  });
}

export function createInventoryTransferLive(
  session: LiveAuthSession,
  input: {
    from_location: string;
    to_location: string;
    requested_by: string;
    lines: Array<{
      item_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
    }>;
    notes?: string;
  },
) {
  return withSession(session, "/inventory/transfers", {
    method: "POST",
    body: input,
  });
}

export function updateInventoryTransferStatusLive(
  session: LiveAuthSession,
  transferId: string,
  input: {
    status: "in_transit" | "completed";
    notes?: string;
  },
) {
  return withSession(session, `/inventory/transfers/${transferId}/status`, {
    method: "PATCH",
    body: input,
  });
}

export function createInventoryIncidentLive(
  session: LiveAuthSession,
  input: {
    item_id: string;
    incident_type: "broken" | "lost" | "expired";
    quantity: number;
    reason: string;
    responsible_department: string;
    cost_impact: number;
    notes?: string;
  },
) {
  return withSession(session, "/inventory/incidents", {
    method: "POST",
    body: input,
  });
}
