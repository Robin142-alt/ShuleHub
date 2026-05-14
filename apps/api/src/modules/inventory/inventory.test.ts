import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  const lockedPurchaseOrders: string[] = [];
  const stockIncrements: Array<{ itemId: string; quantity: number }> = [];
  const locationBalanceIncrements: Array<{ itemId: string; location: string; quantity: number }> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findPurchaseOrderByIdForUpdate: async (_tenantId: string, purchaseOrderId: string) => {
        lockedPurchaseOrders.push(purchaseOrderId);
        return {
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
      };
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000601',
          ...input,
          created_at: new Date('2026-05-04T09:00:00.000Z'),
        };
      },
      incrementItemStock: async (_tenantId: string, itemId: string, quantity: number) => {
        stockIncrements.push({ itemId, quantity });
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'A4 Printing Paper',
            sku: 'STAT-A4-001',
            quantity_on_hand: 150,
            reorder_level: 40,
            unit: 'ream',
            unit_price: 650,
            supplier_id: null,
            category_id: null,
            storage_location: 'Main Store',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 120,
          after_quantity: 150,
        };
      },
      incrementItemLocationBalance: async (
        _tenantId: string,
        itemId: string,
        location: string,
        quantity: number,
      ) => {
        locationBalanceIncrements.push({ itemId, location, quantity });
      },
      listOpenRequestBackordersForItem: async () => [],
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
  assert.deepEqual(lockedPurchaseOrders, ['00000000-0000-0000-0000-000000000501']);
  assert.deepEqual(stockIncrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      quantity: 30,
    },
  ]);
  assert.deepEqual(locationBalanceIncrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      location: 'Main Store',
      quantity: 30,
    },
  ]);
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0]?.movement_type, 'stock_in');
  assert.equal(createdMovements[0]?.before_quantity, 120);
  assert.equal(createdMovements[0]?.after_quantity, 150);
});

test('InventoryService issues department stock with before and after audit quantities', async () => {
  const requestContext = new RequestContextService();
  const stockDecrements: Array<{ itemId: string; quantity: number }> = [];
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
      decrementItemStock: async (_tenantId: string, itemId: string, quantity: number) => {
        stockDecrements.push({ itemId, quantity });
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'A4 Printing Paper',
            sku: 'STAT-A4-001',
            quantity_on_hand: 14,
            reorder_level: 25,
            unit: 'ream',
            unit_price: 650,
            supplier_id: null,
            category_id: null,
            storage_location: 'Main Store - Shelf A2',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 18,
          after_quantity: 14,
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
  assert.deepEqual(stockDecrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      quantity: 4,
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
  let stockWasDecremented = false;

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
      decrementItemStock: async () => {
        stockWasDecremented = true;
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
  assert.equal(stockWasDecremented, true);
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

test('InventoryService approves inventory requests by reserving stock lines', async () => {
  const requestContext = new RequestContextService();
  const reservations: Array<{ itemId: string; quantity: number }> = [];
  let capturedApproverUserId: string | null | undefined;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findRequestByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000603',
        request_number: 'REQ-2026-034',
        department: 'Exams Office',
        requested_by: 'Lucy Wambui',
        status: 'pending',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            item_name: 'A4 Printing Paper',
            quantity: 5,
            unit_price: 650,
          },
        ],
        notes: 'Mock exams',
      }),
      reserveRequestLine: async (
        _tenantId: string,
        _requestId: string,
        itemId: string,
        quantity: number,
      ) => {
        reservations.push({ itemId, quantity });
        return {
          id: '00000000-0000-0000-0000-000000000604',
          item_id: itemId,
          quantity,
          status: 'reserved',
        };
      },
      updateRequestStatus: async (
        _tenantId: string,
        _requestId: string,
        status: string,
        _notes: string | null,
        approverUserId?: string | null,
      ) => {
        capturedApproverUserId = approverUserId;
        return {
          id: '00000000-0000-0000-0000-000000000603',
          request_number: 'REQ-2026-034',
          status,
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-request-approve',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/requests/00000000-0000-0000-0000-000000000603/status',
      started_at: '2026-05-07T09:28:00.000Z',
    },
    () =>
      service.updateRequestStatus('00000000-0000-0000-0000-000000000603', {
        status: 'approved',
        notes: 'Approved for mock exams',
      }),
  );

  assert.equal(response.status, 'approved');
  assert.deepEqual(reservations, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      quantity: 5,
    },
  ]);
  assert.equal(capturedApproverUserId, '00000000-0000-0000-0000-000000000001');
});

test('InventoryService records request backorders when approval stock is unavailable', async () => {
  const requestContext = new RequestContextService();
  const backorders: Array<{
    itemId: string;
    requestedQuantity: number;
    reservedQuantity: number;
  }> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findRequestByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000605',
        request_number: 'REQ-2026-035',
        department: 'Boarding Kitchen',
        requested_by: 'Mary Atieno',
        status: 'pending',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000403',
            item_name: 'Cooking Oil 20L',
            quantity: 4,
            unit_price: 6500,
          },
        ],
        notes: 'Weekend meals',
      }),
      reserveRequestLine: async () => null,
      recordRequestBackorder: async (
        _tenantId: string,
        _requestId: string,
        itemId: string,
        requestedQuantity: number,
        reservedQuantity: number,
      ) => {
        backorders.push({ itemId, requestedQuantity, reservedQuantity });
        return {
          id: '00000000-0000-0000-0000-000000000606',
          item_id: itemId,
          requested_quantity: requestedQuantity,
          reserved_quantity: reservedQuantity,
          backordered_quantity: requestedQuantity - reservedQuantity,
          status: 'open',
        };
      },
      updateRequestStatus: async (
        _tenantId: string,
        _requestId: string,
        status: string,
      ) => ({
        id: '00000000-0000-0000-0000-000000000605',
        request_number: 'REQ-2026-035',
        status,
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-request-backorder',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/requests/00000000-0000-0000-0000-000000000605/status',
      started_at: '2026-05-07T09:29:00.000Z',
    },
    () =>
      service.updateRequestStatus('00000000-0000-0000-0000-000000000605', {
        status: 'approved',
        notes: 'Approve what can be reserved',
      }),
  );

  assert.equal(response.status, 'backordered');
  assert.deepEqual(backorders, [
    {
      itemId: '00000000-0000-0000-0000-000000000403',
      requestedQuantity: 4,
      reservedQuantity: 0,
    },
  ]);
});

test('InventoryService fulfills approved inventory requests by issuing stock', async () => {
  const requestContext = new RequestContextService();
  const decrements: Array<{ itemId: string; quantity: number }> = [];
  const createdMovements: Array<Record<string, unknown>> = [];
  let reservationsMarkedFulfilled = false;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findRequestByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000601',
        request_number: 'REQ-2026-033',
        department: 'Science Lab',
        requested_by: 'Moses Otieno',
        status: 'approved',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000402',
            item_name: 'Lab Gloves',
            quantity: 3,
            unit_price: 780,
          },
        ],
        notes: 'Chemistry practicals',
      }),
      decrementItemStock: async (_tenantId: string, itemId: string, quantity: number) => {
        decrements.push({ itemId, quantity });
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'Lab Gloves',
            sku: 'LAB-GLV-100',
            quantity_on_hand: 9,
            reorder_level: 10,
            unit: 'box',
            unit_price: 780,
            supplier_id: null,
            category_id: null,
            storage_location: 'Science Prep Room',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 12,
          after_quantity: 9,
        };
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000602',
          ...input,
        };
      },
      listReservedRequestLinesForUpdate: async () => [],
      markRequestReservationsFulfilled: async () => {
        reservationsMarkedFulfilled = true;
      },
      updateRequestStatus: async () => ({
        id: '00000000-0000-0000-0000-000000000601',
        request_number: 'REQ-2026-033',
        status: 'fulfilled',
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-request-fulfill',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/requests/00000000-0000-0000-0000-000000000601/status',
      started_at: '2026-05-07T09:30:00.000Z',
    },
    () =>
      service.updateRequestStatus('00000000-0000-0000-0000-000000000601', {
        status: 'fulfilled',
        notes: 'Issued to lab technician',
      }),
  );

  assert.equal(response.status, 'fulfilled');
  assert.deepEqual(decrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000402',
      quantity: 3,
    },
  ]);
  assert.equal(createdMovements[0]?.movement_type, 'stock_issue');
  assert.equal(createdMovements[0]?.reference, 'REQ-2026-033');
  assert.equal(createdMovements[0]?.before_quantity, 12);
  assert.equal(createdMovements[0]?.after_quantity, 9);
  assert.equal(createdMovements[0]?.department, 'Science Lab');
  assert.equal(createdMovements[0]?.counterparty, 'Moses Otieno');
  assert.equal(reservationsMarkedFulfilled, true);
});

test('InventoryService partially fulfills backordered requests from reserved lines only', async () => {
  const requestContext = new RequestContextService();
  const decrements: Array<{ itemId: string; quantity: number }> = [];
  const createdMovements: Array<Record<string, unknown>> = [];
  let reservationsMarkedFulfilled = false;
  let updatedStatus: string | null = null;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findRequestByIdForUpdate: async () => ({
        id: '00000000-0000-0000-0000-000000000609',
        request_number: 'REQ-2026-040',
        department: 'Boarding Kitchen',
        requested_by: 'Linet Auma',
        status: 'backordered',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            item_name: 'Cooking Oil 20L',
            quantity: 10,
            unit_price: 6500,
          },
        ],
        notes: 'Weekend replenishment',
      }),
      listReservedRequestLinesForUpdate: async () => [
        {
          item_id: '00000000-0000-0000-0000-000000000401',
          item_name: 'Cooking Oil 20L',
          quantity: 4,
          unit_price: 6500,
        },
      ],
      decrementItemStock: async (_tenantId: string, itemId: string, quantity: number) => {
        decrements.push({ itemId, quantity });
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'Cooking Oil 20L',
            sku: 'FOOD-OIL-20',
            quantity_on_hand: 6,
            reorder_level: 4,
            unit: 'tin',
            unit_price: 6500,
            supplier_id: null,
            category_id: null,
            storage_location: 'Main Store',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 10,
          after_quantity: 6,
        };
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000610',
          ...input,
        };
      },
      markRequestReservationsFulfilled: async () => {
        reservationsMarkedFulfilled = true;
      },
      updateRequestStatus: async (
        _tenantId: string,
        _requestId: string,
        status: string,
      ) => {
        updatedStatus = status;
        return {
          id: '00000000-0000-0000-0000-000000000609',
          request_number: 'REQ-2026-040',
          status,
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-request-partial-fulfill',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/requests/00000000-0000-0000-0000-000000000609/status',
      started_at: '2026-05-07T09:30:00.000Z',
    },
    () =>
      service.updateRequestStatus('00000000-0000-0000-0000-000000000609', {
        status: 'partially_fulfilled',
        notes: 'Issued the reserved quantity first',
      }),
  );

  assert.equal(response.status, 'partially_fulfilled');
  assert.equal(updatedStatus, 'partially_fulfilled');
  assert.deepEqual(decrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      quantity: 4,
    },
  ]);
  assert.equal(createdMovements[0]?.reference, 'REQ-2026-040');
  assert.equal(createdMovements[0]?.quantity, 4);
  assert.equal(createdMovements[0]?.department, 'Boarding Kitchen');
  assert.equal(reservationsMarkedFulfilled, true);
});

test('InventoryService receives supplier stock with batch, expiry, and before-after audit quantities', async () => {
  const requestContext = new RequestContextService();
  const receivedLines: Array<Record<string, unknown>> = [];
  const createdMovements: Array<Record<string, unknown>> = [];
  const locationBalanceIncrements: Array<{ itemId: string; location: string; quantity: number }> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findStockMovementsBySubmissionId: async () => [],
      incrementItemStockWithCost: async (
        _tenantId: string,
        itemId: string,
        quantity: number,
        unitCost: number,
        supplierId: string | null,
      ) => {
        receivedLines.push({ itemId, quantity, unitCost, supplierId });
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'A4 Printing Paper',
            sku: 'STAT-A4-001',
            quantity_on_hand: 30,
            reorder_level: 25,
            unit: 'ream',
            unit_price: unitCost,
            supplier_id: supplierId,
            category_id: null,
            storage_location: 'Main Store - Shelf A2',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 18,
          after_quantity: 30,
        };
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
      incrementItemLocationBalance: async (
        _tenantId: string,
        itemId: string,
        location: string,
        quantity: number,
      ) => {
        locationBalanceIncrements.push({ itemId, location, quantity });
      },
      listOpenRequestBackordersForItem: async () => [],
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
  assert.deepEqual(locationBalanceIncrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      location: 'Main Store - Shelf A2',
      quantity: 12,
    },
  ]);
  assert.equal(createdMovements[0]?.movement_type, 'stock_receipt');
  assert.equal(createdMovements[0]?.reference, 'PO-2026-031');
  assert.equal(createdMovements[0]?.before_quantity, 18);
  assert.equal(createdMovements[0]?.after_quantity, 30);
  assert.equal(createdMovements[0]?.counterparty, 'Crown Office Supplies');
  assert.equal(createdMovements[0]?.batch_number, 'COS-A4-0526');
  assert.equal(createdMovements[0]?.expiry_date, '2026-12-31');
  assert.equal(createdMovements[0]?.submission_id, 'receipt-submit-001');
});

test('InventoryService resolves open request backorders after supplier stock receipt', async () => {
  const requestContext = new RequestContextService();
  const reservedBackorders: Array<{ requestId: string; itemId: string; quantity: number }> = [];
  const resolvedBackorderIds: string[] = [];
  const updatedRequests: Array<{ requestId: string; status: string }> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findStockMovementsBySubmissionId: async () => [],
      incrementItemStockWithCost: async (
        _tenantId: string,
        itemId: string,
        quantity: number,
        unitCost: number,
      ) => ({
        item: {
          id: itemId,
          tenant_id: 'tenant-a',
          item_name: 'Cooking Oil 20L',
          sku: 'FOOD-OIL-20',
          quantity_on_hand: 10,
          reorder_level: 4,
          unit: 'jerrican',
          unit_price: unitCost,
          supplier_id: null,
          category_id: null,
          storage_location: 'Main Store',
          notes: null,
          status: 'active',
          is_archived: false,
        },
        before_quantity: 4,
        after_quantity: 4 + quantity,
      }),
      recordStockMovement: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000707',
        ...input,
      }),
      incrementItemLocationBalance: async () => {},
      listOpenRequestBackordersForItem: async () => [
        {
          id: '00000000-0000-0000-0000-000000000607',
          tenant_id: 'tenant-a',
          request_id: '00000000-0000-0000-0000-000000000605',
          item_id: '00000000-0000-0000-0000-000000000403',
          requested_quantity: 4,
          reserved_quantity: 0,
          backordered_quantity: 4,
          status: 'open',
        },
      ],
      reserveRequestLine: async (
        _tenantId: string,
        requestId: string,
        itemId: string,
        quantity: number,
      ) => {
        reservedBackorders.push({ requestId, itemId, quantity });
        return {
          id: '00000000-0000-0000-0000-000000000608',
          tenant_id: 'tenant-a',
          request_id: requestId,
          item_id: itemId,
          quantity,
          status: 'reserved',
        };
      },
      markRequestBackorderResolved: async (_tenantId: string, backorderId: string) => {
        resolvedBackorderIds.push(backorderId);
      },
      countOpenBackordersForRequest: async () => 0,
      updateRequestStatus: async (
        _tenantId: string,
        requestId: string,
        status: string,
      ) => {
        updatedRequests.push({ requestId, status });
        return {
          id: requestId,
          request_number: 'REQ-2026-035',
          status,
        };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-stock-receipt-backorder-1',
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
      started_at: '2026-05-07T10:30:00.000Z',
    },
    () =>
      service.receiveSupplierStock({
        supplier_name: 'Crown Office Supplies',
        purchase_reference: 'PO-2026-032',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000403',
            quantity: 6,
            unit_cost: 6500,
          },
        ],
      }),
  );

  assert.deepEqual(reservedBackorders, [
    {
      requestId: '00000000-0000-0000-0000-000000000605',
      itemId: '00000000-0000-0000-0000-000000000403',
      quantity: 4,
    },
  ]);
  assert.deepEqual(resolvedBackorderIds, ['00000000-0000-0000-0000-000000000607']);
  assert.deepEqual(updatedRequests, [
    {
      requestId: '00000000-0000-0000-0000-000000000605',
      status: 'approved',
    },
  ]);
});

test('InventoryService completes a transfer and records transfer movements for the audit trail', async () => {
  const requestContext = new RequestContextService();
  const createdMovements: Array<Record<string, unknown>> = [];
  const validatedLocations: string[] = [];
  const locationTransfers: Array<{
    itemId: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }> = [];

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
      findActiveLocationByCodeOrName: async (_tenantId: string, location: string) => {
        validatedLocations.push(location);
        return {
          id: '00000000-0000-0000-0000-000000000951',
          tenant_id: 'tenant-a',
          code: location.toUpperCase(),
          name: location,
          status: 'active',
        };
      },
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        item_name: 'Cooking Oil 20L',
        sku: 'FOOD-OIL-20',
        quantity_on_hand: 14,
        reorder_level: 10,
        unit_price: 6500,
      }),
      transferItemBalance: async (
        _tenantId: string,
        itemId: string,
        fromLocation: string,
        toLocation: string,
        quantity: number,
      ) => {
        locationTransfers.push({ itemId, fromLocation, toLocation, quantity });
        return {
          source_before_quantity: 12,
          source_after_quantity: 6,
          destination_before_quantity: 2,
          destination_after_quantity: 8,
        };
      },
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
  assert.deepEqual(validatedLocations, ['Main Store', 'Boarding Kitchen']);
  assert.deepEqual(locationTransfers, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      fromLocation: 'Main Store',
      toLocation: 'Boarding Kitchen',
      quantity: 6,
    },
  ]);
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0]?.movement_type, 'transfer');
  assert.equal(createdMovements[0]?.quantity, 6);
  assert.equal(createdMovements[0]?.reference, 'TRF-2026-008');
  assert.equal(createdMovements[0]?.before_quantity, 12);
  assert.equal(createdMovements[0]?.after_quantity, 6);
  assert.equal(createdMovements[0]?.counterparty, 'Boarding Kitchen');
});

test('InventoryService cancels completed transfers by reversing location balances', async () => {
  const requestContext = new RequestContextService();
  const createdMovements: Array<Record<string, unknown>> = [];
  const locationTransfers: Array<{
    itemId: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
  }> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findTransferById: async () => ({
        id: '00000000-0000-0000-0000-000000000911',
        tenant_id: 'tenant-a',
        transfer_number: 'TRF-2026-009',
        from_location: 'Main Store',
        to_location: 'Boarding Kitchen',
        status: 'completed',
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
      findActiveLocationByCodeOrName: async (_tenantId: string, location: string) => ({
        id: '00000000-0000-0000-0000-000000000951',
        tenant_id: 'tenant-a',
        code: location.toUpperCase(),
        name: location,
        status: 'active',
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
      transferItemBalance: async (
        _tenantId: string,
        itemId: string,
        fromLocation: string,
        toLocation: string,
        quantity: number,
      ) => {
        locationTransfers.push({ itemId, fromLocation, toLocation, quantity });
        return {
          source_before_quantity: 8,
          source_after_quantity: 2,
          destination_before_quantity: 6,
          destination_after_quantity: 12,
        };
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        createdMovements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000912',
          ...input,
        };
      },
      updateTransferStatus: async () => ({
        id: '00000000-0000-0000-0000-000000000911',
        transfer_number: 'TRF-2026-009',
        status: 'cancelled',
      }),
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-transfer-cancel',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*', 'transfers:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/transfers/00000000-0000-0000-0000-000000000911/status',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.updateTransferStatus('00000000-0000-0000-0000-000000000911', {
        status: 'cancelled',
        notes: 'Transfer entered in error',
      }),
  );

  assert.equal(response.status, 'cancelled');
  assert.deepEqual(locationTransfers, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      fromLocation: 'Boarding Kitchen',
      toLocation: 'Main Store',
      quantity: 6,
    },
  ]);
  assert.equal(createdMovements[0]?.movement_type, 'transfer_reversal');
  assert.equal(createdMovements[0]?.reference, 'TRF-2026-009');
  assert.equal(createdMovements[0]?.before_quantity, 8);
  assert.equal(createdMovements[0]?.after_quantity, 2);
  assert.equal(createdMovements[0]?.department, 'Boarding Kitchen');
  assert.equal(createdMovements[0]?.counterparty, 'Main Store');
});

test('InventoryService rejects transfers that reference unmanaged locations', async () => {
  const requestContext = new RequestContextService();
  let transferWasCreated = false;

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      findActiveLocationByCodeOrName: async (_tenantId: string, location: string) =>
        location === 'Main Store'
          ? {
              id: '00000000-0000-0000-0000-000000000951',
              tenant_id: 'tenant-a',
              code: 'MAIN',
              name: 'Main Store',
              status: 'active',
            }
          : null,
      createTransfer: async () => {
        transferWasCreated = true;
        throw new Error('transfer should not be created');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-inventory-transfer-location-validation',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'storekeeper',
          session_id: 'session-1',
          permissions: ['inventory:*', 'transfers:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/inventory/transfers',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () =>
          service.createTransfer({
            from_location: 'Main Store',
            to_location: 'Unmanaged Room',
            requested_by: 'Linet Auma',
            lines: [
              {
                item_id: '00000000-0000-0000-0000-000000000401',
                item_name: 'Cooking Oil 20L',
                quantity: 2,
                unit_price: 6500,
              },
            ],
          }),
      ),
    /Destination location must be an active inventory location/,
  );
  assert.equal(transferWasCreated, false);
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

test('InventoryService creates a managed location with normalized code and default status', async () => {
  const requestContext = new RequestContextService();
  let capturedLocation: Record<string, unknown> | null = null;

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      createLocation: async (input: Record<string, unknown>) => {
        capturedLocation = input;
        return {
          id: '00000000-0000-0000-0000-000000000951',
          ...input,
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-location-1',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/locations',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.createLocation({
        code: ' main-store ',
        name: ' Main Store ',
      }),
  );

  assert.equal(response.code, 'MAIN-STORE');
  assert.equal(response.status, 'active');
  assert.deepEqual(capturedLocation, {
    tenant_id: 'tenant-a',
    code: 'MAIN-STORE',
    name: 'Main Store',
    status: 'active',
  });
});

test('InventoryService posts location stock counts and records variance adjustments', async () => {
  const requestContext = new RequestContextService();
  const movements: Array<Record<string, unknown>> = [];
  let capturedSnapshot: Record<string, unknown> | null = null;
  let capturedVariance: { itemId: string; variance: number } | null = null;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveLocationByCodeOrName: async () => ({
        id: '00000000-0000-0000-0000-000000000951',
        tenant_id: 'tenant-a',
        code: 'MAIN',
        name: 'Main Store',
        status: 'active',
      }),
      findItemById: async () => ({
        id: '00000000-0000-0000-0000-000000000401',
        tenant_id: 'tenant-a',
        item_name: 'A4 Printing Paper',
        sku: 'STAT-A4-001',
        quantity_on_hand: 30,
        reorder_level: 25,
        unit: 'ream',
        unit_price: 650,
        supplier_id: null,
        category_id: null,
        storage_location: 'Main Store',
        notes: null,
        status: 'active',
        is_archived: false,
      }),
      setItemLocationBalanceFromCount: async () => ({
        before_quantity: 10,
        after_quantity: 7,
      }),
      adjustItemStockByVariance: async (_tenantId: string, itemId: string, variance: number) => {
        capturedVariance = { itemId, variance };
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'A4 Printing Paper',
            sku: 'STAT-A4-001',
            quantity_on_hand: 27,
            reorder_level: 25,
            unit: 'ream',
            unit_price: 650,
            supplier_id: null,
            category_id: null,
            storage_location: 'Main Store',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 30,
          after_quantity: 27,
        };
      },
      recordStockMovement: async (input: Record<string, unknown>) => {
        movements.push(input);
        return {
          id: '00000000-0000-0000-0000-000000000982',
          ...input,
        };
      },
      createStockCountSnapshot: async (input: Record<string, unknown>) => {
        capturedSnapshot = input;
        return {
          id: '00000000-0000-0000-0000-000000000981',
          ...input,
        };
      },
    } as never,
  );

  const response = await requestContext.run(
    {
      request_id: 'req-inventory-stock-count-post',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/stock-counts',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.postStockCount({
        location_code: 'Main Store',
        notes: 'Cycle count before term opening',
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            counted_quantity: 7,
          },
        ],
      }),
  );

  assert.equal(response.status, 'posted');
  assert.deepEqual(capturedVariance, {
    itemId: '00000000-0000-0000-0000-000000000401',
    variance: -3,
  });
  assert.equal(movements[0]?.movement_type, 'adjustment');
  assert.equal(movements[0]?.quantity, 3);
  assert.equal(movements[0]?.before_quantity, 30);
  assert.equal(movements[0]?.after_quantity, 27);
  assert.equal(movements[0]?.department, 'Main Store');

  const snapshot = capturedSnapshot as {
    variance_count?: number;
    lines?: Array<Record<string, unknown>>;
  } | null;
  assert.equal(snapshot?.variance_count, 1);
  assert.equal(snapshot?.lines?.[0]?.expected_quantity, 10);
  assert.equal(snapshot?.lines?.[0]?.counted_quantity, 7);
  assert.equal(snapshot?.lines?.[0]?.variance_quantity, -3);
});

test('InventoryService uses an atomic decrement for department stock issues', async () => {
  const requestContext = new RequestContextService();
  const decrements: Array<{ itemId: string; quantity: number }> = [];
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
      decrementItemStock: async (_tenantId: string, itemId: string, quantity: number) => {
        decrements.push({ itemId, quantity });
        return {
          item: {
            id: itemId,
            tenant_id: 'tenant-a',
            item_name: 'A4 Printing Paper',
            sku: 'STAT-A4-001',
            quantity_on_hand: 14,
            reorder_level: 25,
            unit: 'ream',
            unit_price: 650,
            supplier_id: null,
            category_id: null,
            storage_location: 'Main Store - Shelf A2',
            notes: null,
            status: 'active',
            is_archived: false,
          },
          before_quantity: 18,
          after_quantity: 14,
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
      request_id: 'req-stock-issue-atomic',
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
        lines: [
          {
            item_id: '00000000-0000-0000-0000-000000000401',
            quantity: 4,
          },
        ],
      }),
  );

  assert.deepEqual(decrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000401',
      quantity: 4,
    },
  ]);
  assert.equal(response.lines[0]?.before_quantity, 18);
  assert.equal(response.lines[0]?.after_quantity, 14);
  assert.equal(createdMovements[0]?.before_quantity, 18);
  assert.equal(createdMovements[0]?.after_quantity, 14);
});

test('InventoryService leaves category ownership fields empty when they are not provided', async () => {
  const requestContext = new RequestContextService();
  let capturedCategory: Record<string, unknown> | null = null;

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      createCategory: async (input: Record<string, unknown>) => {
        capturedCategory = input;
        return {
          id: '00000000-0000-0000-0000-000000000932',
          ...input,
        };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-inventory-category-2',
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
        code: 'general',
        name: 'General Supplies',
      }),
  );

  const categoryInput = capturedCategory as Record<string, unknown> | null;
  assert.equal(categoryInput?.manager, null);
  assert.equal(categoryInput?.storage_zones, null);
});

test('InventoryService seeds item location balances from opening stock', async () => {
  const requestContext = new RequestContextService();
  const locationBalanceIncrements: Array<{ itemId: string; location: string; quantity: number }> = [];

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveLocationByCodeOrName: async () => ({
        id: '00000000-0000-0000-0000-000000000951',
        tenant_id: 'tenant-a',
        code: 'ICT',
        name: 'ICT Store',
        status: 'active',
      }),
      createItem: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000409',
        tenant_id: input.tenant_id,
        item_name: input.item_name,
        sku: input.sku,
        quantity_on_hand: input.quantity_on_hand,
        unit_price: input.unit_price,
        reorder_level: input.reorder_level,
        unit: input.unit,
        supplier_id: null,
        category_id: null,
        storage_location: input.storage_location,
        notes: null,
        status: 'active',
        is_archived: false,
      }),
      recordStockMovement: async (input: Record<string, unknown>) => ({
        id: '00000000-0000-0000-0000-000000000410',
        ...input,
      }),
      incrementItemLocationBalance: async (
        _tenantId: string,
        itemId: string,
        location: string,
        quantity: number,
      ) => {
        locationBalanceIncrements.push({ itemId, location, quantity });
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-inventory-opening-balance',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/items',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.createItem({
        item_name: 'Printer Toner',
        sku: 'ICT-TONER-001',
        unit: 'piece',
        quantity: 8,
        unit_price: 4200,
        reorder_level: 2,
        storage_location: 'ICT Store',
      }),
  );

  assert.deepEqual(locationBalanceIncrements, [
    {
      itemId: '00000000-0000-0000-0000-000000000409',
      location: 'ICT Store',
      quantity: 8,
    },
  ]);
});

test('InventoryService rejects unmanaged item storage locations before item creation', async () => {
  const requestContext = new RequestContextService();
  let itemWasCreated = false;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveLocationByCodeOrName: async () => null,
      createItem: async () => {
        itemWasCreated = true;
        throw new Error('item should not be created');
      },
      recordStockMovement: async () => {
        throw new Error('opening movement should not be recorded');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-inventory-item-storage-location',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'storekeeper',
          session_id: 'session-1',
          permissions: ['inventory:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/inventory/items',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () =>
          service.createItem({
            item_name: 'Printer Toner',
            sku: 'ICT-TONER-002',
            unit: 'piece',
            quantity: 8,
            unit_price: 4200,
            reorder_level: 2,
            storage_location: 'Unmanaged Store',
          }),
      ),
    /Storage location must be an active inventory location/,
  );
  assert.equal(itemWasCreated, false);
});

test('InventoryService rejects blank inventory item identity fields before persistence', async () => {
  const requestContext = new RequestContextService();
  let itemWasCreated = false;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      createItem: async () => {
        itemWasCreated = true;
        throw new Error('item should not be created');
      },
      recordStockMovement: async () => {
        throw new Error('opening movement should not be recorded');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-inventory-item-blank',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'storekeeper',
          session_id: 'session-1',
          permissions: ['inventory:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'POST',
          path: '/inventory/items',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () =>
          service.createItem({
            item_name: '   ',
            sku: 'ITEM-001',
            unit: 'unit',
            quantity: 0,
            unit_price: 0,
            reorder_level: 0,
          }),
      ),
    /Item name is required/,
  );
  assert.equal(itemWasCreated, false);
});

test('InventoryService item updates preserve omitted optional fields instead of clearing them', async () => {
  const requestContext = new RequestContextService();
  let capturedUpdate: Record<string, unknown> | null = null;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      updateItem: async (_tenantId: string, itemId: string, input: Record<string, unknown>) => {
        capturedUpdate = input;
        return {
          id: itemId,
          ...input,
        };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-inventory-item-update',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'PATCH',
      path: '/inventory/items/00000000-0000-0000-0000-000000000401',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.updateItem('00000000-0000-0000-0000-000000000401', {
        item_name: '  Updated paper  ',
      }),
  );

  const updateInput = capturedUpdate as Record<string, unknown> | null;
  assert.equal(updateInput?.item_name, 'Updated paper');
  assert.equal(updateInput?.category_id, undefined);
  assert.equal(updateInput?.supplier_id, undefined);
  assert.equal(updateInput?.storage_location, undefined);
  assert.equal(updateInput?.notes, undefined);
});

test('InventoryService rejects unmanaged storage locations before item updates', async () => {
  const requestContext = new RequestContextService();
  let itemWasUpdated = false;

  const service = new InventoryService(
    requestContext,
    {
      withRequestTransaction: async <T>(callback: () => Promise<T>): Promise<T> => callback(),
    } as never,
    {
      findActiveLocationByCodeOrName: async () => null,
      updateItem: async () => {
        itemWasUpdated = true;
        throw new Error('item should not be updated');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-inventory-item-update-storage-location',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'storekeeper',
          session_id: 'session-1',
          permissions: ['inventory:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'PATCH',
          path: '/inventory/items/00000000-0000-0000-0000-000000000401',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () =>
          service.updateItem('00000000-0000-0000-0000-000000000401', {
            storage_location: 'Unmanaged Store',
          }),
      ),
    /Storage location must be an active inventory location/,
  );
  assert.equal(itemWasUpdated, false);
});

test('InventoryService does not invent a supplier county when it is not provided', async () => {
  const requestContext = new RequestContextService();
  let capturedSupplier: Record<string, unknown> | null = null;

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      createSupplier: async (input: Record<string, unknown>) => {
        capturedSupplier = input;
        return {
          id: '00000000-0000-0000-0000-000000000942',
          ...input,
        };
      },
    } as never,
  );

  await requestContext.run(
    {
      request_id: 'req-inventory-supplier-empty-county',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['procurement:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'POST',
      path: '/inventory/suppliers',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () =>
      service.createSupplier({
        supplier_name: 'Registered Supplier',
      }),
  );

  const supplierInput = capturedSupplier as Record<string, unknown> | null;
  assert.equal(supplierInput?.supplier_name, 'Registered Supplier');
  assert.equal(supplierInput?.county, null);
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

test('InventoryService exports stock valuation as a server-side CSV artifact with checksum', async () => {
  const requestContext = new RequestContextService();
  let tenantUsed: string | null = null;

  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      buildReports: async (tenantId: string) => {
        tenantUsed = tenantId;
        return {
          stock_valuation: [
            {
              item_name: 'A4 "Premium", Paper',
              sku: 'A4,001',
              quantity_on_hand: 30,
              unit_price: 650,
              total_value: 19500,
            },
          ],
          low_stock_report: [],
          movement_history: [],
          supplier_purchases: [],
          stock_reconciliation: [],
        };
      },
    } as never,
  );

  const artifact = await requestContext.run(
    {
      request_id: 'req-inventory-report-export',
      tenant_id: 'tenant-a',
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'storekeeper',
      session_id: 'session-1',
      permissions: ['inventory:*'],
      is_authenticated: true,
      client_ip: '127.0.0.1',
      user_agent: 'test-suite',
      method: 'GET',
      path: '/inventory/reports/stock-valuation/export',
      started_at: '2026-05-04T00:00:00.000Z',
    },
    () => service.exportReportCsv('stock-valuation'),
  );

  assert.equal(tenantUsed, 'tenant-a');
  assert.equal(artifact.report_id, 'stock-valuation');
  assert.equal(artifact.filename, 'inventory-stock-valuation.csv');
  assert.equal(artifact.content_type, 'text/csv; charset=utf-8');
  assert.equal(artifact.row_count, 1);
  assert.equal(
    artifact.csv,
    'Item,SKU,Quantity,Unit Price,Total Value\r\n"A4 ""Premium"", Paper","A4,001",30,650,19500\r\n',
  );
  assert.equal(
    artifact.checksum_sha256,
    createHash('sha256').update(artifact.csv).digest('hex'),
  );
});

test('InventoryService rejects unknown server-side report exports', async () => {
  const requestContext = new RequestContextService();
  const service = new InventoryService(
    requestContext,
    {} as never,
    {
      buildReports: async () => {
        throw new Error('reports should not be loaded for an unknown export');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      requestContext.run(
        {
          request_id: 'req-inventory-report-export-missing',
          tenant_id: 'tenant-a',
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'storekeeper',
          session_id: 'session-1',
          permissions: ['inventory:*'],
          is_authenticated: true,
          client_ip: '127.0.0.1',
          user_agent: 'test-suite',
          method: 'GET',
          path: '/inventory/reports/unknown/export',
          started_at: '2026-05-04T00:00:00.000Z',
        },
        () => service.exportReportCsv('unknown'),
      ),
    /Unknown inventory report export/,
  );
});
