CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(140) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(24) NOT NULL CHECK (role IN ('ADMIN', 'GESTOR', 'OPERADOR', 'CONSULTA')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  data_origin VARCHAR(16) NOT NULL DEFAULT 'INSTITUCIONAL' CHECK (data_origin IN ('INSTITUCIONAL', 'SIMULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  floor_label VARCHAR(80),
  is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  map_x NUMERIC(6,2),
  map_y NUMERIC(6,2),
  data_origin VARCHAR(16) NOT NULL DEFAULT 'INSTITUCIONAL' CHECK (data_origin IN ('INSTITUCIONAL', 'SIMULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  room_id UUID REFERENCES rooms(id),
  status VARCHAR(24) NOT NULL DEFAULT 'SEM_COMUNICACAO' CHECK (status IN ('ONLINE', 'SEM_COMUNICACAO', 'INATIVO')),
  last_seen_at TIMESTAMPTZ,
  data_origin VARCHAR(16) NOT NULL DEFAULT 'INSTITUCIONAL' CHECK (data_origin IN ('INSTITUCIONAL', 'SIMULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_number VARCHAR(80) NOT NULL UNIQUE,
  official_property_number VARCHAR(100) UNIQUE,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  manufacturer VARCHAR(140),
  model VARCHAR(140),
  serial_number VARCHAR(140),
  acquisition_date DATE,
  acquisition_value NUMERIC(14,2),
  conservation_condition VARCHAR(24) NOT NULL DEFAULT 'NAO_INFORMADO' CHECK (conservation_condition IN ('OTIMO', 'BOM', 'REGULAR', 'RUIM', 'NAO_INFORMADO')),
  operational_status VARCHAR(24) NOT NULL DEFAULT 'EM_OPERACAO' CHECK (operational_status IN ('EM_OPERACAO', 'INDISPONIVEL', 'EM_MANUTENCAO', 'BAIXADO')),
  criticality VARCHAR(16) NOT NULL DEFAULT 'MEDIA' CHECK (criticality IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  department_id UUID REFERENCES departments(id),
  room_id UUID REFERENCES rooms(id),
  responsible_role VARCHAR(140),
  qr_code VARCHAR(140) UNIQUE,
  tracking_tag_id VARCHAR(140) UNIQUE,
  tracking_status VARCHAR(24) NOT NULL DEFAULT 'RASTREAMENTO_DESATIVADO' CHECK (tracking_status IN ('LOCALIZACAO_CONFIRMADA', 'SETOR_ESTIMADO', 'ULTIMA_LOCALIZACAO', 'SEM_COMUNICACAO', 'RASTREAMENTO_DESATIVADO')),
  last_detected_at TIMESTAMPTZ,
  last_room_id UUID REFERENCES rooms(id),
  data_origin VARCHAR(16) NOT NULL DEFAULT 'INSTITUCIONAL' CHECK (data_origin IN ('INSTITUCIONAL', 'SIMULADO')),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  origin_department_id UUID REFERENCES departments(id),
  destination_department_id UUID NOT NULL REFERENCES departments(id),
  origin_room_id UUID REFERENCES rooms(id),
  destination_room_id UUID REFERENCES rooms(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  movement_type VARCHAR(24) NOT NULL DEFAULT 'TEMPORARIA' CHECK (movement_type IN ('TEMPORARIA', 'PERMANENTE', 'MANUTENCAO', 'EMERGENCIAL')),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADA', 'REJEITADA', 'CONCLUIDA', 'CANCELADA')),
  expected_return_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(120) NOT NULL UNIQUE,
  asset_id UUID NOT NULL REFERENCES assets(id),
  gateway_id UUID REFERENCES gateways(id),
  room_id UUID REFERENCES rooms(id),
  rssi INTEGER,
  confidence VARCHAR(24) NOT NULL DEFAULT 'ESTIMADA' CHECK (confidence IN ('CONFIRMADA', 'ESTIMADA', 'INDETERMINADA')),
  source VARCHAR(16) NOT NULL CHECK (source IN ('SIMULATED', 'HARDWARE', 'MANUAL')),
  detected_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  location_event_id UUID REFERENCES location_events(id),
  alert_type VARCHAR(60) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFORMATIVO', 'ATENCAO', 'ALTO', 'CRITICO')),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'RECONHECIDO', 'RESOLVIDO')),
  acknowledged_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'INFORMATIVO',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(operational_status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_last_seen ON assets(last_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_status_date ON movement_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_events_asset_date ON location_events(asset_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status_date ON alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_date ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_date ON audit_logs(entity_type, entity_id, created_at DESC);
