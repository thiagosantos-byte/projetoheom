-- Proteção adicional de identidade e histórico automático de alterações críticas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM assets
    WHERE archived_at IS NULL AND serial_number IS NOT NULL AND btrim(serial_number) <> ''
    GROUP BY lower(btrim(serial_number)) HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Índice único de número de série não criado: existem duplicidades históricas que precisam de revisão manual.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_serial_number_active
      ON assets (lower(btrim(serial_number)))
      WHERE archived_at IS NULL AND serial_number IS NOT NULL AND btrim(serial_number) <> '';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS asset_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  previous_status VARCHAR(24) NOT NULL,
  next_status VARCHAR(24) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_status_history_asset ON asset_status_history(asset_id, changed_at DESC);

CREATE OR REPLACE FUNCTION heom_record_asset_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.operational_status IS DISTINCT FROM NEW.operational_status THEN
    INSERT INTO asset_status_history(asset_id, previous_status, next_status, changed_at)
    VALUES (NEW.id, OLD.operational_status, NEW.operational_status, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_heom_asset_status_history ON assets;
CREATE TRIGGER trg_heom_asset_status_history
AFTER UPDATE OF operational_status ON assets
FOR EACH ROW EXECUTE FUNCTION heom_record_asset_status_change();

CREATE TABLE IF NOT EXISTS maintenance_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_order_id UUID NOT NULL REFERENCES maintenance_orders(id) ON DELETE RESTRICT,
  previous_status VARCHAR(24),
  next_status VARCHAR(24) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_history_order ON maintenance_order_history(maintenance_order_id, changed_at DESC);

CREATE OR REPLACE FUNCTION heom_record_maintenance_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO maintenance_order_history(maintenance_order_id, previous_status, next_status, changed_at)
    VALUES (NEW.id, NULL, NEW.status, NOW());
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO maintenance_order_history(maintenance_order_id, previous_status, next_status, changed_at)
    VALUES (NEW.id, OLD.status, NEW.status, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_heom_maintenance_status_history ON maintenance_orders;
CREATE TRIGGER trg_heom_maintenance_status_history
AFTER INSERT OR UPDATE OF status ON maintenance_orders
FOR EACH ROW EXECUTE FUNCTION heom_record_maintenance_status_change();
