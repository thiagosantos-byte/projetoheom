-- Campos adicionais capturados da plaqueta; não altera identificadores únicos.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS reference VARCHAR(140);
