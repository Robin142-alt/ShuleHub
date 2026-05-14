import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  ReportExportQueueService,
  type QueueReportExportRequest,
} from '../../common/reports/report-export-queue';
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
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reportExportQueueService: ReportExportQueueService,
  ) {}

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

  @Post('categories')
  @Permissions('inventory:write')
  createCategory(@Body() dto: CreateInventoryCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Patch('categories/:categoryId')
  @Permissions('inventory:write')
  updateCategory(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.inventoryService.updateCategory(categoryId, dto);
  }

  @Get('locations')
  @Permissions('inventory:read')
  listLocations() {
    return this.inventoryService.listLocations();
  }

  @Post('locations')
  @Permissions('inventory:write')
  createLocation(@Body() dto: CreateInventoryLocationDto) {
    return this.inventoryService.createLocation(dto);
  }

  @Patch('locations/:locationId')
  @Permissions('inventory:write')
  updateLocation(
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: UpdateInventoryLocationDto,
  ) {
    return this.inventoryService.updateLocation(locationId, dto);
  }

  @Get('stock-movements')
  @Permissions('inventory:read')
  listStockMovements(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.listStockMovements(query);
  }

  @Post('stock-issues')
  @Permissions('inventory:write')
  issueDepartmentStock(@Body() dto: CreateStockIssueDto) {
    return this.inventoryService.issueDepartmentStock(dto);
  }

  @Post('stock-receipts')
  @Permissions('inventory:write')
  receiveSupplierStock(@Body() dto: CreateStockReceiptDto) {
    return this.inventoryService.receiveSupplierStock(dto);
  }

  @Post('stock-counts')
  @Permissions('inventory:write')
  postStockCount(@Body() dto: PostStockCountDto) {
    return this.inventoryService.postStockCount(dto);
  }

  @Get('suppliers')
  @Permissions('procurement:read')
  listSuppliers() {
    return this.inventoryService.listSuppliers();
  }

  @Post('suppliers')
  @Permissions('procurement:write')
  createSupplier(@Body() dto: CreateInventorySupplierDto) {
    return this.inventoryService.createSupplier(dto);
  }

  @Patch('suppliers/:supplierId')
  @Permissions('procurement:write')
  updateSupplier(
    @Param('supplierId', new ParseUUIDPipe()) supplierId: string,
    @Body() dto: UpdateInventorySupplierDto,
  ) {
    return this.inventoryService.updateSupplier(supplierId, dto);
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

  @Post('reports/:reportId/export-jobs')
  @Permissions('inventory:read')
  queueReportExport(
    @Param('reportId') reportId: string,
    @Body() body: QueueReportExportRequest = {},
  ) {
    return this.reportExportQueueService.enqueueCurrentRequestReportExport({
      module: 'inventory',
      report_id: reportId,
      format: body.format ?? 'csv',
      filters: body.filters,
      estimated_rows: body.estimated_rows,
    });
  }

  @Get('reports/:reportId/export')
  @Permissions('inventory:read')
  exportReport(@Param('reportId') reportId: string) {
    return this.inventoryService.exportReportCsv(reportId);
  }
}
