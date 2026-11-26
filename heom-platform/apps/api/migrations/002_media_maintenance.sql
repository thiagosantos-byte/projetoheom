ALTER TABLE assets ADD COLUMN IF NOT EXISTS qr_code VARCHAR(140);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_qr_code ON assets(qr_code) WHERE qr_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS asset_photos (
  id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  original_name VARCHAR(240) NOT NULL,
  file_name VARCHAR(180) NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(40) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 12582912),
  image_role VARCHAR(20) NOT NULL DEFAULT 'EQUIPAMENTO' CHECK (image_role IN ('EQUIPAMENTO','PLAQUETA','ETIQUETA','OUTRA')),
  difference_hash CHAR(16) NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE asset_photos ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_asset_photos_asset ON asset_photos(asset_id, created_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS asset_ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  photo_id UUID NOT NULL REFERENCES asset_photos(id) ON DELETE RESTRICT,
  engine VARCHAR(40) NOT NULL DEFAULT 'TESSERACT_LOCAL',
  status VARCHAR(32) NOT NULL CHECK (status IN ('PROCESSADO','MOTOR_INDISPONIVEL','SEM_TEXTO')),
  raw_text TEXT NOT NULL DEFAULT '',
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(5,4),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_status VARCHAR(24) NOT NULL DEFAULT 'AGUARDANDO_REVISAO' CHECK (review_status IN ('AGUARDANDO_REVISAO','CONFIRMADO','CORRIGIDO','REJEITADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_ocr_asset ON asset_ocr_results(asset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  order_type VARCHAR(24) NOT NULL CHECK (order_type IN ('PREVENTIVA','CORRETIVA','CALIBRACAO','INSPECAO')),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('BAIXA','MEDIA','ALTA','CRITICA')),
  status VARCHAR(24) NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','PROGRAMADA','EM_ANDAMENTO','AGUARDANDO_PECA','CONCLUIDA','CANCELADA')),
  scheduled_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  responsible_name VARCHAR(140),
  completion_notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_orders_asset ON maintenance_orders(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_orders_status ON maintenance_orders(status, due_at);

UPDATE assets SET qr_code = 'HEOM-ASSET:' || id::text WHERE qr_code IS NULL OR qr_code LIKE 'SIM-HEOM-%';
