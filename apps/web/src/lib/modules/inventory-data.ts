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

const baseCategories: InventoryCategory[] = [
  {
    id: "cat-stationery",
    name: "Stationery",
    manager: "Academic Office",
    storageZones: "Admin Store, Block A",
    notes: "Daily issue to class teachers and exams office.",
  },
  {
    id: "cat-food",
    name: "Food Stores",
    manager: "Kitchen Department",
    storageZones: "Dry Store, Boarding Wing",
    notes: "Boarding consumption monitored against weekly menu plans.",
  },
  {
    id: "cat-lab",
    name: "Laboratory",
    manager: "Science Department",
    storageZones: "Science Prep Room",
    notes: "Sensitive reagents and practical materials for Grade 7 to Grade 9.",
  },
  {
    id: "cat-ict",
    name: "ICT Equipment",
    manager: "ICT Office",
    storageZones: "ICT Lab Cage Store",
    notes: "Asset-heavy items with serial tracking and annual service windows.",
  },
  {
    id: "cat-boarding",
    name: "Boarding Supplies",
    manager: "Boarding Office",
    storageZones: "Dorm Store",
    notes: "Dorm bedding, hygiene kits, and student welfare stock.",
  },
  {
    id: "cat-cleaning",
    name: "Cleaning",
    manager: "Operations",
    storageZones: "Maintenance Store",
    notes: "Cleaning chemicals and consumables for classrooms and ablution blocks.",
  },
];

const baseSuppliers: InventorySupplier[] = [
  {
    id: "sup-001",
    name: "Crown Office Supplies",
    contact: "Lucy Njeri",
    email: "orders@crownoffice.co.ke",
    phone: "+254 722 441 885",
    lastDelivery: "2026-05-02",
    status: "active",
    county: "Nairobi",
  },
  {
    id: "sup-002",
    name: "Ruiru Fresh Grains",
    contact: "Peter Mwangi",
    email: "stores@ruirufresh.co.ke",
    phone: "+254 733 112 904",
    lastDelivery: "2026-05-03",
    status: "active",
    county: "Kiambu",
  },
  {
    id: "sup-003",
    name: "LabTech East Africa",
    contact: "Miriam Akinyi",
    email: "service@labtech-ea.com",
    phone: "+254 711 683 204",
    lastDelivery: "2026-04-28",
    status: "active",
    county: "Nairobi",
  },
  {
    id: "sup-004",
    name: "Digital Classroom Kenya",
    contact: "David Kimani",
    email: "accounts@digitalclassroom.ke",
    phone: "+254 701 903 117",
    lastDelivery: "2026-04-19",
    status: "active",
    county: "Nairobi",
  },
  {
    id: "sup-005",
    name: "Boarding Essentials Limited",
    contact: "Janet Jelagat",
    email: "dispatch@boardingessentials.co.ke",
    phone: "+254 724 990 512",
    lastDelivery: "2026-05-01",
    status: "active",
    county: "Uasin Gishu",
  },
  {
    id: "sup-006",
    name: "Apex Hygiene Solutions",
    contact: "Sophie Muthoni",
    email: "sales@apexhygiene.co.ke",
    phone: "+254 720 001 446",
    lastDelivery: "2026-04-30",
    status: "on_hold",
    county: "Nairobi",
  },
];

const baseItems: InventoryItem[] = [
  {
    id: "itm-001",
    name: "A4 Printing Paper",
    sku: "STAT-A4-001",
    category: "Stationery",
    unit: "pack",
    quantity: 18,
    supplier: "Crown Office Supplies",
    unitPrice: 650,
    reorderLevel: 25,
    location: "Admin Store Shelf A2",
    notes: "Used for exams office, circulars, and finance printing.",
    archived: false,
  },
  {
    id: "itm-002",
    name: "Exercise Books 96 Pages",
    sku: "STAT-EX-096",
    category: "Stationery",
    unit: "book",
    quantity: 420,
    supplier: "Crown Office Supplies",
    unitPrice: 85,
    reorderLevel: 150,
    location: "Admin Store Bay B1",
    notes: "Issued in batches to Grade 4 to Grade 9.",
    archived: false,
  },
  {
    id: "itm-003",
    name: "Whiteboard Markers",
    sku: "STAT-WBM-012",
    category: "Stationery",
    unit: "box",
    quantity: 0,
    supplier: "Crown Office Supplies",
    unitPrice: 120,
    reorderLevel: 24,
    location: "Admin Store Shelf A3",
    notes: "Daily classroom issue line is blocked until replenishment.",
    archived: false,
  },
  {
    id: "itm-004",
    name: "Liquid Chlorine 20L",
    sku: "CLN-CHL-20",
    category: "Cleaning",
    unit: "jerrycan",
    quantity: 6,
    supplier: "Apex Hygiene Solutions",
    unitPrice: 1900,
    reorderLevel: 8,
    location: "Maintenance Store Rack C1",
    notes: "Water treatment and ablution block sanitation.",
    archived: false,
  },
  {
    id: "itm-005",
    name: "Maize Flour 2kg",
    sku: "FOOD-MF-2",
    category: "Food Stores",
    unit: "bag",
    quantity: 140,
    supplier: "Ruiru Fresh Grains",
    unitPrice: 168,
    reorderLevel: 90,
    location: "Dry Store Row 1",
    notes: "Boarding meal plan consumption line.",
    archived: false,
  },
  {
    id: "itm-006",
    name: "Cooking Oil 20L",
    sku: "FOOD-OIL-20",
    category: "Food Stores",
    unit: "tin",
    quantity: 14,
    supplier: "Ruiru Fresh Grains",
    unitPrice: 6500,
    reorderLevel: 10,
    location: "Dry Store Row 2",
    notes: "Two-week kitchen cover at current burn rate.",
    archived: false,
  },
  {
    id: "itm-007",
    name: "Lab Gloves",
    sku: "LAB-GLV-100",
    category: "Laboratory",
    unit: "box",
    quantity: 4,
    supplier: "LabTech East Africa",
    unitPrice: 780,
    reorderLevel: 10,
    location: "Science Prep Room Locker 4",
    notes: "Practical sessions need weekly replenishment.",
    archived: false,
  },
  {
    id: "itm-008",
    name: "Hydrochloric Acid 500ml",
    sku: "LAB-HCL-500",
    category: "Laboratory",
    unit: "bottle",
    quantity: 12,
    supplier: "LabTech East Africa",
    unitPrice: 430,
    reorderLevel: 6,
    location: "Science Prep Room Cabinet B",
    notes: "Practical use only under teacher issue control.",
    archived: false,
  },
  {
    id: "itm-009",
    name: "Refurbished Desktop Unit",
    sku: "ICT-DESK-REF",
    category: "ICT Equipment",
    unit: "unit",
    quantity: 9,
    supplier: "Digital Classroom Kenya",
    unitPrice: 38500,
    reorderLevel: 4,
    location: "ICT Lab Cage Store",
    notes: "Used for replacement stock and CBC digital lab expansion.",
    archived: false,
  },
  {
    id: "itm-010",
    name: "Mattress Protector",
    sku: "BRD-MAT-PROT",
    category: "Boarding Supplies",
    unit: "piece",
    quantity: 5,
    supplier: "Boarding Essentials Limited",
    unitPrice: 2300,
    reorderLevel: 12,
    location: "Dorm Store Rack 2",
    notes: "Required for new boarders and damaged replacements.",
    archived: false,
  },
  {
    id: "itm-011",
    name: "Rugby Balls",
    sku: "GAMES-RUG-05",
    category: "Boarding Supplies",
    unit: "piece",
    quantity: 7,
    supplier: "Boarding Essentials Limited",
    unitPrice: 1850,
    reorderLevel: 8,
    location: "Games Cage",
    notes: "Sports department request pending ahead of county fixtures.",
    archived: false,
  },
  {
    id: "itm-012",
    name: "Sanitary Towels Bulk Pack",
    sku: "BRD-HYGIENE-24",
    category: "Boarding Supplies",
    unit: "pack",
    quantity: 22,
    supplier: "Boarding Essentials Limited",
    unitPrice: 540,
    reorderLevel: 18,
    location: "Dorm Store Rack 5",
    notes: "Welfare buffer stock for girls boarding wing.",
    archived: false,
  },
];

const baseMovements: InventoryMovement[] = [
  {
    id: "mov-001",
    item: "Exercise Books 96 Pages",
    type: "stock_out",
    quantity: 120,
    date: "2026-05-04 08:15",
    user: "Mary Wanjiku",
    notes: "Issued to Grade 6 and Grade 7 class teachers for term opener.",
  },
  {
    id: "mov-002",
    item: "Maize Flour 2kg",
    type: "stock_out",
    quantity: 45,
    date: "2026-05-04 07:40",
    user: "Peter Kibet",
    notes: "Weekly kitchen release approved by boarding master.",
  },
  {
    id: "mov-003",
    item: "A4 Printing Paper",
    type: "stock_in",
    quantity: 30,
    date: "2026-05-03 15:30",
    user: "Linet Auma",
    notes: "Received against PO-2026-021 from Crown Office Supplies.",
  },
  {
    id: "mov-004",
    item: "Whiteboard Markers",
    type: "stock_out",
    quantity: 12,
    date: "2026-05-03 14:10",
    user: "Mary Wanjiku",
    notes: "Issued to lower school classrooms.",
  },
  {
    id: "mov-005",
    item: "Mattress Protector",
    type: "transfer",
    quantity: 6,
    date: "2026-05-03 11:25",
    user: "Peter Kibet",
    notes: "Transferred from main store to girls dorm intake wing.",
  },
  {
    id: "mov-006",
    item: "Lab Gloves",
    type: "damage",
    quantity: 2,
    date: "2026-05-02 16:55",
    user: "Moses Otieno",
    notes: "Boxes torn during handling in prep room.",
  },
  {
    id: "mov-007",
    item: "Cooking Oil 20L",
    type: "stock_in",
    quantity: 8,
    date: "2026-05-02 10:20",
    user: "Linet Auma",
    notes: "Received against PO-2026-020.",
  },
  {
    id: "mov-008",
    item: "Liquid Chlorine 20L",
    type: "stock_out",
    quantity: 4,
    date: "2026-05-02 09:05",
    user: "John Maina",
    notes: "Sanitation issue to ablution blocks and kitchen wash area.",
  },
];

const basePurchaseOrders: PurchaseOrder[] = [
  {
    id: "po-001",
    poNumber: "PO-2026-021",
    supplier: "Crown Office Supplies",
    requestedBy: "Mary Wanjiku",
    orderDate: "2026-05-02",
    expectedDelivery: "2026-05-05",
    lineSummary: "A4 paper, markers, exam ledger books",
    totalAmount: 86250,
    status: "approved",
  },
  {
    id: "po-002",
    poNumber: "PO-2026-020",
    supplier: "Ruiru Fresh Grains",
    requestedBy: "Peter Kibet",
    orderDate: "2026-04-30",
    expectedDelivery: "2026-05-02",
    lineSummary: "Cooking oil, sugar, beans",
    totalAmount: 143600,
    status: "received",
  },
  {
    id: "po-003",
    poNumber: "PO-2026-019",
    supplier: "LabTech East Africa",
    requestedBy: "Moses Otieno",
    orderDate: "2026-04-29",
    expectedDelivery: "2026-05-06",
    lineSummary: "Lab gloves, beakers, indicator solution",
    totalAmount: 57600,
    status: "pending",
  },
  {
    id: "po-004",
    poNumber: "PO-2026-018",
    supplier: "Digital Classroom Kenya",
    requestedBy: "Duncan Irungu",
    orderDate: "2026-04-22",
    expectedDelivery: "2026-05-10",
    lineSummary: "Desktop units, UPS batteries",
    totalAmount: 412000,
    status: "draft",
  },
  {
    id: "po-005",
    poNumber: "PO-2026-017",
    supplier: "Apex Hygiene Solutions",
    requestedBy: "John Maina",
    orderDate: "2026-04-21",
    expectedDelivery: "2026-04-28",
    lineSummary: "Disinfectant and liquid soap",
    totalAmount: 29400,
    status: "cancelled",
  },
];

const baseRequests: DepartmentRequest[] = [
  {
    id: "req-001",
    department: "Kitchen",
    itemGroup: "Food Stores",
    requestedBy: "Chef Ruth Nduta",
    requestDate: "2026-05-04",
    quantity: "45 bags maize flour",
    purpose: "Weekly boarding issue for breakfast and lunch service.",
    status: "fulfilled",
  },
  {
    id: "req-002",
    department: "Science Lab",
    itemGroup: "Laboratory",
    requestedBy: "Moses Otieno",
    requestDate: "2026-05-04",
    quantity: "12 boxes gloves",
    purpose: "Grade 8 practical set-up for acids and indicators.",
    status: "pending",
  },
  {
    id: "req-003",
    department: "Academic Office",
    itemGroup: "Stationery",
    requestedBy: "Lucy Wambui",
    requestDate: "2026-05-03",
    quantity: "24 marker boxes",
    purpose: "Classroom issue for lower school and remedial centres.",
    status: "approved",
  },
  {
    id: "req-004",
    department: "Boarding Office",
    itemGroup: "Boarding Supplies",
    requestedBy: "Susan Cherotich",
    requestDate: "2026-05-02",
    quantity: "18 mattress protectors",
    purpose: "New boarder intake and damaged replacement cover.",
    status: "pending",
  },
  {
    id: "req-005",
    department: "Maintenance",
    itemGroup: "Cleaning",
    requestedBy: "John Maina",
    requestDate: "2026-05-01",
    quantity: "8 chlorine jerrycans",
    purpose: "Water treatment and hygiene line for boarding block.",
    status: "rejected",
  },
];

const baseTransfers: StockTransfer[] = [
  {
    id: "trf-001",
    item: "Mattress Protector",
    fromLocation: "Main Store",
    toLocation: "Girls Dorm Intake Wing",
    quantity: 6,
    requestedBy: "Susan Cherotich",
    date: "2026-05-03",
    status: "completed",
  },
  {
    id: "trf-002",
    item: "Exercise Books 96 Pages",
    fromLocation: "Main Store",
    toLocation: "Grade 7 Resource Room",
    quantity: 80,
    requestedBy: "Mary Wanjiku",
    date: "2026-05-02",
    status: "completed",
  },
  {
    id: "trf-003",
    item: "Liquid Chlorine 20L",
    fromLocation: "Maintenance Store",
    toLocation: "Kitchen Wash Area",
    quantity: 2,
    requestedBy: "John Maina",
    date: "2026-05-04",
    status: "requested",
  },
  {
    id: "trf-004",
    item: "Refurbished Desktop Unit",
    fromLocation: "ICT Cage Store",
    toLocation: "CBC Innovation Lab",
    quantity: 3,
    requestedBy: "Duncan Irungu",
    date: "2026-05-01",
    status: "in_transit",
  },
];

const baseIncidents: InventoryIncident[] = [
  {
    id: "inc-001",
    item: "Beakers 250ml",
    type: "broken",
    quantity: 6,
    department: "Science Lab",
    date: "2026-05-03",
    reason: "Dropped during practical clean-up after Grade 8 chemistry session.",
    costImpact: 3600,
  },
  {
    id: "inc-002",
    item: "Whiteboard Markers",
    type: "lost",
    quantity: 10,
    department: "Lower School",
    date: "2026-05-02",
    reason: "Returned issue packs incomplete after class rotation.",
    costImpact: 1200,
  },
  {
    id: "inc-003",
    item: "Liquid Soap Refill",
    type: "expired",
    quantity: 4,
    department: "Maintenance",
    date: "2026-04-30",
    reason: "Old batch remained unopened after supplier swap.",
    costImpact: 2600,
  },
  {
    id: "inc-004",
    item: "Rugby Balls",
    type: "broken",
    quantity: 2,
    department: "Games",
    date: "2026-04-29",
    reason: "Valve damage after county training weekend.",
    costImpact: 3700,
  },
];

export function createInventoryDataset(): InventoryDataset {
  return {
    categories: baseCategories.map((item) => ({ ...item })),
    suppliers: baseSuppliers.map((item) => ({ ...item })),
    items: baseItems.map((item) => ({ ...item })),
    movements: baseMovements.map((item) => ({ ...item })),
    purchaseOrders: basePurchaseOrders.map((item) => ({ ...item })),
    requests: baseRequests.map((item) => ({ ...item })),
    transfers: baseTransfers.map((item) => ({ ...item })),
    incidents: baseIncidents.map((item) => ({ ...item })),
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
      headers: ["Item", "SKU", "Quantity", "Unit Price", "Total Value"],
      rows: stockValuationRows,
    },
    {
      id: "report-low-stock",
      title: "Low stock report",
      description: "Lines that need replenishment before service disruption.",
      filename: "inventory-low-stock.csv",
      headers: ["Item", "Category", "Qty", "Reorder", "Status"],
      rows: lowStockRows,
    },
    {
      id: "report-movement-history",
      title: "Movement history",
      description: "Full stock trail across issue, receipt, transfer, and damage.",
      filename: "inventory-movement-history.csv",
      headers: ["Item", "Type", "Quantity", "Date", "User"],
      rows: movementRows,
    },
    {
      id: "report-supplier-purchases",
      title: "Supplier purchases",
      description: "Supplier spend and PO lifecycle summary for procurement review.",
      filename: "inventory-supplier-purchases.csv",
      headers: ["PO", "Supplier", "Line Summary", "Amount", "Status"],
      rows: supplierRows,
    },
  ];
}
