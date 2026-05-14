import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  createCsvReportArtifact,
  type ReportCsvValue,
} from '../../common/reports/report-csv-artifact';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { AdjustStockDto, CreateInventoryItemDto, UpdateInventoryItemDto } from './dto/create-inventory-item.dto';
import {
  CreateInventoryCategoryDto,
  CreateInventoryLocationDto,
  CreateInventorySupplierDto,
  UpdateInventoryCategoryDto,
  UpdateInventoryLocationDto,
  UpdateInventorySupplierDto,
} from './dto/inventory-master-data.dto';
import {
  CreateIncidentDto,
  CreateInventoryRequestDto,
  CreatePurchaseOrderDto,
  PostStockCountDto,
  CreateStockIssueDto,
  CreateStockReceiptDto,
  CreateTransferDto,
  UpdateWorkflowStatusDto,
} from './dto/inventory-workflow.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import {
  InventoryItemRecord,
  InventoryPurchaseOrderRecord,
  InventoryRequestRecord,
  InventoryRepository,
} from './repositories/inventory.repository';

interface StockTransactionLine {
  item_id: string;
  item_name: string;
  quantity: number;
  before_quantity: number;
  after_quantity: number;
}

interface StockTransactionResponse {
  reference: string;
  idempotent: boolean;
  transaction_type: string;
  department?: string;
  counterparty?: string;
  supplier_name?: string;
  purchase_reference?: string;
  lines: StockTransactionLine[];
}

interface StockCountSnapshotLine extends Record<string, unknown> {
  item_id: string;
  item_name: string;
  location_code: string | null;
  expected_quantity: number;
  counted_quantity: number;
  variance_quantity: number;
}

interface RequestFulfillmentLine {
  item_id: string;
  item_name?: string | null;
  quantity: number;
  unit_price?: number | null;
}

type InventoryReportRow = Record<string, ReportCsvValue>;

type InventoryReportsPayload = {
  stock_valuation: InventoryReportRow[];
  low_stock_report: InventoryReportRow[];
  movement_history: InventoryReportRow[];
  supplier_purchases: InventoryReportRow[];
  stock_reconciliation: InventoryReportRow[];
};

type InventoryReportExportDefinition = {
  id: string;
  title: string;
  filename: string;
  headers: string[];
  rows: (reports: InventoryReportsPayload) => ReportCsvValue[][];
};

const INVENTORY_REPORT_EXPORTS = new Map<string, InventoryReportExportDefinition>([
  [
    'stock-valuation',
    {
      id: 'stock-valuation',
      title: 'Stock valuation',
      filename: 'inventory-stock-valuation.csv',
      headers: ['Item', 'SKU', 'Quantity', 'Unit Price', 'Total Value'],
      rows: (reports) =>
        reports.stock_valuation.map((row) => [
          row.item_name,
          row.sku,
          row.quantity_on_hand,
          row.unit_price,
          row.total_value,
        ]),
    },
  ],
  [
    'low-stock',
    {
      id: 'low-stock',
      title: 'Low stock report',
      filename: 'inventory-low-stock.csv',
      headers: ['Item', 'SKU', 'Quantity', 'Reorder Level'],
      rows: (reports) =>
        reports.low_stock_report.map((row) => [
          row.item_name,
          row.sku,
          row.quantity_on_hand,
          row.reorder_level,
        ]),
    },
  ],
  [
    'movement-history',
    {
      id: 'movement-history',
      title: 'Movement history',
      filename: 'inventory-movement-history.csv',
      headers: ['Movement Type', 'Count'],
      rows: (reports) =>
        reports.movement_history.map((row) => [row.movement_type, row.movement_count]),
    },
  ],
  [
    'supplier-purchases',
    {
      id: 'supplier-purchases',
      title: 'Supplier purchases',
      filename: 'inventory-supplier-purchases.csv',
      headers: ['Supplier', 'Purchase Orders', 'Total Spend'],
      rows: (reports) =>
        reports.supplier_purchases.map((row) => [
          row.supplier_name,
          row.purchase_orders,
          row.total_spend,
        ]),
    },
  ],
  [
    'stock-reconciliation',
    {
      id: 'stock-reconciliation',
      title: 'Stock reconciliation',
      filename: 'inventory-stock-reconciliation.csv',
      headers: ['Item', 'SKU', 'Item Quantity', 'Location Quantity', 'Variance', 'Status'],
      rows: (reports) =>
        reports.stock_reconciliation.map((row) => [
          row.item_name,
          row.sku,
          row.item_quantity_on_hand,
          row.location_quantity_on_hand,
          row.variance_quantity,
          row.status,
        ]),
    },
  ],
]);

@Injectable()
export class InventoryService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  async getSummary() {
    return this.inventoryRepository.buildSummary(this.requireTenantId());
  }

  async listItems(query: ListInventoryQueryDto) {
    return this.inventoryRepository.listItems(this.requireTenantId(), {
      search: query.search?.trim() || undefined,
      status: query.status?.trim() || undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async createItem(dto: CreateInventoryItemDto) {
    return this.databaseService.withRequestTransaction(async () => {
      try {
        const tenantId = this.requireTenantId();
        const storageLocation = this.nullableText(dto.storage_location);
        await this.assertOptionalStorageLocation(tenantId, storageLocation);

        const item = await this.inventoryRepository.createItem({
          tenant_id: tenantId,
          item_name: this.requireText(dto.item_name, 'Item name is required'),
          sku: this.requireText(dto.sku, 'SKU is required'),
          category_id: this.nullableText(dto.category_id),
          unit: this.requireText(dto.unit, 'Unit is required'),
          quantity_on_hand: dto.quantity,
          supplier_id: this.nullableText(dto.supplier_id),
          unit_price: dto.unit_price,
          reorder_level: dto.reorder_level,
          storage_location: storageLocation,
          notes: this.nullableText(dto.notes),
          status: 'active',
        });

        if (dto.quantity > 0) {
          await this.inventoryRepository.recordStockMovement({
            tenant_id: item.tenant_id,
            item_id: item.id,
            movement_type: 'stock_in',
            quantity: dto.quantity,
            unit_cost: item.unit_price,
            reference: 'OPENING-STOCK',
            actor_user_id: this.requestContext.getStore()?.user_id ?? null,
            notes: 'Opening stock captured during item creation',
          });

          await this.inventoryRepository.incrementItemLocationBalance(
            item.tenant_id,
            item.id,
            item.storage_location || 'Unassigned',
            dto.quantity,
          );
        }

        return item;
      } catch (error) {
        this.rethrowUniqueSku(error);
        throw error;
      }
    });
  }

  async updateItem(itemId: string, dto: UpdateInventoryItemDto) {
    return this.databaseService.withRequestTransaction(async () => {
      try {
        const tenantId = this.requireTenantId();
        const storageLocation = this.optionalNullableText(dto.storage_location);
        await this.assertOptionalStorageLocation(tenantId, storageLocation ?? null);

        const item = await this.inventoryRepository.updateItem(tenantId, itemId, {
          item_name: this.optionalRequiredText(dto.item_name, 'Item name is required'),
          sku: this.optionalRequiredText(dto.sku, 'SKU is required'),
          category_id: this.optionalNullableText(dto.category_id),
          unit: this.optionalRequiredText(dto.unit, 'Unit is required'),
          supplier_id: this.optionalNullableText(dto.supplier_id),
          unit_price: dto.unit_price,
          reorder_level: dto.reorder_level,
          storage_location: storageLocation,
          notes: this.optionalNullableText(dto.notes),
          status: typeof dto.status === 'string' ? dto.status.trim() : undefined,
          is_archived: typeof dto.is_archived === 'boolean' ? dto.is_archived : undefined,
        });

        if (!item) {
          throw new NotFoundException(`Inventory item "${itemId}" was not found`);
        }

        return item;
      } catch (error) {
        this.rethrowUniqueSku(error);
        throw error;
      }
    });
  }

  async adjustItemStock(itemId: string, dto: AdjustStockDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const item = await this.inventoryRepository.findItemById(tenantId, itemId);

      if (!item) {
        throw new NotFoundException(`Inventory item "${itemId}" was not found`);
      }

      const nextQuantity = this.calculateNextQuantity(item, dto);
      const updatedItem = await this.inventoryRepository.updateItemStock(tenantId, itemId, nextQuantity);

      if (!updatedItem) {
        throw new NotFoundException(`Inventory item "${itemId}" was not found`);
      }

      await this.inventoryRepository.recordStockMovement({
        tenant_id: tenantId,
        item_id: itemId,
        movement_type: dto.movement_type,
        quantity: dto.quantity,
        unit_cost: item.unit_price,
        reference: dto.reference?.trim() || null,
        actor_user_id: this.requestContext.getStore()?.user_id ?? null,
        notes: dto.notes?.trim() || null,
      });

      return updatedItem;
    });
  }

  async listCategories() {
    return this.inventoryRepository.listCategories(this.requireTenantId());
  }

  async createCategory(dto: CreateInventoryCategoryDto) {
    try {
      return await this.inventoryRepository.createCategory({
        tenant_id: this.requireTenantId(),
        code: this.requireText(dto.code, 'Category code is required').toUpperCase(),
        name: this.requireText(dto.name, 'Category name is required'),
        manager: this.nullableText(dto.manager),
        storage_zones: this.nullableText(dto.storage_zones),
        description: this.nullableText(dto.description),
      });
    } catch (error) {
      this.rethrowUniqueCategoryCode(error);
      throw error;
    }
  }

  async updateCategory(categoryId: string, dto: UpdateInventoryCategoryDto) {
    try {
      const updated = await this.inventoryRepository.updateCategory(this.requireTenantId(), categoryId, {
        code: this.optionalRequiredText(dto.code, 'Category code is required')?.toUpperCase(),
        name: this.optionalRequiredText(dto.name, 'Category name is required'),
        manager: this.optionalNullableText(dto.manager),
        storage_zones: this.optionalNullableText(dto.storage_zones),
        description: this.optionalNullableText(dto.description),
      });

      if (!updated) {
        throw new NotFoundException(`Inventory category "${categoryId}" was not found`);
      }

      return updated;
    } catch (error) {
      this.rethrowUniqueCategoryCode(error);
      throw error;
    }
  }

  async listLocations() {
    return this.inventoryRepository.listLocations(this.requireTenantId());
  }

  async createLocation(dto: CreateInventoryLocationDto) {
    try {
      return await this.inventoryRepository.createLocation({
        tenant_id: this.requireTenantId(),
        code: this.requireText(dto.code, 'Location code is required').toUpperCase(),
        name: this.requireText(dto.name, 'Location name is required'),
        status: dto.status?.trim() || 'active',
      });
    } catch (error) {
      this.rethrowUniqueLocationCode(error);
      throw error;
    }
  }

  async updateLocation(locationId: string, dto: UpdateInventoryLocationDto) {
    try {
      const updated = await this.inventoryRepository.updateLocation(this.requireTenantId(), locationId, {
        code: this.optionalRequiredText(dto.code, 'Location code is required')?.toUpperCase(),
        name: this.optionalRequiredText(dto.name, 'Location name is required'),
        status: dto.status?.trim(),
      });

      if (!updated) {
        throw new NotFoundException(`Inventory location "${locationId}" was not found`);
      }

      return updated;
    } catch (error) {
      this.rethrowUniqueLocationCode(error);
      throw error;
    }
  }

  async listStockMovements(query: ListInventoryQueryDto) {
    return this.inventoryRepository.listStockMovements(this.requireTenantId(), query.limit ?? 50);
  }

  async issueDepartmentStock(dto: CreateStockIssueDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const submissionId = dto.submission_id?.trim() || null;
      const existingResponse = await this.getIdempotentStockTransaction(tenantId, submissionId);

      if (existingResponse) {
        return existingResponse;
      }

      const department = dto.department.trim();
      const receivedBy = dto.received_by.trim();

      if (!department) {
        throw new BadRequestException('Department is required for stock issue');
      }

      if (!receivedBy) {
        throw new BadRequestException('Receiver is required for stock issue');
      }

      const reference = this.buildNumber('ISS');
      const responseLines: StockTransactionLine[] = [];

      for (const line of dto.lines) {
        this.assertPositiveQuantity(line.quantity);
        const item = await this.inventoryRepository.findItemById(tenantId, line.item_id);

        if (!item) {
          throw new NotFoundException(`Inventory item "${line.item_id}" was not found`);
        }

        const stockMutation = await this.inventoryRepository.decrementItemStock(
          tenantId,
          line.item_id,
          line.quantity,
        );

        if (!stockMutation) {
          throw new BadRequestException('Stock issue quantity exceeds quantity on hand');
        }

        const beforeQuantity = stockMutation.before_quantity;
        const afterQuantity = stockMutation.after_quantity;

        await this.inventoryRepository.recordStockMovement({
          tenant_id: tenantId,
          item_id: line.item_id,
          item_name: item.item_name,
          movement_type: 'stock_issue',
          quantity: line.quantity,
          unit_cost: item.unit_price,
          reference,
          before_quantity: beforeQuantity,
          after_quantity: afterQuantity,
          department,
          counterparty: receivedBy,
          submission_id: submissionId,
          actor_user_id: this.requestContext.getStore()?.user_id ?? null,
          notes: line.notes?.trim() || dto.notes?.trim() || `Issued to ${department}`,
        });

        responseLines.push(
          this.buildStockTransactionLine({
            item: stockMutation.item,
            quantity: line.quantity,
            beforeQuantity,
            afterQuantity,
          }),
        );
      }

      return {
        reference,
        idempotent: false,
        transaction_type: 'stock_issue',
        department,
        counterparty: receivedBy,
        lines: responseLines,
      };
    });
  }

  async receiveSupplierStock(dto: CreateStockReceiptDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const submissionId = dto.submission_id?.trim() || null;
      const existingResponse = await this.getIdempotentStockTransaction(tenantId, submissionId);

      if (existingResponse) {
        return existingResponse;
      }

      const supplierName = dto.supplier_name.trim();
      const purchaseReference = dto.purchase_reference.trim();
      const supplierId = dto.supplier_id?.trim() || null;

      if (!supplierName) {
        throw new BadRequestException('Supplier name is required for stock receipt');
      }

      if (!purchaseReference) {
        throw new BadRequestException('Purchase reference is required for stock receipt');
      }

      const receiptReference = this.buildNumber('RCV');
      const responseLines: StockTransactionLine[] = [];

      for (const line of dto.lines) {
        this.assertPositiveQuantity(line.quantity);

        if (!Number.isFinite(line.unit_cost) || line.unit_cost < 0) {
          throw new BadRequestException('Unit cost must be zero or greater');
        }

        const stockMutation = await this.inventoryRepository.incrementItemStockWithCost(
          tenantId,
          line.item_id,
          line.quantity,
          line.unit_cost,
          supplierId,
        );

        if (!stockMutation) {
          throw new NotFoundException(`Inventory item "${line.item_id}" was not found`);
        }

        const beforeQuantity = stockMutation.before_quantity;
        const afterQuantity = stockMutation.after_quantity;

        await this.inventoryRepository.recordStockMovement({
          tenant_id: tenantId,
          item_id: line.item_id,
          item_name: stockMutation.item.item_name,
          movement_type: 'stock_receipt',
          quantity: line.quantity,
          unit_cost: line.unit_cost,
          reference: purchaseReference,
          before_quantity: beforeQuantity,
          after_quantity: afterQuantity,
          counterparty: supplierName,
          batch_number: line.batch_number?.trim() || null,
          expiry_date: line.expiry_date?.trim() || null,
          submission_id: submissionId,
          actor_user_id: this.requestContext.getStore()?.user_id ?? null,
          notes: dto.notes?.trim() || `Received against ${purchaseReference}`,
        });

        await this.inventoryRepository.incrementItemLocationBalance(
          tenantId,
          line.item_id,
          stockMutation.item.storage_location || 'Unassigned',
          line.quantity,
        );

        await this.resolveBackordersForReceivedItem(tenantId, line.item_id);

        responseLines.push(
          this.buildStockTransactionLine({
            item: stockMutation.item,
            quantity: line.quantity,
            beforeQuantity,
            afterQuantity,
          }),
        );
      }

      return {
        reference: receiptReference,
        idempotent: false,
        transaction_type: 'stock_receipt',
        supplier_name: supplierName,
        purchase_reference: purchaseReference,
        lines: responseLines,
      };
    });
  }

  async listSuppliers() {
    return this.inventoryRepository.listSuppliers(this.requireTenantId());
  }

  async createSupplier(dto: CreateInventorySupplierDto) {
    try {
      return await this.inventoryRepository.createSupplier({
        tenant_id: this.requireTenantId(),
        supplier_name: this.requireText(dto.supplier_name, 'Supplier name is required'),
        contact_person: this.nullableText(dto.contact_person),
        email: this.nullableText(dto.email),
        phone: this.nullableText(dto.phone),
        county: this.nullableText(dto.county),
        status: dto.status ?? 'active',
      });
    } catch (error) {
      this.rethrowUniqueSupplierName(error);
      throw error;
    }
  }

  async updateSupplier(supplierId: string, dto: UpdateInventorySupplierDto) {
    try {
      const updated = await this.inventoryRepository.updateSupplier(this.requireTenantId(), supplierId, {
        supplier_name: this.optionalRequiredText(dto.supplier_name, 'Supplier name is required'),
        contact_person: this.optionalNullableText(dto.contact_person),
        email: this.optionalNullableText(dto.email),
        phone: this.optionalNullableText(dto.phone),
        county: this.optionalNullableText(dto.county),
        status: dto.status,
      });

      if (!updated) {
        throw new NotFoundException(`Inventory supplier "${supplierId}" was not found`);
      }

      return updated;
    } catch (error) {
      this.rethrowUniqueSupplierName(error);
      throw error;
    }
  }

  async listPurchaseOrders() {
    return this.inventoryRepository.listPurchaseOrders(this.requireTenantId());
  }

  async createPurchaseOrder(dto: CreatePurchaseOrderDto) {
    return this.databaseService.withRequestTransaction(async () => {
      return this.inventoryRepository.createPurchaseOrder({
        tenant_id: this.requireTenantId(),
        po_number: this.buildNumber('PO'),
        supplier_id: dto.supplier_id,
        status: 'pending',
        expected_delivery_date: dto.expected_delivery_date ?? null,
        ordered_at: new Date().toISOString().slice(0, 10),
        total_amount: dto.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0),
        lines: dto.lines.map((line) => ({ ...line })),
        notes: dto.notes?.trim() || null,
        created_by_user_id: this.requestContext.getStore()?.user_id ?? null,
      });
    });
  }

  async updatePurchaseOrderStatus(
    purchaseOrderId: string,
    dto: UpdateWorkflowStatusDto,
  ) {
    if (dto.status === 'received') {
      return this.receivePurchaseOrder(purchaseOrderId, dto);
    }

    const updated = await this.inventoryRepository.updatePurchaseOrderStatus(
      this.requireTenantId(),
      purchaseOrderId,
      dto.status,
      dto.notes?.trim() || null,
    );

    if (!updated) {
      throw new NotFoundException(`Purchase order "${purchaseOrderId}" was not found`);
    }

    return updated;
  }

  async receivePurchaseOrder(
    purchaseOrderId: string,
    dto: { notes?: string },
  ) {
      return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const purchaseOrder = await this.inventoryRepository.findPurchaseOrderByIdForUpdate(tenantId, purchaseOrderId);

      if (!purchaseOrder) {
        throw new NotFoundException(`Purchase order "${purchaseOrderId}" was not found`);
      }

      if (purchaseOrder.status !== 'approved') {
        throw new BadRequestException('Only approved purchase orders can be received into stock');
      }

      for (const line of purchaseOrder.lines) {
        const itemId = line.item_id ? String(line.item_id) : null;
        const quantity = Number(line.quantity ?? 0);
        const itemName = line.item_name ? String(line.item_name) : null;
        const unitPrice = Number(line.unit_price ?? 0);

        if (!itemId || quantity <= 0) {
          continue;
        }

        const stockMutation = await this.inventoryRepository.incrementItemStock(
          tenantId,
          itemId,
          quantity,
        );

        if (!stockMutation) {
          throw new NotFoundException(`Inventory item "${itemId}" was not found for purchase order receipt`);
        }

        await this.inventoryRepository.recordStockMovement({
          tenant_id: tenantId,
          item_id: itemId,
          item_name: itemName ?? stockMutation.item.item_name,
          movement_type: 'stock_in',
          quantity,
          unit_cost: unitPrice,
          reference: purchaseOrder.po_number,
          before_quantity: stockMutation.before_quantity,
          after_quantity: stockMutation.after_quantity,
          actor_user_id: this.requestContext.getStore()?.user_id ?? null,
          notes: dto.notes?.trim() || 'Stock received against approved purchase order',
        });

        await this.inventoryRepository.incrementItemLocationBalance(
          tenantId,
          itemId,
          stockMutation.item.storage_location || 'Unassigned',
          quantity,
        );

        await this.resolveBackordersForReceivedItem(tenantId, itemId);
      }

      const updated = await this.inventoryRepository.updatePurchaseOrderStatus(
        tenantId,
        purchaseOrderId,
        'received',
        dto.notes?.trim() || null,
      );

      if (!updated) {
        throw new NotFoundException(`Purchase order "${purchaseOrderId}" was not found`);
      }

      return updated;
    });
  }

  async listRequests() {
    return this.inventoryRepository.listRequests(this.requireTenantId());
  }

  async createRequest(dto: CreateInventoryRequestDto) {
    return this.inventoryRepository.createRequest({
      tenant_id: this.requireTenantId(),
      request_number: this.buildNumber('REQ'),
      department: dto.department.trim(),
      requested_by: dto.requested_by.trim(),
      status: 'pending',
      needed_by: dto.needed_by ?? null,
      priority: dto.priority?.trim() || 'normal',
      lines: dto.lines.map((line) => ({ ...line })),
      notes: dto.notes?.trim() || null,
    });
  }

  async updateRequestStatus(requestId: string, dto: UpdateWorkflowStatusDto) {
    if (dto.status === 'approved') {
      return this.approveRequest(requestId, dto);
    }

    if (dto.status === 'fulfilled') {
      return this.fulfillRequest(requestId, dto);
    }

    if (dto.status === 'partially_fulfilled') {
      return this.partiallyFulfillRequest(requestId, dto);
    }

    const updated = await this.inventoryRepository.updateRequestStatus(
      this.requireTenantId(),
      requestId,
      dto.status,
      dto.notes?.trim() || null,
    );

    if (!updated) {
      throw new NotFoundException(`Inventory request "${requestId}" was not found`);
    }

    return updated;
  }

  private async approveRequest(requestId: string, dto: UpdateWorkflowStatusDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const request = await this.inventoryRepository.findRequestByIdForUpdate(tenantId, requestId);

      if (!request) {
        throw new NotFoundException(`Inventory request "${requestId}" was not found`);
      }

      if (request.status !== 'pending') {
        throw new BadRequestException('Only pending inventory requests can be approved');
      }

      let hasBackorder = false;

      for (const line of request.lines) {
        const itemId = typeof line.item_id === 'string' ? line.item_id : null;
        const quantity = Number(line.quantity ?? 0);

        if (!itemId || quantity <= 0) {
          continue;
        }

        const reservation = await this.inventoryRepository.reserveRequestLine(
          tenantId,
          requestId,
          itemId,
          quantity,
          this.requestContext.getStore()?.user_id ?? null,
        );

        if (!reservation) {
          await this.inventoryRepository.recordRequestBackorder(
            tenantId,
            requestId,
            itemId,
            quantity,
            0,
          );
          hasBackorder = true;
        }
      }

      const updated = await this.inventoryRepository.updateRequestStatus(
        tenantId,
        requestId,
        hasBackorder ? 'backordered' : 'approved',
        dto.notes?.trim() || null,
        this.requestContext.getStore()?.user_id ?? null,
      );

      if (!updated) {
        throw new NotFoundException(`Inventory request "${requestId}" was not found`);
      }

      return updated;
    });
  }

  private async fulfillRequest(requestId: string, dto: UpdateWorkflowStatusDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const request = await this.inventoryRepository.findRequestByIdForUpdate(tenantId, requestId);

      if (!request) {
        throw new NotFoundException(`Inventory request "${requestId}" was not found`);
      }

      if (request.status !== 'approved') {
        throw new BadRequestException('Only approved inventory requests can be fulfilled');
      }

      const reservedLines = await this.inventoryRepository.listReservedRequestLinesForUpdate(
        tenantId,
        requestId,
      );
      const linesToIssue = reservedLines.length > 0
        ? reservedLines
        : this.requestLinesToFulfillmentLines(request.lines);

      await this.issueRequestStockLines(tenantId, request, linesToIssue, dto.notes?.trim() || null);

      await this.inventoryRepository.markRequestReservationsFulfilled(tenantId, requestId);

      const updated = await this.inventoryRepository.updateRequestStatus(
        tenantId,
        requestId,
        'fulfilled',
        dto.notes?.trim() || null,
      );

      if (!updated) {
        throw new NotFoundException(`Inventory request "${requestId}" was not found`);
      }

      return updated;
    });
  }

  private async partiallyFulfillRequest(requestId: string, dto: UpdateWorkflowStatusDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const request = await this.inventoryRepository.findRequestByIdForUpdate(tenantId, requestId);

      if (!request) {
        throw new NotFoundException(`Inventory request "${requestId}" was not found`);
      }

      if (request.status !== 'backordered') {
        throw new BadRequestException('Only backordered inventory requests can be partially fulfilled');
      }

      const reservedLines = await this.inventoryRepository.listReservedRequestLinesForUpdate(
        tenantId,
        requestId,
      );

      if (reservedLines.length === 0) {
        throw new BadRequestException('No reserved stock is available for partial fulfillment');
      }

      await this.issueRequestStockLines(tenantId, request, reservedLines, dto.notes?.trim() || null);
      await this.inventoryRepository.markRequestReservationsFulfilled(tenantId, requestId);

      const updated = await this.inventoryRepository.updateRequestStatus(
        tenantId,
        requestId,
        'partially_fulfilled',
        dto.notes?.trim() || null,
      );

      if (!updated) {
        throw new NotFoundException(`Inventory request "${requestId}" was not found`);
      }

      return updated;
    });
  }

  async listTransfers() {
    return this.inventoryRepository.listTransfers(this.requireTenantId());
  }

  async createTransfer(dto: CreateTransferDto) {
    const tenantId = this.requireTenantId();
    const fromLocation = this.requireText(dto.from_location, 'Source location is required');
    const toLocation = this.requireText(dto.to_location, 'Destination location is required');

    if (fromLocation.toUpperCase() === toLocation.toUpperCase()) {
      throw new BadRequestException('Source and destination locations must be different');
    }

    await this.assertActiveInventoryLocation(tenantId, fromLocation, 'Source');
    await this.assertActiveInventoryLocation(tenantId, toLocation, 'Destination');

    return this.inventoryRepository.createTransfer({
      tenant_id: tenantId,
      transfer_number: this.buildNumber('TRF'),
      from_location: fromLocation,
      to_location: toLocation,
      status: 'pending',
      requested_by: this.requireText(dto.requested_by, 'Requester is required'),
      lines: dto.lines.map((line) => ({ ...line })),
      notes: dto.notes?.trim() || null,
    });
  }

  async updateTransferStatus(transferId: string, dto: UpdateWorkflowStatusDto) {
    if (dto.status === 'completed') {
      return this.completeTransfer(transferId, dto);
    }

    if (dto.status === 'cancelled') {
      return this.cancelTransfer(transferId, dto);
    }

    const updated = await this.inventoryRepository.updateTransferStatus(
      this.requireTenantId(),
      transferId,
      dto.status,
      dto.notes?.trim() || null,
    );

    if (!updated) {
      throw new NotFoundException(`Inventory transfer "${transferId}" was not found`);
    }

    return updated;
  }

  private async completeTransfer(transferId: string, dto: UpdateWorkflowStatusDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const transfer = await this.inventoryRepository.findTransferById(tenantId, transferId);

      if (!transfer) {
        throw new NotFoundException(`Inventory transfer "${transferId}" was not found`);
      }

      await this.assertActiveInventoryLocation(tenantId, transfer.from_location, 'Source');
      await this.assertActiveInventoryLocation(tenantId, transfer.to_location, 'Destination');

      for (const line of transfer.lines) {
        const itemId = typeof line.item_id === 'string' ? line.item_id : null;
        const quantity = Number(line.quantity ?? 0);

        if (!itemId || quantity <= 0) {
          continue;
        }

        const item = await this.inventoryRepository.findItemById(tenantId, itemId);

        if (!item) {
          throw new NotFoundException(`Inventory item "${itemId}" was not found for transfer completion`);
        }

        const balanceTransfer = await this.inventoryRepository.transferItemBalance(
          tenantId,
          itemId,
          transfer.from_location,
          transfer.to_location,
          quantity,
        );

        if (!balanceTransfer) {
          throw new BadRequestException('Transfer quantity exceeds source location balance');
        }

        await this.inventoryRepository.recordStockMovement({
          tenant_id: tenantId,
          item_id: itemId,
          movement_type: 'transfer',
          quantity,
          unit_cost: item.unit_price,
          reference: transfer.transfer_number,
          before_quantity: balanceTransfer.source_before_quantity,
          after_quantity: balanceTransfer.source_after_quantity,
          department: transfer.from_location,
          counterparty: transfer.to_location,
          actor_user_id: this.requestContext.getStore()?.user_id ?? null,
          notes:
            dto.notes?.trim()
            || `Transferred from ${transfer.from_location} to ${transfer.to_location}`,
        });
      }

      const updated = await this.inventoryRepository.updateTransferStatus(
        tenantId,
        transferId,
        dto.status,
        dto.notes?.trim() || null,
      );

      if (!updated) {
        throw new NotFoundException(`Inventory transfer "${transferId}" was not found`);
      }

      return updated;
    });
  }

  private async cancelTransfer(transferId: string, dto: UpdateWorkflowStatusDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const transfer = await this.inventoryRepository.findTransferById(tenantId, transferId);

      if (!transfer) {
        throw new NotFoundException(`Inventory transfer "${transferId}" was not found`);
      }

      if (transfer.status === 'completed') {
        await this.assertActiveInventoryLocation(tenantId, transfer.from_location, 'Source');
        await this.assertActiveInventoryLocation(tenantId, transfer.to_location, 'Destination');

        for (const line of transfer.lines) {
          const itemId = typeof line.item_id === 'string' ? line.item_id : null;
          const quantity = Number(line.quantity ?? 0);

          if (!itemId || quantity <= 0) {
            continue;
          }

          const item = await this.inventoryRepository.findItemById(tenantId, itemId);

          if (!item) {
            throw new NotFoundException(`Inventory item "${itemId}" was not found for transfer reversal`);
          }

          const balanceTransfer = await this.inventoryRepository.transferItemBalance(
            tenantId,
            itemId,
            transfer.to_location,
            transfer.from_location,
            quantity,
          );

          if (!balanceTransfer) {
            throw new BadRequestException('Transfer reversal quantity exceeds destination location balance');
          }

          await this.inventoryRepository.recordStockMovement({
            tenant_id: tenantId,
            item_id: itemId,
            movement_type: 'transfer_reversal',
            quantity,
            unit_cost: item.unit_price,
            reference: transfer.transfer_number,
            before_quantity: balanceTransfer.source_before_quantity,
            after_quantity: balanceTransfer.source_after_quantity,
            department: transfer.to_location,
            counterparty: transfer.from_location,
            actor_user_id: this.requestContext.getStore()?.user_id ?? null,
            notes:
              dto.notes?.trim()
              || `Reversed transfer from ${transfer.from_location} to ${transfer.to_location}`,
          });
        }
      }

      const updated = await this.inventoryRepository.updateTransferStatus(
        tenantId,
        transferId,
        'cancelled',
        dto.notes?.trim() || null,
      );

      if (!updated) {
        throw new NotFoundException(`Inventory transfer "${transferId}" was not found`);
      }

      return updated;
    });
  }

  async listIncidents() {
    return this.inventoryRepository.listIncidents(this.requireTenantId());
  }

  async createIncident(dto: CreateIncidentDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const item = await this.inventoryRepository.findItemById(tenantId, dto.item_id);

      if (!item) {
        throw new NotFoundException(`Inventory item "${dto.item_id}" was not found`);
      }

      const stockMutation = await this.inventoryRepository.decrementItemStock(
        tenantId,
        dto.item_id,
        dto.quantity,
      );

      if (!stockMutation) {
        throw new BadRequestException('Incident quantity exceeds stock on hand');
      }

      await this.inventoryRepository.recordStockMovement({
        tenant_id: tenantId,
        item_id: dto.item_id,
        item_name: item.item_name,
        movement_type: 'damage',
        quantity: dto.quantity,
        unit_cost: item.unit_price,
        reference: this.buildNumber('INC'),
        before_quantity: stockMutation.before_quantity,
        after_quantity: stockMutation.after_quantity,
        actor_user_id: this.requestContext.getStore()?.user_id ?? null,
        notes: dto.reason,
      });

      return this.inventoryRepository.createIncident({
        tenant_id: tenantId,
        incident_number: this.buildNumber('INC'),
        item_id: dto.item_id,
        incident_type: dto.incident_type,
        quantity: dto.quantity,
        reason: dto.reason.trim(),
        responsible_department: dto.responsible_department.trim(),
        cost_impact: dto.cost_impact,
        status: 'logged',
        notes: dto.notes?.trim() || null,
      });
    });
  }

  async postStockCount(dto: PostStockCountDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const locationCode = this.optionalNullableText(dto.location_code) ?? null;
      const snapshotNumber = this.buildNumber('CNT');
      const countedByUserId = this.requestContext.getStore()?.user_id ?? null;

      if (locationCode) {
        await this.assertActiveInventoryLocation(tenantId, locationCode, 'Stock count');
      }

      const snapshotLines: StockCountSnapshotLine[] = [];
      let varianceCount = 0;

      for (const line of dto.lines) {
        this.assertNonNegativeQuantity(line.counted_quantity, 'Counted quantity must be zero or greater');

        const item = await this.inventoryRepository.findItemById(tenantId, line.item_id);

        if (!item) {
          throw new NotFoundException(`Inventory item "${line.item_id}" was not found`);
        }

        const countResult = locationCode
          ? await this.applyLocationStockCount(
              tenantId,
              locationCode,
              line.item_id,
              line.counted_quantity,
            )
          : await this.applyItemStockCount(
              tenantId,
              line.item_id,
              line.counted_quantity,
            );

        const varianceQuantity = countResult.countedQuantity - countResult.expectedQuantity;

        if (varianceQuantity !== 0) {
          varianceCount += 1;
          await this.inventoryRepository.recordStockMovement({
            tenant_id: tenantId,
            item_id: line.item_id,
            item_name: countResult.item.item_name,
            movement_type: 'adjustment',
            quantity: Math.abs(varianceQuantity),
            unit_cost: countResult.item.unit_price,
            reference: snapshotNumber,
            before_quantity: countResult.stockBeforeQuantity,
            after_quantity: countResult.stockAfterQuantity,
            department: locationCode,
            actor_user_id: countedByUserId,
            notes: dto.notes?.trim() || 'Posted stock count variance adjustment',
          });
        }

        snapshotLines.push({
          item_id: line.item_id,
          item_name: item.item_name,
          location_code: locationCode,
          expected_quantity: countResult.expectedQuantity,
          counted_quantity: countResult.countedQuantity,
          variance_quantity: varianceQuantity,
        });
      }

      return this.inventoryRepository.createStockCountSnapshot({
        tenant_id: tenantId,
        snapshot_number: snapshotNumber,
        location_code: locationCode,
        counted_at: dto.counted_at?.trim() || null,
        counted_by_user_id: countedByUserId,
        status: 'posted',
        lines: snapshotLines,
        variance_count: varianceCount,
        notes: this.nullableText(dto.notes),
      });
    });
  }

  async getReports() {
    return this.inventoryRepository.buildReports(this.requireTenantId());
  }

  async exportReportCsv(reportId: string) {
    const normalizedReportId = reportId.trim().toLowerCase();
    const definition = INVENTORY_REPORT_EXPORTS.get(normalizedReportId);

    if (!definition) {
      throw new BadRequestException(`Unknown inventory report export "${reportId}"`);
    }

    const reports = await this.inventoryRepository.buildReports(this.requireTenantId());

    return createCsvReportArtifact({
      reportId: definition.id,
      title: definition.title,
      filename: definition.filename,
      headers: definition.headers,
      rows: definition.rows(reports),
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for inventory operations');
    }

    return tenantId;
  }

  private requireText(value: string | undefined, message: string): string {
    const normalized = value?.trim() ?? '';

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private optionalRequiredText(value: string | undefined, message: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.requireText(value, message);
  }

  private nullableText(value: string | undefined): string | null {
    const normalized = value?.trim() ?? '';
    return normalized || null;
  }

  private optionalNullableText(value: string | undefined): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.nullableText(value);
  }

  private calculateNextQuantity(item: InventoryItemRecord, dto: AdjustStockDto): number {
    if (dto.movement_type === 'stock_in') {
      return item.quantity_on_hand + dto.quantity;
    }

    if (dto.movement_type === 'stock_out') {
      if (item.quantity_on_hand < dto.quantity) {
        throw new BadRequestException('Stock out quantity exceeds quantity on hand');
      }

      return item.quantity_on_hand - dto.quantity;
    }

    return dto.quantity;
  }

  private assertPositiveQuantity(quantity: number): void {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
  }

  private assertNonNegativeQuantity(quantity: number, message: string): void {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException(message);
    }
  }

  private async getIdempotentStockTransaction(
    tenantId: string,
    submissionId: string | null,
  ): Promise<StockTransactionResponse | null> {
    if (!submissionId) {
      return null;
    }

    const existingMovements = await this.inventoryRepository.findStockMovementsBySubmissionId(
      tenantId,
      submissionId,
    );

    if (existingMovements.length === 0) {
      return null;
    }

    const firstMovement = existingMovements[0];

    return {
      reference: firstMovement.reference ?? submissionId,
      idempotent: true,
      transaction_type: firstMovement.movement_type,
      department: firstMovement.department ?? undefined,
      counterparty: firstMovement.counterparty ?? undefined,
      supplier_name: firstMovement.movement_type === 'stock_receipt'
        ? firstMovement.counterparty ?? undefined
        : undefined,
      purchase_reference: firstMovement.movement_type === 'stock_receipt'
        ? firstMovement.reference ?? undefined
        : undefined,
      lines: existingMovements.map((movement) => ({
        item_id: movement.item_id,
        item_name: movement.item_name ?? '',
        quantity: movement.quantity,
        before_quantity: movement.before_quantity ?? 0,
        after_quantity: movement.after_quantity ?? 0,
      })),
    };
  }

  private async resolveBackordersForReceivedItem(tenantId: string, itemId: string): Promise<void> {
    const backorders = await this.inventoryRepository.listOpenRequestBackordersForItem(
      tenantId,
      itemId,
    );

    for (const backorder of backorders) {
      const quantity = Number(backorder.backordered_quantity ?? 0);

      if (quantity <= 0) {
        continue;
      }

      const reservation = await this.inventoryRepository.reserveRequestLine(
        tenantId,
        backorder.request_id,
        backorder.item_id,
        quantity,
        this.requestContext.getStore()?.user_id ?? null,
      );

      if (!reservation) {
        continue;
      }

      await this.inventoryRepository.markRequestBackorderResolved(tenantId, backorder.id);

      const remainingBackorders = await this.inventoryRepository.countOpenBackordersForRequest(
        tenantId,
        backorder.request_id,
      );

      if (remainingBackorders === 0) {
        await this.inventoryRepository.updateRequestStatus(
          tenantId,
          backorder.request_id,
          'approved',
          null,
        );
      }
    }
  }

  private async assertActiveInventoryLocation(
    tenantId: string,
    location: string,
    label: string,
  ): Promise<void> {
    const activeLocation = await this.inventoryRepository.findActiveLocationByCodeOrName(
      tenantId,
      location,
    );

    if (!activeLocation) {
      throw new BadRequestException(`${label} location must be an active inventory location`);
    }
  }

  private async assertOptionalStorageLocation(
    tenantId: string,
    storageLocation: string | null,
  ): Promise<void> {
    if (!storageLocation) {
      return;
    }

    await this.assertActiveInventoryLocation(tenantId, storageLocation, 'Storage');
  }

  private async applyItemStockCount(
    tenantId: string,
    itemId: string,
    countedQuantity: number,
  ): Promise<{
    item: InventoryItemRecord;
    expectedQuantity: number;
    countedQuantity: number;
    stockBeforeQuantity: number;
    stockAfterQuantity: number;
  }> {
    const mutation = await this.inventoryRepository.setItemStockFromCount(
      tenantId,
      itemId,
      countedQuantity,
    );

    if (!mutation) {
      throw new NotFoundException(`Inventory item "${itemId}" was not found`);
    }

    return {
      item: mutation.item,
      expectedQuantity: mutation.before_quantity,
      countedQuantity: mutation.after_quantity,
      stockBeforeQuantity: mutation.before_quantity,
      stockAfterQuantity: mutation.after_quantity,
    };
  }

  private async applyLocationStockCount(
    tenantId: string,
    locationCode: string,
    itemId: string,
    countedQuantity: number,
  ): Promise<{
    item: InventoryItemRecord;
    expectedQuantity: number;
    countedQuantity: number;
    stockBeforeQuantity: number;
    stockAfterQuantity: number;
  }> {
    const balanceMutation = await this.inventoryRepository.setItemLocationBalanceFromCount(
      tenantId,
      itemId,
      locationCode,
      countedQuantity,
    );
    const variance = balanceMutation.after_quantity - balanceMutation.before_quantity;

    if (variance === 0) {
      const item = await this.inventoryRepository.findItemById(tenantId, itemId);

      if (!item) {
        throw new NotFoundException(`Inventory item "${itemId}" was not found`);
      }

      return {
        item,
        expectedQuantity: balanceMutation.before_quantity,
        countedQuantity: balanceMutation.after_quantity,
        stockBeforeQuantity: item.quantity_on_hand,
        stockAfterQuantity: item.quantity_on_hand,
      };
    }

    const stockMutation = await this.inventoryRepository.adjustItemStockByVariance(
      tenantId,
      itemId,
      variance,
    );

    if (!stockMutation) {
      throw new BadRequestException('Stock count adjustment would create negative stock');
    }

    return {
      item: stockMutation.item,
      expectedQuantity: balanceMutation.before_quantity,
      countedQuantity: balanceMutation.after_quantity,
      stockBeforeQuantity: stockMutation.before_quantity,
      stockAfterQuantity: stockMutation.after_quantity,
    };
  }

  private requestLinesToFulfillmentLines(lines: Array<Record<string, unknown>>): RequestFulfillmentLine[] {
    return lines.map((line) => ({
      item_id: typeof line.item_id === 'string' ? line.item_id : '',
      item_name: typeof line.item_name === 'string' ? line.item_name : null,
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
    }));
  }

  private async issueRequestStockLines(
    tenantId: string,
    request: InventoryRequestRecord,
    lines: RequestFulfillmentLine[],
    notes: string | null,
  ): Promise<void> {
    for (const line of lines) {
      const itemId = line.item_id;
      const quantity = Number(line.quantity ?? 0);

      if (!itemId || quantity <= 0) {
        continue;
      }

      const stockMutation = await this.inventoryRepository.decrementItemStock(
        tenantId,
        itemId,
        quantity,
      );

      if (!stockMutation) {
        throw new BadRequestException('Request fulfillment quantity exceeds quantity on hand');
      }

      await this.inventoryRepository.recordStockMovement({
        tenant_id: tenantId,
        item_id: itemId,
        item_name: stockMutation.item.item_name,
        movement_type: 'stock_issue',
        quantity,
        unit_cost: stockMutation.item.unit_price,
        reference: request.request_number,
        before_quantity: stockMutation.before_quantity,
        after_quantity: stockMutation.after_quantity,
        department: request.department,
        counterparty: request.requested_by,
        actor_user_id: this.requestContext.getStore()?.user_id ?? null,
        notes: notes || request.notes || `Issued for ${request.department}`,
      });
    }
  }

  private buildStockTransactionLine(input: {
    item: InventoryItemRecord;
    quantity: number;
    beforeQuantity: number;
    afterQuantity: number;
  }): StockTransactionLine {
    return {
      item_id: input.item.id,
      item_name: input.item.item_name,
      quantity: input.quantity,
      before_quantity: input.beforeQuantity,
      after_quantity: input.afterQuantity,
    };
  }

  private buildNumber(prefix: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Date.now().toString().slice(-5);
    return `${prefix}-${date}-${suffix}`;
  }

  private rethrowUniqueSku(error: unknown) {
    const databaseError = error as { code?: string; constraint?: string };

    if (databaseError?.code === '23505' && databaseError.constraint?.includes('sku')) {
      throw new ConflictException('inventory SKU already exists in this tenant');
    }
  }

  private rethrowUniqueCategoryCode(error: unknown) {
    const databaseError = error as { code?: string; constraint?: string };

    if (databaseError?.code === '23505' && databaseError.constraint?.includes('tenant_code')) {
      throw new ConflictException('inventory category code already exists in this tenant');
    }
  }

  private rethrowUniqueLocationCode(error: unknown) {
    const databaseError = error as { code?: string; constraint?: string };

    if (
      databaseError?.code === '23505'
      && databaseError.constraint?.includes('inventory_locations_tenant_code')
    ) {
      throw new ConflictException('inventory location code already exists in this tenant');
    }
  }

  private rethrowUniqueSupplierName(error: unknown) {
    const databaseError = error as { code?: string; constraint?: string };

    if (databaseError?.code === '23505' && databaseError.constraint?.includes('tenant_name')) {
      throw new ConflictException('inventory supplier already exists in this tenant');
    }
  }
}
