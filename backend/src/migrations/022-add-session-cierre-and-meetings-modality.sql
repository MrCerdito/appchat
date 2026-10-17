-- ============================================================
-- 022 — Clasificación de cierre en sessions + modalidad de reuniones
-- Producción corre con synchronize:false (app.module.ts) y no hay
-- runner de migraciones: aplicar manualmente.
--
-- Ejecutar:
--   psql -U postgres -d app -f 022-add-session-cierre-and-meetings-modality.sql
-- ============================================================

-- ── Clasificación de cierre de sesión (secciones Requerimientos/Errores) ──
-- Valores permitidos (validación estricta en API):
--   requerimiento | solucion | error | capacitacion | otro
-- cierre_tipo puede ser NULL cuando el cierre se omite.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cierre_tipo varchar(20);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cierre_notas varchar(300);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cierre_seguimiento boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cierre_at timestamptz;

-- Índice para consultas de clasificación + fecha (dashboard de métricas).
CREATE INDEX IF NOT EXISTS idx_sessions_cierre_tipo_created_at
  ON sessions (cierre_tipo, created_at);

-- ── Reuniones: modalidad y marca (sección Capacitaciones) ──
-- modalidad: 'virtual' (default) | 'presencial'
-- tipo_colegio: marca resuelta desde el colegio asociado; NULL = sin clasificar.
ALTER TABLE teams_meetings ADD COLUMN IF NOT EXISTS modalidad varchar(20) NOT NULL DEFAULT 'virtual';
ALTER TABLE teams_meetings ADD COLUMN IF NOT EXISTS tipo_colegio varchar(50);
