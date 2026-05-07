import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

@Injectable()
export class InventorySchemaService implements OnModuleInit {
  private readonly logger = new Logger(InventorySchemaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.databaseService.runSchemaBootstrap(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE IF NOT EXISTS inventory_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        manager text,
        storage_zones text,
        description text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_categories_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_categories_tenant_code UNIQUE (tenant_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        supplier_name text NOT NULL,
        contact_person text,
        email text,
        phone text,
        county text,
        last_delivery_at timestamptz,
        status text NOT NULL DEFAULT 'active',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_suppliers_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_suppliers_tenant_name UNIQUE (tenant_id, supplier_name)
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        item_name text NOT NULL,
        sku text NOT NULL,
        category_id uuid,
        unit text NOT NULL,
        quantity_on_hand integer NOT NULL DEFAULT 0,
        supplier_id uuid,
        unit_price numeric(12,2) NOT NULL DEFAULT 0,
        reorder_level integer NOT NULL DEFAULT 0,
        storage_location text,
        notes text,
        status text NOT NULL DEFAULT 'active',
        is_archived boolean NOT NULL DEFAULT FALSE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_items_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_items_tenant_sku UNIQUE (tenant_id, sku),
        CONSTRAINT fk_inventory_items_category
          FOREIGN KEY (tenant_id, category_id)
          REFERENCES inventory_categories (tenant_id, id)
          ON DELETE SET NULL,
        CONSTRAINT fk_inventory_items_supplier
          FOREIGN KEY (tenant_id, supplier_id)
          REFERENCES inventory_suppliers (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_stock_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        item_id uuid NOT NULL,
        movement_type text NOT NULL,
        quantity integer NOT NULL,
        unit_cost numeric(12,2),
        reference text,
        before_quantity integer,
        after_quantity integer,
        department text,
        counterparty text,
        batch_number text,
        expiry_date date,
        submission_id text,
        actor_user_id uuid,
        notes text,
        occurred_at timestamptz NOT NULL DEFAULT NOW(),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_movements_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT fk_inventory_movements_item
          FOREIGN KEY (tenant_id, item_id)
          REFERENCES inventory_items (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS inventory_purchase_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        po_number text NOT NULL,
        supplier_id uuid,
        status text NOT NULL DEFAULT 'draft',
        expected_delivery_date date,
        ordered_at date,
        approved_by_user_id uuid,
        received_at timestamptz,
        total_amount numeric(12,2) NOT NULL DEFAULT 0,
        lines jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_po_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_po_tenant_number UNIQUE (tenant_id, po_number),
        CONSTRAINT fk_inventory_po_supplier
          FOREIGN KEY (tenant_id, supplier_id)
          REFERENCES inventory_suppliers (tenant_id, id)
          ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        request_number text NOT NULL,
        department text NOT NULL,
        requested_by text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        needed_by date,
        priority text NOT NULL DEFAULT 'normal',
        lines jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text,
        approved_by_user_id uuid,
        fulfilled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_requests_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_requests_tenant_number UNIQUE (tenant_id, request_number)
      );

      CREATE TABLE IF NOT EXISTS inventory_transfers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        transfer_number text NOT NULL,
        from_location text NOT NULL,
        to_location text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        requested_by text NOT NULL,
        approved_by text,
        dispatched_at timestamptz,
        received_at timestamptz,
        lines jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_transfers_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_transfers_tenant_number UNIQUE (tenant_id, transfer_number)
      );

      CREATE TABLE IF NOT EXISTS inventory_incidents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        incident_number text NOT NULL,
        item_id uuid NOT NULL,
        incident_type text NOT NULL,
        quantity integer NOT NULL,
        reason text NOT NULL,
        responsible_department text NOT NULL,
        cost_impact numeric(12,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'logged',
        notes text,
        reported_at timestamptz NOT NULL DEFAULT NOW(),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_incidents_tenant_id_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_inventory_incidents_tenant_number UNIQUE (tenant_id, incident_number),
        CONSTRAINT fk_inventory_incidents_item
          FOREIGN KEY (tenant_id, item_id)
          REFERENCES inventory_items (tenant_id, id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS ix_inventory_items_status ON inventory_items (tenant_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_inventory_items_low_stock ON inventory_items (tenant_id, quantity_on_hand, reorder_level);
      CREATE INDEX IF NOT EXISTS ix_inventory_movements_occurred_at ON inventory_stock_movements (tenant_id, occurred_at DESC);

      ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS manager text;
      ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS storage_zones text;
      ALTER TABLE inventory_suppliers ADD COLUMN IF NOT EXISTS county text;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS before_quantity integer;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS after_quantity integer;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS department text;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS counterparty text;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS batch_number text;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS expiry_date date;
      ALTER TABLE inventory_stock_movements ADD COLUMN IF NOT EXISTS submission_id text;
      CREATE INDEX IF NOT EXISTS ix_inventory_movements_submission_id ON inventory_stock_movements (tenant_id, submission_id) WHERE submission_id IS NOT NULL;

      ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_categories FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_suppliers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_suppliers FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_stock_movements ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_stock_movements FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_purchase_orders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_purchase_orders FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_requests ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_requests FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_transfers FORCE ROW LEVEL SECURITY;
      ALTER TABLE inventory_incidents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE inventory_incidents FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS inventory_categories_rls_policy ON inventory_categories;
      CREATE POLICY inventory_categories_rls_policy ON inventory_categories
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_suppliers_rls_policy ON inventory_suppliers;
      CREATE POLICY inventory_suppliers_rls_policy ON inventory_suppliers
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_items_rls_policy ON inventory_items;
      CREATE POLICY inventory_items_rls_policy ON inventory_items
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_stock_movements_rls_policy ON inventory_stock_movements;
      CREATE POLICY inventory_stock_movements_rls_policy ON inventory_stock_movements
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_purchase_orders_rls_policy ON inventory_purchase_orders;
      CREATE POLICY inventory_purchase_orders_rls_policy ON inventory_purchase_orders
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_requests_rls_policy ON inventory_requests;
      CREATE POLICY inventory_requests_rls_policy ON inventory_requests
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_transfers_rls_policy ON inventory_transfers;
      CREATE POLICY inventory_transfers_rls_policy ON inventory_transfers
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP POLICY IF EXISTS inventory_incidents_rls_policy ON inventory_incidents;
      CREATE POLICY inventory_incidents_rls_policy ON inventory_incidents
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

      DROP TRIGGER IF EXISTS trg_inventory_categories_set_updated_at ON inventory_categories;
      CREATE TRIGGER trg_inventory_categories_set_updated_at
      BEFORE UPDATE ON inventory_categories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_suppliers_set_updated_at ON inventory_suppliers;
      CREATE TRIGGER trg_inventory_suppliers_set_updated_at
      BEFORE UPDATE ON inventory_suppliers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_items_set_updated_at ON inventory_items;
      CREATE TRIGGER trg_inventory_items_set_updated_at
      BEFORE UPDATE ON inventory_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_movements_set_updated_at ON inventory_stock_movements;
      CREATE TRIGGER trg_inventory_movements_set_updated_at
      BEFORE UPDATE ON inventory_stock_movements
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_po_set_updated_at ON inventory_purchase_orders;
      CREATE TRIGGER trg_inventory_po_set_updated_at
      BEFORE UPDATE ON inventory_purchase_orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_requests_set_updated_at ON inventory_requests;
      CREATE TRIGGER trg_inventory_requests_set_updated_at
      BEFORE UPDATE ON inventory_requests
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_transfers_set_updated_at ON inventory_transfers;
      CREATE TRIGGER trg_inventory_transfers_set_updated_at
      BEFORE UPDATE ON inventory_transfers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_inventory_incidents_set_updated_at ON inventory_incidents;
      CREATE TRIGGER trg_inventory_incidents_set_updated_at
      BEFORE UPDATE ON inventory_incidents
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    this.logger.log('Inventory schema verified');
  }
}
