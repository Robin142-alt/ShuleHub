import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { AdjustStockDto, CreateInventoryItemDto, UpdateInventoryItemDto } from './dto/create-inventory-item.dto';
import {
  CreateIncidentDto,
  CreateInventoryRequestDto,
  CreatePurchaseOrderDto,
  CreateTransferDto,
  UpdateWorkflowStatusDto,
} from './dto/inventory-workflow.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import {
  InventoryItemRecord,
  InventoryPurchaseOrderRecord,
  InventoryRepository,
} from './repositories/inventory.repository';

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
        const item = await this.inventoryRepository.createItem({
          tenant_id: this.requireTenantId(),
          item_name: dto.item_name.trim(),
          sku: dto.sku.trim(),
          category_id: dto.category_id?.trim() || null,
          unit: dto.unit.trim(),
          quantity_on_hand: dto.quantity,
          supplier_id: dto.supplier_id?.trim() || null,
          unit_price: dto.unit_price,
          reorder_level: dto.reorder_level,
          storage_location: dto.storage_location?.trim() || null,
          notes: dto.notes?.trim() || null,
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
        const item = await this.inventoryRepository.updateItem(this.requireTenantId(), itemId, {
          item_name: dto.item_name?.trim(),
          sku: dto.sku?.trim(),
          category_id: dto.category_id?.trim() || null,
          unit: dto.unit?.trim(),
          supplier_id: dto.supplier_id?.trim() || null,
          unit_price: dto.unit_price,
          reorder_level: dto.reorder_level,
          storage_location: dto.storage_location?.trim() || null,
          notes: dto.notes?.trim() || null,
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

  async listStockMovements(query: ListInventoryQueryDto) {
    return this.inventoryRepository.listStockMovements(this.requireTenantId(), query.limit ?? 50);
  }

  async listSuppliers() {
    return this.inventoryRepository.listSuppliers(this.requireTenantId());
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
      const purchaseOrder = await this.inventoryRepository.findPurchaseOrderById(tenantId, purchaseOrderId);

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

        await this.inventoryRepository.applyStockReceipt(tenantId, itemId, quantity);
        await this.inventoryRepository.recordStockMovement({
          tenant_id: tenantId,
          item_id: itemId,
          item_name: itemName,
          movement_type: 'stock_in',
          quantity,
          unit_cost: unitPrice,
          reference: purchaseOrder.po_number,
          actor_user_id: this.requestContext.getStore()?.user_id ?? null,
          notes: dto.notes?.trim() || 'Stock received against approved purchase order',
        });
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

  async listTransfers() {
    return this.inventoryRepository.listTransfers(this.requireTenantId());
  }

  async createTransfer(dto: CreateTransferDto) {
    return this.inventoryRepository.createTransfer({
      tenant_id: this.requireTenantId(),
      transfer_number: this.buildNumber('TRF'),
      from_location: dto.from_location.trim(),
      to_location: dto.to_location.trim(),
      status: 'pending',
      requested_by: dto.requested_by.trim(),
      lines: dto.lines.map((line) => ({ ...line })),
      notes: dto.notes?.trim() || null,
    });
  }

  async updateTransferStatus(transferId: string, dto: UpdateWorkflowStatusDto) {
    if (dto.status === 'completed') {
      return this.completeTransfer(transferId, dto);
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

        await this.inventoryRepository.recordStockMovement({
          tenant_id: tenantId,
          item_id: itemId,
          movement_type: 'transfer',
          quantity,
          unit_cost: item.unit_price,
          reference: transfer.transfer_number,
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

      if (item.quantity_on_hand < dto.quantity) {
        throw new BadRequestException('Incident quantity exceeds stock on hand');
      }

      await this.inventoryRepository.updateItemStock(
        tenantId,
        dto.item_id,
        item.quantity_on_hand - dto.quantity,
      );
      await this.inventoryRepository.recordStockMovement({
        tenant_id: tenantId,
        item_id: dto.item_id,
        movement_type: 'damage',
        quantity: dto.quantity,
        unit_cost: item.unit_price,
        reference: this.buildNumber('INC'),
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

  async getReports() {
    return this.inventoryRepository.buildReports(this.requireTenantId());
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for inventory operations');
    }

    return tenantId;
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
}
