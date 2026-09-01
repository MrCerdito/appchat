-- 012: columna esOfensivo en ai_logs para reporte de conducta de la IA
-- Indica si una interacción del asistente virtual fue marcada como ofensiva.

ALTER TABLE ai_logs ADD COLUMN IF NOT EXISTS "esOfensivo" boolean NOT NULL DEFAULT false;