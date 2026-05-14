import assert from 'node:assert/strict';
import test from 'node:test';

import { InventorySchemaService } from '../inventory-schema.service';
import { InventoryRepository } from './inventory.repository';

test('InventoryRepository keeps missing supplier county empty instead of applying a hardcoded default', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000942',
            supplier_name: 'Registered Supplier',
            contact_person: null,
            email: null,
            phone: null,
            county: null,
            last_delivery_at: null,
            status: 'active',
          },
        ],
      };
    },
  } as never);

  const suppliers = await repository.listSuppliers('tenant-a');

  assert.equal(suppliers[0]?.county, null);
  assert.equal(queries[0]?.text.includes("'Nairobi'"), false);
});

test('InventoryRepository accepts null supplier county during creation', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000943',
            supplier_name: values[1],
            contact_person: values[2],
            email: values[3],
            phone: values[4],
            county: values[5],
            last_delivery_at: null,
            status: values[6],
          },
        ],
      };
    },
  } as never);

  const supplier = await repository.createSupplier({
    tenant_id: 'tenant-a',
    supplier_name: 'Registered Supplier',
    contact_person: null,
    email: null,
    phone: null,
    county: null,
    status: 'active',
  });

  assert.equal(supplier.county, null);
  assert.equal(queries[0]?.values[5], null);
});

test('InventoryRepository locks purchase orders before stock receipt', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.findPurchaseOrderByIdForUpdate(
    'tenant-a',
    '00000000-0000-0000-0000-000000000501',
  );

  assert.match(queries[0]?.text ?? '', /FOR UPDATE/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000501',
  ]);
});

test('InventoryRepository increments item stock with before and after audit quantities', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.incrementItemStock(
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    30,
  );

  const incrementQuery = queries[0]?.text ?? '';
  assert.match(incrementQuery, /FOR UPDATE/);
  assert.match(incrementQuery, /item\.quantity_on_hand \+ \$3/);
  assert.match(incrementQuery, /locked_item\.before_quantity/);
  assert.match(incrementQuery, /item\.quantity_on_hand AS after_quantity/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    30,
  ]);
});

test('InventoryRepository increments supplier receipts atomically with cost updates', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.incrementItemStockWithCost(
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    12,
    690,
    '00000000-0000-0000-0000-000000000801',
  );

  const receiptQuery = queries[0]?.text ?? '';
  assert.match(receiptQuery, /FOR UPDATE/);
  assert.match(receiptQuery, /item\.quantity_on_hand \+ \$3/);
  assert.match(receiptQuery, /unit_price = \$4/);
  assert.match(receiptQuery, /supplier_id = COALESCE\(\$5::uuid, item\.supplier_id\)/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    12,
    690,
    '00000000-0000-0000-0000-000000000801',
  ]);
});

test('InventoryRepository increments item location balances with an upsert', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.incrementItemLocationBalance(
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    'Main Store',
    12,
  );

  const balanceQuery = queries[0]?.text ?? '';
  assert.match(balanceQuery, /INSERT INTO inventory_item_balances/);
  assert.match(balanceQuery, /ON CONFLICT \(tenant_id, item_id, location_code\)/);
  assert.match(balanceQuery, /quantity_on_hand = inventory_item_balances\.quantity_on_hand \+ EXCLUDED\.quantity_on_hand/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    'Main Store',
    12,
  ]);
});

test('InventoryRepository lists and creates managed inventory locations', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });

      if (text.includes('INSERT INTO inventory_locations')) {
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000951',
              tenant_id: values[0],
              code: values[1],
              name: values[2],
              status: values[3],
            },
          ],
        };
      }

      return {
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000952',
            tenant_id: 'tenant-a',
            code: 'MAIN-STORE',
            name: 'Main Store',
            status: 'active',
          },
        ],
      };
    },
  } as never);

  const locations = await repository.listLocations('tenant-a');
  const created = await repository.createLocation({
    tenant_id: 'tenant-a',
    code: 'MAIN-STORE',
    name: 'Main Store',
    status: 'active',
  });

  assert.match(queries[0]?.text ?? '', /FROM inventory_locations/);
  assert.match(queries[0]?.text ?? '', /ORDER BY name ASC, code ASC/);
  assert.deepEqual(queries[0]?.values, ['tenant-a']);
  assert.equal(locations[0]?.code, 'MAIN-STORE');
  assert.match(queries[1]?.text ?? '', /INSERT INTO inventory_locations/);
  assert.deepEqual(queries[1]?.values, [
    'tenant-a',
    'MAIN-STORE',
    'Main Store',
    'active',
  ]);
  assert.equal(created.status, 'active');
});

test('InventoryRepository updates managed inventory locations by tenant', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: values[1],
            tenant_id: values[0],
            code: values[2],
            name: values[3],
            status: values[4],
          },
        ],
      };
    },
  } as never);

  const updated = await repository.updateLocation(
    'tenant-a',
    '00000000-0000-0000-0000-000000000951',
    {
      code: 'SCI-LAB',
      name: 'Science Lab Store',
      status: 'inactive',
    },
  );

  const updateQuery = queries[0]?.text ?? '';
  assert.match(updateQuery, /UPDATE inventory_locations/);
  assert.match(updateQuery, /WHERE tenant_id = \$1/);
  assert.match(updateQuery, /AND id = \$2::uuid/);
  assert.match(updateQuery, /updated_at = NOW\(\)/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000951',
    'SCI-LAB',
    'Science Lab Store',
    'inactive',
  ]);
  assert.equal(updated?.code, 'SCI-LAB');
});

test('InventoryRepository finds active managed locations by code or name', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000951',
            tenant_id: values[0],
            code: 'MAIN-STORE',
            name: 'Main Store',
            status: 'active',
          },
        ],
      };
    },
  } as never);

  const location = await repository.findActiveLocationByCodeOrName('tenant-a', ' main-store ');

  const lookupQuery = queries[0]?.text ?? '';
  assert.match(lookupQuery, /FROM inventory_locations/);
  assert.match(lookupQuery, /status = 'active'/);
  assert.match(lookupQuery, /code = \$2/);
  assert.match(lookupQuery, /name = \$3/);
  assert.deepEqual(queries[0]?.values, ['tenant-a', 'MAIN-STORE', 'main-store']);
  assert.equal(location?.code, 'MAIN-STORE');
});

test('InventoryRepository locks inventory requests before fulfillment', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.findRequestByIdForUpdate(
    'tenant-a',
    '00000000-0000-0000-0000-000000000601',
  );

  assert.match(queries[0]?.text ?? '', /FOR UPDATE/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000601',
  ]);
});

test('InventoryRepository transfers item balances between locations with row locks', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.transferItemBalance(
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    'Main Store',
    'Boarding Kitchen',
    6,
  );

  const transferQuery = queries[0]?.text ?? '';
  assert.match(transferQuery, /inventory_item_balances/);
  assert.match(transferQuery, /FOR UPDATE/);
  assert.match(transferQuery, /quantity_on_hand >= \$5/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    'Main Store',
    'Boarding Kitchen',
    6,
  ]);
});

test('InventoryRepository reserves request stock against available quantity', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.reserveRequestLine(
    'tenant-a',
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000401',
    5,
    '00000000-0000-0000-0000-000000000001',
  );

  const reserveQuery = queries[0]?.text ?? '';
  assert.match(reserveQuery, /FROM inventory_items/);
  assert.match(reserveQuery, /FOR UPDATE/);
  assert.match(reserveQuery, /inventory_reservations/);
  assert.match(reserveQuery, /available_quantity >= \$4/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000401',
    5,
    '00000000-0000-0000-0000-000000000001',
  ]);
});

test('InventoryRepository lists reserved request lines for fulfillment with row locks', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.listReservedRequestLinesForUpdate(
    'tenant-a',
    '00000000-0000-0000-0000-000000000603',
  );

  const reserveQuery = queries[0]?.text ?? '';
  assert.match(reserveQuery, /FROM inventory_reservations reservation/);
  assert.match(reserveQuery, /JOIN inventory_items item/);
  assert.match(reserveQuery, /reservation\.status = 'reserved'/);
  assert.match(reserveQuery, /FOR UPDATE OF reservation/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000603',
  ]);
});

test('InventoryRepository records request backorders as tenant-scoped request lines', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.recordRequestBackorder(
    'tenant-a',
    '00000000-0000-0000-0000-000000000605',
    '00000000-0000-0000-0000-000000000403',
    4,
    0,
  );

  const backorderQuery = queries[0]?.text ?? '';
  assert.match(backorderQuery, /inventory_request_backorders/);
  assert.match(backorderQuery, /ON CONFLICT/);
  assert.match(backorderQuery, /backordered_quantity/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000605',
    '00000000-0000-0000-0000-000000000403',
    4,
    0,
  ]);
});

test('InventoryRepository locks open request backorders for stock receipt resolution', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.listOpenRequestBackordersForItem(
    'tenant-a',
    '00000000-0000-0000-0000-000000000403',
  );

  const backorderQuery = queries[0]?.text ?? '';
  assert.match(backorderQuery, /inventory_request_backorders/);
  assert.match(backorderQuery, /status = 'open'/);
  assert.match(backorderQuery, /FOR UPDATE/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000403',
  ]);
});

test('InventoryRepository marks request backorders resolved and counts remaining open lines', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [{ open_backorders: '0' }] };
    },
  } as never);

  await repository.markRequestBackorderResolved(
    'tenant-a',
    '00000000-0000-0000-0000-000000000607',
  );
  const openBackorders = await repository.countOpenBackordersForRequest(
    'tenant-a',
    '00000000-0000-0000-0000-000000000605',
  );

  assert.match(queries[0]?.text ?? '', /status = 'resolved'/);
  assert.match(queries[0]?.text ?? '', /resolved_at = NOW\(\)/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000607',
  ]);
  assert.match(queries[1]?.text ?? '', /COUNT\(\*\)::text AS open_backorders/);
  assert.deepEqual(queries[1]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000605',
  ]);
  assert.equal(openBackorders, 0);
});

test('InventoryRepository records the approver when request approval status is set', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.updateRequestStatus(
    'tenant-a',
    '00000000-0000-0000-0000-000000000603',
    'approved',
    'Approved for mock exams',
    '00000000-0000-0000-0000-000000000001',
  );

  const statusQuery = queries[0]?.text ?? '';
  assert.match(statusQuery, /approved_by_user_id = CASE/);
  assert.match(statusQuery, /\$3 IN \('approved', 'backordered'\)/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000603',
    'approved',
    'Approved for mock exams',
    '00000000-0000-0000-0000-000000000001',
  ]);
});

test('InventoryRepository sets item stock from posted stock counts with row locks', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.setItemStockFromCount(
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    18,
  );

  const countQuery = queries[0]?.text ?? '';
  assert.match(countQuery, /FOR UPDATE/);
  assert.match(countQuery, /quantity_on_hand = \$3/);
  assert.match(countQuery, /locked_item\.before_quantity/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    18,
  ]);
});

test('InventoryRepository sets item location balances from posted stock counts with an upsert', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return { rows: [] };
    },
  } as never);

  await repository.setItemLocationBalanceFromCount(
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    'Main Store',
    7,
  );

  const balanceQuery = queries[0]?.text ?? '';
  assert.match(balanceQuery, /inventory_item_balances/);
  assert.match(balanceQuery, /FOR UPDATE/);
  assert.match(balanceQuery, /ON CONFLICT \(tenant_id, item_id, location_code\)/);
  assert.match(balanceQuery, /quantity_on_hand = EXCLUDED\.quantity_on_hand/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    '00000000-0000-0000-0000-000000000401',
    'Main Store',
    7,
  ]);
});

test('InventoryRepository creates posted stock count snapshots', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      return {
        rows: [
          {
            id: '00000000-0000-0000-0000-000000000981',
            tenant_id: values[0],
            snapshot_number: values[1],
            location_code: values[2],
            counted_at: values[3],
            counted_by_user_id: values[4],
            status: values[5],
            lines: values[6],
            variance_count: values[7],
            notes: values[8],
          },
        ],
      };
    },
  } as never);

  const snapshot = await repository.createStockCountSnapshot({
    tenant_id: 'tenant-a',
    snapshot_number: 'CNT-20260513-00001',
    location_code: 'Main Store',
    counted_at: null,
    counted_by_user_id: '00000000-0000-0000-0000-000000000001',
    status: 'posted',
    lines: [
      {
        item_id: '00000000-0000-0000-0000-000000000401',
        counted_quantity: 7,
      },
    ],
    variance_count: 1,
    notes: 'Cycle count',
  });

  const snapshotQuery = queries[0]?.text ?? '';
  assert.match(snapshotQuery, /INSERT INTO inventory_stock_count_snapshots/);
  assert.match(snapshotQuery, /VALUES \(\$1, \$2, \$3, COALESCE\(\$4::timestamptz, NOW\(\)\), \$5::uuid, \$6, \$7::jsonb, \$8, \$9\)/);
  assert.deepEqual(queries[0]?.values, [
    'tenant-a',
    'CNT-20260513-00001',
    'Main Store',
    null,
    '00000000-0000-0000-0000-000000000001',
    'posted',
    JSON.stringify([
      {
        item_id: '00000000-0000-0000-0000-000000000401',
        counted_quantity: 7,
      },
    ]),
    1,
    'Cycle count',
  ]);
  assert.equal(snapshot.status, 'posted');
});

test('InventoryRepository builds stock reconciliation from item and location balances', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = new InventoryRepository({
    query: async (text: string, values: unknown[]) => {
      queries.push({ text, values });

      if (text.includes('inventory_item_balances')) {
        return {
          rows: [
            {
              item_id: '00000000-0000-0000-0000-000000000401',
              item_name: 'A4 Printing Paper',
              sku: 'STAT-A4-001',
              item_quantity_on_hand: 30,
              location_quantity_on_hand: 28,
              variance_quantity: 2,
              status: 'variance',
            },
          ],
        };
      }

      return { rows: [] };
    },
  } as never);

  const reports = await repository.buildReports('tenant-a');
  const reconciliationQuery = queries.find((query) => query.text.includes('inventory_item_balances'));

  assert.ok(reconciliationQuery);
  assert.match(reconciliationQuery.text, /SUM\(balance\.quantity_on_hand\)/);
  assert.match(reconciliationQuery.text, /variance_quantity/);
  assert.deepEqual(reconciliationQuery.values, ['tenant-a']);
  assert.deepEqual(reports.stock_reconciliation, [
    {
      item_id: '00000000-0000-0000-0000-000000000401',
      item_name: 'A4 Printing Paper',
      sku: 'STAT-A4-001',
      item_quantity_on_hand: 30,
      location_quantity_on_hand: 28,
      variance_quantity: 2,
      status: 'variance',
    },
  ]);
});

test('InventorySchemaService makes stock movements append-only', async () => {
  let schemaSql = '';
  const service = new InventorySchemaService({
    runSchemaBootstrap: async (sql: string) => {
      schemaSql += sql;
    },
  } as never);

  await service.onModuleInit();

  assert.match(schemaSql, /CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation\(\)/);
  assert.match(schemaSql, /DROP TRIGGER IF EXISTS trg_inventory_movements_prevent_mutation ON inventory_stock_movements/);
  assert.match(schemaSql, /BEFORE UPDATE OR DELETE ON inventory_stock_movements/);
  assert.match(schemaSql, /EXECUTE FUNCTION prevent_inventory_movement_mutation\(\)/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS inventory_locations/);
  assert.match(schemaSql, /CREATE POLICY inventory_locations_rls_policy ON inventory_locations/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS inventory_reservations/);
  assert.match(schemaSql, /CREATE POLICY inventory_reservations_rls_policy ON inventory_reservations/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS inventory_item_balances/);
  assert.match(schemaSql, /CREATE POLICY inventory_item_balances_rls_policy ON inventory_item_balances/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS inventory_request_backorders/);
  assert.match(schemaSql, /CREATE POLICY inventory_request_backorders_rls_policy ON inventory_request_backorders/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS inventory_stock_count_snapshots/);
  assert.match(schemaSql, /CREATE POLICY inventory_stock_count_snapshots_rls_policy ON inventory_stock_count_snapshots/);
  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_inventory_items_search_vector/);
  assert.match(schemaSql, /ON inventory_items\s+USING GIN/);
  assert.match(schemaSql, /item_name/);
  assert.match(schemaSql, /storage_location/);
  assert.match(schemaSql, /CREATE INDEX IF NOT EXISTS ix_inventory_suppliers_search_vector/);
  assert.match(schemaSql, /ON inventory_suppliers\s+USING GIN/);
  assert.match(schemaSql, /supplier_name/);
  assert.match(schemaSql, /contact_person/);
  assert.doesNotMatch(schemaSql, /attendance/i);
});
