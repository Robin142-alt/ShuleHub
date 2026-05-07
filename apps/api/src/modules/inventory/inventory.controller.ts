import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { AdjustStockDto, CreateInventoryItemDto, UpdateInventoryItemDto } from './dto/create-inventory-item.dto';
import {
  CreateIncidentDto,
  CreateInventoryRequestDto,
  CreatePurchaseOrderDto,
  CreateTransferDto,
  UpdateWorkflowStatusDto,
} from './dto/inventory-workflow.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  @Permissions('inventory:read')
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Get('items')
  @Permissions('inventory:read')
  listItems(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.listItems(query);
  }

  @Post('items')
  @Permissions('inventory:write')
  createItem(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @Patch('items/:itemId')
  @Permissions('inventory:write')
  updateItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.updateItem(itemId, dto);
  }

  @Post('items/:itemId/adjust')
  @Permissions('inventory:write')
  adjustStock(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustItemStock(itemId, dto);
  }

  @Get('categories')
  @Permissions('inventory:read')
  listCategories() {
    return this.inventoryService.listCategories();
  }

  @Get('stock-movements')
  @Permissions('inventory:read')
  listStockMovements(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.listStockMovements(query);
  }

  @Get('suppliers')
  @Permissions('procurement:read')
  listSuppliers() {
    return this.inventoryService.listSuppliers();
  }

  @Get('purchase-orders')
  @Permissions('procurement:read')
  listPurchaseOrders() {
    return this.inventoryService.listPurchaseOrders();
  }

  @Post('purchase-orders')
  @Permissions('procurement:write')
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.inventoryService.createPurchaseOrder(dto);
  }

  @Patch('purchase-orders/:purchaseOrderId/status')
  @Permissions('procurement:write')
  updatePurchaseOrderStatus(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Body() dto: UpdateWorkflowStatusDto,
  ) {
    return this.inventoryService.updatePurchaseOrderStatus(purchaseOrderId, dto);
  }

  @Get('requests')
  @Permissions('inventory:read')
  listRequests() {
    return this.inventoryService.listRequests();
  }

  @Post('requests')
  @Permissions('inventory:write')
  createRequest(@Body() dto: CreateInventoryRequestDto) {
    return this.inventoryService.createRequest(dto);
  }

  @Patch('requests/:requestId/status')
  @Permissions('inventory:write')
  updateRequestStatus(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: UpdateWorkflowStatusDto,
  ) {
    return this.inventoryService.updateRequestStatus(requestId, dto);
  }

  @Get('transfers')
  @Permissions('transfers:read')
  listTransfers() {
    return this.inventoryService.listTransfers();
  }

  @Post('transfers')
  @Permissions('transfers:write')
  createTransfer(@Body() dto: CreateTransferDto) {
    return this.inventoryService.createTransfer(dto);
  }

  @Patch('transfers/:transferId/status')
  @Permissions('transfers:write')
  updateTransferStatus(
    @Param('transferId', new ParseUUIDPipe()) transferId: string,
    @Body() dto: UpdateWorkflowStatusDto,
  ) {
    return this.inventoryService.updateTransferStatus(transferId, dto);
  }

  @Get('incidents')
  @Permissions('inventory:read')
  listIncidents() {
    return this.inventoryService.listIncidents();
  }

  @Post('incidents')
  @Permissions('inventory:write')
  createIncident(@Body() dto: CreateIncidentDto) {
    return this.inventoryService.createIncident(dto);
  }

  @Get('reports')
  @Permissions('inventory:read')
  getReports() {
    return this.inventoryService.getReports();
  }
}
