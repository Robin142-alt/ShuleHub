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
  actor_user_id?: string | null;
  notes?: string | null;
  occurred_at?: Date;
  created_at?: Date;
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
          actor_user_id,
          notes,
          occurred_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::uuid, $8, COALESCE($9::timestamptz, NOW()))
        RETURNING id, movement_type, quantity, reference, notes, occurred_at, created_at
      `,
      [
        input.tenant_id,
        input.item_id,
        input.movement_type,
        input.quantity,
        input.unit_cost ?? null,
        input.reference ?? null,
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
        SELECT id, code, name, description
        FROM inventory_categories
        WHERE tenant_id = $1
        ORDER BY name ASC
      `,
      [tenantId],
    );

    return result.rows;
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
        SELECT id, supplier_name, contact_person, email, phone, last_delivery_at, status
        FROM inventory_suppliers
        WHERE tenant_id = $1
        ORDER BY supplier_name ASC
      `,
      [tenantId],
    );

    return result.rows;
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

  async updateRequestStatus(tenantId: string, requestId: string, status: string, notes?: string | null) {
    const result = await this.databaseService.query(
      `
        UPDATE inventory_requests
        SET status = $3,
            notes = COALESCE($4, notes),
            fulfilled_at = CASE WHEN $3 = 'fulfilled' THEN NOW() ELSE fulfilled_at END,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, request_number, status
      `,
      [tenantId, requestId, status, notes ?? null],
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

  async buildReports(tenantId: string) {
    const [valuation, lowStock, movement, supplierPurchases] = await Promise.all([
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
