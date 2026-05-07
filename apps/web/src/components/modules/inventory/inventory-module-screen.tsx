"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  Archive,
  Boxes,
  ClipboardList,
  PackagePlus,
  PencilLine,
  ShoppingCart,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { InventoryLineItemsEditor } from "@/components/modules/inventory/inventory-line-items-editor";
import { ModuleShell } from "@/components/modules/shared/module-shell";
import { OpsTable, type OpsTableColumn } from "@/components/modules/shared/ops-table";
import { StatStrip } from "@/components/modules/shared/stat-strip";
import { WorkflowCard } from "@/components/modules/shared/workflow-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { useLiveTenantSession } from "@/hooks/use-live-tenant-session";
import { downloadCsvFile } from "@/lib/dashboard/export";
import type { DashboardRole, DashboardSnapshot } from "@/lib/dashboard/types";
import {
  buildInventoryCategoryBreakdown,
  buildInventoryModuleSections,
  buildInventoryReports,
  buildInventoryStatStrip,
  createInventoryDataset,
  formatIncidentType,
  formatInventoryStatus,
  formatMovementType,
  formatPurchaseOrderStatus,
  formatRequestStatus,
  formatTransferStatus,
  getIncidentTone,
  getInventoryItemStatus,
  getInventoryStatusTone,
  getPurchaseOrderTone,
  getRequestTone,
  getTransferTone,
  type DepartmentRequest,
  type InventoryCategory,
  type InventoryDataset,
  type InventoryIncident,
  type InventoryItem,
  type InventoryMovement,
  type InventorySectionId,
  type InventorySupplier,
  type PurchaseOrder,
  type StockTransfer,
} from "@/lib/modules/inventory-data";
import {
  buildInventoryWorkflowLines,
  calculateInventoryWorkflowDraftTotal,
  countInventoryWorkflowDraftUnits,
  createInventoryWorkflowLineDraft,
  summarizeInventoryWorkflowLineDrafts,
  validateInventoryWorkflowLineDrafts,
  type InventoryWorkflowLineDraft,
} from "@/lib/modules/inventory-workflow";
import { formatCurrency } from "@/lib/dashboard/format";
import {
  adjustInventoryItemStockLive,
  createInventoryIncidentLive,
  createInventoryItemLive,
  createInventoryCategoryLive,
  createInventoryPurchaseOrderLive,
  createInventoryRequestLive,
  createInventorySupplierLive,
  createInventoryTransferLive,
  fetchInventoryDatasetLive,
  fetchInventoryReportsLive,
  updateInventoryCategoryLive,
  updateInventoryItemLive,
  updateInventoryPurchaseOrderStatusLive,
  updateInventoryRequestStatusLive,
  updateInventorySupplierLive,
  updateInventoryTransferStatusLive,
} from "@/lib/modules/inventory-live";

const inventorySectionIds: InventorySectionId[] = [
  "dashboard",
  "items",
  "categories",
  "stock-movement",
  "suppliers",
  "purchase-orders",
  "requests",
  "transfers",
  "damages-losses",
  "reports",
];

const fieldClassName =
  "w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm outline-none transition duration-150 focus:border-accent/40 focus:bg-surface";
const textAreaClassName = `${fieldClassName} min-h-[110px] resize-y`;

type ItemFormState = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  quantity: string;
  supplier: string;
  unitPrice: string;
  reorderLevel: string;
  location: string;
  notes: string;
};

type StockAdjustmentFormState = {
  movementType: "stock_in" | "stock_out" | "adjustment";
  quantity: string;
  notes: string;
};

type CategoryFormState = {
  code: string;
  name: string;
  manager: string;
  storageZones: string;
  notes: string;
};

type SupplierFormState = {
  name: string;
  contact: string;
  email: string;
  phone: string;
  county: string;
  status: "active" | "on_hold";
};

type PurchaseOrderFormState = {
  supplier: string;
  requestedBy: string;
  expectedDelivery: string;
  notes: string;
  lineItems: InventoryWorkflowLineDraft[];
};

type RequestFormState = {
  department: string;
  requestedBy: string;
  purpose: string;
  lineItems: InventoryWorkflowLineDraft[];
};

type TransferFormState = {
  fromLocation: string;
  toLocation: string;
  requestedBy: string;
  lineItems: InventoryWorkflowLineDraft[];
};

type IncidentFormState = {
  itemId: string;
  type: "broken" | "lost" | "expired";
  quantity: string;
  department: string;
  reason: string;
  costImpact: string;
};

function isInventorySectionId(value: string | null): value is InventorySectionId {
  return inventorySectionIds.includes((value ?? "") as InventorySectionId);
}

function FieldWrapper({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </label>
  );
}

function createEmptyItemForm(): ItemFormState {
  return {
    name: "",
    sku: "",
    category: "",
    unit: "",
    quantity: "",
    supplier: "",
    unitPrice: "",
    reorderLevel: "",
    location: "",
    notes: "",
  };
}

function createEmptyAdjustmentForm(): StockAdjustmentFormState {
  return {
    movementType: "stock_out",
    quantity: "",
    notes: "",
  };
}

function createEmptyCategoryForm(): CategoryFormState {
  return {
    code: "",
    name: "",
    manager: "",
    storageZones: "",
    notes: "",
  };
}

function createEmptySupplierForm(): SupplierFormState {
  return {
    name: "",
    contact: "",
    email: "",
    phone: "",
    county: "",
    status: "active",
  };
}

function createEmptyPurchaseOrderForm(): PurchaseOrderFormState {
  return {
    supplier: "",
    requestedBy: "",
    expectedDelivery: "",
    notes: "",
    lineItems: [createInventoryWorkflowLineDraft()],
  };
}

function createEmptyRequestForm(): RequestFormState {
  return {
    department: "",
    requestedBy: "",
    purpose: "",
    lineItems: [createInventoryWorkflowLineDraft()],
  };
}

function createEmptyTransferForm(): TransferFormState {
  return {
    fromLocation: "",
    toLocation: "",
    requestedBy: "",
    lineItems: [createInventoryWorkflowLineDraft()],
  };
}

function createEmptyIncidentForm(): IncidentFormState {
  return {
    itemId: "",
    type: "broken",
    quantity: "",
    department: "",
    reason: "",
    costImpact: "",
  };
}

function createEmptyInventoryDataset(): InventoryDataset {
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

export function InventoryModuleScreen({
  role,
  snapshot,
}: {
  role: DashboardRole;
  snapshot: DashboardSnapshot;
  online: boolean;
}) {
  void role;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = isInventorySectionId(searchParams.get("view"))
    ? (searchParams.get("view") as InventorySectionId)
    : "dashboard";

  const queryClient = useQueryClient();
  const liveSession = useLiveTenantSession(snapshot.tenant.id);
  const [localDataset, setLocalDataset] = useState<InventoryDataset>(() => createInventoryDataset());
  const [itemSearch, setItemSearch] = useState("");
  const [itemCategoryFilter, setItemCategoryFilter] = useState("all");
  const [itemStatusFilter, setItemStatusFilter] = useState("all");
  const [itemSort, setItemSort] = useState("name-asc");
  const [itemPage, setItemPage] = useState(1);
  const [categorySearch, setCategorySearch] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [purchaseOrderStatusFilter, setPurchaseOrderStatusFilter] = useState("all");
  const [transferStatusFilter, setTransferStatusFilter] = useState("all");
  const [incidentTypeFilter, setIncidentTypeFilter] = useState("all");
  const [categoryModalMode, setCategoryModalMode] = useState<"add" | "edit">("add");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(createEmptyCategoryForm);
  const [categoryFormErrors, setCategoryFormErrors] = useState<
    Partial<Record<keyof CategoryFormState, string>>
  >({});
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [supplierModalMode, setSupplierModalMode] = useState<"add" | "edit">("add");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(createEmptySupplierForm);
  const [supplierFormErrors, setSupplierFormErrors] = useState<
    Partial<Record<keyof SupplierFormState, string>>
  >({});
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<"add" | "edit">("add");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(createEmptyItemForm);
  const [itemFormErrors, setItemFormErrors] = useState<Partial<Record<keyof ItemFormState, string>>>(
    {},
  );
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [adjustmentItemId, setAdjustmentItemId] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<StockAdjustmentFormState>(
    createEmptyAdjustmentForm,
  );
  const [adjustmentErrors, setAdjustmentErrors] = useState<
    Partial<Record<keyof StockAdjustmentFormState, string>>
  >({});
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [purchaseOrderModalOpen, setPurchaseOrderModalOpen] = useState(false);
  const [purchaseOrderForm, setPurchaseOrderForm] = useState<PurchaseOrderFormState>(
    createEmptyPurchaseOrderForm,
  );
  const [purchaseOrderErrors, setPurchaseOrderErrors] = useState<
    Partial<Record<keyof PurchaseOrderFormState, string>>
  >({});
  const [isSavingPurchaseOrder, setIsSavingPurchaseOrder] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState<RequestFormState>(createEmptyRequestForm);
  const [requestErrors, setRequestErrors] = useState<Partial<Record<keyof RequestFormState, string>>>(
    {},
  );
  const [isSavingRequest, setIsSavingRequest] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferFormState>(createEmptyTransferForm);
  const [transferErrors, setTransferErrors] = useState<
    Partial<Record<keyof TransferFormState, string>>
  >({});
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState<IncidentFormState>(createEmptyIncidentForm);
  const [incidentErrors, setIncidentErrors] = useState<
    Partial<Record<keyof IncidentFormState, string>>
  >({});
  const [isSavingIncident, setIsSavingIncident] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);

  const liveInventoryQuery = useQuery({
    queryKey: ["inventory-module", liveSession.session?.tenantId],
    queryFn: () => fetchInventoryDatasetLive(liveSession.session!),
    enabled: Boolean(liveSession.session),
    placeholderData: (previous) => previous,
  });
  const liveInventoryReportsQuery = useQuery({
    queryKey: ["inventory-reports", liveSession.session?.tenantId],
    queryFn: () => fetchInventoryReportsLive(liveSession.session!),
    enabled: Boolean(liveSession.session),
    placeholderData: (previous) => previous,
  });
  const isLiveMode = Boolean(liveSession.session);
  const dataset = isLiveMode
    ? (liveInventoryQuery.data ?? createEmptyInventoryDataset())
    : localDataset;
  const isDatasetLoading = isLiveMode && liveInventoryQuery.isLoading;

  async function refreshLiveInventoryData() {
    await queryClient.invalidateQueries({
      queryKey: ["inventory-module", liveSession.session?.tenantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["inventory-reports", liveSession.session?.tenantId],
    });
  }

  const deferredItemSearch = useDeferredValue(itemSearch);
  const filteredItems = dataset.items
    .filter((item) => !item.archived)
    .filter((item) => {
      const term = deferredItemSearch.trim().toLowerCase();
      if (!term) {
        return true;
      }

      return [item.name, item.sku, item.location, item.supplier].some((value) =>
        value.toLowerCase().includes(term),
      );
    })
    .filter((item) => itemCategoryFilter === "all" || item.category === itemCategoryFilter)
    .filter((item) => {
      if (itemStatusFilter === "all") {
        return true;
      }

      return getInventoryItemStatus(item) === itemStatusFilter;
    })
    .sort((left, right) => {
      if (itemSort === "name-asc") {
        return left.name.localeCompare(right.name);
      }

      if (itemSort === "quantity-desc") {
        return right.quantity - left.quantity;
      }

      if (itemSort === "value-desc") {
        return right.quantity * right.unitPrice - left.quantity * left.unitPrice;
      }

      return left.reorderLevel - right.reorderLevel;
    });
  const itemsPageSize = 6;
  const pagedItems = filteredItems.slice((itemPage - 1) * itemsPageSize, itemPage * itemsPageSize);

  const filteredMovements = dataset.movements.filter((movement) => {
    const term = activitySearch.trim().toLowerCase();
    if (!term) {
      return true;
    }

    return [movement.item, movement.user, movement.notes, movement.type].some((value) =>
      value.toLowerCase().includes(term),
    );
  });

  const filteredSuppliers = dataset.suppliers.filter((supplier) => {
    const term = supplierSearch.trim().toLowerCase();
    if (!term) {
      return true;
    }

    return [supplier.name, supplier.contact, supplier.email, supplier.phone].some((value) =>
      value.toLowerCase().includes(term),
    );
  });

  const filteredPurchaseOrders = dataset.purchaseOrders.filter(
    (purchaseOrder) =>
      purchaseOrderStatusFilter === "all" || purchaseOrder.status === purchaseOrderStatusFilter,
  );
  const filteredRequests = dataset.requests.filter(
    (request) => requestStatusFilter === "all" || request.status === requestStatusFilter,
  );
  const filteredTransfers = dataset.transfers.filter(
    (transfer) => transferStatusFilter === "all" || transfer.status === transferStatusFilter,
  );
  const filteredIncidents = dataset.incidents.filter(
    (incident) => incidentTypeFilter === "all" || incident.type === incidentTypeFilter,
  );
  const categoryRows = buildInventoryCategoryBreakdown(dataset);
  const filteredCategoryRows = categoryRows.filter((category) => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) {
      return true;
    }

    return [
      category.name,
      category.code,
      category.manager,
      category.storageZones,
      category.notes,
    ].some((value) => value.toLowerCase().includes(term));
  });
  const purchaseOrderDraftTotal = calculateInventoryWorkflowDraftTotal(purchaseOrderForm.lineItems);
  const requestDraftUnits = countInventoryWorkflowDraftUnits(requestForm.lineItems);
  const transferDraftUnits = countInventoryWorkflowDraftUnits(transferForm.lineItems);
  const selectedIncidentItem = dataset.items.find((item) => item.id === incidentForm.itemId) ?? null;

  const lowStockItems = dataset.items.filter((item) => {
    const status = getInventoryItemStatus(item);
    return status === "low_stock" || status === "out_of_stock";
  });
  const pendingApprovals = [
    ...dataset.requests
      .filter((request) => request.status === "pending" || request.status === "approved")
      .map((request) => ({
        id: request.id,
        title: `${request.department} request`,
        detail: `${request.quantity} for ${request.itemGroup} · ${request.requestedBy}`,
        value: formatRequestStatus(request.status),
        tone: getRequestTone(request.status),
      })),
    ...dataset.purchaseOrders
      .filter((purchaseOrder) => purchaseOrder.status === "pending" || purchaseOrder.status === "draft")
      .map((purchaseOrder) => ({
        id: purchaseOrder.id,
        title: purchaseOrder.poNumber,
        detail: `${purchaseOrder.supplier} · ${purchaseOrder.lineSummary}`,
        value: formatPurchaseOrderStatus(purchaseOrder.status),
        tone: getPurchaseOrderTone(purchaseOrder.status),
      })),
  ].slice(0, 5);
  const reports = isLiveMode
    ? (liveInventoryReportsQuery.data ?? buildInventoryReports(dataset))
    : buildInventoryReports(dataset);
  const sections = buildInventoryModuleSections(dataset);

  function updateSection(sectionId: InventorySectionId) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", sectionId);

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function openAddCategoryModal() {
    setCategoryModalMode("add");
    setEditingCategoryId(null);
    setCategoryForm(createEmptyCategoryForm());
    setCategoryFormErrors({});
    setCategoryModalOpen(true);
  }

  function openEditCategoryModal(category: InventoryCategory) {
    setCategoryModalMode("edit");
    setEditingCategoryId(category.id);
    setCategoryForm({
      code: category.code,
      name: category.name,
      manager: category.manager,
      storageZones: category.storageZones,
      notes: category.notes,
    });
    setCategoryFormErrors({});
    setCategoryModalOpen(true);
  }

  function validateCategoryForm() {
    const errors: Partial<Record<keyof CategoryFormState, string>> = {};

    if (!categoryForm.code.trim()) errors.code = "Category code is required.";
    if (!categoryForm.name.trim()) errors.name = "Category name is required.";
    if (!categoryForm.manager.trim()) errors.manager = "Category owner is required.";
    if (!categoryForm.storageZones.trim()) errors.storageZones = "Storage zone is required.";

    setCategoryFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitCategoryForm() {
    if (!validateCategoryForm()) {
      return;
    }

    setIsSavingCategory(true);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        const payload = {
          code: categoryForm.code.trim().toUpperCase(),
          name: categoryForm.name.trim(),
          manager: categoryForm.manager.trim(),
          storage_zones: categoryForm.storageZones.trim(),
          description: categoryForm.notes.trim(),
        };

        if (categoryModalMode === "add") {
          await createInventoryCategoryLive(liveSession.session, payload);
        } else if (editingCategoryId) {
          await updateInventoryCategoryLive(liveSession.session, editingCategoryId, payload);
        }

        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 300));

        const previousCategory = dataset.categories.find((category) => category.id === editingCategoryId);
        const nextCategory: InventoryCategory = {
          id: editingCategoryId ?? `cat-${Date.now()}`,
          code: categoryForm.code.trim().toUpperCase(),
          name: categoryForm.name.trim(),
          manager: categoryForm.manager.trim(),
          storageZones: categoryForm.storageZones.trim(),
          notes: categoryForm.notes.trim(),
        };

        setLocalDataset((current) => ({
          ...current,
          categories:
            categoryModalMode === "add"
              ? [nextCategory, ...current.categories]
              : current.categories.map((category) =>
                  category.id === nextCategory.id ? nextCategory : category,
                ),
          items:
            categoryModalMode === "edit" && previousCategory
              ? current.items.map((item) =>
                  item.category === previousCategory.name
                    ? { ...item, category: nextCategory.name }
                    : item,
                )
              : current.items,
        }));
      }

      setCategoryModalOpen(false);
      setCategoryForm(createEmptyCategoryForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to save the category.");
    } finally {
      setIsSavingCategory(false);
    }
  }

  function openAddSupplierModal() {
    setSupplierModalMode("add");
    setEditingSupplierId(null);
    setSupplierForm(createEmptySupplierForm());
    setSupplierFormErrors({});
    setSupplierModalOpen(true);
  }

  function openEditSupplierModal(supplier: InventorySupplier) {
    setSupplierModalMode("edit");
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      name: supplier.name,
      contact: supplier.contact,
      email: supplier.email,
      phone: supplier.phone,
      county: supplier.county,
      status: supplier.status,
    });
    setSupplierFormErrors({});
    setSupplierModalOpen(true);
  }

  function validateSupplierForm() {
    const errors: Partial<Record<keyof SupplierFormState, string>> = {};

    if (!supplierForm.name.trim()) errors.name = "Supplier name is required.";
    if (!supplierForm.contact.trim()) errors.contact = "Contact person is required.";
    if (!supplierForm.email.trim()) {
      errors.email = "Email is required.";
    } else if (!supplierForm.email.includes("@")) {
      errors.email = "Enter a valid email address.";
    }
    if (!supplierForm.phone.trim()) errors.phone = "Phone number is required.";
    if (!supplierForm.county.trim()) errors.county = "County is required.";

    setSupplierFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitSupplierForm() {
    if (!validateSupplierForm()) {
      return;
    }

    setIsSavingSupplier(true);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        const payload = {
          supplier_name: supplierForm.name.trim(),
          contact_person: supplierForm.contact.trim(),
          email: supplierForm.email.trim(),
          phone: supplierForm.phone.trim(),
          county: supplierForm.county.trim(),
          status: supplierForm.status,
        } as const;

        if (supplierModalMode === "add") {
          await createInventorySupplierLive(liveSession.session, payload);
        } else if (editingSupplierId) {
          await updateInventorySupplierLive(liveSession.session, editingSupplierId, payload);
        }

        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 300));

        const previousSupplier = dataset.suppliers.find((supplier) => supplier.id === editingSupplierId);
        const nextSupplier: InventorySupplier = {
          id: editingSupplierId ?? `sup-${Date.now()}`,
          name: supplierForm.name.trim(),
          contact: supplierForm.contact.trim(),
          email: supplierForm.email.trim(),
          phone: supplierForm.phone.trim(),
          county: supplierForm.county.trim(),
          status: supplierForm.status,
          lastDelivery: previousSupplier?.lastDelivery ?? "-",
        };

        setLocalDataset((current) => ({
          ...current,
          suppliers:
            supplierModalMode === "add"
              ? [nextSupplier, ...current.suppliers]
              : current.suppliers.map((supplier) =>
                  supplier.id === nextSupplier.id ? nextSupplier : supplier,
                ),
          items:
            supplierModalMode === "edit" && previousSupplier
              ? current.items.map((item) =>
                  item.supplier === previousSupplier.name
                    ? { ...item, supplier: nextSupplier.name }
                    : item,
                )
              : current.items,
          purchaseOrders:
            supplierModalMode === "edit" && previousSupplier
              ? current.purchaseOrders.map((purchaseOrder) =>
                  purchaseOrder.supplier === previousSupplier.name
                    ? { ...purchaseOrder, supplier: nextSupplier.name }
                    : purchaseOrder,
                )
              : current.purchaseOrders,
        }));
      }

      setSupplierModalOpen(false);
      setSupplierForm(createEmptySupplierForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to save the supplier.");
    } finally {
      setIsSavingSupplier(false);
    }
  }

  function openAddItemModal() {
    setItemModalMode("add");
    setEditingItemId(null);
    setItemForm(createEmptyItemForm());
    setItemFormErrors({});
    setItemModalOpen(true);
  }

  function openEditItemModal(item: InventoryItem) {
    setItemModalMode("edit");
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
      quantity: `${item.quantity}`,
      supplier: item.supplier,
      unitPrice: `${item.unitPrice}`,
      reorderLevel: `${item.reorderLevel}`,
      location: item.location,
      notes: item.notes,
    });
    setItemFormErrors({});
    setItemModalOpen(true);
  }

  function validateItemForm() {
    const errors: Partial<Record<keyof ItemFormState, string>> = {};

    if (!itemForm.name.trim()) errors.name = "Item name is required.";
    if (!itemForm.sku.trim()) errors.sku = "SKU is required.";
    if (!itemForm.category.trim()) errors.category = "Category is required.";
    if (!itemForm.unit.trim()) errors.unit = "Unit is required.";
    if (!itemForm.supplier.trim()) errors.supplier = "Supplier is required.";
    if (!itemForm.location.trim()) errors.location = "Storage location is required.";
    if (!itemForm.quantity.trim() || Number(itemForm.quantity) < 0) {
      errors.quantity = "Quantity must be zero or more.";
    }
    if (!itemForm.unitPrice.trim() || Number(itemForm.unitPrice) <= 0) {
      errors.unitPrice = "Unit price must be above zero.";
    }
    if (!itemForm.reorderLevel.trim() || Number(itemForm.reorderLevel) < 0) {
      errors.reorderLevel = "Reorder level must be zero or more.";
    }

    setItemFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitItemForm() {
    if (!validateItemForm()) {
      return;
    }

    setIsSavingItem(true);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        const categoryId = dataset.categories.find(
          (category) => category.name === itemForm.category.trim(),
        )?.id;
        const supplierId = dataset.suppliers.find(
          (supplier) => supplier.name === itemForm.supplier.trim(),
        )?.id;

        if (itemModalMode === "add") {
          await createInventoryItemLive(liveSession.session, {
            item_name: itemForm.name.trim(),
            sku: itemForm.sku.trim(),
            category_id: categoryId,
            unit: itemForm.unit.trim(),
            quantity: Number(itemForm.quantity),
            supplier_id: supplierId,
            unit_price: Number(itemForm.unitPrice),
            reorder_level: Number(itemForm.reorderLevel),
            storage_location: itemForm.location.trim(),
            notes: itemForm.notes.trim(),
          });
        } else if (editingItemId) {
          await updateInventoryItemLive(liveSession.session, editingItemId, {
            item_name: itemForm.name.trim(),
            sku: itemForm.sku.trim(),
            category_id: categoryId,
            unit: itemForm.unit.trim(),
            supplier_id: supplierId,
            unit_price: Number(itemForm.unitPrice),
            reorder_level: Number(itemForm.reorderLevel),
            storage_location: itemForm.location.trim(),
            notes: itemForm.notes.trim(),
          });
        }

        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 450));

        const nextItem: InventoryItem = {
          id: editingItemId ?? `itm-${Date.now()}`,
          name: itemForm.name.trim(),
          sku: itemForm.sku.trim(),
          category: itemForm.category.trim(),
          unit: itemForm.unit.trim(),
          quantity: Number(itemForm.quantity),
          supplier: itemForm.supplier.trim(),
          unitPrice: Number(itemForm.unitPrice),
          reorderLevel: Number(itemForm.reorderLevel),
          location: itemForm.location.trim(),
          notes: itemForm.notes.trim(),
          archived: false,
        };

        setLocalDataset((current) => ({
          ...current,
          items:
            itemModalMode === "add"
              ? [nextItem, ...current.items]
              : current.items.map((item) => (item.id === nextItem.id ? nextItem : item)),
        }));
      }

      setItemModalOpen(false);
      setItemForm(createEmptyItemForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to save the inventory item.");
    } finally {
      setIsSavingItem(false);
    }
  }

  async function archiveItem(itemId: string) {
    setModuleError(null);

    if (isLiveMode && liveSession.session) {
      setActiveActionId(`${itemId}-archive`);

      try {
        await updateInventoryItemLive(liveSession.session, itemId, {
          item_name: dataset.items.find((item) => item.id === itemId)?.name ?? "",
          sku: dataset.items.find((item) => item.id === itemId)?.sku ?? "",
          unit: dataset.items.find((item) => item.id === itemId)?.unit ?? "",
          unit_price: dataset.items.find((item) => item.id === itemId)?.unitPrice ?? 0,
          reorder_level: dataset.items.find((item) => item.id === itemId)?.reorderLevel ?? 0,
          is_archived: true,
        });
        await refreshLiveInventoryData();
      } catch (error) {
        setModuleError(error instanceof Error ? error.message : "Unable to archive the item.");
      } finally {
        setActiveActionId(null);
      }

      return;
    }

    setLocalDataset((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === itemId ? { ...item, archived: true } : item,
      ),
    }));
  }

  function openAdjustmentModal(item: InventoryItem) {
    setAdjustmentItemId(item.id);
    setAdjustmentForm(createEmptyAdjustmentForm());
    setAdjustmentErrors({});
    setAdjustmentModalOpen(true);
  }

  function validateAdjustmentForm() {
    const errors: Partial<Record<keyof StockAdjustmentFormState, string>> = {};

    if (!adjustmentForm.quantity.trim() || Number(adjustmentForm.quantity) <= 0) {
      errors.quantity = "Quantity must be above zero.";
    }

    if (!adjustmentForm.notes.trim()) {
      errors.notes = "A note is required for audit trail clarity.";
    }

    setAdjustmentErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitAdjustment() {
    if (!adjustmentItemId || !validateAdjustmentForm()) {
      return;
    }

    const item = dataset.items.find((entry) => entry.id === adjustmentItemId);
    if (!item) {
      return;
    }

    setIsSavingAdjustment(true);
    setModuleError(null);

    try {
      const quantity = Number(adjustmentForm.quantity);

      if (isLiveMode && liveSession.session) {
        await adjustInventoryItemStockLive(liveSession.session, adjustmentItemId, {
          movement_type: adjustmentForm.movementType,
          quantity,
          notes: adjustmentForm.notes.trim(),
          reference: `ADJ-${item.sku}`,
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        const nextQuantity =
          adjustmentForm.movementType === "stock_in"
            ? item.quantity + quantity
            : Math.max(0, item.quantity - quantity);

        setLocalDataset((current) => ({
          ...current,
          items: current.items.map((entry) =>
            entry.id === item.id ? { ...entry, quantity: nextQuantity } : entry,
          ),
          movements: [
            {
              id: `mov-${Date.now()}`,
              item: item.name,
              type: adjustmentForm.movementType,
              quantity,
              date: "2026-05-04 15:45",
              user: role === "admin" ? "Admin override" : "Storekeeper desk",
              notes: adjustmentForm.notes.trim(),
            },
            ...current.movements,
          ],
        }));
      }

      setAdjustmentModalOpen(false);
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to post the stock adjustment.");
    } finally {
      setIsSavingAdjustment(false);
    }
  }

  function validatePurchaseOrderForm() {
    const errors: Partial<Record<keyof PurchaseOrderFormState, string>> = {};

    if (!purchaseOrderForm.supplier.trim()) errors.supplier = "Supplier is required.";
    if (!purchaseOrderForm.requestedBy.trim()) errors.requestedBy = "Request owner is required.";
    if (!purchaseOrderForm.expectedDelivery.trim()) {
      errors.expectedDelivery = "Expected delivery date is required.";
    }
    const lineItemsError = validateInventoryWorkflowLineDrafts(
      purchaseOrderForm.lineItems,
      dataset.items,
    );
    if (lineItemsError) errors.lineItems = lineItemsError;

    setPurchaseOrderErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitPurchaseOrder() {
    if (!validatePurchaseOrderForm()) {
      return;
    }

    setIsSavingPurchaseOrder(true);
    setModuleError(null);

    try {
      const purchaseOrderLines = buildInventoryWorkflowLines(
        purchaseOrderForm.lineItems,
        dataset.items,
      );
      const purchaseOrderSummary = summarizeInventoryWorkflowLineDrafts(
        purchaseOrderForm.lineItems,
        dataset.items,
      );
      const purchaseOrderNotes = [
        purchaseOrderForm.requestedBy.trim(),
        purchaseOrderForm.notes.trim(),
      ]
        .filter(Boolean)
        .join(" :: ");

      if (isLiveMode && liveSession.session) {
        const supplierId = dataset.suppliers.find(
          (supplier) => supplier.name === purchaseOrderForm.supplier.trim(),
        )?.id;

        if (!supplierId) {
          throw new Error("Select an existing supplier before creating a purchase order.");
        }

        await createInventoryPurchaseOrderLive(liveSession.session, {
          supplier_id: supplierId,
          expected_delivery_date: purchaseOrderForm.expectedDelivery,
          lines: purchaseOrderLines,
          notes: purchaseOrderNotes || undefined,
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        setLocalDataset((current) => ({
          ...current,
          purchaseOrders: [
            {
              id: `po-${Date.now()}`,
              poNumber: `PO-2026-${String(current.purchaseOrders.length + 22).padStart(3, "0")}`,
              supplier: purchaseOrderForm.supplier.trim(),
              requestedBy: purchaseOrderForm.requestedBy.trim(),
              orderDate: "2026-05-04",
              expectedDelivery: purchaseOrderForm.expectedDelivery,
              lineSummary: purchaseOrderSummary,
              totalAmount: purchaseOrderDraftTotal,
              status: "draft",
            },
            ...current.purchaseOrders,
          ],
        }));
      }

      setPurchaseOrderModalOpen(false);
      setPurchaseOrderForm(createEmptyPurchaseOrderForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to create the purchase order.");
    } finally {
      setIsSavingPurchaseOrder(false);
    }
  }

  async function advancePurchaseOrder(purchaseOrderId: string, nextStatus: PurchaseOrder["status"]) {
    setActiveActionId(`${purchaseOrderId}-${nextStatus}`);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        await updateInventoryPurchaseOrderStatusLive(liveSession.session, purchaseOrderId, {
          status: nextStatus,
          notes: nextStatus === "received" ? "Stock received into stores." : undefined,
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));

        setLocalDataset((current) => ({
          ...current,
          purchaseOrders: current.purchaseOrders.map((purchaseOrder) =>
            purchaseOrder.id === purchaseOrderId ? { ...purchaseOrder, status: nextStatus } : purchaseOrder,
          ),
          movements:
            nextStatus === "received"
              ? [
                  {
                    id: `mov-${Date.now()}`,
                    item: "Multi-line supplier receipt",
                    type: "stock_in",
                    quantity: 1,
                    date: "2026-05-04 16:10",
                    user: "Linet Auma",
                    notes: `Stock received against ${purchaseOrderId}.`,
                  },
                  ...current.movements,
                ]
              : current.movements,
        }));
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to update the purchase order.");
    } finally {
      setActiveActionId(null);
    }
  }

  function validateRequestForm() {
    const errors: Partial<Record<keyof RequestFormState, string>> = {};

    if (!requestForm.department.trim()) errors.department = "Department is required.";
    if (!requestForm.requestedBy.trim()) errors.requestedBy = "Request owner is required.";
    if (!requestForm.purpose.trim()) errors.purpose = "Purpose is required.";
    const lineItemsError = validateInventoryWorkflowLineDrafts(requestForm.lineItems, dataset.items);
    if (lineItemsError) errors.lineItems = lineItemsError;

    setRequestErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitRequest() {
    if (!validateRequestForm()) {
      return;
    }

    setIsSavingRequest(true);
    setModuleError(null);

    try {
      const requestLines = buildInventoryWorkflowLines(requestForm.lineItems, dataset.items);
      const requestSummary = summarizeInventoryWorkflowLineDrafts(requestForm.lineItems, dataset.items);

      if (isLiveMode && liveSession.session) {
        await createInventoryRequestLive(liveSession.session, {
          department: requestForm.department.trim(),
          requested_by: requestForm.requestedBy.trim(),
          lines: requestLines,
          notes: requestForm.purpose.trim(),
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        setLocalDataset((current) => ({
          ...current,
          requests: [
            {
              id: `req-${Date.now()}`,
              department: requestForm.department.trim(),
              itemGroup: requestSummary,
              requestedBy: requestForm.requestedBy.trim(),
              requestDate: "2026-05-04",
              quantity: `${requestDraftUnits} units`,
              purpose: requestForm.purpose.trim(),
              status: "pending",
            },
            ...current.requests,
          ],
        }));
      }

      setRequestModalOpen(false);
      setRequestForm(createEmptyRequestForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to create the stock request.");
    } finally {
      setIsSavingRequest(false);
    }
  }

  async function updateRequestStatus(requestId: string, nextStatus: DepartmentRequest["status"]) {
    setActiveActionId(`${requestId}-${nextStatus}`);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        await updateInventoryRequestStatusLive(liveSession.session, requestId, {
          status: nextStatus === "rejected" ? "pending" : nextStatus,
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setLocalDataset((current) => ({
          ...current,
          requests: current.requests.map((request) =>
            request.id === requestId ? { ...request, status: nextStatus } : request,
          ),
        }));
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to update the stock request.");
    } finally {
      setActiveActionId(null);
    }
  }

  function validateTransferForm() {
    const errors: Partial<Record<keyof TransferFormState, string>> = {};

    if (!transferForm.fromLocation.trim()) errors.fromLocation = "From location is required.";
    if (!transferForm.toLocation.trim()) errors.toLocation = "To location is required.";
    if (!transferForm.requestedBy.trim()) errors.requestedBy = "Request owner is required.";
    const lineItemsError = validateInventoryWorkflowLineDrafts(transferForm.lineItems, dataset.items);
    if (lineItemsError) errors.lineItems = lineItemsError;

    setTransferErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitTransfer() {
    if (!validateTransferForm()) {
      return;
    }

    setIsSavingTransfer(true);
    setModuleError(null);

    try {
      const transferLines = buildInventoryWorkflowLines(transferForm.lineItems, dataset.items);
      const transferSummary = summarizeInventoryWorkflowLineDrafts(transferForm.lineItems, dataset.items);

      if (isLiveMode && liveSession.session) {
        await createInventoryTransferLive(liveSession.session, {
          from_location: transferForm.fromLocation.trim(),
          to_location: transferForm.toLocation.trim(),
          requested_by: transferForm.requestedBy.trim(),
          lines: transferLines,
          notes: `${transferSummary} transfer request`,
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setLocalDataset((current) => ({
          ...current,
          transfers: [
            {
              id: `trf-${Date.now()}`,
              item: transferSummary,
              fromLocation: transferForm.fromLocation.trim(),
              toLocation: transferForm.toLocation.trim(),
              quantity: transferDraftUnits,
              requestedBy: transferForm.requestedBy.trim(),
              date: "2026-05-04",
              status: "requested",
            },
            ...current.transfers,
          ],
        }));
      }

      setTransferModalOpen(false);
      setTransferForm(createEmptyTransferForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to create the stock transfer.");
    } finally {
      setIsSavingTransfer(false);
    }
  }

  async function completeTransfer(transferId: string) {
    setActiveActionId(`${transferId}-complete`);
    setModuleError(null);

    try {
      if (isLiveMode && liveSession.session) {
        await updateInventoryTransferStatusLive(liveSession.session, transferId, {
          status: "completed",
          notes: "Transfer completed and receipted at destination.",
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        setLocalDataset((current) => ({
          ...current,
          transfers: current.transfers.map((transfer) =>
            transfer.id === transferId ? { ...transfer, status: "completed" } : transfer,
          ),
        }));
      }
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to complete the transfer.");
    } finally {
      setActiveActionId(null);
    }
  }

  function validateIncidentForm() {
    const errors: Partial<Record<keyof IncidentFormState, string>> = {};

    if (!incidentForm.itemId.trim()) errors.itemId = "Item is required.";
    if (!incidentForm.department.trim()) errors.department = "Department is required.";
    if (!incidentForm.reason.trim()) errors.reason = "Reason is required.";
    if (!incidentForm.quantity.trim() || Number(incidentForm.quantity) <= 0) {
      errors.quantity = "Quantity must be above zero.";
    }
    if (!incidentForm.costImpact.trim() || Number(incidentForm.costImpact) <= 0) {
      errors.costImpact = "Cost impact must be above zero.";
    }

    setIncidentErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitIncident() {
    if (!validateIncidentForm()) {
      return;
    }

    setIsSavingIncident(true);
    setModuleError(null);

    try {
      const incidentItem = dataset.items.find((item) => item.id === incidentForm.itemId) ?? null;

      if (!incidentItem) {
        throw new Error("Select an inventory item before logging damage or loss.");
      }

      if (isLiveMode && liveSession.session) {
        await createInventoryIncidentLive(liveSession.session, {
          item_id: incidentItem.id,
          incident_type: incidentForm.type,
          quantity: Number(incidentForm.quantity),
          reason: incidentForm.reason.trim(),
          responsible_department: incidentForm.department.trim(),
          cost_impact: Number(incidentForm.costImpact),
        });
        await refreshLiveInventoryData();
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setLocalDataset((current) => ({
          ...current,
          incidents: [
            {
              id: `inc-${Date.now()}`,
              item: incidentItem.name,
              type: incidentForm.type,
              quantity: Number(incidentForm.quantity),
              department: incidentForm.department.trim(),
              date: "2026-05-04",
              reason: incidentForm.reason.trim(),
              costImpact: Number(incidentForm.costImpact),
            },
            ...current.incidents,
          ],
        }));
      }

      setIncidentModalOpen(false);
      setIncidentForm(createEmptyIncidentForm());
    } catch (error) {
      setModuleError(error instanceof Error ? error.message : "Unable to log the incident.");
    } finally {
      setIsSavingIncident(false);
    }
  }

  const inventoryItemColumns: OpsTableColumn<InventoryItem>[] = [
    {
      id: "item",
      header: "Item Name",
      render: (item) => (
        <div>
          <p className="font-semibold text-foreground">{item.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{item.location}</p>
        </div>
      ),
    },
    { id: "sku", header: "SKU", render: (item) => item.sku },
    { id: "category", header: "Category", render: (item) => item.category },
    {
      id: "quantity",
      header: "Quantity",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (item) => `${item.quantity} ${item.unit}`,
    },
    {
      id: "unit-price",
      header: "Unit Price",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (item) => formatCurrency(item.unitPrice, false),
    },
    {
      id: "total-value",
      header: "Total Value",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (item) => formatCurrency(item.unitPrice * item.quantity, false),
    },
    {
      id: "reorder",
      header: "Reorder Level",
      className: "text-right",
      headerClassName: "text-right",
      render: (item) => `${item.reorderLevel}`,
    },
    {
      id: "status",
      header: "Status",
      render: (item) => {
        const status = getInventoryItemStatus(item);
        return <StatusPill label={formatInventoryStatus(status)} tone={getInventoryStatusTone(status)} />;
      },
    },
    {
      id: "actions",
      header: "Actions",
      render: (item) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEditItemModal(item)}>
            <PencilLine className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openAdjustmentModal(item)}>
            <Boxes className="h-4 w-4" />
            Adjust
          </Button>
          <Button variant="ghost" size="sm" onClick={() => archiveItem(item.id)}>
            <Archive className="h-4 w-4" />
            Archive
          </Button>
        </div>
      ),
    },
  ];

  const movementColumns: OpsTableColumn<InventoryMovement>[] = [
    { id: "item", header: "Item", render: (movement) => movement.item },
    {
      id: "type",
      header: "Type",
      render: (movement) => (
        <StatusPill label={formatMovementType(movement.type)} tone={movement.type === "damage" ? "critical" : movement.type === "transfer" ? "warning" : "ok"} />
      ),
    },
    { id: "qty", header: "Quantity", render: (movement) => `${movement.quantity}` },
    { id: "date", header: "Date", render: (movement) => movement.date },
    { id: "user", header: "User", render: (movement) => movement.user },
    { id: "notes", header: "Notes", render: (movement) => movement.notes },
  ];

  const supplierColumns: OpsTableColumn<InventorySupplier>[] = [
    {
      id: "name",
      header: "Supplier Name",
      render: (supplier) => (
        <div>
          <p className="font-semibold text-foreground">{supplier.name}</p>
          <p className="mt-1 text-sm text-muted">{supplier.county}</p>
        </div>
      ),
    },
    { id: "contact", header: "Contact", render: (supplier) => supplier.contact },
    { id: "email", header: "Email", render: (supplier) => supplier.email },
    { id: "phone", header: "Phone", render: (supplier) => supplier.phone },
    { id: "last", header: "Last delivery", render: (supplier) => supplier.lastDelivery },
    {
      id: "status",
      header: "Status",
      render: (supplier) => (
        <StatusPill
          label={supplier.status === "active" ? "Active" : "On hold"}
          tone={supplier.status === "active" ? "ok" : "warning"}
        />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      render: (supplier) => (
        <Button variant="ghost" size="sm" onClick={() => openEditSupplierModal(supplier)}>
          <PencilLine className="h-4 w-4" />
          Edit
        </Button>
      ),
    },
  ];

  const purchaseOrderColumns: OpsTableColumn<PurchaseOrder>[] = [
    { id: "po", header: "PO Number", render: (purchaseOrder) => purchaseOrder.poNumber },
    { id: "supplier", header: "Supplier", render: (purchaseOrder) => purchaseOrder.supplier },
    { id: "requestedBy", header: "Requested By", render: (purchaseOrder) => purchaseOrder.requestedBy },
    { id: "summary", header: "Lines", render: (purchaseOrder) => purchaseOrder.lineSummary },
    {
      id: "amount",
      header: "Amount",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (purchaseOrder) => formatCurrency(purchaseOrder.totalAmount, false),
    },
    {
      id: "status",
      header: "Status",
      render: (purchaseOrder) => (
        <StatusPill
          label={formatPurchaseOrderStatus(purchaseOrder.status)}
          tone={getPurchaseOrderTone(purchaseOrder.status)}
        />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      render: (purchaseOrder) => (
        <div className="flex flex-wrap gap-2">
          {purchaseOrder.status === "draft" || purchaseOrder.status === "pending" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={activeActionId === `${purchaseOrder.id}-approved`}
              onClick={() => advancePurchaseOrder(purchaseOrder.id, "approved")}
            >
              {activeActionId === `${purchaseOrder.id}-approved` ? "Approving..." : "Approve"}
            </Button>
          ) : null}
          {purchaseOrder.status === "approved" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={activeActionId === `${purchaseOrder.id}-received`}
              onClick={() => advancePurchaseOrder(purchaseOrder.id, "received")}
            >
              {activeActionId === `${purchaseOrder.id}-received` ? "Receiving..." : "Receive"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const requestColumns: OpsTableColumn<DepartmentRequest>[] = [
    { id: "department", header: "Department", render: (request) => request.department },
    { id: "group", header: "Item Group", render: (request) => request.itemGroup },
    { id: "requestedBy", header: "Requested By", render: (request) => request.requestedBy },
    { id: "date", header: "Request Date", render: (request) => request.requestDate },
    { id: "quantity", header: "Quantity", render: (request) => request.quantity },
    { id: "purpose", header: "Purpose", render: (request) => request.purpose },
    {
      id: "status",
      header: "Status",
      render: (request) => (
        <StatusPill label={formatRequestStatus(request.status)} tone={getRequestTone(request.status)} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      render: (request) => (
        <div className="flex flex-wrap gap-2">
          {request.status === "pending" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={activeActionId === `${request.id}-approved`}
              onClick={() => updateRequestStatus(request.id, "approved")}
            >
              {activeActionId === `${request.id}-approved` ? "Approving..." : "Approve"}
            </Button>
          ) : null}
          {request.status === "approved" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={activeActionId === `${request.id}-fulfilled`}
              onClick={() => updateRequestStatus(request.id, "fulfilled")}
            >
              {activeActionId === `${request.id}-fulfilled` ? "Fulfilling..." : "Fulfill"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const transferColumns: OpsTableColumn<StockTransfer>[] = [
    { id: "item", header: "Item", render: (transfer) => transfer.item },
    { id: "from", header: "From", render: (transfer) => transfer.fromLocation },
    { id: "to", header: "To", render: (transfer) => transfer.toLocation },
    { id: "quantity", header: "Quantity", render: (transfer) => `${transfer.quantity}` },
    { id: "requestedBy", header: "Requested By", render: (transfer) => transfer.requestedBy },
    { id: "date", header: "Date", render: (transfer) => transfer.date },
    {
      id: "status",
      header: "Status",
      render: (transfer) => (
        <StatusPill label={formatTransferStatus(transfer.status)} tone={getTransferTone(transfer.status)} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      render: (transfer) =>
        transfer.status !== "completed" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={activeActionId === `${transfer.id}-complete`}
            onClick={() => completeTransfer(transfer.id)}
          >
            {activeActionId === `${transfer.id}-complete` ? "Updating..." : "Complete"}
          </Button>
        ) : null,
    },
  ];

  const incidentColumns: OpsTableColumn<InventoryIncident>[] = [
    { id: "item", header: "Item", render: (incident) => incident.item },
    {
      id: "type",
      header: "Type",
      render: (incident) => (
        <StatusPill label={formatIncidentType(incident.type)} tone={getIncidentTone(incident.type)} />
      ),
    },
    { id: "quantity", header: "Quantity", render: (incident) => `${incident.quantity}` },
    { id: "department", header: "Department", render: (incident) => incident.department },
    { id: "date", header: "Date", render: (incident) => incident.date },
    { id: "reason", header: "Reason", render: (incident) => incident.reason },
    {
      id: "impact",
      header: "Cost Impact",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (incident) => formatCurrency(incident.costImpact, false),
    },
  ];

  const categoryColumns: OpsTableColumn<(typeof categoryRows)[number]>[] = [
    {
      id: "name",
      header: "Category",
      render: (category) => (
        <div>
          <p className="font-semibold text-foreground">{category.name}</p>
          <p className="mt-1 text-sm text-muted">
            {category.code} · {category.notes}
          </p>
        </div>
      ),
    },
    { id: "manager", header: "Owner", render: (category) => category.manager },
    { id: "items", header: "Items", render: (category) => `${category.itemCount}` },
    { id: "zones", header: "Storage Zones", render: (category) => category.storageZones },
    {
      id: "value",
      header: "Value",
      className: "text-right font-semibold",
      headerClassName: "text-right",
      render: (category) => category.totalValue,
    },
    {
      id: "actions",
      header: "Actions",
      render: (category) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            openEditCategoryModal({
              id: category.id,
              code: category.code,
              name: category.name,
              manager: category.manager,
              storageZones: category.storageZones,
              notes: category.notes,
            })
          }
        >
          <PencilLine className="h-4 w-4" />
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <ModuleShell
        eyebrow="Inventory Module"
        title="Inventory and procurement workspace"
        description="Operational stock control for Kenyan schools: items, approvals, requests, transfers, damages, and school-facing reports in one dense workspace."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={(sectionId) => updateSection(sectionId as InventorySectionId)}
        meta={
          <>
            <StatusPill
              label={
                isLiveMode
                  ? "Live store ledger"
                  : liveSession.apiConfigured
                    ? "Preview data until live sign-in"
                    : "Review workspace"
              }
              tone={isLiveMode ? "ok" : "warning"}
            />
            <StatusPill label={`${lowStockItems.length} low-stock alerts`} tone={lowStockItems.length > 0 ? "critical" : "ok"} />
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setPurchaseOrderModalOpen(true)}>
              <ShoppingCart className="h-4 w-4" />
              Create PO
            </Button>
            <Button onClick={openAddItemModal}>
              <PackagePlus className="h-4 w-4" />
              Add item
            </Button>
          </>
        }
        sidebarFooter={
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Data source
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {isLiveMode
                ? `Signed in as ${liveSession.user?.display_name ?? "store staff"} for live backend operations.`
                : "Procurement and stock valuation stay visible together in the review workspace until a live tenant session is active."}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {moduleError ?? liveSession.error ?? "This keeps store decisions aligned to budget pressure, not just quantity on shelf."}
            </p>
          </div>
        }
      >
        {moduleError ? (
          <Card className="border-danger/40 bg-danger/5 p-4">
            <p className="text-sm font-semibold text-danger">Inventory action failed</p>
            <p className="mt-1 text-sm text-muted">{moduleError}</p>
          </Card>
        ) : null}

        {activeSection === "dashboard" ? (
          <>
            <StatStrip items={buildInventoryStatStrip(dataset)} />

            <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_360px]">
              <div className="space-y-6">
                <WorkflowCard
                  eyebrow="Recent stock movement"
                  title="What moved through stores today?"
                  description="Keep issue, receipt, transfer, and damage activity visible without opening separate logs."
                  items={dataset.movements.slice(0, 5).map((movement) => ({
                    id: movement.id,
                    title: movement.item,
                    detail: `${movement.date} · ${movement.user} · ${movement.notes}`,
                    value: `${formatMovementType(movement.type)} ${movement.quantity}`,
                    tone:
                      movement.type === "damage"
                        ? "critical"
                        : movement.type === "transfer"
                          ? "warning"
                          : "ok",
                  }))}
                />

                <WorkflowCard
                  eyebrow="Purchase activity"
                  title="Procurement lane"
                  description="The most recent supplier orders and their receiving posture."
                  items={dataset.purchaseOrders.slice(0, 4).map((purchaseOrder) => ({
                    id: purchaseOrder.id,
                    title: `${purchaseOrder.poNumber} · ${purchaseOrder.supplier}`,
                    detail: `${purchaseOrder.lineSummary} · ${formatCurrency(purchaseOrder.totalAmount, false)}`,
                    value: formatPurchaseOrderStatus(purchaseOrder.status),
                    tone: getPurchaseOrderTone(purchaseOrder.status),
                  }))}
                />
              </div>

              <div className="space-y-6">
                <WorkflowCard
                  eyebrow="Low stock alerts"
                  title="Reorder pressure"
                  description="Lines that need replenishment before classroom, lab, or boarding disruption."
                  items={lowStockItems.map((item) => ({
                    id: item.id,
                    title: item.name,
                    detail: `${item.quantity} ${item.unit} left · reorder at ${item.reorderLevel}`,
                    value: formatInventoryStatus(getInventoryItemStatus(item)),
                    tone: getInventoryStatusTone(getInventoryItemStatus(item)),
                  }))}
                />

                <WorkflowCard
                  eyebrow="Pending approvals"
                  title="What still needs sign-off?"
                  description="Requests and supplier orders that are not yet fully cleared."
                  items={pendingApprovals}
                />
              </div>
            </section>

            <OpsTable
              title="Inventory category breakdown"
              subtitle="Category ownership, storage zone, and valuation kept in the same operational report."
              rows={categoryRows}
              columns={categoryColumns}
              getRowId={(row) => row.id}
              totalRows={categoryRows.length}
              page={1}
              pageSize={categoryRows.length || 1}
              onPageChange={() => undefined}
              searchPlaceholder="Search categories"
              loading={isDatasetLoading}
              loadingLabel="Loading live inventory categories..."
              emptyTitle="No categories configured"
              emptyDescription="Add categories before stock can be grouped and valued."
            />
          </>
        ) : null}

        {activeSection === "items" ? (
          <OpsTable
            title="Inventory items"
            subtitle="Searchable stock register with valuation, reorder controls, and line-level actions for storekeepers and finance reviewers."
            rows={pagedItems}
            columns={inventoryItemColumns}
            getRowId={(row) => row.id}
            searchValue={itemSearch}
            onSearchValueChange={(value) => {
              setItemSearch(value);
              setItemPage(1);
            }}
            searchPlaceholder="Search by item, SKU, location, or supplier"
            filters={[
              {
                id: "category",
                label: "Filter by category",
                value: itemCategoryFilter,
                onChange: (value) => {
                  setItemCategoryFilter(value);
                  setItemPage(1);
                },
                options: [
                  { value: "all", label: "All categories" },
                  ...dataset.categories.map((category) => ({
                    value: category.name,
                    label: category.name,
                  })),
                ],
              },
              {
                id: "status",
                label: "Filter by stock status",
                value: itemStatusFilter,
                onChange: (value) => {
                  setItemStatusFilter(value);
                  setItemPage(1);
                },
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "in_stock", label: "In stock" },
                  { value: "low_stock", label: "Low stock" },
                  { value: "out_of_stock", label: "Out of stock" },
                ],
              },
            ]}
            sortValue={itemSort}
            onSortValueChange={(value) => {
              setItemSort(value);
              setItemPage(1);
            }}
            sortOptions={[
              { value: "name-asc", label: "Sort: Name A-Z" },
              { value: "quantity-desc", label: "Sort: Highest quantity" },
              { value: "value-desc", label: "Sort: Highest value" },
              { value: "reorder-asc", label: "Sort: Tightest reorder level" },
            ]}
            totalRows={filteredItems.length}
            page={itemPage}
            pageSize={itemsPageSize}
            onPageChange={setItemPage}
            loading={isDatasetLoading}
            loadingLabel="Loading live inventory items..."
            exportConfig={{
              filename: "inventory-items.csv",
              headers: [
                "Item Name",
                "SKU",
                "Category",
                "Quantity",
                "Unit Price",
                "Total Value",
                "Reorder Level",
                "Status",
              ],
              rows: filteredItems.map((item) => {
                const status = getInventoryItemStatus(item);
                return [
                  item.name,
                  item.sku,
                  item.category,
                  `${item.quantity}`,
                  formatCurrency(item.unitPrice, false),
                  formatCurrency(item.unitPrice * item.quantity, false),
                  `${item.reorderLevel}`,
                  formatInventoryStatus(status),
                ];
              }),
            }}
            actions={
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setAdjustmentModalOpen(true)}>
                  <Boxes className="h-4 w-4" />
                  Adjust stock
                </Button>
                <Button onClick={openAddItemModal}>
                  <PackagePlus className="h-4 w-4" />
                  Add item
                </Button>
              </div>
            }
          />
        ) : null}

        {activeSection === "categories" ? (
          <OpsTable
            title="Category control"
            subtitle="Category ownership, zone planning, and stock-value concentration by school function."
            rows={filteredCategoryRows}
            columns={categoryColumns}
            getRowId={(row) => row.id}
            searchValue={categorySearch}
            onSearchValueChange={setCategorySearch}
            searchPlaceholder="Search category, code, owner, or storage zone"
            totalRows={filteredCategoryRows.length}
            page={1}
            pageSize={filteredCategoryRows.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live category controls..."
            exportConfig={{
              filename: "inventory-categories.csv",
              headers: ["Code", "Category", "Owner", "Items", "Storage", "Value"],
              rows: filteredCategoryRows.map((category) => [
                category.code,
                category.name,
                category.manager,
                `${category.itemCount}`,
                category.storageZones,
                category.totalValue,
              ]),
            }}
            actions={
              <Button onClick={openAddCategoryModal}>
                <Boxes className="h-4 w-4" />
                Add category
              </Button>
            }
          />
        ) : null}

        {activeSection === "stock-movement" ? (
          <OpsTable
            title="Stock movement trail"
            subtitle="Operational audit trail for stock in, stock out, transfers, and damages."
            rows={filteredMovements}
            columns={movementColumns}
            getRowId={(row) => row.id}
            searchValue={activitySearch}
            onSearchValueChange={setActivitySearch}
            searchPlaceholder="Search by item, user, note, or movement type"
            totalRows={filteredMovements.length}
            page={1}
            pageSize={filteredMovements.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live stock movements..."
            exportConfig={{
              filename: "inventory-movements.csv",
              headers: ["Item", "Type", "Quantity", "Date", "User", "Notes"],
              rows: filteredMovements.map((movement) => [
                movement.item,
                formatMovementType(movement.type),
                `${movement.quantity}`,
                movement.date,
                movement.user,
                movement.notes,
              ]),
            }}
          />
        ) : null}

        {activeSection === "suppliers" ? (
          <OpsTable
            title="Suppliers"
            subtitle="Vendor contacts, last delivery patterns, and hold status for procurement control."
            rows={filteredSuppliers}
            columns={supplierColumns}
            getRowId={(row) => row.id}
            searchValue={supplierSearch}
            onSearchValueChange={setSupplierSearch}
            searchPlaceholder="Search supplier, contact, email, or phone"
            totalRows={filteredSuppliers.length}
            page={1}
            pageSize={filteredSuppliers.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live suppliers..."
            actions={
              <Button onClick={openAddSupplierModal}>
                <ShoppingCart className="h-4 w-4" />
                Add supplier
              </Button>
            }
          />
        ) : null}

        {activeSection === "purchase-orders" ? (
          <div className="space-y-6">
            <OpsTable
              title="Purchase orders"
              subtitle="Create, approve, and receive supplier orders with clear status ownership."
              rows={filteredPurchaseOrders}
              columns={purchaseOrderColumns}
              getRowId={(row) => row.id}
              filters={[
                {
                  id: "po-status",
                  label: "Filter PO status",
                  value: purchaseOrderStatusFilter,
                  onChange: setPurchaseOrderStatusFilter,
                  options: [
                    { value: "all", label: "All statuses" },
                    { value: "draft", label: "Draft" },
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "received", label: "Received" },
                    { value: "cancelled", label: "Cancelled" },
                  ],
                },
              ]}
              totalRows={filteredPurchaseOrders.length}
              page={1}
              pageSize={filteredPurchaseOrders.length || 1}
              onPageChange={() => undefined}
              loading={isDatasetLoading}
              loadingLabel="Loading live purchase orders..."
              actions={
                <Button onClick={() => setPurchaseOrderModalOpen(true)}>
                  <ShoppingCart className="h-4 w-4" />
                  Create PO
                </Button>
              }
            />

            <section className="grid gap-6 xl:grid-cols-2">
              <WorkflowCard
                eyebrow="Approval posture"
                title="PO workflow health"
                description="Pending approvals and receipts surfaced without opening another screen."
                items={[
                  {
                    id: "po-metric-1",
                    title: "Awaiting approval",
                    detail: "Draft or pending orders still require purchasing sign-off.",
                    value: `${dataset.purchaseOrders.filter((purchaseOrder) => purchaseOrder.status === "draft" || purchaseOrder.status === "pending").length} open`,
                    tone: "warning",
                  },
                  {
                    id: "po-metric-2",
                    title: "Awaiting receipt",
                    detail: "Approved orders delivered by suppliers but not yet booked into stores.",
                    value: `${dataset.purchaseOrders.filter((purchaseOrder) => purchaseOrder.status === "approved").length} open`,
                    tone: "warning",
                  },
                ]}
              />

              <WorkflowCard
                eyebrow="Receiving rule"
                title="What happens on receipt?"
                description="Receiving stock should update movement history immediately and protect quantity truth."
                items={[
                  {
                    id: "po-rule-1",
                    title: "Match delivery note",
                    detail: "Confirm quantities against supplier paperwork before receiving into stock.",
                  },
                  {
                    id: "po-rule-2",
                    title: "Update movement log",
                    detail: "Every receipt writes a stock-in entry for future audit and reconciliation.",
                  },
                ]}
              />
            </section>
          </div>
        ) : null}

        {activeSection === "requests" ? (
          <div className="space-y-6">
            <OpsTable
              title="Department requests"
              subtitle="Books, food, stationery, and lab-item demand routed through request, approval, and fulfillment."
              rows={filteredRequests}
              columns={requestColumns}
              getRowId={(row) => row.id}
              filters={[
                {
                  id: "request-status",
                  label: "Filter request status",
                  value: requestStatusFilter,
                  onChange: setRequestStatusFilter,
                  options: [
                    { value: "all", label: "All statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "fulfilled", label: "Fulfilled" },
                    { value: "rejected", label: "Rejected" },
                  ],
                },
              ]}
              totalRows={filteredRequests.length}
              page={1}
              pageSize={filteredRequests.length || 1}
              onPageChange={() => undefined}
              loading={isDatasetLoading}
              loadingLabel="Loading live requests..."
              actions={
                <Button onClick={() => setRequestModalOpen(true)}>
                  <ClipboardList className="h-4 w-4" />
                  New request
                </Button>
              }
            />
          </div>
        ) : null}

        {activeSection === "transfers" ? (
          <OpsTable
            title="Internal transfers"
            subtitle="Track stock movement between stores, labs, dorms, and operational zones."
            rows={filteredTransfers}
            columns={transferColumns}
            getRowId={(row) => row.id}
            filters={[
              {
                id: "transfer-status",
                label: "Filter transfer status",
                value: transferStatusFilter,
                onChange: setTransferStatusFilter,
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "requested", label: "Requested" },
                  { value: "in_transit", label: "In transit" },
                  { value: "completed", label: "Completed" },
                ],
              },
            ]}
            totalRows={filteredTransfers.length}
            page={1}
            pageSize={filteredTransfers.length || 1}
            onPageChange={() => undefined}
            loading={isDatasetLoading}
            loadingLabel="Loading live transfers..."
            actions={
              <Button onClick={() => setTransferModalOpen(true)}>
                <ArrowLeftRight className="h-4 w-4" />
                New transfer
              </Button>
            }
          />
        ) : null}

        {activeSection === "damages-losses" ? (
          <div className="space-y-6">
            <OpsTable
              title="Damages and losses"
              subtitle="Broken, lost, and expired items with department ownership and financial impact."
              rows={filteredIncidents}
              columns={incidentColumns}
              getRowId={(row) => row.id}
              filters={[
                {
                  id: "incident-type",
                  label: "Filter incident type",
                  value: incidentTypeFilter,
                  onChange: setIncidentTypeFilter,
                  options: [
                    { value: "all", label: "All types" },
                    { value: "broken", label: "Broken" },
                    { value: "lost", label: "Lost" },
                    { value: "expired", label: "Expired" },
                  ],
                },
              ]}
              totalRows={filteredIncidents.length}
              page={1}
              pageSize={filteredIncidents.length || 1}
              onPageChange={() => undefined}
              loading={isDatasetLoading}
              loadingLabel="Loading live incidents..."
              actions={
                <Button onClick={() => setIncidentModalOpen(true)}>
                  <AlertTriangle className="h-4 w-4" />
                  Log incident
                </Button>
              }
            />

            <section className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Cost impact
                </p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  Loss exposure this cycle
                </h3>
                <p className="mt-3 text-3xl font-bold text-danger">
                  {formatCurrency(
                    dataset.incidents.reduce((sum, incident) => sum + incident.costImpact, 0),
                    false,
                  )}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Recorded losses, breakages, and expiry exposure across store-managed stock.
                </p>
              </Card>

              <WorkflowCard
                eyebrow="Risk control"
                title="Incident handling notes"
                description="This record protects both stock truth and departmental accountability."
                items={[
                  {
                    id: "incident-rule-1",
                    title: "Capture reason and owner",
                    detail: "Every incident should point to the responsible department or issue workflow.",
                  },
                  {
                    id: "incident-rule-2",
                    title: "Book the cost impact",
                    detail: "Keep bursars and administrators aware of avoidable stock leakage.",
                  },
                ]}
              />
            </section>
          </div>
        ) : null}

        {activeSection === "reports" ? (
          <div className="space-y-6">
            <section className="grid gap-6 xl:grid-cols-2">
              {reports.map((report) => (
                <Card key={report.id} className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Report
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{report.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        downloadCsvFile({
                          filename: report.filename,
                          headers: report.headers,
                          rows: report.rows,
                        })
                      }
                    >
                      Export {report.filename.replace(".csv", "")}
                    </Button>
                  </div>
                  <div className="mt-5 rounded-xl border border-border bg-surface-muted px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      Preview
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {report.rows[0]?.join(" · ") ?? "No records in this report yet."}
                    </p>
                  </div>
                </Card>
              ))}
            </section>

            <OpsTable
              title="Low stock report preview"
              subtitle="A live view of the records most likely to trigger procurement or urgent stock adjustments."
              rows={lowStockItems}
              columns={inventoryItemColumns.filter((column) => column.id !== "actions")}
              getRowId={(row) => row.id}
              totalRows={lowStockItems.length}
              page={1}
              pageSize={lowStockItems.length || 1}
              onPageChange={() => undefined}
              emptyTitle="No low-stock lines"
              emptyDescription="Current stock levels are above the defined reorder thresholds."
            />
          </div>
        ) : null}
      </ModuleShell>

      <Modal
        open={categoryModalOpen}
        title={categoryModalMode === "add" ? "Add inventory category" : "Edit inventory category"}
        description="Keep store ownership, valuation grouping, and stock zoning aligned across the school."
        onClose={() => setCategoryModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCategoryForm} disabled={isSavingCategory}>
              {isSavingCategory
                ? "Saving..."
                : categoryModalMode === "add"
                  ? "Add category"
                  : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Category code" error={categoryFormErrors.code}>
            <input
              className={fieldClassName}
              value={categoryForm.code}
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  code: event.target.value.toUpperCase(),
                }))
              }
              placeholder="STAT"
            />
          </FieldWrapper>
          <FieldWrapper label="Category name" error={categoryFormErrors.name}>
            <input
              className={fieldClassName}
              value={categoryForm.name}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Stationery"
            />
          </FieldWrapper>
          <FieldWrapper label="Category owner" error={categoryFormErrors.manager}>
            <input
              className={fieldClassName}
              value={categoryForm.manager}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, manager: event.target.value }))
              }
              placeholder="Academic Office"
            />
          </FieldWrapper>
          <FieldWrapper label="Storage zones" error={categoryFormErrors.storageZones}>
            <input
              className={fieldClassName}
              value={categoryForm.storageZones}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, storageZones: event.target.value }))
              }
              placeholder="Admin Store, Block A"
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <FieldWrapper label="Operational notes">
              <textarea
                className={textAreaClassName}
                value={categoryForm.notes}
                onChange={(event) =>
                  setCategoryForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Daily issue to class teachers and exams office."
              />
            </FieldWrapper>
          </div>
        </div>
      </Modal>

      <Modal
        open={supplierModalOpen}
        title={supplierModalMode === "add" ? "Add supplier" : "Edit supplier"}
        description="Maintain approved vendor contacts, county coverage, and procurement status in one controlled register."
        onClose={() => setSupplierModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSupplierModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitSupplierForm} disabled={isSavingSupplier}>
              {isSavingSupplier
                ? "Saving..."
                : supplierModalMode === "add"
                  ? "Add supplier"
                  : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Supplier name" error={supplierFormErrors.name}>
            <input
              className={fieldClassName}
              value={supplierForm.name}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Crown Office Supplies"
            />
          </FieldWrapper>
          <FieldWrapper label="Contact person" error={supplierFormErrors.contact}>
            <input
              className={fieldClassName}
              value={supplierForm.contact}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, contact: event.target.value }))
              }
              placeholder="Lucy Njeri"
            />
          </FieldWrapper>
          <FieldWrapper label="Email" error={supplierFormErrors.email}>
            <input
              className={fieldClassName}
              value={supplierForm.email}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="orders@crownoffice.co.ke"
            />
          </FieldWrapper>
          <FieldWrapper label="Phone" error={supplierFormErrors.phone}>
            <input
              className={fieldClassName}
              value={supplierForm.phone}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="+254 722 441 885"
            />
          </FieldWrapper>
          <FieldWrapper label="County" error={supplierFormErrors.county}>
            <input
              className={fieldClassName}
              value={supplierForm.county}
              onChange={(event) =>
                setSupplierForm((current) => ({ ...current, county: event.target.value }))
              }
              placeholder="Nairobi"
            />
          </FieldWrapper>
          <FieldWrapper label="Status">
            <select
              className={fieldClassName}
              value={supplierForm.status}
              onChange={(event) =>
                setSupplierForm((current) => ({
                  ...current,
                  status: event.target.value as SupplierFormState["status"],
                }))
              }
            >
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
            </select>
          </FieldWrapper>
        </div>
      </Modal>

      <Modal
        open={itemModalOpen}
        title={itemModalMode === "add" ? "Add inventory item" : "Edit inventory item"}
        description="Capture school store details clearly so valuation, reorder alerts, and supplier references remain reliable."
        onClose={() => setItemModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setItemModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitItemForm} disabled={isSavingItem}>
              {isSavingItem ? "Saving..." : itemModalMode === "add" ? "Add item" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Item name" error={itemFormErrors.name}>
            <input
              className={fieldClassName}
              value={itemForm.name}
              onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="A4 Printing Paper"
            />
          </FieldWrapper>
          <FieldWrapper label="SKU" error={itemFormErrors.sku}>
            <input
              className={fieldClassName}
              value={itemForm.sku}
              onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))}
              placeholder="STAT-A4-001"
            />
          </FieldWrapper>
          <FieldWrapper label="Category" error={itemFormErrors.category}>
            <select
              className={fieldClassName}
              value={itemForm.category}
              onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="">Select category</option>
              {dataset.categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label="Unit" error={itemFormErrors.unit}>
            <input
              className={fieldClassName}
              value={itemForm.unit}
              onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))}
              placeholder="pack, box, unit"
            />
          </FieldWrapper>
          <FieldWrapper label="Quantity" error={itemFormErrors.quantity}>
            <input
              className={fieldClassName}
              value={itemForm.quantity}
              onChange={(event) => setItemForm((current) => ({ ...current, quantity: event.target.value }))}
              placeholder="0"
            />
          </FieldWrapper>
          <FieldWrapper label="Supplier" error={itemFormErrors.supplier}>
            <select
              className={fieldClassName}
              value={itemForm.supplier}
              onChange={(event) => setItemForm((current) => ({ ...current, supplier: event.target.value }))}
            >
              <option value="">Select supplier</option>
              {dataset.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.name}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label="Unit price" error={itemFormErrors.unitPrice}>
            <input
              className={fieldClassName}
              value={itemForm.unitPrice}
              onChange={(event) => setItemForm((current) => ({ ...current, unitPrice: event.target.value }))}
              placeholder="650"
            />
          </FieldWrapper>
          <FieldWrapper label="Reorder level" error={itemFormErrors.reorderLevel}>
            <input
              className={fieldClassName}
              value={itemForm.reorderLevel}
              onChange={(event) => setItemForm((current) => ({ ...current, reorderLevel: event.target.value }))}
              placeholder="25"
            />
          </FieldWrapper>
          <FieldWrapper label="Storage location" error={itemFormErrors.location}>
            <input
              className={fieldClassName}
              value={itemForm.location}
              onChange={(event) => setItemForm((current) => ({ ...current, location: event.target.value }))}
              placeholder="Admin Store Shelf A2"
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <FieldWrapper label="Notes">
              <textarea
                className={textAreaClassName}
                value={itemForm.notes}
                onChange={(event) => setItemForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Use and handling notes"
              />
            </FieldWrapper>
          </div>
        </div>
      </Modal>

      <Modal
        open={adjustmentModalOpen}
        title="Adjust stock"
        description="Record stock issues, receipts, or quantity corrections against one item."
        onClose={() => setAdjustmentModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustmentModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdjustment} disabled={isSavingAdjustment}>
              {isSavingAdjustment ? "Posting..." : "Post adjustment"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Movement type" error={adjustmentErrors.movementType}>
            <select
              className={fieldClassName}
              value={adjustmentForm.movementType}
              onChange={(event) =>
                setAdjustmentForm((current) => ({
                  ...current,
                  movementType: event.target.value as StockAdjustmentFormState["movementType"],
                }))
              }
            >
              <option value="stock_out">Stock out</option>
              <option value="stock_in">Stock in</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </FieldWrapper>
          <FieldWrapper label="Quantity" error={adjustmentErrors.quantity}>
            <input
              className={fieldClassName}
              value={adjustmentForm.quantity}
              onChange={(event) =>
                setAdjustmentForm((current) => ({ ...current, quantity: event.target.value }))
              }
              placeholder="12"
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <FieldWrapper label="Notes" error={adjustmentErrors.notes}>
              <textarea
                className={textAreaClassName}
                value={adjustmentForm.notes}
                onChange={(event) =>
                  setAdjustmentForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Issued to Grade 7 stationery store"
              />
            </FieldWrapper>
          </div>
        </div>
      </Modal>

      <Modal
        open={purchaseOrderModalOpen}
        title="Create purchase order"
        description="Prepare a supplier order and move it into the approval workflow."
        onClose={() => setPurchaseOrderModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurchaseOrderModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitPurchaseOrder} disabled={isSavingPurchaseOrder}>
              {isSavingPurchaseOrder ? "Saving..." : "Create PO"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Supplier" error={purchaseOrderErrors.supplier}>
            <select
              className={fieldClassName}
              value={purchaseOrderForm.supplier}
              onChange={(event) =>
                setPurchaseOrderForm((current) => ({ ...current, supplier: event.target.value }))
              }
            >
              <option value="">Select supplier</option>
              {dataset.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.name}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label="Requested by" error={purchaseOrderErrors.requestedBy}>
            <input
              className={fieldClassName}
              value={purchaseOrderForm.requestedBy}
              onChange={(event) =>
                setPurchaseOrderForm((current) => ({ ...current, requestedBy: event.target.value }))
              }
              placeholder="Mary Wanjiku"
            />
          </FieldWrapper>
          <FieldWrapper label="Expected delivery" error={purchaseOrderErrors.expectedDelivery}>
            <input
              type="date"
              className={fieldClassName}
              value={purchaseOrderForm.expectedDelivery}
              onChange={(event) =>
                setPurchaseOrderForm((current) => ({
                  ...current,
                  expectedDelivery: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <InventoryLineItemsEditor
              label="Order lines"
              description="Build the supplier order from real inventory items so approvals, receipts, and valuation stay aligned."
              lines={purchaseOrderForm.lineItems}
              items={dataset.items}
              onChange={(lineItems) =>
                setPurchaseOrderForm((current) => ({ ...current, lineItems }))
              }
              error={purchaseOrderErrors.lineItems}
              allowUnitPriceEdit
              addButtonLabel="Add PO line"
            />
          </div>
          <div className="md:col-span-2">
            <FieldWrapper label="Procurement notes">
              <textarea
                className={textAreaClassName}
                value={purchaseOrderForm.notes}
                onChange={(event) =>
                  setPurchaseOrderForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Urgent before assessment week, confirm delivery at main gate receiving desk."
              />
            </FieldWrapper>
          </div>
          <div className="md:col-span-2 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Purchase order estimate</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {purchaseOrderDraftTotal > 0
                ? formatCurrency(purchaseOrderDraftTotal, false)
                : "Add order lines to calculate value"}
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={requestModalOpen}
        title="Create department request"
        description="Log a request before approval and fulfillment so stock movement stays auditable."
        onClose={() => setRequestModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRequestModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRequest} disabled={isSavingRequest}>
              {isSavingRequest ? "Saving..." : "Submit request"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Department" error={requestErrors.department}>
            <input
              className={fieldClassName}
              value={requestForm.department}
              onChange={(event) =>
                setRequestForm((current) => ({ ...current, department: event.target.value }))
              }
              placeholder="Science Lab"
            />
          </FieldWrapper>
          <FieldWrapper label="Requested by" error={requestErrors.requestedBy}>
            <input
              className={fieldClassName}
              value={requestForm.requestedBy}
              onChange={(event) =>
                setRequestForm((current) => ({ ...current, requestedBy: event.target.value }))
              }
              placeholder="Moses Otieno"
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <InventoryLineItemsEditor
              label="Requested lines"
              description="Choose the exact stock lines needed by the department before approval or fulfillment."
              lines={requestForm.lineItems}
              items={dataset.items}
              onChange={(lineItems) => setRequestForm((current) => ({ ...current, lineItems }))}
              error={requestErrors.lineItems}
              addButtonLabel="Add request line"
            />
          </div>
          <div className="md:col-span-2">
            <FieldWrapper label="Purpose" error={requestErrors.purpose}>
              <textarea
                className={textAreaClassName}
                value={requestForm.purpose}
                onChange={(event) =>
                  setRequestForm((current) => ({ ...current, purpose: event.target.value }))
                }
                placeholder="Grade 8 practical set-up for acids and indicators."
              />
            </FieldWrapper>
          </div>
          <div className="md:col-span-2 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Requested units</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {requestDraftUnits > 0 ? `${requestDraftUnits} units requested` : "Add request lines to total units"}
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={transferModalOpen}
        title="Create stock transfer"
        description="Track stock movement between stores, labs, dormitories, and operational locations."
        onClose={() => setTransferModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTransfer} disabled={isSavingTransfer}>
              {isSavingTransfer ? "Saving..." : "Create transfer"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="From location" error={transferErrors.fromLocation}>
            <input
              className={fieldClassName}
              value={transferForm.fromLocation}
              onChange={(event) =>
                setTransferForm((current) => ({ ...current, fromLocation: event.target.value }))
              }
              placeholder="Main Store"
            />
          </FieldWrapper>
          <FieldWrapper label="To location" error={transferErrors.toLocation}>
            <input
              className={fieldClassName}
              value={transferForm.toLocation}
              onChange={(event) =>
                setTransferForm((current) => ({ ...current, toLocation: event.target.value }))
              }
              placeholder="Girls Dorm Intake Wing"
            />
          </FieldWrapper>
          <div className="md:col-span-2">
            <FieldWrapper label="Requested by" error={transferErrors.requestedBy}>
              <input
                className={fieldClassName}
                value={transferForm.requestedBy}
                onChange={(event) =>
                  setTransferForm((current) => ({ ...current, requestedBy: event.target.value }))
                }
                placeholder="Susan Cherotich"
              />
            </FieldWrapper>
          </div>
          <div className="md:col-span-2">
            <InventoryLineItemsEditor
              label="Transfer lines"
              description="Select the exact items and quantities moving between operational locations."
              lines={transferForm.lineItems}
              items={dataset.items}
              onChange={(lineItems) => setTransferForm((current) => ({ ...current, lineItems }))}
              error={transferErrors.lineItems}
              addButtonLabel="Add transfer line"
            />
          </div>
          <div className="md:col-span-2 rounded-xl border border-border bg-surface-muted px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Transfer quantity</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {transferDraftUnits > 0 ? `${transferDraftUnits} units in transfer` : "Add transfer lines to total units"}
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={incidentModalOpen}
        title="Log damage or loss"
        description="Capture the reason, quantity, cost, and responsible department for follow-up and finance visibility."
        onClose={() => setIncidentModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIncidentModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitIncident} disabled={isSavingIncident}>
              {isSavingIncident ? "Saving..." : "Log incident"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="Item" error={incidentErrors.itemId}>
            <select
              className={fieldClassName}
              value={incidentForm.itemId}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, itemId: event.target.value }))
              }
            >
              <option value="">Select inventory item</option>
              {dataset.items
                .filter((item) => !item.archived)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                  </option>
                ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label="Type">
            <select
              className={fieldClassName}
              value={incidentForm.type}
              onChange={(event) =>
                setIncidentForm((current) => ({
                  ...current,
                  type: event.target.value as IncidentFormState["type"],
                }))
              }
            >
              <option value="broken">Broken</option>
              <option value="lost">Lost</option>
              <option value="expired">Expired</option>
            </select>
          </FieldWrapper>
          <FieldWrapper label="Quantity" error={incidentErrors.quantity}>
            <input
              className={fieldClassName}
              value={incidentForm.quantity}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, quantity: event.target.value }))
              }
              placeholder="6"
            />
          </FieldWrapper>
          <FieldWrapper label="Department" error={incidentErrors.department}>
            <input
              className={fieldClassName}
              value={incidentForm.department}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, department: event.target.value }))
              }
              placeholder="Science Lab"
            />
          </FieldWrapper>
          <FieldWrapper label="Cost impact" error={incidentErrors.costImpact}>
            <input
              className={fieldClassName}
              value={incidentForm.costImpact}
              onChange={(event) =>
                setIncidentForm((current) => ({ ...current, costImpact: event.target.value }))
              }
                placeholder="3600"
              />
            </FieldWrapper>
          {selectedIncidentItem ? (
            <div className="md:col-span-2 rounded-xl border border-border bg-surface-muted px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current stock context</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {`${selectedIncidentItem.name} · ${selectedIncidentItem.quantity} ${selectedIncidentItem.unit} on hand · ${formatCurrency(selectedIncidentItem.unitPrice, false)} per unit`}
              </p>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <FieldWrapper label="Reason" error={incidentErrors.reason}>
              <textarea
                className={textAreaClassName}
                value={incidentForm.reason}
                onChange={(event) =>
                  setIncidentForm((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Dropped during practical clean-up after chemistry session."
              />
            </FieldWrapper>
          </div>
        </div>
      </Modal>
    </>
  );
}
