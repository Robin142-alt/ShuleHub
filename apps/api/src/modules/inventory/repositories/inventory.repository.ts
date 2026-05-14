import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';

export interface InventoryItemRecord {
  id: string;
  tenant_id: string;
  item_name: string;
  sku: string;
  category_id: string | null;
  category_name?: string | null;
  unit: string;
  quantity_on_hand: number;
  unit_price: number;
  reorder_level: number;
  supplier_id: string | null;
  supplier_name?: string | null;
  storage_location: string | null;
  notes: string | null;
  status: string;
  is_archived: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface InventoryStockMovementRecord {
  id?: string;
  tenant_id: string;
  item_id: string;
  item_name?: string | null;
  movement_type: string;
  quantity: number;
  unit_cost?: number | null;
  reference?: string | null;
  before_quantity?: number | null;
  after_quantity?: number | null;
  department?: string | null;
  counterparty?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  submission_id?: string | null;
  actor_user_id?: string | null;
  notes?: string | null;
  occurred_at?: Date;
  created_at?: Date;
}

export interface InventoryStockMutationRecord {
  item: InventoryItemRecord;
  before_quantity: number;
  after_quantity: number;
}

export interface InventoryLocationTransferRecord {
  source_before_quantity: number;
  source_after_quantity: number;
  destination_before_quantity: number;
  destination_after_quantity: number;
}

export interface InventoryLocationBalanceMutationRecord {
  before_quantity: number;
  after_quantity: number;
}

export interface InventoryPurchaseOrderRecord {
  id: string;
  tenant_id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  requested_by_display_name?: string | null;
  status: string;
  expected_delivery_date: string | null;
  ordered_at: string | null;
  received_at: string | null;
  total_amount: number;
  lines: Array<Record<string, unknown>>;
  notes: string | null;
}

export interface InventoryCategoryRecord {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  manager: string | null;
  storage_zones: string | null;
  description: string | null;
}

export interface InventoryLocationRecord {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface InventorySupplierRecord {
  id: string;
  supplier_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  county: string | null;
  last_delivery_at: string | null;
  status: string;
}

export interface InventoryTransferRecord {
  id: string;
  transfer_number: string;
  from_location: string;
  to_location: string;
  status: string;
  requested_by: string;
  lines: Array<Record<string, unknown>>;
  notes: string | null;
}

export interface InventoryRequestRecord {
  id: string;
  request_number: string;
  department: string;
  requested_by: string;
  status: string;
  needed_by?: string | null;
  priority?: string | null;
  lines: Array<Record<string, unknown>>;
  notes: string | null;
}

export interface InventoryReservationRecord {
  id: string;
  tenant_id: string;
  request_id: string;
  item_id: string;
  quantity: number;
  status: string;
  reserved_by_user_id?: string | null;
  reserved_at?: Date;
  fulfilled_at?: Date | null;
  cancelled_at?: Date | null;
}

export interface InventoryReservedRequestLineRecord {
  reservation_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
}

export interface InventoryRequestBackorderRecord {
  id: string;
  tenant_id: string;
  request_id: string;
  item_id: string;
  requested_quantity: number;
  reserved_quantity: number;
  backordered_quantity: number;
  status: string;
  resolved_at?: Date | null;
}

export interface InventoryStockCountSnapshotRecord {
  id: string;
  tenant_id: string;
  snapshot_number: string;
  location_code: string | null;
  counted_at: Date | string;
  counted_by_user_id: string | null;
  status: string;
  lines: Array<Record<string, unknown>>;
  variance_count: number;
  notes: string | null;
}

interface InventoryRow {
  id: string;
  tenant_id: string;
  item_name: string;
  sku: string;
  category_id: string | null;
  category_name?: string | null;
  unit: string;
  quantity_on_hand: number;
  unit_price: string | number;
  reorder_level: number;
  supplier_id: string | null;
  supplier_name?: string | null;
  storage_location: string | null;
  notes: string | null;
  status: string;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class InventoryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async buildSummary(tenantId: string) {
    const [valuationResult, lowStockResult, requestsResult, purchasesResult, movementResult, purchaseActivityResult, alertsResult, approvalsResult, categoryBreakdownResult] =
      await Promise.all([
        this.databaseService.query<{ total_value: string }>(
          `
            SELECT COALESCE(SUM(quantity_on_hand * unit_price), 0)::text AS total_value
            FROM inventory_items
            WHERE tenant_id = $1
              AND is_archived = FALSE
          `,
          [tenantId],
        ),
        this.databaseService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM inventory_items
            WHERE tenant_id = $1
              AND is_archived = FALSE
              AND quantity_on_hand <= reorder_level
          `,
          [tenantId],
        ),
        this.databaseService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM inventory_requests
            WHERE tenant_id = $1
              AND status IN ('pending', 'approved')
          `,
          [tenantId],
        ),
        this.databaseService.query<{ total: string }>(
          `
            SELECT COUNT(*)::text AS total
            FROM inventory_purchase_orders
            WHERE tenant_id = $1
              AND ordered_at >= NOW() - INTERVAL '30 days'
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              movement.id,
              item.item_name,
              movement.movement_type,
              movement.quantity,
              movement.reference,
              movement.notes,
              actor.display_name AS actor_display_name,
              movement.occurred_at
            FROM inventory_stock_movements movement
            JOIN inventory_items item
              ON item.tenant_id = movement.tenant_id
             AND item.id = movement.item_id
            LEFT JOIN users actor
              ON actor.tenant_id = movement.tenant_id
             AND actor.id = movement.actor_user_id
            WHERE movement.tenant_id = $1
            ORDER BY movement.occurred_at DESC
            LIMIT 6
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              po.id,
              po.po_number,
              supplier.supplier_name,
              po.status,
              po.total_amount,
              po.ordered_at
            FROM inventory_purchase_orders po
            LEFT JOIN inventory_suppliers supplier
              ON supplier.tenant_id = po.tenant_id
             AND supplier.id = po.supplier_id
            WHERE po.tenant_id = $1
            ORDER BY COALESCE(po.ordered_at::timestamptz, po.created_at) DESC
            LIMIT 5
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT item_name, sku, quantity_on_hand, reorder_level
            FROM inventory_items
            WHERE tenant_id = $1
              AND is_archived = FALSE
              AND quantity_on_hand <= reorder_level
            ORDER BY quantity_on_hand ASC, item_name ASC
            LIMIT 6
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT request_number, department, status, priority
            FROM inventory_requests
            WHERE tenant_id = $1
              AND status IN ('pending', 'approved')
            ORDER BY created_at DESC
            LIMIT 6
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              COALESCE(category.name, 'Uncategorized') AS category_name,
              COUNT(*)::int AS item_count,
              COALESCE(SUM(item.quantity_on_hand * item.unit_price), 0)::text AS total_value
            FROM inventory_items item
            LEFT JOIN inventory_categories category
              ON category.tenant_id = item.tenant_id
             AND category.id = item.category_id
            WHERE item.tenant_id = $1
              AND item.is_archived = FALSE
            GROUP BY COALESCE(category.name, 'Uncategorized')
            ORDER BY item_count DESC, category_name ASC
          `,
          [tenantId],
        ),
      ]);

    return {
      total_inventory_value: Number(valuationResult.rows[0]?.total_value ?? '0'),
      low_stock_items: Number(lowStockResult.rows[0]?.total ?? '0'),
      pending_requests: Number(requestsResult.rows[0]?.total ?? '0'),
      recent_purchases: Number(purchasesResult.rows[0]?.total ?? '0'),
      recent_stock_movement: movementResult.rows,
      purchase_activity: purchaseActivityResult.rows,
      low_stock_alerts: alertsResult.rows,
      pending_approvals: approvalsResult.rows,
      category_breakdown: categoryBreakdownResult.rows.map((row) => ({
        category_name: row.category_name,
        item_count: row.item_count,
        total_value: Number(row.total_value),
      })),
    };
  }

  async listItems(
    tenantId: string,
    options: { search?: string; status?: string; limit: number; offset: number },
  ): Promise<InventoryItemRecord[]> {
    const conditions = ['item.tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.search) {
      conditions.push(
        `(item.item_name ILIKE $${parameterIndex} OR item.sku ILIKE $${parameterIndex})`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    if (options.status) {
      conditions.push(`item.status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    values.push(options.limit);
    values.push(options.offset);

    const result = await this.databaseService.query<InventoryRow>(
      `
        SELECT
          item.id,
          item.tenant_id,
          item.item_name,
          item.sku,
          item.category_id,
          category.name AS category_name,
          item.unit,
          item.quantity_on_hand,
          item.unit_price,
          item.reorder_level,
          item.supplier_id,
          supplier.supplier_name,
          item.storage_location,
          item.notes,
          item.status,
          item.is_archived,
          item.created_at,
          item.updated_at
        FROM inventory_items item
        LEFT JOIN inventory_categories category
          ON category.tenant_id = item.tenant_id
         AND category.id = item.category_id
        LEFT JOIN inventory_suppliers supplier
          ON supplier.tenant_id = item.tenant_id
         AND supplier.id = item.supplier_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY item.updated_at DESC, item.item_name ASC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      values,
    );

    return result.rows.map((row) => this.mapItem(row));
  }

  async createItem(input: {
    tenant_id: string;
    item_name: string;
    sku: string;
    category_id: string | null;
    unit: string;
    quantity_on_hand: number;
    supplier_id: string | null;
    unit_price: number;
    reorder_level: number;
    storage_location: string | null;
    notes: string | null;
    status: string;
  }): Promise<InventoryItemRecord> {
    const result = await this.databaseService.query<InventoryRow>(
      `
        INSERT INTO inventory_items (
          tenant_id,
          item_name,
          sku,
          category_id,
          unit,
          quantity_on_hand,
          supplier_id,
          unit_price,
          reorder_level,
          storage_location,
          notes,
          status
        )
        VALUES ($1, $2, $3, $4::uuid, $5, $6, $7::uuid, $8, $9, $10, $11, $12)
        RETURNING
          id,
          tenant_id,
          item_name,
          sku,
          category_id,
          unit,
          quantity_on_hand,
          unit_price,
          reorder_level,
          supplier_id,
          storage_location,
          notes,
          status,
          is_archived,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.item_name,
        input.sku,
        input.category_id,
        input.unit,
        input.quantity_on_hand,
        input.supplier_id,
        input.unit_price,
        input.reorder_level,
        input.storage_location,
        input.notes,
        input.status,
      ],
    );

    return this.mapItem(result.rows[0]);
  }

  async updateItem(
    tenantId: string,
    itemId: string,
    input: Partial<{
      item_name: string;
      sku: string;
      category_id: string | null;
      unit: string;
      supplier_id: string | null;
      unit_price: number;
      reorder_level: number;
      storage_location: string | null;
      notes: string | null;
      status: string;
      is_archived: boolean;
    }>,
  ): Promise<InventoryItemRecord | null> {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, itemId];
    let parameterIndex = 3;

    const setField = (column: string, value: unknown, cast?: string) => {
      assignments.push(`${column} = $${parameterIndex}${cast ? `::${cast}` : ''}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.item_name !== undefined) setField('item_name', input.item_name);
    if (input.sku !== undefined) setField('sku', input.sku);
    if (input.category_id !== undefined) setField('category_id', input.category_id, 'uuid');
    if (input.unit !== undefined) setField('unit', input.unit);
    if (input.supplier_id !== undefined) setField('supplier_id', input.supplier_id, 'uuid');
    if (input.unit_price !== undefined) setField('unit_price', input.unit_price);
    if (input.reorder_level !== undefined) setField('reorder_level', input.reorder_level);
    if (input.storage_location !== undefined) setField('storage_location', input.storage_location);
    if (input.notes !== undefined) setField('notes', input.notes);
    if (input.status !== undefined) setField('status', input.status);
    if (input.is_archived !== undefined) setField('is_archived', input.is_archived);

    if (assignments.length === 0) {
      return this.findItemById(tenantId, itemId);
    }

    assignments.push('updated_at = NOW()');

    const result = await this.databaseService.query<InventoryRow>(
      `
        UPDATE inventory_items
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          item_name,
          sku,
          category_id,
          unit,
          quantity_on_hand,
          unit_price,
          reorder_level,
          supplier_id,
          storage_location,
          notes,
          status,
          is_archived,
          created_at,
          updated_at
      `,
      values,
    );

    return result.rows[0] ? this.mapItem(result.rows[0]) : null;
  }

  async findItemById(tenantId: string, itemId: string): Promise<InventoryItemRecord | null> {
    const result = await this.databaseService.query<InventoryRow>(
      `
        SELECT
          id,
          tenant_id,
          item_name,
          sku,
          category_id,
          unit,
          quantity_on_hand,
          unit_price,
          reorder_level,
          supplier_id,
          storage_location,
          notes,
          status,
          is_archived,
          created_at,
          updated_at
        FROM inventory_items
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, itemId],
    );

    return result.rows[0] ? this.mapItem(result.rows[0]) : null;
  }

  async updateItemStock(
    tenantId: string,
    itemId: string,
    nextQuantity: number,
  ): Promise<InventoryItemRecord | null> {
    const result = await this.databaseService.query<InventoryRow>(
      `
        UPDATE inventory_items
        SET quantity_on_hand = $3,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          item_name,
          sku,
          category_id,
          unit,
          quantity_on_hand,
          unit_price,
          reorder_level,
          supplier_id,
          storage_location,
          notes,
          status,
          is_archived,
          created_at,
          updated_at
      `,
      [tenantId, itemId, nextQuantity],
    );

    return result.rows[0] ? this.mapItem(result.rows[0]) : null;
  }

  async setItemStockFromCount(
    tenantId: string,
    itemId: string,
    countedQuantity: number,
  ): Promise<InventoryStockMutationRecord | null> {
    const result = await this.databaseService.query<InventoryRow & {
      before_quantity: number;
      after_quantity: number;
    }>(
      `
        WITH locked_item AS (
          SELECT
            id,
            quantity_on_hand AS before_quantity
          FROM inventory_items
          WHERE tenant_id = $1
            AND id = $2::uuid
          FOR UPDATE
        ),
        updated_item AS (
          UPDATE inventory_items AS item
          SET quantity_on_hand = $3,
              updated_at = NOW()
          FROM locked_item
          WHERE item.tenant_id = $1
            AND item.id = locked_item.id
          RETURNING
            item.id,
            item.tenant_id,
            item.item_name,
            item.sku,
            item.category_id,
            item.unit,
            item.quantity_on_hand,
            item.unit_price,
            item.reorder_level,
            item.supplier_id,
            item.storage_location,
            item.notes,
            item.status,
            item.is_archived,
            item.created_at,
            item.updated_at,
            locked_item.before_quantity,
            item.quantity_on_hand AS after_quantity
        )
        SELECT *
        FROM updated_item
      `,
      [tenantId, itemId, countedQuantity],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      item: this.mapItem(row),
      before_quantity: Number(row.before_quantity),
      after_quantity: Number(row.after_quantity),
    };
  }

  async adjustItemStockByVariance(
    tenantId: string,
    itemId: string,
    variance: number,
  ): Promise<InventoryStockMutationRecord | null> {
    const result = await this.databaseService.query<InventoryRow & {
      before_quantity: number;
      after_quantity: number;
    }>(
      `
        WITH locked_item AS (
          SELECT
            id,
            quantity_on_hand AS before_quantity
          FROM inventory_items
          WHERE tenant_id = $1
            AND id = $2::uuid
            AND quantity_on_hand + $3 >= 0
          FOR UPDATE
        ),
        updated_item AS (
          UPDATE inventory_items AS item
          SET quantity_on_hand = item.quantity_on_hand + $3,
              updated_at = NOW()
          FROM locked_item
          WHERE item.tenant_id = $1
            AND item.id = locked_item.id
          RETURNING
            item.id,
            item.tenant_id,
            item.item_name,
            item.sku,
            item.category_id,
            item.unit,
            item.quantity_on_hand,
            item.unit_price,
            item.reorder_level,
            item.supplier_id,
            item.storage_location,
            item.notes,
            item.status,
            item.is_archived,
            item.created_at,
            item.updated_at,
            locked_item.before_quantity,
            item.quantity_on_hand AS after_quantity
        )
        SELECT *
        FROM updated_item
      `,
      [tenantId, itemId, variance],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      item: this.mapItem(row),
      before_quantity: Number(row.before_quantity),
      after_quantity: Number(row.after_quantity),
    };
  }

  async decrementItemStock(
    tenantId: string,
    itemId: string,
    quantity: number,
  ): Promise<InventoryStockMutationRecord | null> {
    const result = await this.databaseService.query<InventoryRow & {
      before_quantity: number;
      after_quantity: number;
    }>(
      `
        WITH locked_item AS (
          SELECT
            id,
            quantity_on_hand AS before_quantity
          FROM inventory_items
          WHERE tenant_id = $1
            AND id = $2::uuid
            AND quantity_on_hand >= $3
          FOR UPDATE
        ),
        updated_item AS (
          UPDATE inventory_items AS item
          SET quantity_on_hand = item.quantity_on_hand - $3,
              updated_at = NOW()
          FROM locked_item
          WHERE item.tenant_id = $1
            AND item.id = locked_item.id
          RETURNING
            item.id,
            item.tenant_id,
            item.item_name,
            item.sku,
            item.category_id,
            item.unit,
            item.quantity_on_hand,
            item.unit_price,
            item.reorder_level,
            item.supplier_id,
            item.storage_location,
            item.notes,
            item.status,
            item.is_archived,
            item.created_at,
            item.updated_at,
            locked_item.before_quantity,
            item.quantity_on_hand AS after_quantity
        )
        SELECT *
        FROM updated_item
      `,
      [tenantId, itemId, quantity],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      item: this.mapItem(row),
      before_quantity: Number(row.before_quantity),
      after_quantity: Number(row.after_quantity),
    };
  }

  async incrementItemStock(
    tenantId: string,
    itemId: string,
    quantity: number,
  ): Promise<InventoryStockMutationRecord | null> {
    const result = await this.databaseService.query<InventoryRow & {
      before_quantity: number;
      after_quantity: number;
    }>(
      `
        WITH locked_item AS (
          SELECT
            id,
            quantity_on_hand AS before_quantity
          FROM inventory_items
          WHERE tenant_id = $1
            AND id = $2::uuid
          FOR UPDATE
        ),
        updated_item AS (
          UPDATE inventory_items AS item
          SET quantity_on_hand = item.quantity_on_hand + $3,
              updated_at = NOW()
          FROM locked_item
          WHERE item.tenant_id = $1
            AND item.id = locked_item.id
          RETURNING
            item.id,
            item.tenant_id,
            item.item_name,
            item.sku,
            item.category_id,
            item.unit,
            item.quantity_on_hand,
            item.unit_price,
            item.reorder_level,
            item.supplier_id,
            item.storage_location,
            item.notes,
            item.status,
            item.is_archived,
            item.created_at,
            item.updated_at,
            locked_item.before_quantity,
            item.quantity_on_hand AS after_quantity
        )
        SELECT *
        FROM updated_item
      `,
      [tenantId, itemId, quantity],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      item: this.mapItem(row),
      before_quantity: Number(row.before_quantity),
      after_quantity: Number(row.after_quantity),
    };
  }

  async incrementItemStockWithCost(
    tenantId: string,
    itemId: string,
    quantity: number,
    unitCost: number,
    supplierId: string | null,
  ): Promise<InventoryStockMutationRecord | null> {
    const result = await this.databaseService.query<InventoryRow & {
      before_quantity: number;
      after_quantity: number;
    }>(
      `
        WITH locked_item AS (
          SELECT
            id,
            quantity_on_hand AS before_quantity
          FROM inventory_items
          WHERE tenant_id = $1
            AND id = $2::uuid
          FOR UPDATE
        ),
        updated_item AS (
          UPDATE inventory_items AS item
          SET quantity_on_hand = item.quantity_on_hand + $3,
              unit_price = $4,
              supplier_id = COALESCE($5::uuid, item.supplier_id),
              updated_at = NOW()
          FROM locked_item
          WHERE item.tenant_id = $1
            AND item.id = locked_item.id
          RETURNING
            item.id,
            item.tenant_id,
            item.item_name,
            item.sku,
            item.category_id,
            item.unit,
            item.quantity_on_hand,
            item.unit_price,
            item.reorder_level,
            item.supplier_id,
            item.storage_location,
            item.notes,
            item.status,
            item.is_archived,
            item.created_at,
            item.updated_at,
            locked_item.before_quantity,
            item.quantity_on_hand AS after_quantity
        )
        SELECT *
        FROM updated_item
      `,
      [tenantId, itemId, quantity, unitCost, supplierId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      item: this.mapItem(row),
      before_quantity: Number(row.before_quantity),
      after_quantity: Number(row.after_quantity),
    };
  }

  async transferItemBalance(
    tenantId: string,
    itemId: string,
    fromLocation: string,
    toLocation: string,
    quantity: number,
  ): Promise<InventoryLocationTransferRecord | null> {
    const result = await this.databaseService.query<InventoryLocationTransferRecord>(
      `
        WITH source_balance AS (
          SELECT
            item_id,
            location_code,
            quantity_on_hand AS source_before_quantity
          FROM inventory_item_balances
          WHERE tenant_id = $1
            AND item_id = $2::uuid
            AND location_code = $3
            AND quantity_on_hand >= $5
          FOR UPDATE
        ),
        decremented_source AS (
          UPDATE inventory_item_balances AS balance
          SET quantity_on_hand = balance.quantity_on_hand - $5,
              updated_at = NOW()
          FROM source_balance
          WHERE balance.tenant_id = $1
            AND balance.item_id = source_balance.item_id
            AND balance.location_code = source_balance.location_code
          RETURNING
            source_balance.source_before_quantity,
            balance.quantity_on_hand AS source_after_quantity
        ),
        destination_existing AS (
          SELECT quantity_on_hand AS destination_before_quantity
          FROM inventory_item_balances
          WHERE tenant_id = $1
            AND item_id = $2::uuid
            AND location_code = $4
          FOR UPDATE
        ),
        incremented_destination AS (
          INSERT INTO inventory_item_balances (
            tenant_id,
            item_id,
            location_code,
            quantity_on_hand
          )
          SELECT
            $1,
            $2::uuid,
            $4,
            $5
          FROM decremented_source
          ON CONFLICT (tenant_id, item_id, location_code)
          DO UPDATE SET
            quantity_on_hand = inventory_item_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
            updated_at = NOW()
          RETURNING quantity_on_hand AS destination_after_quantity
        )
        SELECT
          decremented_source.source_before_quantity,
          decremented_source.source_after_quantity,
          COALESCE(
            (SELECT destination_before_quantity FROM destination_existing),
            0
          ) AS destination_before_quantity,
          incremented_destination.destination_after_quantity
        FROM decremented_source
        CROSS JOIN incremented_destination
      `,
      [tenantId, itemId, fromLocation, toLocation, quantity],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      source_before_quantity: Number(row.source_before_quantity),
      source_after_quantity: Number(row.source_after_quantity),
      destination_before_quantity: Number(row.destination_before_quantity),
      destination_after_quantity: Number(row.destination_after_quantity),
    };
  }

  async incrementItemLocationBalance(
    tenantId: string,
    itemId: string,
    locationCode: string,
    quantity: number,
  ): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO inventory_item_balances (
          tenant_id,
          item_id,
          location_code,
          quantity_on_hand
        )
        VALUES ($1, $2::uuid, $3, $4)
        ON CONFLICT (tenant_id, item_id, location_code)
        DO UPDATE SET
          quantity_on_hand = inventory_item_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
          updated_at = NOW()
      `,
      [tenantId, itemId, locationCode, quantity],
    );
  }

  async setItemLocationBalanceFromCount(
    tenantId: string,
    itemId: string,
    locationCode: string,
    countedQuantity: number,
  ): Promise<InventoryLocationBalanceMutationRecord> {
    const result = await this.databaseService.query<{
      before_quantity: number;
      after_quantity: number;
    }>(
      `
        WITH existing_balance AS (
          SELECT quantity_on_hand AS before_quantity
          FROM inventory_item_balances
          WHERE tenant_id = $1
            AND item_id = $2::uuid
            AND location_code = $3
          FOR UPDATE
        ),
        upserted_balance AS (
          INSERT INTO inventory_item_balances (
            tenant_id,
            item_id,
            location_code,
            quantity_on_hand
          )
          VALUES ($1, $2::uuid, $3, $4)
          ON CONFLICT (tenant_id, item_id, location_code)
          DO UPDATE SET
            quantity_on_hand = EXCLUDED.quantity_on_hand,
            updated_at = NOW()
          RETURNING quantity_on_hand AS after_quantity
        )
        SELECT
          COALESCE((SELECT before_quantity FROM existing_balance), 0) AS before_quantity,
          upserted_balance.after_quantity
        FROM upserted_balance
      `,
      [tenantId, itemId, locationCode, countedQuantity],
    );

    const row = result.rows[0];

    return {
      before_quantity: Number(row?.before_quantity ?? 0),
      after_quantity: Number(row?.after_quantity ?? countedQuantity),
    };
  }

  async applyStockReceipt(tenantId: string, itemId: string, quantity: number): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE inventory_items
        SET quantity_on_hand = quantity_on_hand + $3,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, itemId, quantity],
    );
  }

  async applyStockReceiptWithCost(
    tenantId: string,
    itemId: string,
    quantity: number,
    unitCost: number,
    supplierId: string | null,
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE inventory_items
        SET quantity_on_hand = quantity_on_hand + $3,
            unit_price = $4,
            supplier_id = COALESCE($5::uuid, supplier_id),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, itemId, quantity, unitCost, supplierId],
    );
  }

  async findStockMovementsBySubmissionId(
    tenantId: string,
    submissionId: string,
  ): Promise<InventoryStockMovementRecord[]> {
    const result = await this.databaseService.query<InventoryStockMovementRecord>(
      `
        SELECT
          movement.id,
          movement.tenant_id,
          movement.item_id,
          item.item_name,
          movement.movement_type,
          movement.quantity,
          movement.unit_cost,
          movement.reference,
          movement.before_quantity,
          movement.after_quantity,
          movement.department,
          movement.counterparty,
          movement.batch_number,
          movement.expiry_date::text,
          movement.submission_id,
          movement.actor_user_id,
          movement.notes,
          movement.occurred_at,
          movement.created_at,
          movement.updated_at
        FROM inventory_stock_movements movement
        LEFT JOIN inventory_items item
          ON item.tenant_id = movement.tenant_id
         AND item.id = movement.item_id
        WHERE movement.tenant_id = $1
          AND movement.submission_id = $2
        ORDER BY movement.occurred_at ASC, movement.created_at ASC
      `,
      [tenantId, submissionId],
    );

    return result.rows;
  }

  async recordStockMovement(input: InventoryStockMovementRecord) {
    const result = await this.databaseService.query(
      `
        INSERT INTO inventory_stock_movements (
          tenant_id,
          item_id,
          movement_type,
          quantity,
          unit_cost,
          reference,
          before_quantity,
          after_quantity,
          department,
          counterparty,
          batch_number,
          expiry_date,
          submission_id,
          actor_user_id,
          notes,
          occurred_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13, $14::uuid, $15, COALESCE($16::timestamptz, NOW()))
        RETURNING id, movement_type, quantity, reference, notes, occurred_at, created_at
      `,
      [
        input.tenant_id,
        input.item_id,
        input.movement_type,
        input.quantity,
        input.unit_cost ?? null,
        input.reference ?? null,
        input.before_quantity ?? null,
        input.after_quantity ?? null,
        input.department ?? null,
        input.counterparty ?? null,
        input.batch_number ?? null,
        input.expiry_date ?? null,
        input.submission_id ?? null,
        input.actor_user_id ?? null,
        input.notes ?? null,
        input.occurred_at ?? null,
      ],
    );

    return result.rows[0];
  }

  async listCategories(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          manager,
          storage_zones,
          description
        FROM inventory_categories
        WHERE tenant_id = $1
        ORDER BY name ASC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async createCategory(input: {
    tenant_id: string;
    code: string;
    name: string;
    manager: string | null;
    storage_zones: string | null;
    description: string | null;
  }) {
    const result = await this.databaseService.query<InventoryCategoryRecord>(
      `
        INSERT INTO inventory_categories (
          tenant_id,
          code,
          name,
          manager,
          storage_zones,
          description
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          tenant_id,
          code,
          name,
          manager,
          storage_zones,
          description
      `,
      [
        input.tenant_id,
        input.code,
        input.name,
        input.manager,
        input.storage_zones,
        input.description,
      ],
    );

    return result.rows[0];
  }

  async updateCategory(
    tenantId: string,
    categoryId: string,
    input: Partial<{
      code: string;
      name: string;
      manager: string | null;
      storage_zones: string | null;
      description: string | null;
    }>,
  ) {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, categoryId];
    let parameterIndex = 3;

    const setField = (column: string, value: unknown) => {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.code !== undefined) setField('code', input.code);
    if (input.name !== undefined) setField('name', input.name);
    if (input.manager !== undefined) setField('manager', input.manager);
    if (input.storage_zones !== undefined) setField('storage_zones', input.storage_zones);
    if (input.description !== undefined) setField('description', input.description);

    if (assignments.length === 0) {
      const categories = await this.listCategories(tenantId);
      return categories.find((category) => category.id === categoryId) ?? null;
    }

    assignments.push('updated_at = NOW()');

    const result = await this.databaseService.query<InventoryCategoryRecord>(
      `
        UPDATE inventory_categories
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          code,
          name,
          manager,
          storage_zones,
          description
      `,
      values,
    );

    return result.rows[0] ?? null;
  }

  async listLocations(tenantId: string) {
    const result = await this.databaseService.query<InventoryLocationRecord>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          status,
          created_at,
          updated_at
        FROM inventory_locations
        WHERE tenant_id = $1
        ORDER BY name ASC, code ASC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async createLocation(input: {
    tenant_id: string;
    code: string;
    name: string;
    status: string;
  }) {
    const result = await this.databaseService.query<InventoryLocationRecord>(
      `
        INSERT INTO inventory_locations (
          tenant_id,
          code,
          name,
          status
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          tenant_id,
          code,
          name,
          status,
          created_at,
          updated_at
      `,
      [
        input.tenant_id,
        input.code,
        input.name,
        input.status,
      ],
    );

    return result.rows[0];
  }

  async updateLocation(
    tenantId: string,
    locationId: string,
    input: Partial<{
      code: string;
      name: string;
      status: string;
    }>,
  ) {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, locationId];
    let parameterIndex = 3;

    const setField = (column: string, value: unknown) => {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.code !== undefined) setField('code', input.code);
    if (input.name !== undefined) setField('name', input.name);
    if (input.status !== undefined) setField('status', input.status);

    if (assignments.length === 0) {
      const locations = await this.listLocations(tenantId);
      return locations.find((location) => location.id === locationId) ?? null;
    }

    assignments.push('updated_at = NOW()');

    const result = await this.databaseService.query<InventoryLocationRecord>(
      `
        UPDATE inventory_locations
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          code,
          name,
          status,
          created_at,
          updated_at
      `,
      values,
    );

    return result.rows[0] ?? null;
  }

  async findActiveLocationByCodeOrName(
    tenantId: string,
    location: string,
  ): Promise<InventoryLocationRecord | null> {
    const normalizedLocation = location.trim();
    const result = await this.databaseService.query<InventoryLocationRecord>(
      `
        SELECT
          id,
          tenant_id,
          code,
          name,
          status,
          created_at,
          updated_at
        FROM inventory_locations
        WHERE tenant_id = $1
          AND status = 'active'
          AND (
            code = $2
            OR name = $3
          )
        LIMIT 1
      `,
      [tenantId, normalizedLocation.toUpperCase(), normalizedLocation],
    );

    return result.rows[0] ?? null;
  }

  async listStockMovements(tenantId: string, limit: number) {
    const result = await this.databaseService.query(
      `
        SELECT
          movement.id,
          item.item_name,
          movement.movement_type,
          movement.quantity,
          movement.reference,
          movement.before_quantity,
          movement.after_quantity,
          movement.department,
          movement.counterparty,
          movement.batch_number,
          movement.expiry_date::text,
          movement.submission_id,
          movement.notes,
          actor.display_name AS actor_display_name,
          movement.occurred_at
        FROM inventory_stock_movements movement
        JOIN inventory_items item
          ON item.tenant_id = movement.tenant_id
         AND item.id = movement.item_id
        LEFT JOIN users actor
          ON actor.tenant_id = movement.tenant_id
         AND actor.id = movement.actor_user_id
        WHERE movement.tenant_id = $1
        ORDER BY movement.occurred_at DESC
        LIMIT $2
      `,
      [tenantId, limit],
    );

    return result.rows;
  }

  async listSuppliers(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          id,
          supplier_name,
          contact_person,
          email,
          phone,
          COALESCE(county, metadata->>'county') AS county,
          last_delivery_at::text,
          status
        FROM inventory_suppliers
        WHERE tenant_id = $1
        ORDER BY supplier_name ASC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async createSupplier(input: {
    tenant_id: string;
    supplier_name: string;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    county: string | null;
    status: string;
  }) {
    const result = await this.databaseService.query<InventorySupplierRecord>(
      `
        INSERT INTO inventory_suppliers (
          tenant_id,
          supplier_name,
          contact_person,
          email,
          phone,
          county,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, jsonb_build_object('county', $6))
        RETURNING
          id,
          supplier_name,
          contact_person,
          email,
          phone,
          county,
          last_delivery_at::text,
          status
      `,
      [
        input.tenant_id,
        input.supplier_name,
        input.contact_person,
        input.email,
        input.phone,
        input.county,
        input.status,
      ],
    );

    return result.rows[0];
  }

  async updateSupplier(
    tenantId: string,
    supplierId: string,
    input: Partial<{
      supplier_name: string;
      contact_person: string | null;
      email: string | null;
      phone: string | null;
      county: string | null;
      status: string;
    }>,
  ) {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, supplierId];
    let parameterIndex = 3;

    const setField = (column: string, value: unknown) => {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.supplier_name !== undefined) setField('supplier_name', input.supplier_name);
    if (input.contact_person !== undefined) setField('contact_person', input.contact_person);
    if (input.email !== undefined) setField('email', input.email);
    if (input.phone !== undefined) setField('phone', input.phone);
    if (input.county !== undefined) {
      setField('county', input.county);
      assignments.push(`metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{county}', to_jsonb($${parameterIndex - 1}::text), true)`);
    }
    if (input.status !== undefined) setField('status', input.status);

    if (assignments.length === 0) {
      const suppliers = await this.listSuppliers(tenantId);
      return suppliers.find((supplier) => supplier.id === supplierId) ?? null;
    }

    assignments.push('updated_at = NOW()');

    const result = await this.databaseService.query<InventorySupplierRecord>(
      `
        UPDATE inventory_suppliers
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          supplier_name,
          contact_person,
          email,
          phone,
          COALESCE(county, metadata->>'county') AS county,
          last_delivery_at::text,
          status
      `,
      values,
    );

    return result.rows[0] ?? null;
  }

  async createPurchaseOrder(input: {
    tenant_id: string;
    po_number: string;
    supplier_id: string;
    status: string;
    expected_delivery_date: string | null;
    ordered_at: string | null;
    total_amount: number;
    lines: Array<Record<string, unknown>>;
    notes: string | null;
    created_by_user_id: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO inventory_purchase_orders (
          tenant_id,
          po_number,
          supplier_id,
          status,
          expected_delivery_date,
          ordered_at,
          total_amount,
          lines,
          notes,
          created_by_user_id
        )
        VALUES ($1, $2, $3::uuid, $4, $5::date, $6::date, $7, $8::jsonb, $9, $10::uuid)
        RETURNING id, po_number, status, total_amount, lines, notes
      `,
      [
        input.tenant_id,
        input.po_number,
        input.supplier_id,
        input.status,
        input.expected_delivery_date,
        input.ordered_at,
        input.total_amount,
        JSON.stringify(input.lines),
        input.notes,
        input.created_by_user_id,
      ],
    );

    return result.rows[0];
  }

  async listPurchaseOrders(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          po.id,
          po.tenant_id,
          po.po_number,
          po.supplier_id,
          supplier.supplier_name,
          creator.display_name AS requested_by_display_name,
          po.status,
          po.expected_delivery_date::text,
          po.ordered_at::text,
          po.received_at::text,
          po.total_amount,
          po.lines,
          po.notes
        FROM inventory_purchase_orders po
        LEFT JOIN inventory_suppliers supplier
          ON supplier.tenant_id = po.tenant_id
         AND supplier.id = po.supplier_id
        LEFT JOIN users creator
          ON creator.tenant_id = po.tenant_id
         AND creator.id = po.created_by_user_id
        WHERE po.tenant_id = $1
        ORDER BY COALESCE(po.ordered_at::timestamptz, po.created_at) DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.mapPurchaseOrder(row));
  }

  async findPurchaseOrderById(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<InventoryPurchaseOrderRecord | null> {
    const result = await this.databaseService.query(
      `
        SELECT
          po.id,
          po.tenant_id,
          po.po_number,
          po.supplier_id,
          supplier.supplier_name,
          po.status,
          po.expected_delivery_date::text,
          po.ordered_at::text,
          po.received_at::text,
          po.total_amount,
          po.lines,
          po.notes
        FROM inventory_purchase_orders po
        LEFT JOIN inventory_suppliers supplier
          ON supplier.tenant_id = po.tenant_id
         AND supplier.id = po.supplier_id
        WHERE po.tenant_id = $1
          AND po.id = $2::uuid
        LIMIT 1
      `,
      [tenantId, purchaseOrderId],
    );

    return result.rows[0] ? this.mapPurchaseOrder(result.rows[0]) : null;
  }

  async findPurchaseOrderByIdForUpdate(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<InventoryPurchaseOrderRecord | null> {
    const result = await this.databaseService.query(
      `
        SELECT
          po.id,
          po.tenant_id,
          po.po_number,
          po.supplier_id,
          supplier.supplier_name,
          po.status,
          po.expected_delivery_date::text,
          po.ordered_at::text,
          po.received_at::text,
          po.total_amount,
          po.lines,
          po.notes
        FROM inventory_purchase_orders po
        LEFT JOIN inventory_suppliers supplier
          ON supplier.tenant_id = po.tenant_id
         AND supplier.id = po.supplier_id
        WHERE po.tenant_id = $1
          AND po.id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, purchaseOrderId],
    );

    return result.rows[0] ? this.mapPurchaseOrder(result.rows[0]) : null;
  }

  async updatePurchaseOrderStatus(
    tenantId: string,
    purchaseOrderId: string,
    status: string,
    notes?: string | null,
  ) {
    const result = await this.databaseService.query(
      `
        UPDATE inventory_purchase_orders
        SET status = $3,
            notes = COALESCE($4, notes),
            received_at = CASE WHEN $3 = 'received' THEN NOW() ELSE received_at END,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, tenant_id, po_number, status
      `,
      [tenantId, purchaseOrderId, status, notes ?? null],
    );

    return result.rows[0] ?? null;
  }

  async createRequest(input: {
    tenant_id: string;
    request_number: string;
    department: string;
    requested_by: string;
    status: string;
    needed_by: string | null;
    priority: string;
    lines: Array<Record<string, unknown>>;
    notes: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO inventory_requests (
          tenant_id,
          request_number,
          department,
          requested_by,
          status,
          needed_by,
          priority,
          lines,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8::jsonb, $9)
        RETURNING id, request_number, status
      `,
      [
        input.tenant_id,
        input.request_number,
        input.department,
        input.requested_by,
        input.status,
        input.needed_by,
        input.priority,
        JSON.stringify(input.lines),
        input.notes,
      ],
    );

    return result.rows[0];
  }

  async listRequests(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          id,
          request_number,
          department,
          requested_by,
          status,
          needed_by::text,
          priority,
          lines,
          notes,
          fulfilled_at,
          created_at::text
        FROM inventory_requests
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async findRequestByIdForUpdate(
    tenantId: string,
    requestId: string,
  ): Promise<InventoryRequestRecord | null> {
    const result = await this.databaseService.query<InventoryRequestRecord>(
      `
        SELECT
          id,
          request_number,
          department,
          requested_by,
          status,
          needed_by::text,
          priority,
          lines,
          notes
        FROM inventory_requests
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, requestId],
    );

    return result.rows[0] ?? null;
  }

  async reserveRequestLine(
    tenantId: string,
    requestId: string,
    itemId: string,
    quantity: number,
    actorUserId: string | null,
  ): Promise<InventoryReservationRecord | null> {
    const result = await this.databaseService.query<InventoryReservationRecord>(
      `
        WITH locked_item AS (
          SELECT
            id,
            quantity_on_hand
          FROM inventory_items
          WHERE tenant_id = $1
            AND id = $3::uuid
          FOR UPDATE
        ),
        available_item AS (
          SELECT
            locked_item.id,
            locked_item.quantity_on_hand
              - COALESCE((
                  SELECT SUM(reservation.quantity)::int
                  FROM inventory_reservations reservation
                  WHERE reservation.tenant_id = $1
                    AND reservation.item_id = $3::uuid
                    AND reservation.status = 'reserved'
                ), 0) AS available_quantity
          FROM locked_item
        ),
        eligible_item AS (
          SELECT id
          FROM available_item
          WHERE available_quantity >= $4
        ),
        upserted_reservation AS (
          INSERT INTO inventory_reservations (
            tenant_id,
            request_id,
            item_id,
            quantity,
            status,
            reserved_by_user_id
          )
          SELECT
            $1,
            $2::uuid,
            $3::uuid,
            $4,
            'reserved',
            $5::uuid
          FROM eligible_item
          ON CONFLICT (tenant_id, request_id, item_id, status)
          DO UPDATE SET
            quantity = inventory_reservations.quantity + EXCLUDED.quantity,
            reserved_by_user_id = COALESCE(EXCLUDED.reserved_by_user_id, inventory_reservations.reserved_by_user_id),
            updated_at = NOW()
          RETURNING
            id,
            tenant_id,
            request_id,
            item_id,
            quantity,
            status,
            reserved_by_user_id,
            reserved_at,
            fulfilled_at,
            cancelled_at
        )
        SELECT *
        FROM upserted_reservation
      `,
      [tenantId, requestId, itemId, quantity, actorUserId],
    );

    return result.rows[0] ?? null;
  }

  async listReservedRequestLinesForUpdate(
    tenantId: string,
    requestId: string,
  ): Promise<InventoryReservedRequestLineRecord[]> {
    const result = await this.databaseService.query<InventoryReservedRequestLineRecord>(
      `
        SELECT
          reservation.id AS reservation_id,
          reservation.item_id,
          item.item_name,
          reservation.quantity::int AS quantity,
          item.unit_price
        FROM inventory_reservations reservation
        JOIN inventory_items item
          ON item.tenant_id = reservation.tenant_id
         AND item.id = reservation.item_id
        WHERE reservation.tenant_id = $1
          AND reservation.request_id = $2::uuid
          AND reservation.status = 'reserved'
        ORDER BY reservation.created_at ASC, reservation.id ASC
        FOR UPDATE OF reservation
      `,
      [tenantId, requestId],
    );

    return result.rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
    }));
  }

  async markRequestReservationsFulfilled(tenantId: string, requestId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE inventory_reservations
        SET status = 'fulfilled',
            fulfilled_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND request_id = $2::uuid
          AND status = 'reserved'
      `,
      [tenantId, requestId],
    );
  }

  async recordRequestBackorder(
    tenantId: string,
    requestId: string,
    itemId: string,
    requestedQuantity: number,
    reservedQuantity: number,
  ): Promise<InventoryRequestBackorderRecord | null> {
    const result = await this.databaseService.query<InventoryRequestBackorderRecord>(
      `
        INSERT INTO inventory_request_backorders (
          tenant_id,
          request_id,
          item_id,
          requested_quantity,
          reserved_quantity,
          backordered_quantity,
          status
        )
        VALUES (
          $1,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          GREATEST($4 - $5, 0),
          'open'
        )
        ON CONFLICT (tenant_id, request_id, item_id, status)
        DO UPDATE SET
          requested_quantity = EXCLUDED.requested_quantity,
          reserved_quantity = EXCLUDED.reserved_quantity,
          backordered_quantity = EXCLUDED.backordered_quantity,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          request_id,
          item_id,
          requested_quantity,
          reserved_quantity,
          backordered_quantity,
          status,
          resolved_at
      `,
      [tenantId, requestId, itemId, requestedQuantity, reservedQuantity],
    );

    return result.rows[0] ?? null;
  }

  async listOpenRequestBackordersForItem(
    tenantId: string,
    itemId: string,
  ): Promise<InventoryRequestBackorderRecord[]> {
    const result = await this.databaseService.query<InventoryRequestBackorderRecord>(
      `
        SELECT
          id,
          tenant_id,
          request_id,
          item_id,
          requested_quantity,
          reserved_quantity,
          backordered_quantity,
          status,
          resolved_at
        FROM inventory_request_backorders
        WHERE tenant_id = $1
          AND item_id = $2::uuid
          AND status = 'open'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE
      `,
      [tenantId, itemId],
    );

    return result.rows;
  }

  async markRequestBackorderResolved(tenantId: string, backorderId: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE inventory_request_backorders
        SET status = 'resolved',
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
          AND status = 'open'
      `,
      [tenantId, backorderId],
    );
  }

  async countOpenBackordersForRequest(tenantId: string, requestId: string): Promise<number> {
    const result = await this.databaseService.query<{ open_backorders: string }>(
      `
        SELECT COUNT(*)::text AS open_backorders
        FROM inventory_request_backorders
        WHERE tenant_id = $1
          AND request_id = $2::uuid
          AND status = 'open'
      `,
      [tenantId, requestId],
    );

    return Number(result.rows[0]?.open_backorders ?? '0');
  }

  async updateRequestStatus(
    tenantId: string,
    requestId: string,
    status: string,
    notes?: string | null,
    approvedByUserId?: string | null,
  ) {
    const result = await this.databaseService.query(
      `
        UPDATE inventory_requests
        SET status = $3,
            notes = COALESCE($4, notes),
            approved_by_user_id = CASE
              WHEN $3 IN ('approved', 'backordered') THEN COALESCE($5::uuid, approved_by_user_id)
              ELSE approved_by_user_id
            END,
            fulfilled_at = CASE WHEN $3 = 'fulfilled' THEN NOW() ELSE fulfilled_at END,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, request_number, status
      `,
      [tenantId, requestId, status, notes ?? null, approvedByUserId ?? null],
    );

    return result.rows[0] ?? null;
  }

  async createTransfer(input: {
    tenant_id: string;
    transfer_number: string;
    from_location: string;
    to_location: string;
    status: string;
    requested_by: string;
    lines: Array<Record<string, unknown>>;
    notes: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO inventory_transfers (
          tenant_id,
          transfer_number,
          from_location,
          to_location,
          status,
          requested_by,
          lines,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        RETURNING id, transfer_number, status
      `,
      [
        input.tenant_id,
        input.transfer_number,
        input.from_location,
        input.to_location,
        input.status,
        input.requested_by,
        JSON.stringify(input.lines),
        input.notes,
      ],
    );

    return result.rows[0];
  }

  async listTransfers(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT id, transfer_number, from_location, to_location, status, requested_by, lines, notes, created_at::text
        FROM inventory_transfers
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async findTransferById(
    tenantId: string,
    transferId: string,
  ): Promise<InventoryTransferRecord | null> {
    const result = await this.databaseService.query<InventoryTransferRecord>(
      `
        SELECT id, transfer_number, from_location, to_location, status, requested_by, lines, notes
        FROM inventory_transfers
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, transferId],
    );

    return result.rows[0]
      ? {
          ...result.rows[0],
          lines: Array.isArray(result.rows[0].lines) ? result.rows[0].lines : [],
        }
      : null;
  }

  async updateTransferStatus(
    tenantId: string,
    transferId: string,
    status: string,
    notes?: string | null,
  ) {
    const result = await this.databaseService.query(
      `
        UPDATE inventory_transfers
        SET status = $3,
            notes = COALESCE($4, notes),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, transfer_number, status
      `,
      [tenantId, transferId, status, notes ?? null],
    );

    return result.rows[0] ?? null;
  }

  async createIncident(input: {
    tenant_id: string;
    incident_number: string;
    item_id: string;
    incident_type: string;
    quantity: number;
    reason: string;
    responsible_department: string;
    cost_impact: number;
    status: string;
    notes: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO inventory_incidents (
          tenant_id,
          incident_number,
          item_id,
          incident_type,
          quantity,
          reason,
          responsible_department,
          cost_impact,
          status,
          notes
        )
        VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, incident_number, status
      `,
      [
        input.tenant_id,
        input.incident_number,
        input.item_id,
        input.incident_type,
        input.quantity,
        input.reason,
        input.responsible_department,
        input.cost_impact,
        input.status,
        input.notes,
      ],
    );

    return result.rows[0];
  }

  async listIncidents(tenantId: string) {
    const result = await this.databaseService.query(
      `
        SELECT
          incident.id,
          incident.incident_number,
          item.item_name,
          incident.incident_type,
          incident.quantity,
          incident.reason,
          incident.responsible_department,
          incident.cost_impact,
          incident.status,
          incident.notes,
          incident.reported_at
        FROM inventory_incidents incident
        JOIN inventory_items item
          ON item.tenant_id = incident.tenant_id
         AND item.id = incident.item_id
        WHERE incident.tenant_id = $1
        ORDER BY incident.reported_at DESC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async createStockCountSnapshot(input: {
    tenant_id: string;
    snapshot_number: string;
    location_code: string | null;
    counted_at: string | null;
    counted_by_user_id: string | null;
    status: string;
    lines: Array<Record<string, unknown>>;
    variance_count: number;
    notes: string | null;
  }) {
    const result = await this.databaseService.query<InventoryStockCountSnapshotRecord>(
      `
        INSERT INTO inventory_stock_count_snapshots (
          tenant_id,
          snapshot_number,
          location_code,
          counted_at,
          counted_by_user_id,
          status,
          lines,
          variance_count,
          notes
        )
        VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5::uuid, $6, $7::jsonb, $8, $9)
        RETURNING
          id,
          tenant_id,
          snapshot_number,
          location_code,
          counted_at,
          counted_by_user_id,
          status,
          lines,
          variance_count,
          notes
      `,
      [
        input.tenant_id,
        input.snapshot_number,
        input.location_code,
        input.counted_at,
        input.counted_by_user_id,
        input.status,
        JSON.stringify(input.lines),
        input.variance_count,
        input.notes,
      ],
    );

    return result.rows[0];
  }

  async buildReports(tenantId: string) {
    const [valuation, lowStock, movement, supplierPurchases, stockReconciliation] = await Promise.all([
      this.databaseService.query(
        `
          SELECT item_name, sku, quantity_on_hand, unit_price, (quantity_on_hand * unit_price)::text AS total_value
          FROM inventory_items
          WHERE tenant_id = $1
            AND is_archived = FALSE
          ORDER BY total_value DESC NULLS LAST, item_name ASC
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT item_name, sku, quantity_on_hand, reorder_level
          FROM inventory_items
          WHERE tenant_id = $1
            AND is_archived = FALSE
            AND quantity_on_hand <= reorder_level
          ORDER BY quantity_on_hand ASC
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT movement_type, COUNT(*)::int AS movement_count
          FROM inventory_stock_movements
          WHERE tenant_id = $1
          GROUP BY movement_type
          ORDER BY movement_count DESC, movement_type ASC
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT
            supplier.supplier_name,
            COUNT(*)::int AS purchase_orders,
            COALESCE(SUM(po.total_amount), 0)::text AS total_spend
          FROM inventory_purchase_orders po
          LEFT JOIN inventory_suppliers supplier
            ON supplier.tenant_id = po.tenant_id
           AND supplier.id = po.supplier_id
          WHERE po.tenant_id = $1
          GROUP BY supplier.supplier_name
          ORDER BY total_spend DESC NULLS LAST
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT
            item.id AS item_id,
            item.item_name,
            item.sku,
            item.quantity_on_hand::int AS item_quantity_on_hand,
            COALESCE(SUM(balance.quantity_on_hand), 0)::int AS location_quantity_on_hand,
            (item.quantity_on_hand - COALESCE(SUM(balance.quantity_on_hand), 0))::int AS variance_quantity,
            CASE
              WHEN item.quantity_on_hand = COALESCE(SUM(balance.quantity_on_hand), 0) THEN 'matched'
              ELSE 'variance'
            END AS status
          FROM inventory_items item
          LEFT JOIN inventory_item_balances balance
            ON balance.tenant_id = item.tenant_id
           AND balance.item_id = item.id
          WHERE item.tenant_id = $1
            AND item.is_archived = FALSE
          GROUP BY item.id, item.item_name, item.sku, item.quantity_on_hand
          ORDER BY ABS(item.quantity_on_hand - COALESCE(SUM(balance.quantity_on_hand), 0)) DESC,
                   item.item_name ASC
        `,
        [tenantId],
      ),
    ]);

    return {
      stock_valuation: valuation.rows.map((row) => ({
        ...row,
        total_value: Number((row as { total_value: string }).total_value),
      })),
      low_stock_report: lowStock.rows,
      movement_history: movement.rows,
      supplier_purchases: supplierPurchases.rows.map((row) => ({
        ...row,
        total_spend: Number((row as { total_spend: string }).total_spend),
      })),
      stock_reconciliation: stockReconciliation.rows.map((row) => ({
        ...row,
        item_quantity_on_hand: Number(row.item_quantity_on_hand ?? 0),
        location_quantity_on_hand: Number(row.location_quantity_on_hand ?? 0),
        variance_quantity: Number(row.variance_quantity ?? 0),
      })),
    };
  }

  private mapItem(row: InventoryRow): InventoryItemRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      item_name: row.item_name,
      sku: row.sku,
      category_id: row.category_id,
      category_name: row.category_name,
      unit: row.unit,
      quantity_on_hand: Number(row.quantity_on_hand),
      unit_price: Number(row.unit_price),
      reorder_level: Number(row.reorder_level),
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      storage_location: row.storage_location,
      notes: row.notes,
      status: row.status,
      is_archived: row.is_archived,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapPurchaseOrder(row: Record<string, unknown>): InventoryPurchaseOrderRecord {
    return {
      id: String(row.id),
      tenant_id: String(row.tenant_id),
      po_number: String(row.po_number),
      supplier_id: row.supplier_id ? String(row.supplier_id) : null,
      supplier_name: row.supplier_name ? String(row.supplier_name) : null,
      requested_by_display_name: row.requested_by_display_name
        ? String(row.requested_by_display_name)
        : null,
      status: String(row.status),
      expected_delivery_date: row.expected_delivery_date ? String(row.expected_delivery_date) : null,
      ordered_at: row.ordered_at ? String(row.ordered_at) : null,
      received_at: row.received_at ? String(row.received_at) : null,
      total_amount: Number(row.total_amount ?? 0),
      lines: Array.isArray(row.lines) ? (row.lines as Array<Record<string, unknown>>) : [],
      notes: row.notes ? String(row.notes) : null,
    };
  }
}
