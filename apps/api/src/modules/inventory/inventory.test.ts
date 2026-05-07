import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { InventoryService } from './inventory.service';

test('InventoryService adjusts stock and records the movement trail', async () => {
  const requestContext = new RequestContextService();
  let movementPayload: { movement_type: string; quantity: number } | null = null;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        name: 'A4 Printing Paper',
        sku: 'STAT-A4-001',
        quantity_on_hand: 120,
        reorder_level: 40,
        unit_price: 650,
      }),
      recordStockMovement: async (input: Record<string, unknown>) => {
        movementPayload = {
          movement_type: String(input.movement_type),
          quantity: Number(input.quantity),
        };

        return {
          id: '00000000-0000-0000-0000-000000000402',
          ...input,
          created_at: new Date('2026-05-04T08:00:00.000Z'),
        };
      },
      updateItemStock: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        name: 'A4 Printing Paper',
        sku: 'STAT-A4-001',
        quantity_on_hand: 95,
        reorder_level: 40,
        unit_price: 650,
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-adjust-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*', 'procurement:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/items/00000000-0000-0000-0000-000000000401/adjust',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.adjustItemStock('00000000-0000-0000-0000-000000000401', {
        movement_type: 'stock_out',
        quantity: 25,
        notes: 'Issued to Grade 7 stationery store',
        reference: 'REQ-2026-104',
      }),
  );

  assert.equal(response.quantity_on_hand, 95);
  if (!movementPayload) {
    throw new Error('Expected a stock movement payload to be recorded');
  }

  const recordedMovement = movementPayload as { movement_type: string; quantity: number };

  assert.equal(recordedMovement.movement_type, 'stock_out');
  assert.equal(recordedMovement.quantity, 25);
});

test('InventoryService receives an approved purchase order and creates stock-in movements', async () => {
  const requestContext = new RequestContextService();
  const createdMovements: Array<Record<string, unknown>> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findPurchaseOrderById: async () => ({
        id: '00000000-0000-0000-0000-000000000501',
        tenant_id: 'tenant-a',
        po_number: 'PO-2026-014',
        status: 'approved',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            item_name: 'A4 Printing Paper',
            quantity: 30,
            unit_price: 650,
          },
        ],
      }),
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000601',
          ...input,
          created_at: new Date('2026-05-04T09:00:00.000Z'),
        };
      },
      applyStockReceipt: async (): Promise<void> => undefined,
      updatePurchaseOrderStatus: async () => ({
        id: '00000000-0000-0000-0000-000000000501',
        tenant_id: 'tenant-a',
        po_number: 'PO-2026-014',
        status: 'received',
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-po-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*', 'procurement:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/purchase-orders/00000000-0000-0000-0000-000000000501/status',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.receivePurchaseOrder('00000000-0000-0000-0000-000000000501', {
        notes: 'Verified against delivery note DN-1182',
      }),
  );

  assert.equal(response.status, 'received');
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0]?.movement_type, 'stock_in');
});

test('InventoryService issues department stock with before and after audit quantities', async () => {
  const requestContext = new RequestContextService();
  const stockUpdates: Array<{ itemId: string; nextQuantity: number }> = [];
  const createdMovements: Array<Record<string, unknown>> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findStockMovementsBySubmissionId: async () => [],
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        item_name: 'A4 Printing Paper',
        sku: 'STAT-A4-001',
        quantity_on_hand: 18,
        reorder_level: 25,
        unit: 'ream',
        unit_price: 650,
        supplier_id: null,
        category_id: null,
        storage_location: 'Main Store - Shelf A2',
        notes: null,
        status: 'active',
        is_archived: false,
      }),
      updateItemStock: async (_tenantId: string, itemId: string, nextQuantity: number) => {
        stockUpdates.push({ itemId, nextQuantity });
        return {
          id: itemId,
          quantity_on_hand: nextQuantity,
        };
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000701',
          ...input,
          occurred_at: new Date('2026-05-07T09:15:00.000Z'),
          created_at: new Date('2026-05-07T09:15:00.000Z'),
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-stock-issue-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/stock-issues',
      started_at: '2026-05-07T09:15:00.000Z',
    },
    () =>
      service.issueDepartmentStock({
        department: 'Exams Office',
        received_by: 'Lucy Wambui',
        submission_id: 'issue-submit-001',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            quantity: 4,
          },
        ],
        notes: 'Exam printing paper issue',
      }),
  );

  assert.match(response.reference, /^ISS-/);
  assert.equal(response.idempotent, false);
  assert.equal(response.lines[0]?.before_quantity, 18);
  assert.equal(response.lines[0]?.after_quantity, 14);
  assert.deepEqual(stockUpdates, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      nextQuantity: 14,
    },
  ]);
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0]?.movement_type, 'stock_issue');
  assert.equal(createdMovements[0]?.before_quantity, 18);
  assert.equal(createdMovements[0]?.after_quantity, 14);
  assert.equal(createdMovements[0]?.department, 'Exams Office');
  assert.equal(createdMovements[0]?.counterparty, 'Lucy Wambui');
  assert.equal(createdMovements[0]?.submission_id, 'issue-submit-001');
});

test('InventoryService blocks department stock issues that would create negative stock', async () => {
  const requestContext = new RequestContextService();
  let stockWasUpdated = false;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findStockMovementsBySubmissionId: async () => [],
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000402',
        tenant_id: 'tenant-a',
        item_name: 'Lab Gloves',
        sku: 'LAB-GLV-100',
        quantity_on_hand: 4,
        reorder_level: 10,
        unit: 'box',
        unit_price: 780,
        supplier_id: null,
        category_id: null,
        storage_location: 'Science Prep Room',
        notes: null,
        status: 'active',
        is_archived: false,
      }),
      updateItemStock: async () => {
        stockWasUpdated = true;
        return null;
      },
      recordStockMovement: async () => {
        throw new Error('movement should not be recorded');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-stock-issue-negative',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'storekeeper',
          session_id: 'session-1',
          permissions: ['inventory:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/inventory/stock-issues',
          started_at: '2026-05-07T09:20:00.000Z',
        },
        () =>
          service.issueDepartmentStock({
            department: 'Science Lab',
            received_by: 'Moses Otieno',
            lines: [
              {
                item_id: '00000000-0000-0000-0000-000000000402',
                quantity: 99,
              },
            ],
          }),
      ),
    /Stock issue quantity exceeds quantity on hand/,
  );
  assert.equal(stockWasUpdated, false);
});

test('InventoryService returns existing stock issue movements for duplicate submissions', async () => {
  const requestContext = new RequestContextService();
  let stockWasUpdated = false;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findStockMovementsBySubmissionId: async () => [
        {
          id: '00000000-0000-0000-0000-000000000703',
          reference: 'ISS-20260507-00003',
          item_id: '00000000-0000-0000-0000-000000000401',
          item_name: 'A4 Printing Paper',
          movement_type: 'stock_issue',
          quantity: 4,
          before_quantity: 18,
          after_quantity: 14,
          department: 'Exams Office',
          counterparty: 'Lucy Wambui',
          submission_id: 'issue-submit-duplicate',
        },
      ],
      updateItemStock: async () => {
        stockWasUpdated = true;
        return null;
      },
      recordStockMovement: async () => {
        throw new Error('duplicate movement should not be recorded');
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-stock-issue-duplicate',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/stock-issues',
      started_at: '2026-05-07T09:25:00.000Z',
    },
    () =>
      service.issueDepartmentStock({
        department: 'Exams Office',
        received_by: 'Lucy Wambui',
        submission_id: 'issue-submit-duplicate',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            quantity: 4,
          },
        ],
      }),
  );

  assert.equal(response.reference, 'ISS-20260507-00003');
  assert.equal(response.idempotent, true);
  assert.equal(response.lines[0]?.after_quantity, 14);
  assert.equal(stockWasUpdated, false);
});

test('InventoryService receives supplier stock with batch, expiry, and before-after audit quantities', async () => {
  const requestContext = new RequestContextService();
  const receivedLines: Array<Record<string, unknown>> = [];
  const createdMovements: Array<Record<string, unknown>> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findStockMovementsBySubmissionId: async () => [],
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        item_name: 'A4 Printing Paper',
        sku: 'STAT-A4-001',
        quantity_on_hand: 18,
        reorder_level: 25,
        unit: 'ream',
        unit_price: 650,
        supplier_id: '00000000-0000-0000-0000-000000000801',
        category_id: null,
        storage_location: 'Main Store - Shelf A2',
        notes: null,
        status: 'active',
        is_archived: false,
      }),
      applyStockReceiptWithCost: async (
        _tenantId: string,
        itemId: string,
        quantity: number,
        unitCost: number,
        supplierId: string | null,
      ) => {
        receivedLines.push({ itemId, quantity, unitCost, supplierId });
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000704',
          ...input,
          occurred_at: new Date('2026-05-07T10:15:00.000Z'),
          created_at: new Date('2026-05-07T10:15:00.000Z'),
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-stock-receipt-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/stock-receipts',
      started_at: '2026-05-07T10:15:00.000Z',
    },
    () =>
      service.receiveSupplierStock({
        supplier_id: '00000000-0000-0000-0000-000000000801',
        supplier_name: 'Crown Office Supplies',
        purchase_reference: 'PO-2026-031',
        submission_id: 'receipt-submit-001',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            quantity: 12,
            unit_cost: 690,
            batch_number: 'COS-A4-0526',
            expiry_date: '2026-12-31',
          },
        ],
      }),
  );

  assert.match(response.reference, /^RCV-/);
  assert.equal(response.idempotent, false);
  assert.deepEqual(receivedLines, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      quantity: 12,
      unitCost: 690,
      supplierId: '00000000-0000-0000-0000-000000000801',
    },
  ]);
  assert.equal(response.lines[0]?.before_quantity, 18);
  assert.equal(response.lines[0]?.after_quantity, 30);
  assert.equal(createdMovements[0]?.movement_type, 'stock_receipt');
  assert.equal(createdMovements[0]?.reference, 'PO-2026-031');
  assert.equal(createdMovements[0]?.before_quantity, 18);
  assert.equal(createdMovements[0]?.after_quantity, 30);
  assert.equal(createdMovements[0]?.counterparty, 'Crown Office Supplies');
  assert.equal(createdMovements[0]?.batch_number, 'COS-A4-0526');
  assert.equal(createdMovements[0]?.expiry_date, '2026-12-31');
  assert.equal(createdMovements[0]?.submission_id, 'receipt-submit-001');
});

test('InventoryService completes a transfer and records transfer movements for the audit trail', async () => {
  const requestContext = new RequestContextService();
  const createdMovements: Array<Record<string, unknown>> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findTransferById: async () => ({
        id: '00000000-0000-0000-0000-000000000901',
        tenant_id: 'tenant-a',
        transfer_number: 'TRF-2026-008',
        from_location: 'Main Store',
        to_location: 'Boarding Kitchen',
        status: 'in_transit',
        requested_by: 'Linet Auma',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            item_name: 'Cooking Oil 20L',
            quantity: 6,
            unit_price: 6500,
          },
        ],
        notes: 'Boarding replenishment before weekend issue',
      }),
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        item_name: 'Cooking Oil 20L',
        sku: 'FOOD-OIL-20',
        quantity_on_hand: 14,
        reorder_level: 10,
        unit_price: 6500,
      }),
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000902',
          ...input,
          created_at: new Date('2026-05-04T11:00:00.000Z'),
        };
      },
      updateTransferStatus: async () => ({
        id: '00000000-0000-0000-0000-000000000901',
        transfer_number: 'TRF-2026-008',
        status: 'completed',
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-transfer-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*', 'transfers:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/transfers/00000000-0000-0000-0000-000000000901/status',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.updateTransferStatus('00000000-0000-0000-0000-000000000901', {
        status: 'completed',
        notes: 'Delivered to boarding kitchen store',
      }),
  );

  assert.equal(response.status, 'completed');
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0]?.movement_type, 'transfer');
  assert.equal(createdMovements[0]?.quantity, 6);
  assert.equal(createdMovements[0]?.reference, 'TRF-2026-008');
});

test('InventoryService creates a category with operational ownership fields', async () => {
  const requestContext = new RequestContextService();

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      createCategory: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000931',
        ...input,
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-category-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/categories',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.createCategory({
        code: 'stat',
        name: 'Stationery',
        manager: 'Academic Office',
        storage_zones: 'Admin Store, Block A',
        description: 'Daily issue to class teachers and exams office.',
      }),
  );

  assert.equal(response.code, 'STAT');
  assert.equal(response.manager, 'Academic Office');
  assert.equal(response.storage_zones, 'Admin Store, Block A');
});

test('InventoryService updates a supplier and preserves procurement status fields', async () => {
  const requestContext = new RequestContextService();

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      updateSupplier: async (_tenantId: string, _supplierId: string, input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000941',
        ...input,
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-supplier-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['procurement:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/suppliers/00000000-0000-0000-0000-000000000941',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.updateSupplier('00000000-0000-0000-0000-000000000941', {
        supplier_name: 'Crown Office Supplies',
        contact_person: 'Lucy Njeri',
        email: 'orders@crownoffice.co.ke',
        phone: '+254722441885',
        county: 'Nairobi',
        status: 'on_hold',
      }),
  );

  assert.equal(response.supplier_name, 'Crown Office Supplies');
  assert.equal(response.county, 'Nairobi');
  assert.equal(response.status, 'on_hold');
});
